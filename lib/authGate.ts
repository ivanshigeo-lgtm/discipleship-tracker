// First-screen auth gate for open signup.
//
// Product rules:
//   - Anyone can log in or open an account without a coach.
//   - A stored session must skip the login / open-account screen.
//   - While session restore is in flight, never flash the login gate.

export const OPEN_ACCOUNT_PATH = '/sign-up'
export const OPEN_ACCOUNT_LABEL = 'Open an account'
export const FINISH_PROFILE_HINT = 'Finish opening your account to enter the app.'

// Login chrome. Intentionally empty: the previous subtitle ("Coach's Dashboard")
// and footer ("Contact your coach if you need access") told people the app was
// invite-only. Open signup lives at OPEN_ACCOUNT_PATH.
export const LOGIN_SUBTITLE = ''
export const LOGIN_FOOTER = ''

export type AuthGate = 'loading' | 'login' | 'finish-profile' | 'app'

export function authEntryState(input: {
  loading: boolean
  userId: string | null
  profileId: string | null
  profileLoading: boolean
}): AuthGate {
  // Session restore / auth bootstrap — do not show Sign In yet.
  if (input.loading) return 'loading'
  if (input.userId && !input.profileId && input.profileLoading) return 'loading'
  if (!input.userId) return 'login'
  if (!input.profileId) return 'finish-profile'
  return 'app'
}

// Copy that tells a visitor they cannot enter without a coach. Used to lock the
// first screen (and the signed-in-but-no-profile fallback) to open signup.
export function copyRequiresCoachToEnter(text: string): boolean {
  const t = text.toLowerCase()
  return (
    t.includes("coach's dashboard") ||
    t.includes('contact your coach') ||
    t.includes('if you need access') ||
    t.includes('ask your coach for an invite') ||
    t.includes('need a coach')
  )
}

// Token refresh / getSession / OTP must not be aborted by the generic API
// timeout. Aborting an in-flight refresh can emit SIGNED_OUT and dump a
// returning user on Sign In after they swipe the app away.
export function isSupabaseAuthRequest(input: RequestInfo | URL): boolean {
  const url =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.href
        : typeof Request !== 'undefined' && input instanceof Request
          ? input.url
          : String(input)
  return url.includes('/auth/v1/')
}
