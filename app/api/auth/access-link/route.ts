import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

// Generate a one-click magic sign-in link for a person who already has an
// account, so a coach can copy it and hand it to them to re-access their
// account (e.g. they lost their password). The link logs them straight in.
export async function POST(request: NextRequest) {
  try {
    const { personId } = await request.json()
    if (!personId) {
      return NextResponse.json({ error: 'Missing personId' }, { status: 400 })
    }

    const admin = getSupabaseAdmin()

    // ── Authorize: a magic link logs someone in AS the target, so only the
    // target's coach (admin, self, or upstream in their coaching tree) may mint
    // one. Verify the caller's session token and check the relationship. ──
    const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { data: requester } = await admin
      .from('people')
      .select('id, is_admin')
      .eq('auth_user_id', userData.user.id)
      .single()
    if (!requester) return NextResponse.json({ error: 'No coach profile' }, { status: 403 })

    let allowed = requester.is_admin || requester.id === personId
    if (!allowed) {
      const { data: downline } = await admin.rpc('get_downline', { coach_person_id: requester.id })
      allowed = Array.isArray(downline) && downline.some((d: { person_id: string }) => d.person_id === personId)
    }
    if (!allowed) {
      return NextResponse.json({ error: 'You can only generate links for people you coach.' }, { status: 403 })
    }

    const { data: person, error: pErr } = await admin
      .from('people')
      .select('email, name, auth_user_id')
      .eq('id', personId)
      .single()

    if (pErr || !person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }
    if (!person.email) {
      return NextResponse.json({ error: 'No email on file — add an email to their profile first.' }, { status: 400 })
    }

    // Redirect to the app root (which routes to /my-journey). Using the root
    // keeps the redirect within Supabase's allowed site URL.
    const origin = request.headers.get('origin') || new URL(request.url).origin

    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: person.email,
      options: { redirectTo: origin },
    })

    if (error || !data?.properties?.action_link) {
      return NextResponse.json({ error: error?.message || 'Could not generate link' }, { status: 500 })
    }

    return NextResponse.json({ link: data.properties.action_link, email: person.email })
  } catch {
    return NextResponse.json({ error: 'Failed to generate link' }, { status: 500 })
  }
}
