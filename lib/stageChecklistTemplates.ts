import type { ChecklistCategory, Stage } from '../types/database'

type ChecklistTemplateItem = {
  category: ChecklistCategory
  label: string
}

export const stageChecklistTemplates: Record<Stage, ChecklistTemplateItem[]> = {
  Engage: [
    { category: 'Action Step', label: 'Meaningful Connection - Implement SALT. Hear their story. Share yours.' },
    { category: 'Action Step', label: 'Schedule Follow Up' },
    { category: 'Action Step', label: 'Consistently Pray' },
  ],
  Establish: [
    { category: 'Tool', label: 'Completed One2One' },
    { category: 'Tool', label: 'Completed Biblical Foundation' },
    { category: 'Tool', label: 'Completed Church Community' },
    { category: 'Action Step', label: 'Confirm salvation / spiritual birthday' },
    { category: 'Action Step', label: 'Start One2One' },
    { category: 'Action Step', label: 'Connect to Small Group' },
    { category: 'Action Step', label: 'Start SOAPing' },
    { category: 'Action Step', label: 'Water baptism conversation' },
  ],
  Equip: [
    { category: 'Tool', label: 'Completed Making Disciples' },
    { category: 'Action Step', label: 'Practice Sharing Testimony/Gospel' },
    { category: 'Action Step', label: 'Begin Serving in a Ministry/Mission' },
    { category: 'Action Step', label: 'Assist in Leading Small Group' },
  ],
  Empower: [
    { category: 'Tool', label: 'Completed Empowering Leaders' },
    { category: 'Action Step', label: 'Identified Their Circle' },
    { category: 'Action Step', label: 'Lead a Grace Group' },
  ],
}

export const stages: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']
