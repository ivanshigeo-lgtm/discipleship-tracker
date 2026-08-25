#!/usr/bin/env npx tsx
// One-time backfill of engagements.series_id for finite recurring series.
//
// Uses the same grouping as lib/engagementSeries.ts (owner + person +
// description + time + meeting_type + regular cadence, 2+ dates). Does NOT
// touch victory_groups — those are unbounded standing groups with no end.
// Does not create calendar events or email anyone.
//
//   npx tsx scripts/backfill-engagement-series.ts          # dry-run
//   npx tsx scripts/backfill-engagement-series.ts --apply  # write series_id
//
// Safe to re-run: rows that already have series_id are skipped.

import { existsSync, readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import {
  backfillSeriesAssignments,
  type SeriesOccurrence,
} from '../lib/engagementSeries'

function loadEnv() {
  for (const p of ['.env.local', '.env']) {
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
      if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2]!.trim()
    }
  }
}

async function fetchAll(
  sb: ReturnType<typeof createClient>,
): Promise<SeriesOccurrence[]> {
  const rows: SeriesOccurrence[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('engagements')
      .select('id, person_id, created_by_person_id, description, follow_up_date, follow_up_time, meeting_type, status, series_id')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    rows.push(...((data ?? []) as SeriesOccurrence[]))
    if ((data?.length ?? 0) < 1000) return rows
  }
}

async function main() {
  loadEnv()
  const apply = process.argv.includes('--apply')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const rows = await fetchAll(sb)
  const assignments = backfillSeriesAssignments(rows)

  const already = rows.filter(r => r.series_id).length
  const covered = assignments.reduce((n, a) => n + a.engagementIds.length, 0)
  console.log(`${rows.length} engagements (${already} already have series_id)`)
  console.log(`${assignments.length} finite series covering ${covered} rows`)
  for (const a of assignments.slice(0, 30)) {
    console.log(`  ${a.seriesId.slice(0, 8)}  ${a.cadence.padEnd(16)} ${String(a.engagementIds.length).padStart(2)} occ  last ${a.lastDate}  ${a.meetingType ?? '(untyped)'}`)
  }
  if (assignments.length > 30) console.log(`  … ${assignments.length - 30} more`)

  if (!apply) {
    console.log('\nDry-run only. Pass --apply to stamp series_id. victory_groups are not touched.')
    return
  }

  let updated = 0
  for (const a of assignments) {
    const { error, count } = await sb
      .from('engagements')
      .update({ series_id: a.seriesId })
      .in('id', a.engagementIds)
      .is('series_id', null)
    if (error) throw new Error(error.message)
    updated += count ?? a.engagementIds.length
  }
  console.log(`\nStamped series_id on ${updated} rows.`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
