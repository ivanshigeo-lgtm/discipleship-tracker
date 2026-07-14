'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabaseClient'

/*
 * WebView session bootstrap for the WikiChurch app. The app opens
 * /embed/boot?next=<path>#token_hash=<hash from /api/embed/session>.
 * We redeem the hash for a fresh session (its own refresh-token family,
 * persisted in the WebView's localStorage) and hop to the target page.
 * The hash fragment never reaches the server.
 */
export default function EmbedBoot() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search)
      const nextRaw = params.get('next') || '/my-journey'
      // same-origin paths only — never an open redirect
      const next = nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/my-journey'
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const tokenHash = hash.get('token_hash')

      if (!tokenHash) {
        setError('Missing sign-in token.')
        return
      }
      const { error: otpError } = await supabase.auth.verifyOtp({
        type: 'email',
        token_hash: tokenHash,
      })
      if (otpError) {
        setError(otpError.message)
        const rn = (window as unknown as { ReactNativeWebView?: { postMessage: (s: string) => void } }).ReactNativeWebView
        rn?.postMessage(JSON.stringify({ type: 'boot_error', message: otpError.message }))
        return
      }
      window.location.replace(next)
    }
    run()
  }, [])

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{ background: 'var(--void, #060814)' }}
    >
      {error ? (
        <p className="max-w-xs px-6 text-center text-sm" style={{ color: 'var(--fg-2, #B4BAD6)' }}>
          We couldn&apos;t open this page — please close it and try again. ({error})
        </p>
      ) : (
        <span
          className="h-6 w-6 animate-spin rounded-full border-2 border-t-transparent"
          style={{ borderColor: 'var(--gbm-cobalt-bright, #2E55E6)', borderTopColor: 'transparent' }}
        />
      )}
    </div>
  )
}
