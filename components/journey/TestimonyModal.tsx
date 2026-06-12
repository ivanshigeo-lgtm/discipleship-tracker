'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { saveTestimony } from '../../lib/supabaseQueries'
import type { Person } from '../../types/database'

/*
 * The two-minute testimony — written or on video.
 * Shared with the whole constellation: anyone can meet your story.
 */
export default function TestimonyModal({
  profile,
  onClose,
  onSaved,
}: {
  profile: Person
  onClose: () => void
  onSaved: () => void
}) {
  const [mode, setMode] = useState<'write' | 'video'>(profile.testimony_video_url ? 'video' : 'write')
  const [text, setText] = useState(profile.testimony_text || '')
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [videoUrl, setVideoUrl] = useState(profile.testimony_video_url || '')
  const [error, setError] = useState('')

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 50 * 1024 * 1024) {
      setError('Video must be under 50MB — a two-minute clip at standard quality fits comfortably.')
      return
    }
    setUploading(true)
    setError('')
    const ext = file.name.split('.').pop()
    const path = `${profile.id}/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('testimonies').upload(path, file)
    if (upErr) {
      setError('Upload failed. Please try again.')
      setUploading(false)
      return
    }
    const { data } = supabase.storage.from('testimonies').getPublicUrl(path)
    setVideoUrl(data.publicUrl)
    setUploading(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    const { error: err } = await saveTestimony(profile.id, {
      testimony_text: text.trim() || null,
      testimony_video_url: videoUrl || null,
    })
    setSaving(false)
    if (err) {
      setError(err.message || 'Could not save. Please try again.')
    } else {
      onSaved()
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(6,8,20,.8)] p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-[var(--r-xl)] border border-[var(--line-2)] bg-[var(--indigo)] p-6" style={{ boxShadow: 'var(--elev-2)' }}>
        <div className="cn-label" style={{ color: 'var(--equip)' }}>Equip · your story</div>
        <h2 className="mt-1 text-2xl" style={{ fontFamily: 'var(--font-display)', color: 'var(--fg-1)' }}>
          Tell your story
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--fg-2)]">
          Two minutes: who you were, how you met Jesus, who you&rsquo;re becoming. Your story will shine in
          the constellation for anyone to find.
        </p>

        <div className="mt-4 flex rounded-lg bg-[var(--indigo-2)] p-1">
          {(['write', 'video'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
                mode === m ? 'bg-[var(--gbm-cobalt-bright)] text-white' : 'text-[var(--fg-2)]'
              }`}
            >
              {m === 'write' ? 'Write it' : 'On video'}
            </button>
          ))}
        </div>

        {mode === 'write' ? (
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Before I met Jesus…&#10;Then…&#10;Now…"
            rows={8}
            className="mt-4 w-full resize-none rounded-lg border border-[var(--line-2)] bg-[var(--indigo-2)] px-3 py-2 text-sm text-[var(--fg-1)] placeholder:text-[var(--fg-3)] focus:border-[var(--gbm-cobalt-bright)] focus:outline-none"
          />
        ) : (
          <div className="mt-4">
            {videoUrl ? (
              <div>
                <video src={videoUrl} controls className="w-full rounded-lg" />
                <button
                  type="button"
                  onClick={() => setVideoUrl('')}
                  className="mt-2 text-xs text-[var(--fg-3)] underline"
                >
                  Replace video
                </button>
              </div>
            ) : (
              <label className="block">
                <input
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  capture="user"
                  onChange={handleVideoUpload}
                  disabled={uploading}
                  className="hidden"
                />
                <div className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-[var(--line-2)] p-8 text-center transition-colors hover:border-[var(--gbm-cobalt-bright)]">
                  {uploading ? (
                    <span className="flex items-center gap-2 text-sm text-[var(--fg-2)]">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--gbm-cobalt-bright)] border-t-transparent" />
                      Uploading…
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--fg-2)]">Record or choose a video (up to 50MB)</span>
                  )}
                </div>
              </label>
            )}
          </div>
        )}

        {error && <p className="mt-2 text-xs text-[var(--danger)]">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onClose} className="cn-btn cn-btn-ghost flex-1">
            Not yet
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || uploading || (!text.trim() && !videoUrl)}
            className="cn-btn cn-btn-primary flex-1 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Let it shine'}
          </button>
        </div>
      </div>
    </div>
  )
}
