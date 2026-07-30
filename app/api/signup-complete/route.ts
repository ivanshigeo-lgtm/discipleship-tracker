// Open self-service signup — onboarding backend. A freshly OTP-verified user has
// an auth session but may or may not already have a people row (a coach may have
// created one for them earlier, keyed by email). This route:
//   action:'context' — decide what the onboarding screen should show:
//     'preexisting' (an unclaimed people row with this email already exists, made
//        by a coach — greet them by name + show the coach they're connected to),
//     'done' (this user already has a claimed profile — nothing to do), or
//     'orphan' (no matching profile — collect a name + optional coach code).
//   action:'finish' — claim the pre-existing row, or create a fresh people row,
//        optionally opening a PENDING coach-connection request from a coach code.
// Service-role: the claim UPDATE must run past the auth_user_id/email unique
// indexes deterministically, and findCoachByCode reads level_signoffs.
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

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

// Resolve the caller's identity from their access token. Returns the auth user
// (with a normalized, lower-cased email) or null.
async function getUserFromToken(accessToken: string | undefined) {
  if (!accessToken) return null
  const { data: { user } } = await supabase.auth.getUser(accessToken)
  if (!user) return null
  return { id: user.id, email: (user.email ?? '').toLowerCase() }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, accessToken } = body as {
      action?: string
      accessToken?: string
      name?: string
      coachCode?: string
      // Set when the user arrived from a coach's per-disciple invite link
      // (/sign-up?claim=<id>) → claim THIS specific coach-created profile,
      // regardless of whether the signup email matches the profile's email.
      claimPersonId?: string
      // True when the user arrived from a coach's invite link (?code= or
      // ?claim=). The coach already invited them, so a coach-code connection
      // must NOT be left pending (no second approval to enter the app). A
      // stranger who manually types a coach code is NOT invited → pending.
      invited?: boolean
    }
    const claimPersonId = (body.claimPersonId ?? '').trim()
    const invited = body.invited === true

    const user = await getUserFromToken(accessToken)
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // The coach-created row this user should claim (unclaimed, email matches).
    // Deterministic order (oldest first) mirrors AuthContext's relink logic.
    const findUnclaimedByEmail = async () => {
      const { data } = await supabase
        .from('people')
        .select('id, name')
        .ilike('email', user.email)
        .is('auth_user_id', null)
        .order('created_at', { ascending: true })
        .limit(1)
      return (data?.[0] as { id: string; name: string } | undefined) ?? null
    }

    // An unclaimed coach-created row addressed by its exact id (per-disciple
    // invite link). Returns null if the id is unknown or already claimed.
    const findUnclaimedById = async (id: string) => {
      if (!id) return null
      const { data } = await supabase
        .from('people')
        .select('id, name')
        .eq('id', id)
        .is('auth_user_id', null)
        .maybeSingle()
      return (data as { id: string; name: string } | null) ?? null
    }

    // A row already claimed by THIS auth user (idempotency across retries).
    const findClaimedForUser = async () => {
      const { data } = await supabase
        .from('people')
        .select('id, name')
        .eq('auth_user_id', user.id)
        .limit(1)
      return (data?.[0] as { id: string; name: string } | undefined) ?? null
    }

    // The coach at the far end of a disciple's connection (for greeting / notify).
    const findCoachForDisciple = async (disciplePersonId: string) => {
      const { data: conn } = await supabase
        .from('discipleship_connections')
        .select('discipler_person_id')
        .eq('disciple_person_id', disciplePersonId)
        .order('created_at', { ascending: true })
        .limit(1)
      const coachId = conn?.[0]?.discipler_person_id as string | undefined
      if (!coachId) return null
      const { data: coach } = await supabase
        .from('people')
        .select('id, name')
        .eq('id', coachId)
        .single()
      return (coach as { id: string; name: string } | null) ?? null
    }

    if (action === 'context') {
      // A specific invite link wins over email matching — the coach told us
      // exactly which profile this is, even if the signup email differs.
      const unclaimed = (claimPersonId && await findUnclaimedById(claimPersonId)) || await findUnclaimedByEmail()
      if (unclaimed) {
        const coach = await findCoachForDisciple(unclaimed.id)
        return NextResponse.json({
          mode: 'preexisting',
          personName: unclaimed.name,
          coachName: coach?.name ?? null,
          coachCode: coach ? coach.id.slice(-6).toUpperCase() : null,
        })
      }

      const claimed = await findClaimedForUser()
      if (claimed) {
        return NextResponse.json({ mode: 'done' })
      }

      return NextResponse.json({ mode: 'orphan' })
    }

    if (action === 'finish') {
      const name = (body.name ?? '').trim()
      const coachCode = (body.coachCode ?? '').trim()

      // ── Pre-existing (coach-created) row → claim it and greet the coach. ──
      // A per-disciple invite link (?claim=<id>) targets the exact profile even
      // when the signup email differs; otherwise fall back to email matching.
      const unclaimed = (claimPersonId && await findUnclaimedById(claimPersonId)) || await findUnclaimedByEmail()
      if (unclaimed) {
        const { error: claimError } = await supabase
          .from('people')
          .update({ auth_user_id: user.id, updated_at: new Date().toISOString() })
          .eq('id', unclaimed.id)
          .is('auth_user_id', null)

        if (claimError && claimError.code !== '23505') {
          console.error('signup-complete claim error:', claimError)
          return NextResponse.json({ error: 'Failed to finish setup.' }, { status: 500 })
        }

        // Align the profile's email to their login so a future signup can't miss
        // it (this is the gap that let a duplicate slip through). Best-effort:
        // a unique-email collision here must never block a successful claim.
        await supabase
          .from('people')
          .update({ email: user.email })
          .eq('id', unclaimed.id)

        // Notify the connected coach that their disciple just joined.
        const coach = await findCoachForDisciple(unclaimed.id)
        if (coach) {
          await supabase.from('messages').insert({
            from_person_id: unclaimed.id,
            to_person_id: coach.id,
            kind: 'note',
            body: `${unclaimed.name} just joined the app! ✦`,
          })
        }

        return NextResponse.json({ ok: true })
      }

      // ── Orphan → reuse an already-claimed row or create a fresh one. ──
      let person = await findClaimedForUser()
      if (!person) {
        const { data: created, error: insertError } = await supabase
          .from('people')
          .insert({
            name: name || (user.email ? user.email.split('@')[0] : 'New disciple'),
            email: user.email,
            current_stage: 'Engage',
            status: 'Active',
            auth_user_id: user.id,
          })
          .select('id, name')
          .single()

        if (insertError || !created) {
          console.error('signup-complete insert error:', insertError)
          return NextResponse.json({ error: 'Failed to create your profile.' }, { status: 500 })
        }
        person = created as { id: string; name: string }
      }

      // Optional coach code → connect to the coach.
      // A code that arrived via the coach's own invite link (invited=true) is a
      // standing invitation — the connection is created NON-pending so the
      // disciple is in immediately with no second approval. A code typed by a
      // stranger opens a PENDING request the coach must accept in their feed.
      if (coachCode) {
        const coach = await findCoachByCode(coachCode)
        if (!coach) {
          // Don't fail the whole signup over a bad code — they're already set up.
          return NextResponse.json({ ok: true, coachWarning: 'Coach code not recognized' })
        }

        // Skip if a connection between these two already exists (idempotency).
        const { data: existing } = await supabase
          .from('discipleship_connections')
          .select('id')
          .eq('discipler_person_id', coach.id)
          .eq('disciple_person_id', person.id)
          .limit(1)

        if (!existing?.length) {
          await supabase.from('discipleship_connections').insert({
            discipler_person_id: coach.id,
            disciple_person_id: person.id,
            disciple_name: name || person.name,
            status: 'Identified',
            pending: !invited,
            updated_at: new Date().toISOString(),
          })
          await supabase.from('messages').insert({
            from_person_id: person.id,
            to_person_id: coach.id,
            kind: 'note',
            body: invited
              ? `${name || person.name} joined the app via your invite link and is now connected to you! ✦`
              : `${name || person.name} signed up and requested you as their coach — accept in your feed to connect. ✦`,
          })
        }
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    console.error('signup-complete error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
