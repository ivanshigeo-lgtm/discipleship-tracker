import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '../../../../lib/supabaseServer'

export const runtime = 'nodejs'
export const maxDuration = 60

// Daily janitor for the visibility overlay. isoap_entry_visibility rows point
// at entries that live in iSOAP (journal_entries); when an entry is deleted
// from iSOAP directly (its own app UI), the WikiChurch share row is left
// dangling and the feeds have to tolerate a ghost. This cron prunes those rows
// so a delete in the system of record eventually propagates here.
//
// Existence is checked through the same /api/entries/list contract the feeds
// use (shared-secret auth, user_id-scoped, entry_ids-bounded) — this app never
// holds the iSOAP service-role key. Deletion is deliberately conservative:
//   • a person with no isoap_links row is SKIPPED (can't verify → don't touch)
//   • any non-OK / failed list call skips that person's rows entirely
// so an iSOAP outage can never mass-delete shares.
//
// Invoked by Vercel cron (vercel.json); Vercel sends
// `Authorization: Bearer ${CRON_SECRET}` when the env var is set.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ?dry=1 reports what WOULD be deleted without touching anything.
  const dry = request.nextUrl.searchParams.get('dry') === '1'
  const ingestSecret = process.env.ISOAP_INGEST_SECRET
  if (!ingestSecret) {
    return NextResponse.json({ error: 'ISOAP_INGEST_SECRET not configured' }, { status: 500 })
  }
  const listUrl = (
    process.env.ISOAP_INGEST_URL || 'https://api.isoap.app/api/entries/ingest'
  ).replace(/\/ingest$/, '/list')

  const admin = getSupabaseAdmin()

  // Page through the whole overlay table (Supabase caps a response at 1,000).
  type VisRow = { wc_person_id: string; isoap_entry_id: string }
  const visRows: VisRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await admin
      .from('isoap_entry_visibility')
      .select('wc_person_id, isoap_entry_id')
      .order('isoap_entry_id')
      .range(from, from + 999)
    if (error) {
      return NextResponse.json({ error: 'Could not read visibility rows' }, { status: 500 })
    }
    visRows.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  if (visRows.length === 0) {
    return NextResponse.json({ checked: 0, deleted: 0, skippedPeople: 0 })
  }

  const entryIdsByPerson = new Map<string, string[]>()
  for (const r of visRows) {
    if (!r.wc_person_id || !r.isoap_entry_id) continue
    const list = entryIdsByPerson.get(r.wc_person_id) ?? []
    list.push(r.isoap_entry_id)
    entryIdsByPerson.set(r.wc_person_id, list)
  }

  // Person → iSOAP account, chunked (never .in() an unbounded id list — the
  // URL silently overflows).
  const personIds = Array.from(entryIdsByPerson.keys())
  const isoapUserById = new Map<string, string>()
  for (let i = 0; i < personIds.length; i += 100) {
    const { data: links, error } = await admin
      .from('isoap_links')
      .select('wc_person_id, isoap_user_id')
      .in('wc_person_id', personIds.slice(i, i + 100))
    if (error) {
      return NextResponse.json({ error: 'Could not read isoap_links' }, { status: 500 })
    }
    for (const l of links ?? []) {
      if (l.isoap_user_id) isoapUserById.set(l.wc_person_id, l.isoap_user_id as string)
    }
  }

  let deleted = 0
  let skippedPeople = 0
  const orphans: { wc_person_id: string; entry_ids: string[] }[] = []
  for (const [pid, entryIds] of entryIdsByPerson) {
    const isoapUserId = isoapUserById.get(pid)
    if (!isoapUserId) {
      skippedPeople++
      continue
    }
    let alive: Set<string>
    try {
      const resp = await fetch(listUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ingest-secret': ingestSecret },
        body: JSON.stringify({ isoap_user_id: isoapUserId, entry_ids: entryIds }),
      })
      if (!resp.ok) {
        skippedPeople++
        continue
      }
      const json = await resp.json().catch(() => null)
      if (!json || !Array.isArray(json.entries)) {
        skippedPeople++
        continue
      }
      alive = new Set((json.entries as { id: string }[]).map((e) => e.id))
    } catch {
      skippedPeople++
      continue
    }
    const gone = entryIds.filter((id) => !alive.has(id))
    if (gone.length === 0) continue

    if (!dry) {
      for (let i = 0; i < gone.length; i += 100) {
        const chunk = gone.slice(i, i + 100)
        const { error: delErr } = await admin
          .from('isoap_entry_visibility')
          .delete()
          .eq('wc_person_id', pid)
          .in('isoap_entry_id', chunk)
        if (delErr) continue
        deleted += chunk.length
      }
    }
    orphans.push({ wc_person_id: pid, entry_ids: gone })
  }

  return NextResponse.json({
    dry,
    checked: visRows.length,
    people: entryIdsByPerson.size,
    deleted,
    skippedPeople,
    orphans,
  })
}
