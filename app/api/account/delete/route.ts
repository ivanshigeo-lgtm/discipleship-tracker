import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// In-app account deletion (App Store guideline 5.1.1(v)). Deletes the caller's
// OWN account only: their person row (FK cascades take journals, prayers,
// engagements, signoffs, messages, results, connections), their storage files,
// and finally the auth user. References OTHERS keep to this person that would
// block the delete (NO ACTION FKs) are handled first: prayer requests they
// authored are erased (their UGC); engagements they created for others and
// sign-offs they approved are kept but de-attributed (set null) so other
// people's progress survives a coach deleting their account.

const PERSON_BUCKETS = ['soap-photos', 'prayer-media', 'testimonies', 'assessment-scans']

async function deletePersonFiles(personId: string) {
  for (const bucket of PERSON_BUCKETS) {
    try {
      const store = supabase.storage.from(bucket)
      const { data: files } = await store.list(personId, { limit: 1000 })
      const paths = (files ?? []).filter(f => f.id).map(f => `${personId}/${f.name}`)
      if (paths.length) await store.remove(paths)
    } catch (err) {
      // Best-effort: never let storage cleanup block the account delete
      console.error(`account delete: storage cleanup failed for ${bucket}`, err)
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await request.json()
    if (!accessToken) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: { user } } = await supabase.auth.getUser(accessToken)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { data: person } = await supabase
      .from('people')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (person) {
      await deletePersonFiles(person.id)

      await supabase.from('prayer_requests').delete().eq('created_by_person_id', person.id)
      await supabase.from('engagements')
        .update({ created_by_person_id: null }).eq('created_by_person_id', person.id)
      await supabase.from('level_signoffs')
        .update({ approved_by: null }).eq('approved_by', person.id)

      const { error: personError } = await supabase.from('people').delete().eq('id', person.id)
      if (personError) {
        console.error('account delete: person delete failed', personError)
        return NextResponse.json({ error: 'Could not delete account data' }, { status: 500 })
      }
    }

    const { error: authError } = await supabase.auth.admin.deleteUser(user.id)
    if (authError) {
      console.error('account delete: auth user delete failed', authError)
      return NextResponse.json({ error: 'Could not delete sign-in account' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('account delete error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
