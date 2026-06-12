'use server'

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Generate a short code from person ID (last 6 chars, uppercase)
export function generateCoachCode(personId: string): string {
  return personId.slice(-6).toUpperCase()
}

// Find coach by code
async function findCoachByCode(code: string) {
  const normalizedCode = code.toUpperCase().trim()

  // Get all coaches (people who are admins or in Empower stage)
  const { data: coaches, error } = await supabase
    .from('people')
    .select('id, name, current_stage, is_admin')
    .or('is_admin.eq.true,current_stage.eq.Empower')

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

    // Create the connection
    const { error: insertError } = await supabase
      .from('discipleship_connections')
      .insert({
        discipler_person_id: coach.id,
        disciple_person_id: discipleId,
        relationship_type: 'Coach',
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
