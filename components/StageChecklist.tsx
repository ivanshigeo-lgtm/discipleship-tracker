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
import StageLevelBadge from './StageLevelBadge'

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
    const { data, error } = await getStageChecklistItems(personId)
    if (error) {
      setError(error.message)
      return
    }
    setItems((data ?? []) as StageChecklistItem[])
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

    return (
      <div className="space-y-2">
        {templateItems.map(templateItem => {
          const savedItem = findSavedItem(stage, category, templateItem.label)
          const checked = Boolean(savedItem?.completed)
          const itemId = savedItem?.id ?? `${stage}-${category}-${templateItem.label}`

          return (
            <label key={templateItem.label} className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
              <input
                type="checkbox"
                checked={checked}
                disabled={savingId === itemId}
                onChange={event => handleToggle(stage, category, templateItem.label, event.target.checked)}
                className="mt-1 h-4 w-4 rounded border-gray-300 text-black"
              />
              <span className={`text-sm ${checked ? 'text-gray-700 line-through' : 'text-gray-900'}`}>
                {templateItem.label}
              </span>
            </label>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-2">
        {stages.map(stage => {
          const { completedCount, totalCount } = completionForStage(stage)
          const isOpen = openStages[stage]
          const isCurrentStage = currentStage === stage

          return (
            <div key={stage} className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button
                type="button"
                onClick={() => toggleStageOpen(stage)}
                className="flex w-full items-center justify-between gap-3 p-3 text-left hover:bg-gray-50"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StageLevelBadge stage={stage} size="sm" />
                    <span className="font-semibold text-gray-900">{stageLabels[stage].display}</span>
                    {isCurrentStage && (
                      <span className="rounded-full bg-black px-2 py-0.5 text-xs font-semibold text-white">Current</span>
                    )}
                  </div>
                  <div className="mt-1 text-xs font-medium text-gray-700">
                    {completedCount} of {totalCount} completed
                  </div>
                </div>
                <div className="text-xl font-light text-gray-700">{isOpen ? '−' : '+'}</div>
              </button>

              {isOpen && (
                <div className="space-y-4 border-t border-gray-200 bg-gray-50 p-3">
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Tools</div>
                    {renderItems(stage, 'Tool')}
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Action Items</div>
                    {renderItems(stage, 'Action Step')}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
