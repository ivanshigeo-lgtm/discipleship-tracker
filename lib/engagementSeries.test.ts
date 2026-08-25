import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  inferCadence,
  lastOfSeriesById,
  lastOfSeriesFor,
  heuristicSeriesKey,
  clusterHeuristicSeries,
  backfillSeriesAssignments,
  normalizeFollowUpTime,
  type SeriesOccurrence,
} from './engagementSeries.ts'
import { nextOccurrenceDates } from './recurrence.ts'

function e(partial: Partial<SeriesOccurrence> & { id: string; follow_up_date: string }): SeriesOccurrence {
  return {
    person_id: 'p1',
    created_by_person_id: 'ivan',
    description: 'Saturday 1:1',
    follow_up_time: '09:00:00',
    meeting_type: 'One2One',
    status: 'Pending',
    series_id: null,
    ...partial,
  }
}

describe('inferCadence', () => {
  it('detects weekly Saturday dates', () => {
    assert.equal(inferCadence(['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']), 'weekly')
  })
  it('detects biweekly', () => {
    assert.equal(inferCadence(['2026-08-01', '2026-08-15', '2026-08-29']), 'biweekly')
  })
  it('detects monthly same date', () => {
    assert.equal(inferCadence(['2026-05-15', '2026-06-15', '2026-07-15']), 'monthly')
  })
  it('detects monthly weekday (2nd Saturday)', () => {
    assert.equal(inferCadence(['2026-05-09', '2026-06-13', '2026-07-11']), 'monthly-weekday')
  })
  it('returns null for a single date', () => {
    assert.equal(inferCadence(['2026-08-01']), null)
  })
})

describe('nextOccurrenceDates', () => {
  it('appends N weekly dates after the last', () => {
    assert.deepEqual(
      nextOccurrenceDates('2026-08-22', 4, 'weekly'),
      ['2026-08-29', '2026-09-05', '2026-09-12', '2026-09-19'],
    )
  })
  it('appends monthly-weekday after the last 2nd Saturday', () => {
    const next = nextOccurrenceDates('2026-08-08', 2, 'monthly-weekday')
    assert.deepEqual(next, ['2026-09-12', '2026-10-10'])
  })
  it('returns nothing for a one-off cadence', () => {
    assert.deepEqual(nextOccurrenceDates('2026-08-22', 4, 'none'), [])
  })
})

describe('lastOfSeriesById — rolling 1:1s are not a finite series', () => {
  it('does not flag completed weekly history + one pending next meeting', () => {
    const completed = [
      '2026-06-06', '2026-06-13', '2026-06-20', '2026-06-27',
      '2026-07-04', '2026-07-11', '2026-07-18', '2026-07-25',
      '2026-08-01', '2026-08-08', '2026-08-15',
    ].map((d, i) => e({ id: `h${i}`, follow_up_date: d, status: 'Completed' }))
    const next = e({ id: 'next', follow_up_date: '2026-08-22', status: 'Pending' })
    const all = [...completed, next]
    assert.equal(lastOfSeriesById(all, 'ivan').size, 0)
    assert.equal(lastOfSeriesFor(next, all, 'ivan'), null)
    // Heuristic clustering still sees a weekly cadence — that is why display
    // must not use it (EngagementDetailModal loads this person's full history).
    assert.ok(clusterHeuristicSeries(all).some(c => c.rows.some(r => r.id === 'next')))
  })

  it('does not infer last-of-series from pending siblings without series_id', () => {
    const weeks = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((d, i) =>
      e({ id: `w${i + 1}`, follow_up_date: d }),
    )
    assert.equal(lastOfSeriesById(weeks, 'ivan').size, 0)
    assert.equal(lastOfSeriesFor(weeks[3]!, weeks, 'ivan'), null)
  })

  it('does not flag a one-off meeting', () => {
    const one = [e({ id: 'solo', follow_up_date: '2026-08-22' })]
    assert.equal(lastOfSeriesById(one, 'ivan').size, 0)
  })

  it('does not mix two owners or two same-title stretches into a series', () => {
    const ivan = e({ id: 'i1', follow_up_date: '2026-08-01' })
    const ivan2 = e({ id: 'i2', follow_up_date: '2026-08-08' })
    const other = e({ id: 'o1', follow_up_date: '2026-08-15', created_by_person_id: 'coach-b' })
    const other2 = e({ id: 'o2', follow_up_date: '2026-08-22', created_by_person_id: 'coach-b' })
    assert.equal(lastOfSeriesById([ivan, ivan2, other, other2], 'ivan').size, 0)
    assert.equal(lastOfSeriesById([ivan, ivan2, other, other2], 'coach-b').size, 0)
  })
})

describe('lastOfSeriesById — explicit series_id', () => {
  const weeks = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((d, i) =>
    e({ id: `w${i + 1}`, follow_up_date: d, series_id: 'ser-4' }),
  )

  it('a 4-date series_id batch flags ONLY the last date', () => {
    const map = lastOfSeriesById(weeks, 'ivan')
    assert.equal(map.size, 1)
    const info = map.get('w4')
    assert.ok(info)
    assert.equal(info.seriesId, 'ser-4')
    assert.equal(info.cadence, 'weekly')
    assert.equal(info.occurrenceCount, 4)
    assert.equal(info.lastDate, '2026-08-22')
    assert.equal(lastOfSeriesFor(weeks[3]!, weeks, 'ivan')?.engagementId, 'w4')
  })

  it('does not flag earlier dates in that batch', () => {
    const map = lastOfSeriesById(weeks, 'ivan')
    assert.equal(map.has('w1'), false)
    assert.equal(map.has('w2'), false)
    assert.equal(map.has('w3'), false)
    assert.equal(lastOfSeriesFor(weeks[0]!, weeks, 'ivan'), null)
    assert.equal(lastOfSeriesFor(weeks[1]!, weeks, 'ivan'), null)
    assert.equal(lastOfSeriesFor(weeks[2]!, weeks, 'ivan'), null)
  })

  it('still flags the last date after earlier weeks are completed', () => {
    const mixed = weeks.map((row, i) => i < 3 ? { ...row, status: 'Completed' as const } : row)
    const map = lastOfSeriesById(mixed, 'ivan')
    assert.ok(map.get('w4'))
    assert.equal(map.size, 1)
  })

  it('does not notify a participant who does not own the series', () => {
    assert.equal(lastOfSeriesById(weeks, 'p1').size, 0)
    assert.equal(lastOfSeriesById(weeks, 'stranger').size, 0)
  })

  it('trusts series_id even when descriptions later diverge', () => {
    const rows = [
      e({ id: 's1', follow_up_date: '2026-08-01', series_id: 'ser-1', description: 'Saturday 1:1' }),
      e({ id: 's2', follow_up_date: '2026-08-08', series_id: 'ser-1', description: 'Saturday 1:1 (park)' }),
      e({ id: 's3', follow_up_date: '2026-08-15', series_id: 'ser-1', description: 'Saturday 1:1 (park)' }),
    ]
    const map = lastOfSeriesById(rows, 'ivan')
    assert.ok(map.get('s3'))
    assert.equal(map.get('s3')?.seriesId, 'ser-1')
    assert.equal(map.get('s3')?.occurrenceCount, 3)
    assert.equal(map.has('s1'), false)
    assert.equal(map.has('s2'), false)
  })

  it('does not treat a lone series_id row as a series', () => {
    const rows = [e({ id: 's1', follow_up_date: '2026-08-22', series_id: 'ser-1' })]
    assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
  })

  it('does not fall back to an earlier pending date if the last date is cancelled', () => {
    const rows = weeks.map((row, i) => i === 3 ? { ...row, status: 'Cancelled' as const } : row)
    assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
  })
})

describe('heuristicSeriesKey', () => {
  it('ignores description padding and groups the same meeting', () => {
    const a = e({ id: 'a', follow_up_date: '2026-08-01', description: 'Saturday 1:1' })
    const b = e({ id: 'b', follow_up_date: '2026-08-08', description: 'Saturday 1:1  ' })
    assert.equal(heuristicSeriesKey(a), heuristicSeriesKey(b))
  })

  it('groups HH:MM with HH:MM:SS clock times', () => {
    const a = e({ id: 'a', follow_up_date: '2026-08-01', follow_up_time: '09:00' })
    const b = e({ id: 'b', follow_up_date: '2026-08-08', follow_up_time: '09:00:00' })
    assert.equal(heuristicSeriesKey(a), heuristicSeriesKey(b))
    assert.equal(normalizeFollowUpTime('09:00:00'), '09:00')
  })

  it('groups meeting_type case-insensitively', () => {
    const a = e({ id: 'a', follow_up_date: '2026-08-01', meeting_type: 'One2One' })
    const b = e({ id: 'b', follow_up_date: '2026-08-08', meeting_type: 'one2one' })
    assert.equal(heuristicSeriesKey(a), heuristicSeriesKey(b))
  })
})

describe('lastOfSeriesById — every finite engagement meeting_type', () => {
  const saturdays = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']

  for (const meetingType of ['One2One', 'Making Disciples', 'Church Community', 'Empowering Leaders', 'Coffee', null]) {
    it(`flags only the last date of a ${meetingType ?? 'untyped'} series_id batch`, () => {
      const rows = saturdays.map((d, i) =>
        e({
          id: `${meetingType ?? 'none'}-${i}`,
          follow_up_date: d,
          meeting_type: meetingType,
          description: meetingType ?? 'Hangout',
          series_id: `ser-${meetingType ?? 'none'}`,
        }),
      )
      const map = lastOfSeriesById(rows, 'ivan')
      assert.equal(map.size, 1)
      assert.ok(map.get(`${meetingType ?? 'none'}-3`))
      assert.equal(map.get(`${meetingType ?? 'none'}-3`)?.cadence, 'weekly')
      assert.equal(map.has(`${meetingType ?? 'none'}-0`), false)
    })

    it(`does not flag a rolling ${meetingType ?? 'untyped'} 1:1 without series_id`, () => {
      const rows = saturdays.map((d, i) =>
        e({
          id: `roll-${meetingType ?? 'none'}-${i}`,
          follow_up_date: d,
          meeting_type: meetingType,
          description: meetingType ?? 'Hangout',
          status: i < 3 ? 'Completed' : 'Pending',
        }),
      )
      assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
    })
  }

  it('does not flag a production-style ONe2ONe 1:1 with null series_id', () => {
    const dates = ['2026-08-04', '2026-08-13', '2026-08-27', '2026-09-03', '2026-09-10', '2026-09-17']
    const rows = dates.map((d, i) =>
      e({
        id: `j${i}`,
        follow_up_date: d,
        description: 'ONe2ONe 1',
        meeting_type: 'One2One',
        follow_up_time: '17:00',
        status: i < dates.length - 1 ? 'Completed' : 'Pending',
      }),
    )
    assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
    assert.equal(lastOfSeriesFor(rows[5]!, rows, 'ivan'), null)
  })

  it('flags a finite Church Community series_id batch (not a standing victory_group)', () => {
    const dates = ['2026-08-23', '2026-08-30', '2026-09-06', '2026-09-13']
    const rows = dates.map((d, i) =>
      e({
        id: `cc${i}`,
        follow_up_date: d,
        description: 'Church Community',
        meeting_type: 'Church Community',
        follow_up_time: '09:45',
        series_id: 'ser-cc',
      }),
    )
    const map = lastOfSeriesById(rows, 'ivan')
    assert.equal(map.size, 1)
    assert.ok(map.get('cc3'))
    assert.equal(map.get('cc3')?.cadence, 'weekly')
    assert.equal(map.has('cc0'), false)
  })

  it('does not mix two series_id batches that share a person and time', () => {
    const md = saturdays.map((d, i) =>
      e({ id: `md${i}`, follow_up_date: d, meeting_type: 'Making Disciples', description: 'Making Disciples', series_id: 'ser-md' }),
    )
    const coffee = saturdays.map((d, i) =>
      e({ id: `cf${i}`, follow_up_date: d, meeting_type: 'Coffee', description: 'Coffee', series_id: 'ser-cf' }),
    )
    const map = lastOfSeriesById([...md, ...coffee], 'ivan')
    assert.equal(map.size, 2)
    assert.ok(map.get('md3'))
    assert.ok(map.get('cf3'))
    assert.equal(map.has('md2'), false)
    assert.equal(map.has('cf2'), false)
  })

  it('does not flag irregular one-offs that only happen to share a title', () => {
    const rows = [
      e({ id: 'a', follow_up_date: '2026-08-01' }),
      e({ id: 'b', follow_up_date: '2026-08-04' }),
      e({ id: 'c', follow_up_date: '2026-08-20' }),
    ]
    assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
    assert.equal(clusterHeuristicSeries(rows).length, 0)
  })
})

describe('clusterHeuristicSeries — backfill only, not display', () => {
  it('still clusters a long pause into two groups for backfill', () => {
    const rows = [
      e({ id: 'old1', follow_up_date: '2026-06-11' }),
      e({ id: 'old2', follow_up_date: '2026-06-18' }),
      e({ id: 'new1', follow_up_date: '2026-08-06' }),
      e({ id: 'new2', follow_up_date: '2026-08-13' }),
      e({ id: 'new3', follow_up_date: '2026-08-20' }),
    ]
    const clusters = clusterHeuristicSeries(rows)
    assert.equal(clusters.length, 2)
    assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
  })
})

describe('backfillSeriesAssignments', () => {
  it('stamps the same series_id on a null-series weekly cluster', () => {
    const rows = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((d, i) =>
      e({ id: `w${i + 1}`, follow_up_date: d, meeting_type: 'Making Disciples', description: 'Making Disciples' }),
    )
    let n = 0
    const assignments = backfillSeriesAssignments(rows, () => `ser-${++n}`)
    assert.equal(assignments.length, 1)
    assert.equal(assignments[0]!.seriesId, 'ser-1')
    assert.deepEqual(assignments[0]!.engagementIds.sort(), ['w1', 'w2', 'w3', 'w4'])
    assert.equal(assignments[0]!.cadence, 'weekly')
    assert.equal(assignments[0]!.lastDate, '2026-08-22')
    assert.equal(assignments[0]!.meetingType, 'Making Disciples')
  })

  it('gives two same-title series months apart different ids', () => {
    const first = ['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-24'].map((d, i) =>
      e({ id: `a${i}`, follow_up_date: d }),
    )
    const second = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((d, i) =>
      e({ id: `b${i}`, follow_up_date: d }),
    )
    let n = 0
    const assignments = backfillSeriesAssignments([...first, ...second], () => `ser-${++n}`)
    assert.equal(assignments.length, 2)
    assert.equal(new Set(assignments.map(a => a.seriesId)).size, 2)
  })

  it('does not stamp rows that already have a series_id', () => {
    const rows = [
      e({ id: 's1', follow_up_date: '2026-08-01', series_id: 'already' }),
      e({ id: 's2', follow_up_date: '2026-08-08', series_id: 'already' }),
    ]
    assert.equal(backfillSeriesAssignments(rows).length, 0)
  })

  it('leaves lastOfSeries working after the stamp', () => {
    const rows = ['2026-08-01', '2026-08-08', '2026-08-15'].map((d, i) =>
      e({ id: `c${i}`, follow_up_date: d, meeting_type: 'Church Community', description: 'Church Community' }),
    )
    const [assignment] = backfillSeriesAssignments(rows, () => 'backfilled')
    const stamped = rows.map(r => ({ ...r, series_id: assignment!.seriesId }))
    const map = lastOfSeriesById(stamped, 'ivan')
    assert.equal(map.get('c2')?.seriesId, 'backfilled')
    assert.equal(map.get('c2')?.occurrenceCount, 3)
  })

  it('does not invent a series for a single date (no counted end)', () => {
    assert.equal(backfillSeriesAssignments([e({ id: 'solo', follow_up_date: '2026-08-22' })]).length, 0)
  })
})
