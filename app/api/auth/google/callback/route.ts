import { NextRequest, NextResponse } from 'next/server'
import { getTokensFromCode, saveGoogleTokens } from '../../../../../lib/googleCalendar'

const successPage = `
<!DOCTYPE html>
<html>
<head>
  <title>Google Calendar Connected</title>
  <style>
    body { font-family: system-ui; background: #0a0f1a; color: #f6f1e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #141b2d; padding: 2rem; border-radius: 1rem; text-align: center; max-width: 400px; }
    h1 { color: #36d6c3; margin-bottom: 1rem; }
    p { margin-bottom: 1.5rem; opacity: 0.8; }
  </style>
  <script>
    // Redirect after a short delay to allow browser to settle
    setTimeout(function() {
      window.location.href = '/?gcal=connected&t=' + Date.now();
    }, 500);
  </script>
</head>
<body>
  <div class="card">
    <h1>Connected!</h1>
    <p>Redirecting to dashboard...</p>
  </div>
</body>
</html>
`

const errorPage = (message: string) => `
<!DOCTYPE html>
<html>
<head>
  <title>Connection Failed</title>
  <style>
    body { font-family: system-ui; background: #0a0f1a; color: #f6f1e7; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #141b2d; padding: 2rem; border-radius: 1rem; text-align: center; max-width: 400px; }
    h1 { color: #f0729f; margin-bottom: 1rem; }
    p { margin-bottom: 1.5rem; opacity: 0.8; }
    a { display: inline-block; background: #3b82f6; color: white; padding: 0.75rem 1.5rem; border-radius: 0.5rem; text-decoration: none; font-weight: 600; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Connection Failed</h1>
    <p>${message}</p>
    <a href="/">Return to Dashboard</a>
  </div>
</body>
</html>
`

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const personId = request.nextUrl.searchParams.get('state')

  if (!code || !personId) {
    return new NextResponse(errorPage('Missing parameters'), { headers: { 'Content-Type': 'text/html' } })
  }

  try {
    const tokens = await getTokensFromCode(code)
    await saveGoogleTokens(personId, tokens)
    return new NextResponse(successPage, { headers: { 'Content-Type': 'text/html' } })
  } catch (error) {
    console.error('Google OAuth error:', error)
    return new NextResponse(errorPage('Failed to connect. Please try again.'), { headers: { 'Content-Type': 'text/html' } })
  }
}
