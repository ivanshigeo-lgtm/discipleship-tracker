// Kicks off the public assessment funnel by capturing name + email UP FRONT so we
// can (a) save progress server-side as the taker answers and let them resume on
// any device, and (b) keep the email as a followable lead even if they never
// finish. Mirrors the find-or-create-lead logic in app/api/assessment-onramp,
// then ensures an assessment_progress row and logs the collected email once.
//
// Service-role: assessment_progress + onramp_submissions are RLS-locked to the
// service role (anonymous takers have no session).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)

export async function POST(request: NextRequest) {
  let body: { name?: string; email?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  if (!name) return NextResponse.json({ error: 'Please enter your name.' }, { status: 400 })
  if (!isEmail(email)) return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 })

  // ── Find an existing person by email, or create a fresh unassigned lead. ──
  // Same rule as assessment-onramp: case-insensitive, oldest first, so re-entering
  // the same email on another device resumes rather than duplicating.
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
      .insert({ name, email, current_stage: 'Engage', status: 'Active', auth_user_id: null })
      .select('id')
      .single()
    if (insertErr || !newPerson) {
      return NextResponse.json({ error: 'Could not create your profile.', detail: insertErr?.message }, { status: 500 })
    }
    personId = newPerson.id as string
    created = true
  }

  // ── Ensure a progress row. If one already exists, hand back the saved answers
  // so the client can hydrate (resume). Only a brand-new row triggers the
  // "email collected" log, so re-entering the same email doesn't re-log.
  const { data: existingProgress } = await supabase
    .from('assessment_progress')
    .select('resume_token, gifts_responses, big_five_responses, passion_answers')
    .eq('person_id', personId)
    .maybeSingle()

  let progress = existingProgress
  if (!progress) {
    const { data: fresh, error: progErr } = await supabase
      .from('assessment_progress')
      .insert({ person_id: personId })
      .select('resume_token, gifts_responses, big_five_responses, passion_answers')
      .single()
    if (progErr || !fresh) {
      return NextResponse.json({ error: 'Could not start your assessment.', detail: progErr?.message }, { status: 500 })
    }
    progress = fresh

    // Log the collected email once (completed_at stays null until they finish),
    // but only if we've never logged this person before.
    const { data: priorSub } = await supabase
      .from('onramp_submissions')
      .select('id')
      .eq('person_id', personId)
      .limit(1)
    if (!priorSub || !priorSub.length) {
      const { error: subErr } = await supabase
        .from('onramp_submissions')
        .insert({ person_id: personId, name, email, created, completed_at: null })
      if (subErr) console.error('assessment/start submission log failed:', subErr)
    }
  }

  return NextResponse.json({
    ok: true,
    personId,
    resumeToken: progress.resume_token,
    name,
    email,
    gifts: progress.gifts_responses ?? null,
    bigFive: progress.big_five_responses ?? null,
    passion: progress.passion_answers ?? null,
  })
}
