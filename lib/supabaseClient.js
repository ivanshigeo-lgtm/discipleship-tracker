import { createClient } from '@supabase/supabase-js'
import { isSupabaseAuthRequest } from './authGate'

const supabaseUrl = 'https://yddjlhdptsundeimugba.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlkZGpsaGRwdHN1bmRlaW11Z2JhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NDI1OTUsImV4cCI6MjA5NTUxODU5NX0.9noWlySqIcSJE_YBQPtjXkDCBL0ttkqom3vuVhHIGag'

// A stale session can make requests hang FOREVER (never settle), which leaves
// sections stuck on "loading"/"failed to load" until a hard refresh — and the
// in-flight dedup cache in supabaseQueries then reuses the hung promise on
// every retry. Abort at 20s so a hung request becomes a normal error the UI
// can retry with a fresh request.
//
// Never abort /auth/v1/* — killing a token refresh can SIGNED_OUT a returning
// user and dump them on Sign In after they swipe the app away.
const fetchWithTimeout = (input, init = {}) => {
  if (isSupabaseAuthRequest(input)) return fetch(input, init)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('Request timed out')), 20000)
  if (init.signal) {
    if (init.signal.aborted) controller.abort(init.signal.reason)
    else init.signal.addEventListener('abort', () => controller.abort(init.signal.reason), { once: true })
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(timer))
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: fetchWithTimeout },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})
