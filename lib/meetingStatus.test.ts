import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isCancelledArchived, isMeetingOverdue, meetingEndsAt } from './meetingStatus.ts'

describe('isMeetingOverdue', () => {
  const now = new Date('2026-08-22T15:00:00')

  it('is overdue after a dated meeting time', () => {
    assert.equal(isMeetingOverdue('2026-08-22', '14:00:00', now), true)
    assert.equal(isMeetingOverdue('2026-08-22', '16:00:00', now), false)
  })

  it('treats a dateless-time meeting as overdue after that calendar day', () => {
    assert.equal(isMeetingOverdue('2026-08-21', null, now), true)
    assert.equal(isMeetingOverdue('2026-08-22', null, now), false)
  })

  it('is overdue for any past date', () => {
    assert.equal(isMeetingOverdue('2026-08-01', '09:00:00', now), true)
  })
})

describe('isCancelledArchived', () => {
  const now = new Date('2026-08-22T15:00:00')

  it('archives 24 hours after cancelled_at', () => {
    assert.equal(isCancelledArchived('2026-08-21T14:59:00', '2026-09-01', now), true)
    assert.equal(isCancelledArchived('2026-08-21T15:01:00', '2026-09-01', now), false)
  })

  it('falls back to meeting date for rows with no cancelled_at', () => {
    assert.equal(isCancelledArchived(null, '2026-08-21', now), true)
    assert.equal(isCancelledArchived(null, '2026-08-22', now), false)
    assert.equal(isCancelledArchived(null, '2026-08-23', now), false)
  })
})

describe('meetingEndsAt', () => {
  it('parses HH:MM:SS as local time on that date', () => {
    const d = meetingEndsAt('2026-08-22', '09:30:00')
    assert.equal(d.getHours(), 9)
    assert.equal(d.getMinutes(), 30)
  })
})
