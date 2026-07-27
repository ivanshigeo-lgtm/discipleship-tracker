import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Find coach by code (codes are the last 6 chars of the person ID, uppercase).
// "Empowered" = admin OR an approved Empower sign-off — the same definition the
// coach dashboard gates on. Mirrors app/api/connect-coach/route.ts:findCoachByCode.
async function findCoachByCode(code: string) {
  const normalizedCode = code.toUpperCase().trim()

  const { data: signoffs } = await supabase
    .from('level_signoffs')
    .select('person_id')
    .eq('stage', 'Empower')
    .eq('status', 'approved')
  const empoweredIds = (signoffs ?? []).map(s => s.person_id).filter(Boolean)

  const orParts = ['is_admin.eq.true']
  if (empoweredIds.length) orParts.push(`id.in.(${empoweredIds.join(',')})`)

  const { data: coaches, error } = await supabase
    .from('people')
    .select('id, name, is_admin')
    .or(orParts.join(','))

  if (error || !coaches) return null

  return coaches.find(coach => coach.id.slice(-6).toUpperCase() === normalizedCode) || null
}

// New-account claim flow (native sign-up → onboarding). A freshly OTP-verified
// user has an auth session but no people row. This route lets them:
//   action:'lookup' — resolve a coach code to that coach + the unclaimed profiles
//     the coach already made for their disciples ("is this you?" candidates).
//   action:'claim'  — attach the auth user to a chosen unclaimed row.
// Both need the service key: findCoachByCode reads level_signoffs, and the claim
// UPDATE must run past the auth_user_id/email unique indexes deterministically.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action } = body

    if (action === 'lookup') {
      const { code } = body
      if (!code) {
        return NextResponse.json({ error: 'Coach code required' }, { status: 400 })
      }

      const coach = await findCoachByCode(code)
      if (!coach) {
        return NextResponse.json(
          { error: 'Invalid coach code. Please check and try again.' },
          { status: 404 }
        )
      }

      // Unclaimed disciple rows this coach already created — the "is this you?"
      // candidates. Connections point coach → disciple person rows; keep only the
      // ones that still have no login (auth_user_id IS NULL).
      const { data: connections } = await supabase
        .from('discipleship_connections')
        .select('disciple_person_id')
        .eq('discipler_person_id', coach.id)
      const discipleIds = (connections ?? [])
        .map(c => c.disciple_person_id)
        .filter(Boolean)

      let candidates: { id: string; name: string }[] = []
      if (discipleIds.length) {
        const { data: people } = await supabase
          .from('people')
          .select('id, name')
          .in('id', discipleIds)
          .is('auth_user_id', null)
          .order('created_at', { ascending: true })
        candidates = (people ?? []) as { id: string; name: string }[]
      }

      return NextResponse.json({
        coach: { id: coach.id, name: coach.name },
        candidates,
      })
    }

    if (action === 'claim') {
      const { personId, authUserId, email } = body
      if (!personId || !authUserId) {
        return NextResponse.json(
          { error: 'personId and authUserId required' },
          { status: 400 }
        )
      }

      // Guard: never steal an already-claimed row. Read first so we can return an
      // idempotent success when this same auth user already owns it (double-tap /
      // retry) vs a real conflict when someone else does.
      const { data: existing } = await supabase
        .from('people')
        .select('id, auth_user_id')
        .eq('id', personId)
        .single()

      if (!existing) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
      }
      if (existing.auth_user_id) {
        if (existing.auth_user_id === authUserId) {
          return NextResponse.json({ success: true, personId })
        }
        return NextResponse.json(
          { error: 'This profile is already linked to another account.' },
          { status: 409 }
        )
      }

      const { error: updateError } = await supabase
        .from('people')
        .update({
          auth_user_id: authUserId,
          ...(email ? { email } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('id', personId)
        .is('auth_user_id', null)

      if (updateError) {
        // 23505 = raced another claim of this auth user / email; treat as taken.
        if (updateError.code === '23505') {
          return NextResponse.json(
            { error: 'That account is already linked to a profile.' },
            { status: 409 }
          )
        }
        console.error('claim-profile update error:', updateError)
        return NextResponse.json({ error: 'Failed to claim profile.' }, { status: 500 })
      }

      return NextResponse.json({ success: true, personId })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('claim-profile error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
