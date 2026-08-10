// Autosaves a taker's answers to their assessment_progress row and doubles as the
// read-back used to resume. The client holds {personId, resumeToken} (in
// localStorage after /api/assessment/start); the token must match the row or we
// refuse. Called with response fields to WRITE (after each test completes), or
// with none to READ the current saved state on resume.
//
// Service-role: assessment_progress is RLS-locked to the service role.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Body = {
  personId?: string
  resumeToken?: string
  giftsResponses?: unknown
  bigFiveResponses?: unknown
  passionAnswers?: unknown
}

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const personId = (body.personId ?? '').trim()
  const resumeToken = (body.resumeToken ?? '').trim()
  if (!personId || !resumeToken) {
    return NextResponse.json({ error: 'Missing session.' }, { status: 400 })
  }

  const { data: row, error: findErr } = await supabase
    .from('assessment_progress')
    .select('resume_token, gifts_responses, big_five_responses, passion_answers')
    .eq('person_id', personId)
    .maybeSingle()
  if (findErr) {
    return NextResponse.json({ error: 'Could not load your progress.', detail: findErr.message }, { status: 500 })
  }
  if (!row || row.resume_token !== resumeToken) {
    return NextResponse.json({ error: 'Session not found.' }, { status: 404 })
  }

  // Build the partial update from whichever response fields were provided.
  const update: Record<string, unknown> = {}
  if (body.giftsResponses !== undefined) update.gifts_responses = body.giftsResponses
  if (body.bigFiveResponses !== undefined) update.big_five_responses = body.bigFiveResponses
  if (body.passionAnswers !== undefined) update.passion_answers = body.passionAnswers

  let saved = row
  if (Object.keys(update).length) {
    update.updated_at = new Date().toISOString()
    const { data: updated, error: updErr } = await supabase
      .from('assessment_progress')
      .update(update)
      .eq('person_id', personId)
      .select('resume_token, gifts_responses, big_five_responses, passion_answers')
      .single()
    if (updErr || !updated) {
      return NextResponse.json({ error: 'Could not save your progress.', detail: updErr?.message }, { status: 500 })
    }
    saved = updated
  }

  // Name for the "welcome back" greeting on resume.
  const { data: person } = await supabase
    .from('people')
    .select('name, email')
    .eq('id', personId)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    personId,
    name: person?.name ?? null,
    email: person?.email ?? null,
    gifts: saved.gifts_responses ?? null,
    bigFive: saved.big_five_responses ?? null,
    passion: saved.passion_answers ?? null,
  })
}
