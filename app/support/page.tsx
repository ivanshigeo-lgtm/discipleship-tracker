export const metadata = {
  title: 'Support — Constellations by Grace Bible Maui',
  description: 'Get help with the Constellations / WikiChurch discipleship app.',
}

export default function Support() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-2 text-3xl font-bold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
        Support
      </h1>
      <p className="mb-6 text-sm text-[var(--fg-3)]">
        Constellations — the discipleship app by Grace Bible Maui.
      </p>

      <div className="space-y-6 text-[var(--fg-2)]">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Contact us</h2>
          <p>
            The fastest way to get help is by email. We usually reply within 1–2 business days.
          </p>
          <p className="mt-2">
            <strong>Email:</strong>{' '}
            <a href="mailto:jasato@gmail.com" className="text-[var(--gbm-cobalt-bright)] hover:underline">
              jasato@gmail.com
            </a>
          </p>
          <p className="mt-1 text-sm text-[var(--fg-3)]">
            Please include the email address on your account and a short description of what you were
            doing when the problem happened.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">What is Constellations?</h2>
          <p>
            Constellations helps coaches at Grace Bible Maui walk alongside the people they disciple —
            tracking spiritual journeys, meetings, prayer requests, and milestones in one place.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Get the apps</h2>
          <p className="mb-3">Both apps are free on the App Store.</p>
          <ul className="space-y-2">
            <li>
              <a
                href="https://apps.apple.com/us/app/wikichurch/id6790726239"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--gbm-cobalt-bright)] hover:underline"
              >
                Constellations (WikiChurch) on the App Store
              </a>{' '}
              <span className="text-sm text-[var(--fg-3)]">— the discipleship app on this site.</span>
            </li>
            <li>
              <a
                href="https://apps.apple.com/us/app/isoap/id6788583040"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--gbm-cobalt-bright)] hover:underline"
              >
                iSOAP on the App Store
              </a>{' '}
              <span className="text-sm text-[var(--fg-3)]">— the companion journaling app for SOAP entries.</span>
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Common questions</h2>
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold text-[var(--fg-1)]">I can&apos;t sign in.</h3>
              <p className="text-[var(--fg-2)]">
                Make sure you are using the same email your coach or church used to invite you. If you
                requested a sign-in code, check your spam folder, and note that codes expire after a few
                minutes — request a fresh one if needed. Still stuck? Email us and we&apos;ll help.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[var(--fg-1)]">How do I reset my password?</h3>
              <p className="text-[var(--fg-2)]">
                On the sign-in screen choose &ldquo;Forgot password&rdquo; and follow the emailed link,
                or email us and we&apos;ll send you a reset.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[var(--fg-1)]">The camera won&apos;t open.</h3>
              <p className="text-[var(--fg-2)]">
                The app asks for camera permission the first time you scan a page. If you previously
                declined, enable it in your device&apos;s Settings → Constellations → Camera.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-[var(--fg-1)]">How do I delete my account or data?</h3>
              <p className="text-[var(--fg-2)]">
                Email us at{' '}
                <a href="mailto:jasato@gmail.com" className="text-[var(--gbm-cobalt-bright)] hover:underline">
                  jasato@gmail.com
                </a>{' '}
                and we will delete your account and associated data. See our{' '}
                <a href="/privacy" className="text-[var(--gbm-cobalt-bright)] hover:underline">
                  Privacy Policy
                </a>{' '}
                for details on how your information is handled.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Privacy</h2>
          <p>
            Your discipleship data is private to your account and church. Read the full{' '}
            <a href="/privacy" className="text-[var(--gbm-cobalt-bright)] hover:underline">
              Privacy Policy
            </a>
            .
          </p>
        </section>
      </div>

      <div className="mt-8 border-t border-[var(--line-2)] pt-4">
        <a href="/" className="text-sm text-[var(--gbm-cobalt-bright)] hover:underline">
          ← Back to Constellations
        </a>
      </div>
    </div>
  )
}
