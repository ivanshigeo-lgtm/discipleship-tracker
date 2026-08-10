// Silent, private page-visit logging for the public /assessment funnel.
// A tiny client beacon POSTs here on page load; we append one row to
// page_visits. Nothing is shown to the visitor — the count is read back
// only by an admin via /api/visit-stats. Service-role write because an
// anonymous taker has no session and page_visits is locked by RLS.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type Body = { path?: string; visitorKey?: string }

export async function POST(request: NextRequest) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Only ever record the assessment funnel from this beacon; ignore anything else
  // so a stray/forged call can't pollute the count with arbitrary paths.
  const path = (body.path ?? '').trim().slice(0, 200)
  if (!path.startsWith('/assessment')) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const visitorKey = (body.visitorKey ?? '').trim().slice(0, 100) || null
  const referrer = (request.headers.get('referer') ?? '').slice(0, 300) || null
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 400) || null

  const { error } = await admin.from('page_visits').insert({
    path,
    visitor_key: visitorKey,
    referrer,
    user_agent: userAgent,
  })
  if (error) {
    console.error('track-visit insert failed:', error)
    // Never surface an error to the visitor — tracking is best-effort.
    return NextResponse.json({ ok: false })
  }

  return NextResponse.json({ ok: true })
}
