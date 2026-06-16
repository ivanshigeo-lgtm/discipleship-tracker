'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import {
  getMyConversations,
  getOrCreateDM,
  createGroupConversation,
  getConversationMessages,
  sendConversationMessage,
  markConversationRead,
  searchPeople,
} from '../lib/supabaseQueries'
import type { ConversationSummary } from '../types/database'

type ChatMsg = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
  sender: { id: string; name: string } | null
}

function convDisplayName(conv: ConversationSummary, myId: string): string {
  if (conv.name) return conv.name
  const other = conv.members.find(m => m.id !== myId)
  return other?.name ?? 'Unknown'
}

export default function MessageCenter({
  myPersonId,
  myName,
  isOpen,
  onClose,
  initialTargetPersonId,
  onConsumedTarget,
}: {
  myPersonId: string
  myName: string
  isOpen: boolean
  onClose: () => void
  initialTargetPersonId?: string | null
  onConsumedTarget?: () => void
}) {
  const [convs, setConvs] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMsg[]>([])
  const [compose, setCompose] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingConvs, setLoadingConvs] = useState(false)
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list')
  const [showNew, setShowNew] = useState(false)
  const [groupMode, setGroupMode] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [groupMembers, setGroupMembers] = useState<{ id: string; name: string }[]>([])
  const [searchQ, setSearchQ] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; name: string }[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const composeRef = useRef<HTMLTextAreaElement>(null)

  const activeConv = convs.find(c => c.id === activeId)

  const loadConvs = useCallback(async () => {
    setLoadingConvs(true)
    const { data } = await getMyConversations(myPersonId)
    if (data) setConvs(data)
    setLoadingConvs(false)
  }, [myPersonId])

  const loadMessages = useCallback(async (convId: string) => {
    setLoadingMsgs(true)
    const { data } = await getConversationMessages(convId)
    if (data) setMessages(data as ChatMsg[])
    setLoadingMsgs(false)
  }, [])

  // Load conversations when panel opens
  useEffect(() => {
    if (isOpen) loadConvs()
  }, [isOpen, loadConvs])

  // Auto-open DM when initialTargetPersonId is provided
  useEffect(() => {
    if (!isOpen || !initialTargetPersonId) return
    const init = async () => {
      const { conversationId } = await getOrCreateDM(myPersonId, initialTargetPersonId)
      if (conversationId) {
        await loadConvs()
        setActiveId(conversationId)
        setMobileView('thread')
      }
      onConsumedTarget?.()
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialTargetPersonId])

  // Load messages + mark read when conversation changes
  useEffect(() => {
    if (!activeId) return
    loadMessages(activeId)
    markConversationRead(activeId, myPersonId)
    setConvs(prev => prev.map(c => c.id === activeId ? { ...c, unreadCount: 0 } : c))
  }, [activeId, myPersonId, loadMessages])

  // Scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Realtime: new messages in the open thread
  useEffect(() => {
    if (!activeId) return
    const channel = supabase
      .channel(`msg-thread-${activeId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversation_messages',
        filter: `conversation_id=eq.${activeId}`,
      }, (payload) => {
        const msg = payload.new as ChatMsg
        setMessages(prev => prev.some(m => m.id === msg.id) ? prev : [...prev, msg])
        markConversationRead(activeId, myPersonId)
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeId, myPersonId])

  // Realtime: refresh conversation list when any message arrives
  useEffect(() => {
    if (!isOpen) return
    const channel = supabase
      .channel(`conv-list-${myPersonId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_messages' }, () => {
        loadConvs()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [isOpen, myPersonId, loadConvs])

  // People search with debounce
  useEffect(() => {
    if (!searchQ.trim()) { setSearchResults([]); return }
    const t = setTimeout(async () => {
      const { data } = await searchPeople(searchQ)
      if (data) setSearchResults((data as { id: string; name: string }[]).filter(p => p.id !== myPersonId))
    }, 280)
    return () => clearTimeout(t)
  }, [searchQ, myPersonId])

  const openConv = (convId: string) => {
    setActiveId(convId)
    setMobileView('thread')
    setShowNew(false)
    setSearchQ('')
  }

  const handleSend = async () => {
    if (!compose.trim() || !activeId || sending) return
    setSending(true)
    const body = compose.trim()
    setCompose('')
    const tempId = `temp-${Date.now()}`
    setMessages(prev => [...prev, {
      id: tempId, conversation_id: activeId, sender_id: myPersonId, body,
      created_at: new Date().toISOString(), sender: { id: myPersonId, name: myName },
    }])
    const { data } = await sendConversationMessage(activeId, myPersonId, body)
    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId
        ? { ...(data as object) as ChatMsg, sender: { id: myPersonId, name: myName } }
        : m))
      loadConvs()
    }
    setSending(false)
    composeRef.current?.focus()
  }

  const handleStartDM = async (person: { id: string; name: string }) => {
    const { conversationId } = await getOrCreateDM(myPersonId, person.id)
    if (conversationId) {
      await loadConvs()
      openConv(conversationId)
    }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim() || groupMembers.length === 0) return
    const { data } = await createGroupConversation(groupName.trim(), [myPersonId, ...groupMembers.map(m => m.id)])
    if (data) {
      await loadConvs()
      openConv(data.id)
      setGroupName('')
      setGroupMembers([])
      setGroupMode(false)
    }
  }

  const toggleGroupMember = (p: { id: string; name: string }) => {
    setGroupMembers(prev => prev.some(m => m.id === p.id) ? prev.filter(m => m.id !== p.id) : [...prev, p])
  }

  const resetNew = () => {
    setShowNew(false)
    setGroupMode(false)
    setGroupName('')
    setGroupMembers([])
    setSearchQ('')
  }

  if (!isOpen) return null

  const fieldClass = "w-full rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-xs text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-[rgba(6,8,20,.72)]" onClick={onClose} />

      {/* Slide-in panel */}
      <div
        className="relative flex w-full flex-col md:max-w-[680px]"
        style={{ background: 'var(--indigo)', borderLeft: '1px solid var(--line-2)', boxShadow: 'var(--elev-2)' }}
      >
        {/* Panel header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--line-2)] px-4 py-3">
          <div className="flex items-center gap-2">
            {mobileView === 'thread' && activeConv && (
              <button type="button" onClick={() => setMobileView('list')} className="mr-1 text-sm text-[var(--fg-3)] hover:text-[var(--fg-1)] md:hidden">
                ←
              </button>
            )}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gbm-cobalt-bright)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <h2 className="text-sm font-semibold text-[var(--fg-1)]" style={{ fontFamily: 'var(--font-display)' }}>
              {mobileView === 'thread' && activeConv
                ? convDisplayName(activeConv, myPersonId)
                : 'Messages'}
            </h2>
            {activeConv?.name && mobileView === 'thread' && (
              <span className="text-[10px] text-[var(--fg-3)]">
                {activeConv.members.filter(m => m.id !== myPersonId).map(m => m.name).join(', ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => { setShowNew(s => !s); if (showNew) resetNew() }}
              className="rounded-full border border-[var(--line-2)] px-2.5 py-1 text-[10px] font-medium text-[var(--fg-2)] hover:border-[var(--gbm-cobalt-bright)] hover:text-[var(--fg-1)]"
            >
              + New chat
            </button>
            <button type="button" onClick={onClose} className="text-lg leading-none text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">
          {/* Conversation list — full width on mobile list view, sidebar on desktop */}
          <div
            className={`${mobileView === 'list' ? 'flex' : 'hidden'} md:flex w-full flex-col md:w-56 md:shrink-0 border-r border-[var(--line-2)]`}
            style={{ background: 'var(--indigo-2)' }}
          >
            {/* New conversation form */}
            {showNew && (
              <div className="space-y-2 border-b border-[var(--line-2)] p-3">
                {!groupMode ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">New message</p>
                    <input
                      type="text"
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      placeholder="Search by name..."
                      className={fieldClass}
                      autoFocus
                    />
                    {searchResults.map(p => (
                      <button key={p.id} type="button" onClick={() => handleStartDM(p)}
                        className="w-full rounded-lg border border-[var(--line-1)] bg-[var(--indigo)] px-2.5 py-2 text-left text-xs text-[var(--fg-1)] hover:border-[var(--line-2)]">
                        {p.name}
                      </button>
                    ))}
                    <button type="button" onClick={() => { setGroupMode(true); setSearchQ('') }}
                      className="w-full text-center text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-1)] pt-1">
                      Create group chat →
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--fg-3)]">New group</p>
                    <input
                      type="text"
                      value={groupName}
                      onChange={e => setGroupName(e.target.value)}
                      placeholder="Group name..."
                      className={fieldClass}
                    />
                    <input
                      type="text"
                      value={searchQ}
                      onChange={e => setSearchQ(e.target.value)}
                      placeholder="Add members..."
                      className={fieldClass}
                    />
                    {groupMembers.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {groupMembers.map(m => (
                          <span key={m.id} className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]"
                            style={{ background: 'rgba(91,141,247,.15)', color: 'var(--equip)' }}>
                            {m.name}
                            <button type="button" onClick={() => toggleGroupMember(m)} className="text-[var(--fg-3)] hover:text-[var(--fg-1)]">×</button>
                          </span>
                        ))}
                      </div>
                    )}
                    {searchResults.map(p => (
                      <button key={p.id} type="button" onClick={() => toggleGroupMember(p)}
                        className={`w-full rounded-lg border px-2.5 py-2 text-left text-xs hover:border-[var(--line-2)] ${groupMembers.some(m => m.id === p.id) ? 'border-[var(--equip)] text-[var(--equip)]' : 'border-[var(--line-1)] text-[var(--fg-1)]'}`}
                        style={{ background: 'var(--indigo)' }}>
                        {p.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={handleCreateGroup}
                      disabled={!groupName.trim() || groupMembers.length === 0}
                      className="cn-btn cn-btn-primary w-full !py-1.5 !text-xs disabled:opacity-40"
                    >
                      Create Group
                    </button>
                    <button type="button" onClick={() => { setGroupMode(false); setSearchQ('') }}
                      className="w-full text-center text-[10px] text-[var(--fg-3)] hover:text-[var(--fg-1)]">
                      ← Back to DM
                    </button>
                  </>
                )}
              </div>
            )}

            {/* List of conversations */}
            <div className="flex-1 space-y-1 overflow-y-auto p-2">
              {loadingConvs && <p className="py-6 text-center text-xs italic text-[var(--fg-3)]">Loading...</p>}
              {!loadingConvs && convs.length === 0 && (
                <p className="py-8 text-center text-xs italic text-[var(--fg-3)]">No conversations yet.<br />Tap + New chat to start one.</p>
              )}
              {convs.map(conv => (
                <button
                  key={conv.id}
                  type="button"
                  onClick={() => openConv(conv.id)}
                  className={`w-full rounded-xl border p-2.5 text-left transition-colors ${
                    activeId === conv.id
                      ? 'border-[var(--gbm-cobalt-bright)] bg-[rgba(91,141,247,.12)]'
                      : 'border-[var(--line-1)] hover:border-[var(--line-2)] hover:bg-[var(--indigo-3)]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className={`truncate text-xs font-semibold leading-tight ${conv.unreadCount > 0 ? 'text-[var(--fg-1)]' : 'text-[var(--fg-2)]'}`}>
                      {convDisplayName(conv, myPersonId)}
                    </span>
                    {conv.unreadCount > 0 && (
                      <span className="flex h-4 min-w-[1rem] shrink-0 items-center justify-center rounded-full px-1 text-[9px] font-bold"
                        style={{ background: 'var(--establish)', color: 'var(--void)' }}>
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                  {conv.lastMessage && (
                    <p className="mt-0.5 truncate text-[10px] text-[var(--fg-3)]">
                      {conv.lastMessage.sender_id === myPersonId ? 'You: ' : ''}{conv.lastMessage.body}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Thread view */}
          <div className={`${mobileView === 'thread' ? 'flex' : 'hidden'} md:flex min-w-0 flex-1 flex-col`}>
            {!activeId ? (
              <div className="flex flex-1 items-center justify-center p-8 text-center">
                <div>
                  <svg className="mx-auto mb-3 opacity-20" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <p className="text-sm italic text-[var(--fg-3)]">Select a conversation<br />or start a new one.</p>
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div className="flex-1 space-y-3 overflow-y-auto p-4">
                  {loadingMsgs && <p className="text-center text-xs italic text-[var(--fg-3)]">Loading...</p>}
                  {messages.map(msg => {
                    const isMe = msg.sender_id === myPersonId
                    return (
                      <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                        <div className="max-w-[76%]">
                          {!isMe && (
                            <p className="mb-1 text-[10px] text-[var(--fg-3)]">{msg.sender?.name ?? 'Someone'}</p>
                          )}
                          <div
                            className="px-3 py-2 text-sm leading-relaxed"
                            style={{
                              borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                              background: isMe ? 'var(--gbm-cobalt-bright)' : 'var(--indigo-2)',
                              color: isMe ? '#fff' : 'var(--fg-1)',
                              border: isMe ? 'none' : '1px solid var(--line-2)',
                            }}
                          >
                            {msg.body}
                          </div>
                          <p className={`mt-1 text-[9px] text-[var(--fg-3)] ${isMe ? 'text-right' : ''}`}>
                            {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={bottomRef} />
                </div>

                {/* Compose box */}
                <div className="shrink-0 border-t border-[var(--line-2)] p-3">
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={composeRef}
                      value={compose}
                      onChange={e => setCompose(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
                      }}
                      placeholder="Message… (Enter to send)"
                      rows={1}
                      className="flex-1 resize-none rounded-xl border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2.5 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
                      style={{ maxHeight: 120 }}
                    />
                    <button
                      type="button"
                      onClick={handleSend}
                      disabled={!compose.trim() || sending}
                      className="cn-btn cn-btn-primary shrink-0 !px-3 !py-2.5 disabled:opacity-40"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M2 21L23 12 2 3v7l15 2-15 2v7z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
