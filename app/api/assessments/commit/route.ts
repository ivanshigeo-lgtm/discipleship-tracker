// Paper-assessment photo scan (commit step). After the leader reviews the draft
// from /api/assessments/scan — resolving any flagged/blank items — the final
// answers land here. Server re-scores everything with the shared lib code
// (client scores are never trusted), upserts the same three result tables the
// in-app assessments write (milestones auto-complete from those rows), records
// the scan in assessment_scans (photo refs + confirmed answers), then runs the
// ministry-fit generation so the exec summary is ready immediately.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  authorizeScanCaller,
  validateGiftResponses,
  validateBigFiveResponses,
} from '@/lib/assessmentScan'
import { scoreGifts, topGifts } from '@/lib/spiritualGifts'
import { scoreTraits } from '@/lib/bigFive'
import { normalizePassionAnswers } from '@/lib/passion'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type CommitBody = {
  accessToken?: string
  personId?: string
  gifts?: { responses?: unknown }
  bigFive?: { responses?: unknown }
  passion?: { answers?: unknown }
  pages?: { code?: string; path?: string }[]
  model?: string
}

export async function POST(request: NextRequest) {
  let body: CommitBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { personId } = body
  if (!personId) return NextResponse.json({ error: 'personId required' }, { status: 400 })
  if (!body.gifts && !body.bigFive && !body.passion) {
    return NextResponse.json({ error: 'Nothing to commit' }, { status: 400 })
  }

  const auth = await authorizeScanCaller(supabase, body.accessToken)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: person } = await supabase.from('people').select('id, name').eq('id', personId).maybeSingle()
  if (!person) return NextResponse.json({ error: 'Person not found' }, { status: 404 })

  const now = new Date().toISOString()
  const saved: Record<string, boolean> = {}
  const snapshot: Record<string, unknown> = {}

  if (body.gifts) {
    const v = validateGiftResponses(body.gifts.responses)
    if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
    const scores = scoreGifts(v.responses)
    const { error } = await supabase.from('spiritual_gifts_results').upsert(
      { person_id: personId, responses: v.responses, scores, top_gifts: topGifts(v.responses), completed_at: now },
      { onConflict: 'person_id' }
    )
    if (error) return NextResponse.json({ error: `Could not save Spiritual Gifts: ${error.message}` }, { status: 500 })
    saved.gifts = true
    snapshot.gifts = v.responses
  }

  if (body.bigFive) {
    const v = validateBigFiveResponses(body.bigFive.responses)
    if ('error' in v) return NextResponse.json({ error: v.error }, { status: 400 })
    const { error } = await supabase.from('big_five_results').upsert(
      { person_id: personId, responses: v.responses, scores: scoreTraits(v.responses), completed_at: now },
      { onConflict: 'person_id' }
    )
    if (error) return NextResponse.json({ error: `Could not save Big Five: ${error.message}` }, { status: 500 })
    saved.bigFive = true
    snapshot.bigFive = v.responses
  }

  if (body.passion) {
    const answers = normalizePassionAnswers(body.passion.answers)
    const { error } = await supabase.from('passion_results').upsert(
      { person_id: personId, answers, completed_at: now },
      { onConflict: 'person_id' }
    )
    if (error) return NextResponse.json({ error: `Could not save Passion: ${error.message}` }, { status: 500 })
    saved.passion = true
    snapshot.passion = answers
  }

  const pages = (body.pages ?? [])
    .filter(p => typeof p?.path === 'string' && p.path.startsWith(`${personId}/`))
    .map(p => ({ code: p.code ?? 'unknown', path: p.path }))

  const { data: scanRow, error: scanErr } = await supabase
    .from('assessment_scans')
    .insert({
      person_id: personId,
      scanned_by: auth.caller.id,
      pages,
      responses: snapshot,
      model: body.model ?? null,
    })
    .select()
    .single()
  if (scanErr) {
    // The results themselves saved — report the bookkeeping failure without
    // failing the commit.
    console.error('assessment_scans insert error:', scanErr)
  }

  // Exec summary: the ministry-fit route already builds it from the three result
  // tables, idempotent + cached on an inputs hash — returns incomplete if any
  // assessment is still missing.
  let summary: string | null = null
  let ministryFit: unknown = null
  try {
    const res = await fetch(`${request.nextUrl.origin}/api/ministry-fit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId }),
    })
    const fit = await res.json()
    if (fit?.status === 'ready' && fit.result) {
      ministryFit = fit.result
      summary = fit.result.summary ?? null
      if (summary && scanRow) {
        await supabase.from('assessment_scans').update({ summary }).eq('id', scanRow.id)
      }
    }
  } catch (e) {
    console.error('ministry-fit generation after commit failed:', e)
  }

  return NextResponse.json({
    status: 'committed',
    person: { id: person.id, name: person.name },
    saved,
    scanId: scanRow?.id ?? null,
    summary,
    ministryFit,
  })
}
