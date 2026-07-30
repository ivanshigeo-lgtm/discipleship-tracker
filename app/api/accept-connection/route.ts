// Coach accepts a PENDING self-service connection request (from open signup).
// The disciple's signup opened a discipleship_connections row with pending=true;
// only the coach on the far end may flip it live. Service-role so the update
// runs past RLS write policies and we can notify the disciple.
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const { accessToken, connectionId } = await request.json() as {
      accessToken?: string
      connectionId?: string
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (!connectionId) {
      return NextResponse.json({ error: 'connectionId required' }, { status: 400 })
    }

    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // The caller's own people row — the id we authorize against.
    const { data: caller } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()
    if (!caller) {
      return NextResponse.json({ error: 'No profile found' }, { status: 403 })
    }

    const { data: connection } = await supabase
      .from('discipleship_connections')
      .select('id, discipler_person_id, disciple_person_id')
      .eq('id', connectionId)
      .single()
    if (!connection) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    // Only the coach on this connection may accept it.
    if (connection.discipler_person_id !== caller.id) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { error: updateError } = await supabase
      .from('discipleship_connections')
      .update({ pending: false, updated_at: new Date().toISOString() })
      .eq('id', connectionId)
    if (updateError) {
      console.error('accept-connection update error:', updateError)
      return NextResponse.json({ error: 'Failed to accept.' }, { status: 500 })
    }

    // Let the disciple know they're connected.
    if (connection.disciple_person_id) {
      await supabase.from('messages').insert({
        from_person_id: connection.discipler_person_id,
        to_person_id: connection.disciple_person_id,
        kind: 'note',
        body: 'Your coach accepted your connection — welcome! ✦',
      })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('accept-connection error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
