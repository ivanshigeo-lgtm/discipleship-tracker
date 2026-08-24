import { NextRequest, NextResponse } from 'next/server'
import {
  backfillMissingCalendarEvents,
} from '../../../../lib/googleCalendar'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}))
  const personId = body.personId as string | undefined

  if (!personId) {
    return NextResponse.json({ error: 'Missing personId' }, { status: 400 })
  }

  try {
    const result = await backfillMissingCalendarEvents(personId)
    if (result.errors.includes('not_connected')) {
      return NextResponse.json({ synced: false, reason: 'not_connected', ...result })
    }
    return NextResponse.json({ synced: result.failed === 0, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'backfill_failed'
    const refreshFailed = /token refresh|invalid_grant|reconnect/i.test(message)
    console.error('Calendar backfill error:', error)
    return NextResponse.json(
      {
        synced: false,
        reason: refreshFailed ? 'token_refresh_failed' : 'backfill_failed',
        error: message,
      },
      { status: 500 },
    )
  }
}
