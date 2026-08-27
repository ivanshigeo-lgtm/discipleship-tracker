import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  authEntryState,
  copyRequiresCoachToEnter,
  isSupabaseAuthRequest,
  LOGIN_FOOTER,
  LOGIN_SUBTITLE,
  OPEN_ACCOUNT_LABEL,
  OPEN_ACCOUNT_PATH,
  FINISH_PROFILE_HINT,
} from './authGate.ts'

describe('authEntryState — first screen', () => {
  it('does not show Sign In while a stored session is still restoring', () => {
    assert.equal(
      authEntryState({ loading: true, userId: null, profileId: null, profileLoading: true }),
      'loading',
    )
  })

  it('shows the open login/open-account screen only when auth has resolved with no user', () => {
    assert.equal(
      authEntryState({ loading: false, userId: null, profileId: null, profileLoading: false }),
      'login',
    )
  })

  it('skips Sign In when a stored session has a user', () => {
    assert.equal(
      authEntryState({
        loading: false,
        userId: 'auth-1',
        profileId: 'person-1',
        profileLoading: false,
      }),
      'app',
    )
  })

  it('waits on the profile row instead of flashing Sign In or a coach wall', () => {
    assert.equal(
      authEntryState({
        loading: false,
        userId: 'auth-1',
        profileId: null,
        profileLoading: true,
      }),
      'loading',
    )
  })

  it('does not send a signed-in user with no profile to the login gate', () => {
    assert.equal(
      authEntryState({
        loading: false,
        userId: 'auth-1',
        profileId: null,
        profileLoading: false,
      }),
      'finish-profile',
    )
  })
})

describe('open-signup login copy', () => {
  it('keeps /sign-up as the open-account path', () => {
    assert.equal(OPEN_ACCOUNT_PATH, '/sign-up')
    assert.ok(OPEN_ACCOUNT_LABEL.length > 0)
  })

  it('does not require a coach to log in or open an account', () => {
    const firstScreen = [LOGIN_SUBTITLE, LOGIN_FOOTER, OPEN_ACCOUNT_LABEL, FINISH_PROFILE_HINT].join(' ')
    assert.equal(copyRequiresCoachToEnter(firstScreen), false)
  })

  it('flags the leftover coach-gated copy that used to ship on Sign In', () => {
    assert.equal(
      copyRequiresCoachToEnter("Coach's Dashboard\nContact your coach if you need access"),
      true,
    )
    assert.equal(
      copyRequiresCoachToEnter('Ask your coach for an invite link.'),
      true,
    )
  })

  it('keeps the Sign In UI and My Journey gate free of coach-required copy', () => {
    const login = readFileSync('components/LoginPage.tsx', 'utf8')
    const journey = readFileSync('app/my-journey/page.tsx', 'utf8')
    assert.equal(login.includes("Coach's Dashboard"), false)
    assert.equal(login.includes('Contact your coach if you need access'), false)
    assert.ok(login.includes('OPEN_ACCOUNT_PATH'))
    assert.equal(journey.includes('Ask your coach for an invite link'), false)
    assert.ok(journey.includes('authEntryState'))
  })
})

describe('isSupabaseAuthRequest', () => {
  it('recognizes GoTrue auth URLs so session refresh is not aborted', () => {
    assert.equal(
      isSupabaseAuthRequest('https://yddjlhdptsundeimugba.supabase.co/auth/v1/token?grant_type=refresh_token'),
      true,
    )
    assert.equal(
      isSupabaseAuthRequest('https://yddjlhdptsundeimugba.supabase.co/rest/v1/people'),
      false,
    )
  })
})
