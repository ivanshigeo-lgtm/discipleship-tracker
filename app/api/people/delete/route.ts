import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Coach-dashboard person deletion. The client-side delete only removed the
// people row, so anyone who had AUTHORED prayer requests (a NO ACTION FK) could
// never be deleted, and RLS blocks a non-admin coach from clearing another
// person's authored prayers. This route authorizes with the CALLER's own RLS
// (can_edit_person via their JWT — admin or downline, same rule as the people
// DELETE policy) and then runs the same wipe as /api/account/delete: storage
// files, authored prayers erased, engagements/sign-offs they created for others
// de-attributed (kept), person row deleted, and their sign-in account removed
// so no orphaned auth user is left behind.

const PERSON_BUCKETS = ['soap-photos', 'prayer-media', 'testimonies', 'assessment-scans']

async function deletePersonFiles(personId: string) {
  for (const bucket of PERSON_BUCKETS) {
    try {
      const store = admin.storage.from(bucket)
      const { data: files } = await store.list(personId, { limit: 1000 })
      const paths = (files ?? []).filter(f => f.id).map(f => `${personId}/${f.name}`)
      if (paths.length) await store.remove(paths)
    } catch (err) {
      console.error(`person delete: storage cleanup failed for ${bucket}`, err)
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, personId } = await request.json()
    if (!accessToken || !personId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: { user } } = await admin.auth.getUser(accessToken)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Authorization runs under the CALLER's JWT so RLS decides, not us.
    // The anon key stored in Vercel env is line-wrapped (a newline mid-key),
    // which Headers.set rejects — strip ALL whitespace or every delete 403s.
    const asCaller = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\s+/g, ''),
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/\s+/g, ''),
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    )
    const { data: canEdit, error: authzError } = await asCaller.rpc('can_edit_person', {
      target_person_id: personId,
    })
    if (authzError || canEdit !== true) {
      if (authzError) console.error('person delete: can_edit_person rpc failed', authzError)
      return NextResponse.json({ error: 'Not allowed to delete this person' }, { status: 403 })
    }

    const { data: person } = await admin
      .from('people')
      .select('id, auth_user_id')
      .eq('id', personId)
      .maybeSingle()
    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    await deletePersonFiles(person.id)

    await admin.from('prayer_requests').delete().eq('created_by_person_id', person.id)
    await admin.from('engagements')
      .update({ created_by_person_id: null }).eq('created_by_person_id', person.id)
    await admin.from('level_signoffs')
      .update({ approved_by: null }).eq('approved_by', person.id)

    const { error: personError } = await admin.from('people').delete().eq('id', person.id)
    if (personError) {
      console.error('person delete: people delete failed', personError)
      return NextResponse.json({ error: personError.message }, { status: 500 })
    }

    if (person.auth_user_id) {
      const { error: authError } = await admin.auth.admin.deleteUser(person.auth_user_id)
      if (authError) {
        // Person data is gone; an undeleted login is worth surfacing but not a rollback.
        console.error('person delete: auth user delete failed', authError)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('person delete error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
