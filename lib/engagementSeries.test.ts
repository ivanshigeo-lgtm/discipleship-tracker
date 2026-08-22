import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  inferCadence,
  lastOfSeriesById,
  lastOfSeriesFor,
  heuristicSeriesKey,
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

describe('lastOfSeriesById — production-style siblings (no series_id)', () => {
  const weeks = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((d, i) =>
    e({ id: `w${i + 1}`, follow_up_date: d }),
  )

  it('flags only the last pending occurrence for the creator', () => {
    const map = lastOfSeriesById(weeks, 'ivan')
    assert.equal(map.size, 1)
    const info = map.get('w4')
    assert.ok(info)
    assert.equal(info.cadence, 'weekly')
    assert.equal(info.occurrenceCount, 4)
    assert.equal(info.lastDate, '2026-08-22')
    assert.equal(lastOfSeriesFor(weeks[0]!, weeks, 'ivan'), null)
  })

  it('does not notify a participant who does not own the series', () => {
    assert.equal(lastOfSeriesById(weeks, 'p1').size, 0)
    assert.equal(lastOfSeriesById(weeks, 'stranger').size, 0)
  })

  it('still flags the last row after earlier weeks are completed', () => {
    const mixed = weeks.map((row, i) => i < 3 ? { ...row, status: 'Completed' as const } : row)
    const map = lastOfSeriesById(mixed, 'ivan')
    assert.ok(map.get('w4'))
  })

  it('does not flag a one-off meeting', () => {
    const one = [e({ id: 'solo', follow_up_date: '2026-08-22' })]
    assert.equal(lastOfSeriesById(one, 'ivan').size, 0)
  })

  it('splits two same-title series months apart', () => {
    const first = ['2026-01-03', '2026-01-10', '2026-01-17', '2026-01-24'].map((d, i) =>
      e({ id: `a${i}`, follow_up_date: d }),
    )
    const second = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22'].map((d, i) =>
      e({ id: `b${i}`, follow_up_date: d }),
    )
    const map = lastOfSeriesById([...first, ...second], 'ivan')
    assert.equal(map.size, 2)
    assert.ok(map.get('a3'))
    assert.ok(map.get('b3'))
    assert.equal(map.get('a3')?.lastDate, '2026-01-24')
    assert.equal(map.get('b3')?.lastDate, '2026-08-22')
  })

  it('does not mix two owners with the same description', () => {
    const ivan = e({ id: 'i1', follow_up_date: '2026-08-01' })
    const ivan2 = e({ id: 'i2', follow_up_date: '2026-08-08' })
    const other = e({ id: 'o1', follow_up_date: '2026-08-15', created_by_person_id: 'coach-b' })
    const other2 = e({ id: 'o2', follow_up_date: '2026-08-22', created_by_person_id: 'coach-b' })
    const map = lastOfSeriesById([ivan, ivan2, other, other2], 'ivan')
    assert.equal(map.size, 1)
    assert.ok(map.get('i2'))
    assert.equal(lastOfSeriesById([ivan, ivan2, other, other2], 'coach-b').get('o2')?.engagementId, 'o2')
  })
})

describe('lastOfSeriesById — explicit series_id', () => {
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
  })

  it('does not treat a lone series_id row as a series', () => {
    const rows = [e({ id: 's1', follow_up_date: '2026-08-22', series_id: 'ser-1' })]
    assert.equal(lastOfSeriesById(rows, 'ivan').size, 0)
  })
})

describe('heuristicSeriesKey', () => {
  it('ignores description padding and groups the same meeting', () => {
    const a = e({ id: 'a', follow_up_date: '2026-08-01', description: 'Saturday 1:1' })
    const b = e({ id: 'b', follow_up_date: '2026-08-08', description: 'Saturday 1:1  ' })
    assert.equal(heuristicSeriesKey(a), heuristicSeriesKey(b))
  })
})
