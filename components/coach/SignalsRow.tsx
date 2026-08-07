'use client'

// Zone 2: "While you were away" — only signals that are actually non-zero,
// each an inline <details> expand (no modal maze): unread conversations,
// pending stage sign-offs, new-disciple requests, meeting invites. All-quiet
// renders a single calm card.

import { useEffect, useState } from 'react'
import {
  getMyConversations,
  getPendingLevelSignoffs,
  getPendingConnectionRequests,
  getPendingMeetingInvites,
} from '../../lib/supabaseQueries'
import { ZoneLabel } from './coachModel'
import type { Engagement } from '../../types/database'

type Conv = {
  id: string
  members: { id: string; name: string }[]
  lastMessage: { body: string; sender_id: string; created_at: string } | null
  unreadCount: number
}
type Signoff = { id: string; stage: string; person: { id: string; name: string } | null }
type DiscipleReq = { id: string; disciple_name: string | null }

export default function SignalsRow({
  personId,
  refreshKey,
  onOpenMessages,
  onGoToEngagements,
}: {
  personId: string
  refreshKey: number
  onOpenMessages: (targetPersonId?: string) => void
  onGoToEngagements: () => void
}) {
  const [convs, setConvs] = useState<Conv[]>([])
  const [signoffs, setSignoffs] = useState<Signoff[]>([])
  const [requests, setRequests] = useState<DiscipleReq[]>([])
  const [invites, setInvites] = useState<Engagement[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [convRes, soRes, reqRes, invRes] = await Promise.all([
        getMyConversations(personId),
        getPendingLevelSignoffs(personId),
        getPendingConnectionRequests(personId),
        getPendingMeetingInvites(personId),
      ])
      if (!alive) return
      setConvs(((convRes.data as Conv[] | null) ?? []).filter(c => c.unreadCount > 0))
      setSignoffs((soRes.data as unknown as Signoff[] | null) ?? [])
      setRequests((reqRes.data as DiscipleReq[] | null) ?? [])
      setInvites((invRes.data as Engagement[] | null) ?? [])
      setReady(true)
    })()
    return () => { alive = false }
  }, [personId, refreshKey])

  if (!ready) return null

  const unreadTotal = convs.reduce((s, c) => s + c.unreadCount, 0)
  const topConv = convs[0] ?? null
  const topSender = topConv?.lastMessage
    ? topConv.members.find(m => m.id === topConv.lastMessage!.sender_id)?.name ?? null
    : null
  // Reply targets the DM partner; group conversations just open the center.
  const topOther = topConv && topConv.members.length === 2
    ? topConv.members.find(m => m.id !== personId)?.id
    : undefined

  const anySignal = convs.length + signoffs.length + requests.length + invites.length > 0

  const dotStyle = (color: string, glow: string) => ({ background: color, boxShadow: `0 0 8px ${glow}` })
  const glowChip = 'rounded-full border border-[rgba(91,141,247,.5)] px-3 py-1 text-[11.5px] font-semibold text-white transition-all hover:brightness-110'
  const glowBg = { background: 'linear-gradient(180deg,#2E55E6,#1c3fd0)', boxShadow: '0 0 18px -4px rgba(46,85,230,.8)' }

  const Sig = ({ dot, title, preview, badge, body, cta, onCta }: {
    dot: React.CSSProperties
    title: string
    preview: string | null
    badge: string
    body: React.ReactNode
    cta: string
    onCta: () => void
  }) => (
    <details className="overflow-hidden rounded-[var(--r-md)] border border-[var(--line-1)] bg-[var(--indigo-2)]" style={{ boxShadow: 'var(--elev-2)' }}>
      <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-3 [&::-webkit-details-marker]:hidden">
        <span className="h-[7px] w-[7px] shrink-0 rounded-full" style={dot} />
        <span className="whitespace-nowrap text-[13px] font-semibold text-[var(--fg-1)]">{title}</span>
        {preview && <span className="max-w-[220px] overflow-hidden text-ellipsis whitespace-nowrap text-[11.5px] text-[var(--fg-3)]">{preview}</span>}
        <span className="ml-auto shrink-0 rounded-full bg-[var(--indigo-3)] px-2 py-0.5 text-[11px] font-bold text-[var(--fg-2)]">{badge}</span>
      </summary>
      <div className="flex items-center gap-2 border-t border-dashed border-[var(--line-1)] px-3.5 pb-3 pt-2.5">
        <span className="flex-1 text-[12.5px] text-[var(--fg-2)]">{body}</span>
        <button type="button" onClick={onCta} className={glowChip} style={glowBg}>{cta}</button>
      </div>
    </details>
  )

  return (
    <section className="mb-5">
      <ZoneLabel label="While you were away" />
      {!anySignal ? (
        <div className="cn-card px-4 py-4 text-center text-[12.5px] text-[var(--fg-3)]">Your sky is calm.</div>
      ) : (
        <div className="flex flex-col gap-2">
          {convs.length > 0 && topConv && (
            <Sig
              dot={dotStyle('var(--danger)', 'rgba(242,114,138,.8)')}
              title={topSender ?? 'Messages'}
              preview={topConv.lastMessage ? `“${topConv.lastMessage.body.slice(0, 60)}”` : null}
              badge={`${unreadTotal} new`}
              body={topConv.lastMessage
                ? <><b className="font-semibold text-[var(--fg-1)]">{topSender ?? 'Someone'}:</b> “{topConv.lastMessage.body.slice(0, 120)}”</>
                : 'You have unread messages.'}
              cta="Reply"
              onCta={() => onOpenMessages(topOther)}
            />
          )}
          {signoffs.length > 0 && (
            <Sig
              dot={dotStyle('var(--establish)', 'rgba(54,214,195,.7)')}
              title="Sign-off waiting"
              preview={signoffs[0].person ? `${signoffs[0].person.name} · ${signoffs[0].stage} complete` : null}
              badge={signoffs.length > 1 ? `${signoffs.length}` : 'Review'}
              body={signoffs[0].person
                ? <>{signoffs[0].person.name} finished every {signoffs[0].stage} step. Your sign-off lights their next stage.</>
                : 'A disciple is waiting on your sign-off.'}
              cta="Review"
              onCta={() => onOpenMessages()}
            />
          )}
          {requests.length > 0 && (
            <Sig
              dot={dotStyle('var(--engage)', 'rgba(244,182,80,.7)')}
              title="New disciple request"
              preview={requests[0].disciple_name ?? null}
              badge={`${requests.length}`}
              body={<>{requests[0].disciple_name ?? 'Someone'} wants to join your constellation.</>}
              cta="Welcome them"
              onCta={onGoToEngagements}
            />
          )}
          {invites.length > 0 && (
            <Sig
              dot={dotStyle('var(--equip)', 'rgba(91,141,247,.75)')}
              title="Meeting invite"
              preview={invites[0].description}
              badge={`${invites.length}`}
              body={<>You&rsquo;ve been invited to {invites.length === 1 ? 'a meeting' : `${invites.length} meetings`} — confirm or decline.</>}
              cta="Respond"
              onCta={onGoToEngagements}
            />
          )}
        </div>
      )}
    </section>
  )
}
