'use client'

import { useEffect, useState } from 'react'
import {
  getStageChecklistItems,
  updateStageChecklistItem,
  upsertStageChecklistItem,
} from '../lib/supabaseQueries'
import { stageChecklistTemplates, stages } from '../lib/stageChecklistTemplates'
import type { ChecklistCategory, Stage, StageChecklistItem } from '../types/database'
import { stageLabels } from '../lib/stageLabels'

const STAGE_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

export default function StageChecklist({
  personId,
  currentStage,
  onChanged,
}: {
  personId: string
  currentStage: Stage
  onChanged?: () => void
}) {
  const [items, setItems] = useState<StageChecklistItem[]>([])
  const [openStages, setOpenStages] = useState<Record<Stage, boolean>>({
    Engage: false,
    Establish: false,
    Equip: false,
    Empower: false,
  })
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const loadItems = async () => {
    setError('')
    try {
      const result = await Promise.race([
        getStageChecklistItems(personId),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 15000))
      ])
      if (result.error) {
        setError(result.error.message)
        return
      }
      setItems((result.data ?? []) as StageChecklistItem[])
    } catch (err) {
      console.error('StageChecklist load error:', err)
      setError('Failed to load checklist')
    }
  }

  useEffect(() => {
    loadItems()
  }, [personId])

  const toggleStageOpen = (stage: Stage) => {
    setOpenStages(current => ({
      ...current,
      [stage]: !current[stage],
    }))
  }

  const findSavedItem = (stage: Stage, category: ChecklistCategory, label: string) => {
    return items.find(item => item.stage === stage && item.category === category && item.label === label)
  }

  const handleToggle = async (stage: Stage, category: ChecklistCategory, label: string, checked: boolean) => {
    const savedItem = findSavedItem(stage, category, label)
    const optimisticId = savedItem?.id ?? `${stage}-${category}-${label}`
    setSavingId(optimisticId)
    setError('')

    if (savedItem) {
      setItems(currentItems =>
        currentItems.map(item =>
          item.id === savedItem.id
            ? {
                ...item,
                completed: checked,
                completed_at: checked ? new Date().toISOString() : null,
              }
            : item
        )
      )

      const { error } = await updateStageChecklistItem(savedItem.id, checked)
      if (error) {
        setError(error.message)
        await loadItems()
      } else {
        onChanged?.()
      }
    } else {
      const { data, error } = await upsertStageChecklistItem({
        person_id: personId,
        stage,
        category,
        label,
        completed: checked,
      })

      if (error) {
        setError(error.message)
      } else if (data) {
        setItems(currentItems => [...currentItems, data as StageChecklistItem])
        onChanged?.()
      }
    }

    setSavingId(null)
  }

  const completionForStage = (stage: Stage) => {
    const templateItems = stageChecklistTemplates[stage]
    const completedCount = templateItems.filter(templateItem => {
      const savedItem = findSavedItem(stage, templateItem.category, templateItem.label)
      return savedItem?.completed
    }).length

    return { completedCount, totalCount: templateItems.length }
  }

  const renderItems = (stage: Stage, category: ChecklistCategory) => {
    const templateItems = stageChecklistTemplates[stage].filter(item => item.category === category)
    const stageColor = STAGE_COLORS[stage]

    return (
      <div className="space-y-1.5">
        {templateItems.map(templateItem => {
          const savedItem = findSavedItem(stage, category, templateItem.label)
          const checked = Boolean(savedItem?.completed)
          const itemId = savedItem?.id ?? `${stage}-${category}-${templateItem.label}`

          return (
            <label
              key={templateItem.label}
              className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-[var(--line-1)] bg-[var(--indigo-2)] p-2.5 transition-colors hover:border-[var(--line-2)]"
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={savingId === itemId}
                onChange={event => handleToggle(stage, category, templateItem.label, event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--line-2)] bg-[var(--indigo)]"
                style={{ accentColor: stageColor }}
              />
              <span className={`text-xs ${checked ? 'text-[var(--fg-3)] line-through' : 'text-[var(--fg-1)]'}`}>
                {templateItem.label}
              </span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-[rgba(240,114,159,.15)] p-2 text-xs text-[#F2728A]">{error}</p>}

      {stages.map(stage => {
        const { completedCount, totalCount } = completionForStage(stage)
        const isOpen = openStages[stage]
        const isCurrentStage = currentStage === stage
        const stageColor = STAGE_COLORS[stage]
        const percentage = Math.round((completedCount / totalCount) * 100)

        return (
          <div
            key={stage}
            className="overflow-hidden rounded-lg border border-[var(--line-1)]"
            style={{ background: 'var(--indigo-2)' }}
          >
            <button
              type="button"
              onClick={() => toggleStageOpen(stage)}
              className="flex w-full items-center justify-between gap-3 p-2.5 text-left transition-colors hover:bg-[var(--indigo-3)]"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={{ border: `2px solid ${stageColor}`, color: stageColor }}
                >
                  ✦
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold" style={{ color: stageColor }}>
                      {stageLabels[stage].name}
                    </span>
                    {isCurrentStage && (
                      <span className="rounded-full bg-[var(--gbm-cobalt-bright)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fg-1)]">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[var(--fg-3)]">
                    <span>{completedCount}/{totalCount}</span>
                    <div className="h-1 w-16 overflow-hidden rounded-full bg-[var(--indigo)]">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${percentage}%`, background: stageColor }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              <span className="text-sm text-[var(--fg-3)]">{isOpen ? '−' : '+'}</span>
            </button>

            {isOpen && (
              <div className="space-y-3 border-t border-[var(--line-1)] bg-[var(--indigo)] p-2.5">
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Tools</div>
                  {renderItems(stage, 'Tool')}
                </div>
                <div>
                  <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--fg-3)]">Action Steps</div>
                  {renderItems(stage, 'Action Step')}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
