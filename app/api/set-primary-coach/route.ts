import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Promote one discipleship connection to be the disciple's PRIMARY coach.
// A disciple may have several coaches; exactly one is primary (enforced by the
// partial-unique index ux_conn_one_primary). Transfer is atomic-ish: clear the
// current primary, then flag the new one. The unique index is the integrity
// backstop against races.
//
// Authorized to: an admin, OR the current primary coach (handing off), OR — when
// no primary exists yet — any coach already connected to that disciple.
export async function POST(request: NextRequest) {
  try {
    const { connectionId, actorPersonId } = await request.json()

    if (!connectionId || !actorPersonId) {
      return NextResponse.json(
        { error: 'connectionId and actorPersonId are required' },
        { status: 400 }
      )
    }

    // Load the target connection to promote.
    const { data: target, error: targetError } = await supabase
      .from('discipleship_connections')
      .select('id, disciple_person_id, discipler_person_id, is_primary')
      .eq('id', connectionId)
      .single()

    if (targetError || !target) {
      return NextResponse.json({ error: 'Connection not found' }, { status: 404 })
    }

    if (!target.disciple_person_id) {
      return NextResponse.json(
        { error: 'This connection has no linked disciple, so it cannot be primary.' },
        { status: 400 }
      )
    }

    // Already primary — nothing to do.
    if (target.is_primary) {
      return NextResponse.json({ success: true, connectionId, alreadyPrimary: true })
    }

    // Gather all of this disciple's connections (to find the current primary and
    // confirm the actor is a connected coach when authorizing).
    const { data: siblings, error: siblingsError } = await supabase
      .from('discipleship_connections')
      .select('id, discipler_person_id, is_primary')
      .eq('disciple_person_id', target.disciple_person_id)

    if (siblingsError) {
      return NextResponse.json({ error: 'Failed to load connections' }, { status: 500 })
    }

    const currentPrimary = (siblings ?? []).find(c => c.is_primary)

    // Authorize.
    const { data: actor } = await supabase
      .from('people')
      .select('id, is_admin')
      .eq('id', actorPersonId)
      .single()

    const isAdmin = Boolean(actor?.is_admin)
    const isCurrentPrimaryCoach = currentPrimary?.discipler_person_id === actorPersonId
    const isConnectedCoachWhenNoPrimary =
      !currentPrimary && (siblings ?? []).some(c => c.discipler_person_id === actorPersonId)

    if (!isAdmin && !isCurrentPrimaryCoach && !isConnectedCoachWhenNoPrimary) {
      return NextResponse.json(
        { error: 'Only an admin or the current primary coach can change the primary coach.' },
        { status: 403 }
      )
    }

    // Clear the existing primary (if any other than the target), then flag target.
    // Order matters: clear first so the partial-unique index is never doubly true.
    if (currentPrimary && currentPrimary.id !== connectionId) {
      const { error: clearError } = await supabase
        .from('discipleship_connections')
        .update({ is_primary: false, updated_at: new Date().toISOString() })
        .eq('disciple_person_id', target.disciple_person_id)
        .eq('is_primary', true)

      if (clearError) {
        console.error('Error clearing primary:', clearError)
        return NextResponse.json({ error: 'Failed to update primary coach' }, { status: 500 })
      }
    }

    const { error: setError } = await supabase
      .from('discipleship_connections')
      .update({ is_primary: true, updated_at: new Date().toISOString() })
      .eq('id', connectionId)

    if (setError) {
      console.error('Error setting primary:', setError)
      return NextResponse.json({ error: 'Failed to update primary coach' }, { status: 500 })
    }

    return NextResponse.json({ success: true, connectionId })
  } catch (err) {
    console.error('Set primary coach error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
