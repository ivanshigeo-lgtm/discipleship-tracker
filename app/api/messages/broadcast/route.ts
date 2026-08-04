import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Send one message (text, optionally with a voice/video attachment) to many
// people at once — targeted by discipleship stage, by group, or hand-picked.
// Fan-out happens here: one messages row per recipient, so both the web and
// native inboxes render broadcasts with zero client changes.
//
// Authorization mirrors /api/people/merge: admins and approved-Empower members
// reach the whole church; any other coach (someone with disciples) reaches only
// their own downline and the groups they lead.

type Body = {
  accessToken?: string
  body?: string
  mediaUrl?: string | null
  mediaKind?: 'audio' | 'video' | null
  stages?: string[]
  groupIds?: string[]
  personIds?: string[]
}

const STAGES = ['Engage', 'Establish', 'Equip', 'Empower']

async function churchWide(personId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true
  const { data } = await admin
    .from('level_signoffs')
    .select('id')
    .eq('person_id', personId)
    .eq('stage', 'Empower')
    .eq('status', 'approved')
    .maybeSingle()
  return Boolean(data)
}

export async function POST(request: NextRequest) {
  try {
    const { accessToken, body, mediaUrl, mediaKind, stages = [], groupIds = [], personIds = [] }: Body =
      await request.json()
    if (!accessToken) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const text = (body ?? '').trim()
    if (!text && !mediaUrl) {
      return NextResponse.json({ error: 'Write something or attach a recording' }, { status: 400 })
    }
    if (mediaUrl && mediaKind !== 'audio' && mediaKind !== 'video') {
      return NextResponse.json({ error: 'mediaKind must be audio or video' }, { status: 400 })
    }
    const badStage = stages.find(s => !STAGES.includes(s))
    if (badStage) return NextResponse.json({ error: `Unknown stage: ${badStage}` }, { status: 400 })
    if (stages.length === 0 && groupIds.length === 0 && personIds.length === 0) {
      return NextResponse.json({ error: 'Pick at least one stage, group, or person' }, { status: 400 })
    }

    const { data: { user } } = await admin.auth.getUser(accessToken)
    if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: me } = await admin
      .from('people')
      .select('id, is_admin')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    if (!me) return NextResponse.json({ error: 'No profile' }, { status: 403 })

    const wide = await churchWide(me.id, Boolean(me.is_admin))

    // My reach when not church-wide: direct disciples + groups I own.
    const { data: conns } = await admin
      .from('discipleship_connections')
      .select('disciple_person_id')
      .eq('discipler_person_id', me.id)
    const downline = new Set((conns ?? []).map(c => c.disciple_person_id as string).filter(Boolean))
    if (!wide && downline.size === 0) {
      return NextResponse.json({ error: 'Only coaches can send broadcasts' }, { status: 403 })
    }

    const recipients = new Set<string>()

    if (stages.length > 0) {
      const { data: staged, error } = await admin
        .from('people')
        .select('id')
        .in('current_stage', stages)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      for (const p of staged ?? []) {
        if (wide || downline.has(p.id)) recipients.add(p.id)
      }
    }

    if (groupIds.length > 0) {
      if (!wide) {
        const { data: owned } = await admin
          .from('victory_groups')
          .select('id')
          .eq('owner_person_id', me.id)
          .in('id', groupIds)
        const ownedIds = new Set((owned ?? []).map(g => g.id as string))
        const notMine = groupIds.find(g => !ownedIds.has(g))
        if (notMine) return NextResponse.json({ error: 'You can only message groups you lead' }, { status: 403 })
      }
      const { data: members, error } = await admin
        .from('person_victory_groups')
        .select('person_id')
        .in('victory_group_id', groupIds)
        .eq('status', 'approved')
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      for (const m of members ?? []) recipients.add(m.person_id)
    }

    for (const id of personIds) {
      if (wide || downline.has(id)) recipients.add(id)
    }

    recipients.delete(me.id)
    if (recipients.size === 0) {
      return NextResponse.json({ error: 'No one matched that audience' }, { status: 400 })
    }

    // Old clients that don't know about media yet still show a sensible body.
    const fallback = mediaKind === 'audio' ? '[Voice message]' : '[Video message]'
    const rows = [...recipients].map(to => ({
      from_person_id: me.id,
      to_person_id: to,
      kind: 'note' as const,
      body: text || fallback,
      media_url: mediaUrl ?? null,
      media_kind: mediaUrl ? mediaKind : null,
    }))
    const { error: insErr } = await admin.from('messages').insert(rows)
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

    return NextResponse.json({ sent: rows.length })
  } catch (e) {
    console.error('Broadcast error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'broadcast failed' }, { status: 500 })
  }
}
