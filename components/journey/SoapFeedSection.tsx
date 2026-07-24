'use client'

import SharedSoapFeed from '../SharedSoapFeed'

/*
 * SoapFeedSection — the Feed destination (native's Feed tab). Shows SOAP
 * reflections shared with you across the three scopes — your coach, your Grace
 * Group, and the wider constellation — stacked, each remembering what you've
 * seen. Previously buried in the menu's "Shared With Me" overlay.
 */
export default function SoapFeedSection({ personId }: { personId: string }) {
  const seen = (scope: string) => `shared-seen-soaps-${scope}-${personId}`
  return (
    <div className="mx-auto max-w-2xl">
      <SharedSoapFeed personId={personId} scope="coach"         title="Shared with Me"       seenKey={seen('coach')} showEmpty />
      <SharedSoapFeed personId={personId} scope="group"         title="Shared with my Group" seenKey={seen('group')} showEmpty />
      <SharedSoapFeed personId={personId} scope="constellation" title="Shared with GBC"      seenKey={seen('constellation')} showEmpty />
    </div>
  )
}
