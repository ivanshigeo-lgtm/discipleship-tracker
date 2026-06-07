import { NextRequest, NextResponse } from 'next/server'
import { getAuthUrl } from '../../../../lib/googleCalendar'

export async function GET(request: NextRequest) {
  const personId = request.nextUrl.searchParams.get('personId')

  if (!personId) {
    return NextResponse.json({ error: 'Missing personId' }, { status: 400 })
  }

  const authUrl = getAuthUrl(personId)
  return NextResponse.redirect(authUrl)
}
