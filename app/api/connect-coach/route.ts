import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Find coach by code (codes are the last 6 chars of the person ID, uppercase).
// "Empowered" = admin OR an approved Empower sign-off — the same definition the
// coach dashboard gates on, so only empowered people can be coaches.
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

  // Find the coach whose ID ends with this code
  return coaches.find(coach =>
    coach.id.slice(-6).toUpperCase() === normalizedCode
  ) || null
}

export async function POST(request: NextRequest) {
  try {
    const { code, discipleId } = await request.json()

    if (!code || !discipleId) {
      return NextResponse.json(
        { error: 'Code and disciple ID required' },
        { status: 400 }
      )
    }

    // Find the coach
    const coach = await findCoachByCode(code)

    if (!coach) {
      return NextResponse.json(
        { error: 'Invalid coach code. Please check and try again.' },
        { status: 404 }
      )
    }

    // Check if connection already exists
    const { data: existing } = await supabase
      .from('discipleship_connections')
      .select('id')
      .eq('discipler_person_id', coach.id)
      .eq('disciple_person_id', discipleId)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'You are already connected to this coach.' },
        { status: 400 }
      )
    }

    // Look up the disciple's name — discipleship_connections.disciple_name is NOT NULL
    const { data: disciple } = await supabase
      .from('people')
      .select('name')
      .eq('id', discipleId)
      .single()

    if (!disciple) {
      return NextResponse.json(
        { error: 'Disciple not found' },
        { status: 404 }
      )
    }

    // Create the connection
    const { error: insertError } = await supabase
      .from('discipleship_connections')
      .insert({
        discipler_person_id: coach.id,
        disciple_person_id: discipleId,
        disciple_name: disciple.name,
        relationship_notes: null,
        status: 'Identified',
        updated_at: new Date().toISOString(),
      })

    if (insertError) {
      console.error('Error creating connection:', insertError)
      return NextResponse.json(
        { error: 'Failed to connect. Please try again.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      coach: { id: coach.id, name: coach.name }
    })

  } catch (err) {
    console.error('Connect coach error:', err)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
