import type { Stage } from '../types/database'

export const stageLabels: Record<Stage, { name: Stage; action: string; display: string; shortDescription: string }> = {
  Engage: {
    name: 'Engage',
    action: 'Reach',
    display: 'Engage — Reach',
    shortDescription: 'People being reached',
  },
  Establish: {
    name: 'Establish',
    action: 'Build',
    display: 'Establish — Build',
    shortDescription: 'People being built',
  },
  Equip: {
    name: 'Equip',
    action: 'Train',
    display: 'Equip — Train',
    shortDescription: 'Emerging team members',
  },
  Empower: {
    name: 'Empower',
    action: 'Release',
    display: 'Empower — Release',
    shortDescription: 'Empowered leaders',
  },
}

export const stageOrder: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']
