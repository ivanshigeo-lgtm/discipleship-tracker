export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
        Privacy Policy
      </h1>
      <p className="mb-4 text-sm text-[var(--fg-3)]">Last updated: June 6, 2026</p>

      <div className="space-y-6 text-[var(--fg-2)]">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Overview</h2>
          <p>
            Constellations is a discipleship tracking application operated by Grace Bible Maui.
            This privacy policy explains how we collect, use, and protect your information.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Information We Collect</h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong>Account Information:</strong> Email address and name when you create an account.
            </li>
            <li>
              <strong>Discipleship Data:</strong> Information you enter about people you are coaching,
              including names, prayer requests, meeting notes, and spiritual journey milestones.
            </li>
            <li>
              <strong>Google Calendar Data:</strong> If you choose to connect Google Calendar, we access
              your calendar only to create, update, and delete events for scheduled meetings. We do not
              read or store other calendar events.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">How We Use Your Information</h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>To provide the discipleship tracking functionality</li>
            <li>To sync your scheduled meetings with Google Calendar (if connected)</li>
            <li>To authenticate your account</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Google Calendar Integration</h2>
          <p>
            When you connect your Google Calendar, we request permission to manage calendar events.
            This allows us to:
          </p>
          <ul className="ml-4 mt-2 list-disc space-y-2">
            <li>Create calendar events for scheduled meetings</li>
            <li>Update events when meeting details change</li>
            <li>Delete events when meetings are removed</li>
          </ul>
          <p className="mt-2">
            We only access the specific events created by this application. We do not read, modify,
            or delete any other events in your calendar.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Data Storage and Security</h2>
          <p>
            Your data is stored securely using Supabase, a trusted cloud database provider.
            Google Calendar tokens are encrypted and stored securely. We do not sell or share
            your personal information with third parties.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Data Retention</h2>
          <p>
            Your data is retained as long as you maintain an active account. You may request
            deletion of your data at any time by contacting us.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="ml-4 mt-2 list-disc space-y-2">
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Disconnect Google Calendar at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Contact</h2>
          <p>
            For questions about this privacy policy or your data, contact Grace Bible Maui at{' '}
            <a href="mailto:jasato@gmail.com" className="text-[var(--gbm-cobalt-bright)] hover:underline">
              jasato@gmail.com
            </a>
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
