import { NextRequest, NextResponse } from 'next/server'
import { getGoogleTokens } from '../../../../../lib/googleCalendar'

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')

  if (!personId) {
    return NextResponse.json({ error: 'Missing personId' }, { status: 400 })
  }

  const tokens = await getGoogleTokens(personId)
  return NextResponse.json({ connected: !!tokens })
}
