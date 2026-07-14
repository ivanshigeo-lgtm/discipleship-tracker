import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/*
 * Session hand-off for the WikiChurch app's WebViews. The app POSTs its own
 * Supabase access token; we verify it and mint a one-time magic-link hash for
 * that same user. The WebView redeems it via verifyOtp on /embed/boot, which
 * creates a session with its OWN refresh-token family — sharing the app's
 * refresh token directly would trip GoTrue's rotation reuse detection and
 * sign the user out everywhere.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.replace(/^Bearer\s+/i, '')
  if (!token) {
    return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token)
  const email = userData?.user?.email
  if (userError || !email) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 })
  }

  const { data, error } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })
  if (error || !data?.properties?.hashed_token) {
    return NextResponse.json({ error: error?.message || 'Could not create session link' }, { status: 500 })
  }

  return NextResponse.json({ token_hash: data.properties.hashed_token })
}
