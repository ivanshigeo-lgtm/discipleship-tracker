'use client'

import { useEffect, useState } from 'react'
import {
  getVictoryGroups,
  getGroupsForPerson,
  addPersonToVictoryGroup,
  sendMessage,
} from '../../lib/supabaseQueries'
import type { Person, VictoryGroup } from '../../types/database'
import { daysOf, fmtDaysShort } from '../../lib/meetingDays'
import { fmtTime12 } from '../../lib/formatTime'

/*
 * Choose a Grace Group and join it. Groups your coach belongs to are
 * lifted to the top and marked — the natural first pick. Joining
 * quietly lets the coach know.
 */
export default function JoinGroupModal({
  personId,
  coach,
  myGroupIds,
  pendingGroupIds = [],
  onClose,
  onJoined,
}: {
  personId: string
  coach: Person | null
  myGroupIds: string[]
  pendingGroupIds?: string[]
  onClose: () => void
  onJoined: () => void
}) {
  const [groups, setGroups] = useState<VictoryGroup[]>([])
  const [coachGroupIds, setCoachGroupIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinedName, setJoinedName] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const load = async () => {
      const [groupsRes, coachGroupsRes] = await Promise.all([
        getVictoryGroups(),
        coach ? getGroupsForPerson(coach.id) : Promise.resolve({ data: [], error: null }),
      ])
      if (groupsRes.data) setGroups(groupsRes.data as VictoryGroup[])
      if (coachGroupsRes.data) {
        setCoachGroupIds(new Set((coachGroupsRes.data as { victory_group_id: string }[]).map(m => m.victory_group_id)))
      }
      setLoading(false)
    }
    load()
  }, [coach])

  const handleJoin = async (group: VictoryGroup) => {
    setJoiningId(group.id)
    setError('')
    // Self-joins are a REQUEST — the group owner approves before you're a
    // member (and can see the group's prayers/SOAPs).
    const { error: err } = await addPersonToVictoryGroup(personId, group.id, 'pending')
    if (err) {
      setError(err.message?.includes('duplicate') ? 'You’ve already requested that group.' : 'Could not request. Please try again.')
      setJoiningId(null)
      return
    }
    // Ask the group's owner (who approves), falling back to your coach.
    const notifyId = group.owner_person_id || coach?.id
    if (notifyId) {
      await sendMessage(personId, notifyId, 'note', `I’d like to join ${group.name}. Could you approve my request?`)
    }
    setJoinedName(group.name)
    setJoiningId(null)
    onJoined()
    setTimeout(onClose, 2500)
  }

  const sorted = [...groups].sort((a, b) => {
    const ca = coachGroupIds.has(a.id) ? 0 : 1
    const cb = coachGroupIds.has(b.id) ? 0 : 1
    return ca - cb || a.name.localeCompare(b.name)
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        {joinedName ? (
          <div className="jy-rise-in py-6 text-center">
            <p className="text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--establish)' }}>
              ✦ Request sent
            </p>
            <p className="mt-2 text-sm text-[var(--fg-2)]">The leader of {joinedName} will approve you soon.</p>
          </div>
        ) : (
          <>
            <div className="cn-label" style={{ color: 'var(--establish)' }}>Establish · find your people</div>
            <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
              Join a Grace Group
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
              Pick the group that fits your week.
              {coach ? ` Groups ${coach.name.split(' ')[0]} is part of are marked.` : ''}
            </p>

            {loading ? (
              <div className="flex justify-center py-8">
                <span className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
              </div>
            ) : (
              <div className="mt-4 space-y-2">
                {sorted.map(group => {
                  const isCoachGroup = coachGroupIds.has(group.id)
                  const already = myGroupIds.includes(group.id)
                  return (
                    <div
                      key={group.id}
                      className="flex items-center gap-3 rounded-xl border p-3"
                      style={{
                        borderColor: isCoachGroup ? 'rgba(54,214,195,.35)' : 'var(--line-1)',
                        background: isCoachGroup ? 'rgba(54,214,195,.06)' : 'var(--indigo-2)',
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[var(--fg-1)]">{group.name}</span>
                          {isCoachGroup && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider" style={{ color: 'var(--establish)' }}>
                              ✦ your coach&rsquo;s
                            </span>
                          )}
                        </div>
                        {(daysOf(group).length > 0 || group.meeting_time) && (
                          <span className="text-xs text-[var(--fg-3)]">
                            {[fmtDaysShort(daysOf(group)), fmtTime12(group.meeting_time)].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      {already ? (
                        <span className="shrink-0 text-xs font-semibold" style={{ color: 'var(--establish)' }}>
                          ✓ joined
                        </span>
                      ) : pendingGroupIds.includes(group.id) ? (
                        <span className="shrink-0 text-xs font-semibold text-[var(--fg-3)]">
                          ⌛ requested
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleJoin(group)}
                          disabled={joiningId !== null}
                          className="cn-btn cn-btn-primary shrink-0 !px-3 !py-1.5 !text-xs disabled:opacity-50"
                        >
                          {joiningId === group.id ? 'Requesting…' : 'Request to join'}
                        </button>
                      )}
                    </div>
                  )
                })}
                {sorted.length === 0 && (
                  <p className="py-4 text-center text-sm text-[var(--fg-3)]">
                    No Grace Groups yet — ask your coach.
                  </p>
                )}
              </div>
            )}

            {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

            <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost mt-4 w-full">
              Not now
            </button>
          </>
        )}
      </div>
    </div>
  )
}
