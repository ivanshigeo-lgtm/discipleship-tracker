export default function PrivacyPolicy() {
  return (
    <div className="mx-auto max-w-3xl p-8">
      <h1 className="mb-6 text-3xl font-bold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
        Privacy Policy
      </h1>
      <p className="mb-4 text-sm text-[var(--fg-3)]">Last updated: August 14, 2026</p>

      <div className="space-y-6 text-[var(--fg-2)]">
        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Overview</h2>
          <p>
            This policy covers the discipleship tools operated by Grace Bible Maui: the{' '}
            <strong>WikiChurch</strong> mobile app for iOS and Android, and the{' '}
            <strong>Constellations</strong> web application at wikichurch.app. They are two doors
            into the same service and share one account and one database. This policy explains what
            we collect, why, and how you can remove it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Information We Collect</h2>
          <p className="mb-2">
            Only the first two are required to use the service. Everything else is collected only
            when you choose a feature that needs it, and only after your device asks your permission.
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong>Name and email address</strong> — to create and authenticate your account.
            </li>
            <li>
              <strong>Discipleship data you enter</strong> — information about the people you coach,
              including names, prayer requests, meeting notes, scripture reflections (SOAP entries),
              and spiritual journey milestones.
            </li>
            <li>
              <strong>Photos and camera images</strong> — when you photograph or attach a handwritten
              journal page, a profile picture, or an image for a post.
            </li>
            <li>
              <strong>Video</strong> — when you record or attach video to a message or post.
            </li>
            <li>
              <strong>Voice recordings</strong> — when you record an audio message to send to your
              group or the people you coach.
            </li>
            <li>
              <strong>Contacts</strong> — if you use &ldquo;add from contacts&rdquo; to start coaching
              someone, we read the name, phone number, and email of the contact <em>you select</em>{' '}
              so you do not have to retype them. We only ever read your contacts; the app can never
              add to or change them.
            </li>
            <li>
              <strong>Messages and other content you post</strong> — group messages, comments,
              encouragements, and anything else you share with others in the app.
            </li>
            <li>
              <strong>Google Calendar access</strong> — optional, and write-only. See below.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">
            Analytics, and What We Do Not Collect
          </h2>
          <p>
            We do not collect your location, financial or payment information, health data, or
            advertising identifiers. <strong>There is no advertising anywhere in the service, and no
            third-party analytics or tracking software in either the mobile app or the web
            application.</strong> We do not build advertising profiles, and we do not track you
            across other apps or websites.
          </p>
          <p className="mt-2">
            There is one exception, and we would rather name it than claim we count nothing. When
            someone opens our <strong>public assessment page</strong> at wikichurch.app/assessment, we
            record that the page was opened, together with a randomly generated key stored in that
            browser, the link that referred them, and the browser&rsquo;s user-agent string. This lets
            church leaders see how many people started the assessment and how many were the same
            visitor returning. It covers that one public page and no other part of the service, it is
            never shown to the visitor, it is not tied to your name or account, and it is never used
            for advertising. The mobile app records nothing of this kind at all.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">How We Use Your Information</h2>
          <ul className="ml-4 list-disc space-y-2">
            <li>To provide the discipleship tracking and coaching functionality</li>
            <li>To authenticate your account and keep it secure</li>
            <li>To deliver the messages, posts, and prayer requests you send to the people you choose</li>
            <li>
              To convert a photographed handwritten journal page into text, so it becomes searchable
              and editable, and to generate optional reflection summaries from entries you have written
            </li>
            <li>To send you reminders about meetings you have scheduled, if you turn reminders on</li>
            <li>To sync meetings you schedule to your Google Calendar, if you connect it</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Google Calendar Integration</h2>
          <p>
            Connecting Google Calendar is optional. When you connect it, we request permission to
            manage calendar events so we can create an event when you schedule a meeting, update it
            when the details change, and delete it when the meeting is removed.
          </p>
          <p className="mt-2">
            The connection is <strong>one-way</strong>: we write only the events this application
            creates. We do not read, import, modify, or delete any other events in your calendar, and
            we never copy your existing calendar into the app. You can disconnect at any time.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">
            Who Can See Your Information
          </h2>
          <p>
            Your discipleship data is visible to you, to the leaders responsible for coaching you at
            Grace Bible Maui, and to the people you deliberately share content with. Messages, posts,
            and prayer requests are visible to the group or people you send them to. Nothing you
            enter is public.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">
            Service Providers and Sharing
          </h2>
          <p className="mb-2">
            <strong>We do not sell your personal information, and we do not share it with third
            parties for their own purposes.</strong> We use a small number of providers who process
            data solely on our behalf, under contract, to run the service:
          </p>
          <ul className="ml-4 list-disc space-y-2">
            <li>
              <strong>Supabase</strong> — database, file storage, and authentication.
            </li>
            <li>
              <strong>Vercel</strong> — application hosting.
            </li>
            <li>
              <strong>Anthropic (Claude)</strong> — reads a journal page you photograph in order to
              turn it into text, and generates optional summaries of entries you have written.
              Content sent for this purpose is not used to train their models.
            </li>
            <li>
              <strong>Google</strong> — only if you connect Google Calendar, and only for the events
              described above.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Data Storage and Security</h2>
          <p>
            Your data is stored securely with Supabase. Access is restricted at the database level so
            that accounts can only reach data they are entitled to see. Google Calendar tokens are
            encrypted at rest. Connections to the service are encrypted in transit.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">
            Deleting Your Account and Data
          </h2>
          <p>
            <strong>You can delete your account and all of its data from inside the app at any
            time</strong>, without contacting anyone. In the WikiChurch app, open your Journey screen,
            tap the <strong>Account</strong> button in the top right, and choose{' '}
            <strong>Delete account</strong>. After two confirmations, your account and everything in
            it — your journey, scripture entries, prayers, and messages — is permanently erased. This
            cannot be undone.
          </p>
          <p className="mt-2">
            Otherwise, your data is retained for as long as your account remains active. You may also
            email us at the address below to request access, correction, or deletion.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">
            Content From Other People
          </h2>
          <p>
            The app lets members share content with one another. If you see something inappropriate,
            you can report it or block the person who posted it from within the app. Reported content
            is reviewed and removed if it violates our expectations for the community.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Children</h2>
          <p>
            This service is intended for people aged 13 and over. It is not directed at children
            under 13, and we do not knowingly collect information from them. If you believe a child
            under 13 has created an account, contact us and we will delete it.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Your Rights</h2>
          <p>You have the right to:</p>
          <ul className="ml-4 mt-2 list-disc space-y-2">
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Delete your account and all of your data, from within the app</li>
            <li>Decline or withdraw any optional permission — contacts, camera, photos, microphone, or notifications — in your device settings</li>
            <li>Disconnect Google Calendar at any time</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Changes to This Policy</h2>
          <p>
            If we change this policy we will update the date at the top of this page. Material
            changes will be communicated in the app.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-xl font-semibold text-[var(--fg-1)]">Contact</h2>
          <p>
            For questions about this privacy policy or your data, contact Grace Bible Maui at{' '}
            <a href="mailto:jasato@gmail.com" className="text-[var(--gbm-cobalt-bright)] hover:underline">
              jasato@gmail.com
            </a>
            , or by mail at 635 Hina Ave, Kahului, HI 96732.
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
