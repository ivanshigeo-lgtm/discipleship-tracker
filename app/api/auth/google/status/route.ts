import { NextRequest, NextResponse } from 'next/server'
import { getGoogleTokens } from '../../../../../lib/googleCalendar'
import { getSupabaseAdmin } from '../../../../../lib/supabaseServer'
import { googleAccountBlockedReason, googleAccountMismatchWarning } from '../../../../../lib/googleCalendarLogic'

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')

  if (!personId) {
    return NextResponse.json({ error: 'Missing personId' }, { status: 400 })
  }

  const tokens = await getGoogleTokens(personId)
  if (!tokens) {
    return NextResponse.json({ connected: false, email: null, warning: null, blocked: false })
  }

  const email = (tokens.google_account_email as string | null) ?? null
  const supabase = getSupabaseAdmin()
  const { data: person } = await supabase
    .from('people')
    .select('email')
    .eq('id', personId)
    .maybeSingle()

  const blockedReason = googleAccountBlockedReason(email)
  const warning = blockedReason ?? googleAccountMismatchWarning({
    googleEmail: email,
    personEmail: (person?.email as string | null) ?? null,
  })

  return NextResponse.json({
    connected: true,
    email,
    warning,
    blocked: Boolean(blockedReason),
  })
}
