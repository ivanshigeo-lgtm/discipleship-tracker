import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  IVAN_PERSONAL_GMAIL,
  accessTokenNeedsRefresh,
  addHour,
  calendarToday,
  calendarWriteSkipReason,
  deleteEventParams,
  engagementEventInsertParams,
  engagementEventSummary,
  googleAccountBlockedReason,
  googleAccountMismatchWarning,
  groupEventSummary,
  groupRecurringEventParams,
  isGoogleNotFound,
  mergeGoogleTokens,
  persistRefreshedGoogleTokens,
} from './googleCalendarLogic.ts'

describe('calendarWriteSkipReason', () => {
  it('skips when no tokens are stored', () => {
    assert.equal(calendarWriteSkipReason(null), 'not_connected')
  })

  it('skips when both access and refresh tokens are missing', () => {
    assert.equal(calendarWriteSkipReason({ access_token: null, refresh_token: null }), 'not_connected')
  })

  it('does not skip when a refresh token is present (even if access expired)', () => {
    assert.equal(calendarWriteSkipReason({ access_token: null, refresh_token: 'rt' }), null)
  })
})

describe('googleAccountBlockedReason', () => {
  it('refuses ivanshigeo@gmail.com for anyone', () => {
    const reason = googleAccountBlockedReason(IVAN_PERSONAL_GMAIL)
    assert.ok(reason)
    assert.match(reason, /ivanshigeo@gmail.com/)
    assert.match(reason, /church calendar/)
  })

  it('allows jasato@gmail.com', () => {
    assert.equal(googleAccountBlockedReason('jasato@gmail.com'), null)
  })

  it('allows a missing email so existing connections can keep working', () => {
    assert.equal(googleAccountBlockedReason(null), null)
  })
})

describe('googleAccountMismatchWarning', () => {
  it('warns when the connected Gmail is not the person email', () => {
    const warning = googleAccountMismatchWarning({
      googleEmail: IVAN_PERSONAL_GMAIL,
      personEmail: 'jasato@gmail.com',
    })
    assert.ok(warning)
    assert.match(warning, /ivanshigeo@gmail.com/)
    assert.match(warning, /jasato@gmail.com/)
  })

  it('is silent when they match', () => {
    assert.equal(
      googleAccountMismatchWarning({ googleEmail: 'jasato@gmail.com', personEmail: 'jasato@gmail.com' }),
      null,
    )
  })
})

describe('accessTokenNeedsRefresh', () => {
  const now = Date.parse('2026-08-24T21:00:00Z')

  it('refreshes when expiry is in the past', () => {
    assert.equal(accessTokenNeedsRefresh('2026-08-19T17:43:04.466Z', now), true)
  })

  it('refreshes when expiry is missing (do not assume the token is valid)', () => {
    assert.equal(accessTokenNeedsRefresh(null, now), true)
  })

  it('does not refresh a token that is still well within its window', () => {
    assert.equal(accessTokenNeedsRefresh(now + 10 * 60_000, now), false)
  })

  it('refreshes inside the 60s skew window', () => {
    assert.equal(accessTokenNeedsRefresh(now + 30_000, now), true)
  })
})

describe('mergeGoogleTokens', () => {
  it('does not wipe refresh_token when Google omits it on refresh', () => {
    const merged = mergeGoogleTokens(
      {
        access_token: 'old-at',
        refresh_token: 'keep-rt',
        expiry_date: '2026-08-19T17:43:04.466Z',
        google_account_email: 'jasato@gmail.com',
      },
      { access_token: 'new-at', expiry_date: Date.parse('2026-08-24T22:00:00Z') },
    )
    assert.equal(merged.access_token, 'new-at')
    assert.equal(merged.refresh_token, 'keep-rt')
    assert.equal(merged.google_account_email, 'jasato@gmail.com')
    assert.equal(merged.expiry_date, Date.parse('2026-08-24T22:00:00Z'))
  })
})

describe('persistRefreshedGoogleTokens', () => {
  const expired = {
    access_token: 'expired-at',
    refresh_token: 'rt',
    expiry_date: '2026-08-19T17:43:04.466Z',
    google_account_email: 'jasato@gmail.com',
  }
  const nowMs = Date.parse('2026-08-24T21:00:00Z')

  it('does not call Google when the access token is still valid', async () => {
    let called = false
    const result = await persistRefreshedGoogleTokens({
      stored: { ...expired, expiry_date: nowMs + 10 * 60_000 },
      nowMs,
      getAccessToken: async () => {
        called = true
        return { token: 'should-not-run' }
      },
      save: async () => {
        throw new Error('should not save')
      },
    })
    assert.equal(result.refreshed, false)
    assert.equal(called, false)
  })

  it('awaits refresh and persist when the access token is expired', async () => {
    const order: string[] = []
    const saved: unknown[] = []
    const result = await persistRefreshedGoogleTokens({
      stored: expired,
      nowMs,
      getAccessToken: async () => {
        order.push('refresh')
        return { token: 'fresh-at', expiry_date: nowMs + 3600_000 }
      },
      save: async (merged) => {
        order.push('save')
        saved.push(merged)
      },
    })
    assert.equal(result.refreshed, true)
    assert.deepEqual(order, ['refresh', 'save'])
    assert.equal((saved[0] as { access_token: string }).access_token, 'fresh-at')
    assert.equal((saved[0] as { refresh_token: string }).refresh_token, 'rt')
  })

  it('does not swallow a refresh failure', async () => {
    await assert.rejects(
      () => persistRefreshedGoogleTokens({
        stored: expired,
        nowMs,
        getAccessToken: async () => {
          throw new Error('invalid_grant')
        },
        save: async () => {},
      }),
      /Google token refresh failed: invalid_grant/,
    )
  })

  it('does not swallow a persist failure', async () => {
    await assert.rejects(
      () => persistRefreshedGoogleTokens({
        stored: expired,
        nowMs,
        getAccessToken: async () => ({ token: 'fresh-at', expiry_date: nowMs + 3600_000 }),
        save: async () => {
          throw new Error('upsert failed')
        },
      }),
      /Failed to persist refreshed Google tokens: upsert failed/,
    )
  })

  it('throws when expired with no refresh_token rather than sending the dead access token', async () => {
    await assert.rejects(
      () => persistRefreshedGoogleTokens({
        stored: { access_token: 'expired-at', refresh_token: null, expiry_date: expired.expiry_date },
        nowMs,
        getAccessToken: async () => ({ token: 'nope' }),
        save: async () => {},
      }),
      /no refresh_token is stored/,
    )
  })
})

describe('event payloads', () => {
  it('builds a 1:1 event with church title, Honolulu TZ, 1 hour, no attendees, no invite emails', () => {
    const params = engagementEventInsertParams({
      summary: engagementEventSummary('Jeyssen Tumacder', 'ONe2ONe 1', 'One2One'),
      startDate: '2026-08-29',
      startTime: '09:00',
    })
    assert.equal(params.calendarId, 'primary')
    assert.equal(params.sendUpdates, 'none')
    assert.equal(params.requestBody.summary, 'Jeyssen Tumacder: ONe2ONe 1')
    assert.equal(params.requestBody.start.timeZone, 'Pacific/Honolulu')
    assert.equal(params.requestBody.start.dateTime, '2026-08-29T09:00:00')
    assert.equal(params.requestBody.end.dateTime, '2026-08-29T10:00:00')
    assert.equal('attendees' in params.requestBody, false)
  })

  it('builds a Grace Group recurring event without attendees', () => {
    const params = groupRecurringEventParams({
      summary: groupEventSummary('Makawao'),
      description: 'Weekly Grace Group meeting',
      startDate: '2026-08-25',
      time: '19:00',
      rruleDay: 'TU',
    })
    assert.equal(params.sendUpdates, 'none')
    assert.equal(params.requestBody.summary, 'Grace Group: Makawao')
    assert.deepEqual(params.requestBody.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=TU'])
    assert.equal('attendees' in params.requestBody, false)
  })

  it('deletes without sending Google invite emails', () => {
    const params = deleteEventParams('abc123')
    assert.equal(params.sendUpdates, 'none')
    assert.equal(params.calendarId, 'primary')
  })

  it('adds one hour across noon', () => {
    assert.equal(addHour('11:30'), '12:30')
    assert.equal(addHour('23:15'), '00:15')
  })
})

describe('calendarToday', () => {
  it('returns a YYYY-MM-DD Honolulu date', () => {
    assert.match(calendarToday(new Date('2026-08-25T08:00:00Z')), /^\d{4}-\d{2}-\d{2}$/)
    // 8:00 UTC is still the 24th in Honolulu (UTC-10)
    assert.equal(calendarToday(new Date('2026-08-25T08:00:00Z')), '2026-08-24')
  })
})

describe('isGoogleNotFound', () => {
  it('treats a 404 as already-deleted', () => {
    assert.equal(isGoogleNotFound({ code: 404 }), true)
    assert.equal(isGoogleNotFound({ response: { status: 404 } }), true)
    assert.equal(isGoogleNotFound({ code: 401 }), false)
  })
})
