// Public assessment-onramp commit. The standalone /assessment funnel lets ANYONE
// (no login) take the three assessments — Spiritual Gifts, Big Five, and Passion —
// then hands us their name + email. This route:
//   1. finds an existing person by email, or creates a fresh UNASSIGNED LEAD
//      (current_stage 'Engage', no coach, no auth user) so the team can follow up;
//   2. re-scores the assessments server-side (client scores are never trusted) and
//      upserts the same three result tables the in-app assessments write;
//   3. runs the ministry-fit generation so the consolidated exec summary +
//      recommended ministries come back in the same response, ready to render.
//
// Service-role: the table writes bypass RLS (results are read-only to authed users;
// an anonymous taker has no session at all). Mirrors app/api/assessments/commit.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { validateGiftResponses, validateBigFiveResponses } from '@/lib/assessmentScan'
import { scoreGifts, topGifts } from '@/lib/spiritualGifts'
import { scoreTraits } from '@/lib/bigFive'
import { normalizePassionAnswers } from '@/lib/passion'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type OnrampBody = {
  name?: string
  email?: string
  giftsResponses?: unknown
  bigFiveResponses?: unknown
  passionAnswers?: unknown
}

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function POST(request: NextRequest) {
  let body: OnrampBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!isEmail(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 })

  // All three assessments are required to produce a meaningful ministry fit.
  const gifts = validateGiftResponses(body.giftsResponses)
  if ('error' in gifts) return NextResponse.json({ error: `Spiritual Gifts: ${gifts.error}` }, { status: 400 })
  const big = validateBigFiveResponses(body.bigFiveResponses)
  if ('error' in big) return NextResponse.json({ error: `Personality: ${big.error}` }, { status: 400 })
  const passion = normalizePassionAnswers(body.passionAnswers)

  const now = new Date().toISOString()

  // ── Find an existing person by email, or create a fresh unassigned lead. ──
  // "Update existing" (product decision): a matching email attaches these results
  // to that person rather than spawning a duplicate. Case-insensitive match,
  // oldest first for determinism.
  let personId: string
  let created = false
  const { data: existing, error: findErr } = await supabase
    .from('people')
    .select('id')
    .ilike('email', email)
    .order('created_at', { ascending: true })
    .limit(1)
  if (findErr) {
    return NextResponse.json({ error: 'Could not look up your profile.', detail: findErr.message }, { status: 500 })
  }

  if (existing && existing.length) {
    personId = existing[0].id as string
  } else {
    const { data: newPerson, error: insertErr } = await supabase
      .from('people')
      .insert({
        name,
        email,
        current_stage: 'Engage',
        status: 'Active',
        auth_user_id: null,
      })
      .select('id')
      .single()
    if (insertErr || !newPerson) {
      return NextResponse.json({ error: 'Could not create your profile.', detail: insertErr?.message }, { status: 500 })
    }
    personId = newPerson.id as string
    created = true
  }

  // ── Re-score + upsert the three result tables (same shapes the app writes). ──
  const giftScores = scoreGifts(gifts.responses)
  const traitScores = scoreTraits(big.responses)

  const writes = await Promise.all([
    supabase.from('spiritual_gifts_results').upsert(
      { person_id: personId, responses: gifts.responses, scores: giftScores, top_gifts: topGifts(gifts.responses), completed_at: now },
      { onConflict: 'person_id' }
    ),
    supabase.from('big_five_results').upsert(
      { person_id: personId, responses: big.responses, scores: traitScores, completed_at: now },
      { onConflict: 'person_id' }
    ),
    supabase.from('passion_results').upsert(
      { person_id: personId, answers: passion, completed_at: now },
      { onConflict: 'person_id' }
    ),
  ])
  const writeErr = writes.find((w) => w.error)?.error
  if (writeErr) {
    return NextResponse.json({ error: 'Could not save your results.', detail: writeErr.message }, { status: 500 })
  }

  // Mark this person's submission COMPLETE for the private admin stats view.
  // If they came through /api/assessment/start there's already a (pending) row —
  // stamp its completed_at. If they hit this route directly (legacy/no start),
  // log a fresh already-completed row. Never double-logs: dedup-by-email at read.
  const { data: subRows } = await supabase
    .from('onramp_submissions')
    .select('id')
    .eq('person_id', personId)
    .order('submitted_at', { ascending: false })
    .limit(1)
  if (subRows && subRows.length) {
    const { error: updErr } = await supabase
      .from('onramp_submissions')
      .update({ completed_at: now })
      .eq('id', subRows[0].id)
    if (updErr) console.error('assessment-onramp completion stamp failed:', updErr)
  } else {
    const { error: subErr } = await supabase
      .from('onramp_submissions')
      .insert({ person_id: personId, name, email, created, completed_at: now })
    if (subErr) console.error('assessment-onramp submission log failed:', subErr)
  }

  // ── Consolidated exec summary + recommended ministries (idempotent, cached). ──
  // force:true so an existing person's summary regenerates from the fresh inputs.
  let summary: string | null = null
  let suggestions: unknown[] = []
  let newMinistryIdeas: unknown[] = []
  try {
    const res = await fetch(`${request.nextUrl.origin}/api/ministry-fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId, force: true }),
    })
    const fit = await res.json()
    if (fit?.status === 'ready' && fit.result) {
      summary = fit.result.summary ?? null
      suggestions = fit.result.suggestions ?? []
      newMinistryIdeas = fit.result.new_ministry_ideas ?? []
    }
  } catch (e) {
    console.error('assessment-onramp ministry-fit failed:', e)
  }

  return NextResponse.json({
    ok: true,
    personId,
    created,
    summary,
    suggestions,
    newMinistryIdeas,
  })
}
