import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Merge a duplicate person into a keeper. All data movement happens inside the
// merge_people() DB function (one transaction, execute revoked from client
// roles), so this route's job is authorization: admins and approved-Empower
// members can merge anyone (the church-wide-edit rule the dashboard already
// follows); other coaches only when BOTH people are theirs to edit
// (can_edit_person under the caller's own JWT). Merging two claimed profiles
// is refused by the function itself.

async function callerCanMergeAnyone(userId: string): Promise<boolean> {
  const { data: me } = await admin
    .from('people')
    .select('id, is_admin')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (!me) return false
  if (me.is_admin) return true
  const { data: signoff } = await admin
    .from('level_signoffs')
    .select('id')
    .eq('person_id', me.id)
    .eq('stage', 'Empower')
    .eq('status', 'approved')
    .maybeSingle()
  return Boolean(signoff)
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, keepId, dupId } = await request.json()
    if (!accessToken || !keepId || !dupId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }
    if (keepId === dupId) {
      return NextResponse.json({ error: 'Pick two different people' }, { status: 400 })
    }

    const { data: { user } } = await admin.auth.getUser(accessToken)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    let allowed = await callerCanMergeAnyone(user.id)
    if (!allowed) {
      // The anon key stored in Vercel env is line-wrapped (a newline mid-key),
      // which Headers.set rejects — strip ALL whitespace or every call 403s.
      const asCaller = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\s+/g, ''),
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/\s+/g, ''),
        { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
      )
      const [keepCheck, dupCheck] = await Promise.all([
        asCaller.rpc('can_edit_person', { target_person_id: keepId }),
        asCaller.rpc('can_edit_person', { target_person_id: dupId }),
      ])
      allowed = keepCheck.data === true && dupCheck.data === true
    }
    if (!allowed) {
      return NextResponse.json({ error: 'Not allowed to merge these people' }, { status: 403 })
    }

    const { data, error } = await admin.rpc('merge_people', {
      p_keep: keepId,
      p_dup: dupId,
    })
    if (error) {
      console.error('person merge: merge_people failed', error)
      // Function raise messages are user-readable (e.g. both profiles claimed)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('person merge error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
