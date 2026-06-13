import type { Person, StageChecklistItem, VictoryGroup, Stage, DiscipleshipConnection } from '../../types/database'

/* Ring/quadrant positions (TL, TR, BR, BL) — fixed visual placement */
export const E_ORDER: Stage[] = ['Engage', 'Establish', 'Equip', 'Empower']

/*
 * The disciple's path through the stages. Engage comes LAST: it is not
 * something done to you — it's you going out to engage someone new, as you
 * were once engaged. The journey circles back to where a new star begins.
 */
export const JOURNEY_ORDER: Stage[] = ['Establish', 'Equip', 'Empower', 'Engage']

export const E_COLORS: Record<Stage, string> = {
  Engage: '#F4B650',
  Establish: '#36D6C3',
  Equip: '#5B8DF7',
  Empower: '#F0729F',
}

export const E_VERSES: Record<Stage, { text: string; ref: string }> = {
  Engage: { text: 'We love because he first loved us.', ref: '1 John 4:19' },
  Establish: { text: 'Rooted and built up in him, strengthened in the faith.', ref: 'Colossians 2:7' },
  Equip: { text: 'To equip his people for works of service.', ref: 'Ephesians 4:12' },
  Empower: { text: 'Go and make disciples of all nations.', ref: 'Matthew 28:19' },
}

export const E_TAGLINES: Record<Stage, string> = {
  Engage: 'Go — engage someone new, as you were once engaged.',
  Establish: 'Put down roots — in church, in the Word, in the faith.',
  Equip: 'Be sharpened to serve, lead, and tell your story.',
  Empower: 'The light you received becomes light you give.',
}

export const UNLOCK_THRESHOLD = 0.75

export type StepAction =
  | 'coach-code'
  | 'message-coach'
  | 'join-group'
  | 'soap'
  | 'testimony'
  | 'coach-verified'
  | 'celebrate'

export type JourneyStep = {
  id: string
  title: string
  detail: string
  completed: boolean
  progress: number // 0..1
  action: StepAction
}

export type JourneyLevel = {
  stage: Stage
  color: string
  tagline: string
  verse: { text: string; ref: string }
  steps: JourneyStep[]
  progress: number // 0..1
  unlocked: boolean
  completed: boolean
}

export type JourneyData = {
  profile: Person
  coach: Person | null
  groups: VictoryGroup[]
  soapStreak: number
  soapCount: number
  hasSoapToday: boolean
  checklist: StageChecklistItem[]
  /* connections where THIS person is the discipler — their own engaging */
  disciples: DiscipleshipConnection[]
}

const SOAP_STREAK_TARGET = 7

function checklistDone(checklist: StageChecklistItem[], stage: Stage, label: string): boolean {
  return checklist.some(i => i.stage === stage && i.label === label && i.completed)
}

export function computeJourney(d: JourneyData): JourneyLevel[] {
  const isConnected = d.coach !== null
  const inGroup = d.groups.length > 0
  const hasTestimony = Boolean(d.profile.testimony_text || d.profile.testimony_video_url)

  /*
   * Engage — the disciple's own engaging, nothing inherited from being
   * engaged. The Engage checklist a coach marks on this person's profile
   * records the COACH's work and deliberately does not light this quadrant.
   * It stays blank until this disciple engages someone new.
   */
  const identified = d.disciples.length
  const started = d.disciples.filter(c => c.status === 'One2One Started' || c.status === 'Actively Discipling').length
  const discipling = d.disciples.filter(c => c.status === 'Actively Discipling').length

  const engage: JourneyStep[] = [
    {
      id: 'identify',
      title: 'Engage Your Community Using SALT',
      detail:
        identified > 0
          ? `You're engaging ${identified} ${identified === 1 ? 'person' : 'people'}`
          : 'Pray and look around — who has God placed near you?',
      completed: identified > 0,
      progress: identified > 0 ? 1 : 0,
      action: 'celebrate',
    },
    {
      id: 'start-one2one',
      title: 'Coach Someone Through One2One',
      detail: started > 0 ? 'A new journey has begun' : 'Hear their story. Share yours.',
      completed: started > 0,
      progress: started > 0 ? 1 : 0,
      action: 'celebrate',
    },
    {
      id: 'actively-disciple',
      title: 'Help Establish Them In Faith',
      detail:
        discipling > 0
          ? 'A new star is being lit through you'
          : 'Disciple them through their own journey.',
      completed: discipling > 0,
      progress: discipling > 0 ? 1 : 0,
      action: 'celebrate',
    },
  ]

  const establish: JourneyStep[] = [
    {
      id: 'coach',
      title: 'Connect with your coach',
      detail: d.coach
        ? `Walking with ${d.coach.name} — send a greeting or a prayer request`
        : 'Enter your coach’s code to begin the journey together.',
      completed: isConnected,
      progress: isConnected ? 1 : 0,
      action: isConnected ? 'message-coach' : 'coach-code',
    },
    {
      id: 'group',
      title: 'I joined a Grace Group',
      detail: inGroup
        ? `You belong to ${d.groups.map(g => g.name).join(', ')}`
        : 'Find your people — pick a group and join.',
      completed: inGroup,
      progress: inGroup ? 1 : 0,
      action: 'join-group',
    },
    {
      id: 'word',
      title: 'I Started SOAPing',
      detail:
        d.soapStreak >= SOAP_STREAK_TARGET
          ? `A ${d.soapStreak}-day rhythm — keep it burning`
          : `SOAP daily — ${d.soapStreak} of ${SOAP_STREAK_TARGET} days in a row`,
      completed: d.soapStreak >= SOAP_STREAK_TARGET,
      progress: Math.min(d.soapStreak / SOAP_STREAK_TARGET, 1),
      action: 'soap',
    },
    {
      id: 'salvation',
      title: 'I Accepted Jesus as Lord',
      detail: d.profile.spiritual_birthday
        ? `Your spiritual birthday: ${d.profile.spiritual_birthday}`
        : 'Pray the prayer of salvation with your coach — mark your spiritual birthday.',
      completed: Boolean(d.profile.spiritual_birthday) || checklistDone(d.checklist, 'Establish', 'Confirm salvation / spiritual birthday'),
      progress: Boolean(d.profile.spiritual_birthday) || checklistDone(d.checklist, 'Establish', 'Confirm salvation / spiritual birthday') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'baptism',
      title: 'I got Baptized',
      detail: d.profile.baptism_date
        ? `Baptized ${d.profile.baptism_date}`
        : 'Talk with your coach about water baptism and being filled with the Spirit.',
      completed: Boolean(d.profile.baptism_date) || checklistDone(d.checklist, 'Establish', 'Water baptism conversation'),
      progress: Boolean(d.profile.baptism_date) || checklistDone(d.checklist, 'Establish', 'Water baptism conversation') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'one2one',
      title: 'I’m Going Through One2One',
      detail: 'Walk through the One2One foundations with your coach.',
      completed: checklistDone(d.checklist, 'Establish', 'Completed One2One'),
      progress: checklistDone(d.checklist, 'Establish', 'Completed One2One') ? 1 : 0,
      action: 'coach-verified',
    },
  ]

  const equip: JourneyStep[] = [
    {
      id: 'making-disciples',
      title: 'Journey Through Making Disciples',
      detail: 'Learn to pass on what you’ve received.',
      completed: checklistDone(d.checklist, 'Equip', 'Completed Making Disciples'),
      progress: checklistDone(d.checklist, 'Equip', 'Completed Making Disciples') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'testimony',
      title: 'Share Your Story',
      detail: hasTestimony
        ? 'Your two-minute testimony shines in the constellation.'
        : 'Record or write your two-minute testimony — your story becomes light for others.',
      completed: hasTestimony,
      progress: hasTestimony ? 1 : 0,
      action: 'testimony',
    },
    {
      id: 'practice-share',
      title: 'Share Your Hope In Christ',
      detail: 'Share your testimony and the gospel with someone this season.',
      completed: checklistDone(d.checklist, 'Equip', 'Practice Sharing Testimony/Gospel'),
      progress: checklistDone(d.checklist, 'Equip', 'Practice Sharing Testimony/Gospel') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'serve',
      title: 'Discover and Deploy Your Gifts',
      detail: 'Step into a ministry or mission.',
      completed: checklistDone(d.checklist, 'Equip', 'Begin Serving in a Ministry/Mission'),
      progress: checklistDone(d.checklist, 'Equip', 'Begin Serving in a Ministry/Mission') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'assist-gg',
      title: 'Serve Your Grace Group',
      detail: 'Help carry the group you’ve grown in.',
      completed: checklistDone(d.checklist, 'Equip', 'Assist in Leading Small Group'),
      progress: checklistDone(d.checklist, 'Equip', 'Assist in Leading Small Group') ? 1 : 0,
      action: 'coach-verified',
    },
  ]

  const empower: JourneyStep[] = [
    {
      id: 'empowering-leaders',
      title: 'Journey Through Empowering Leaders',
      detail: 'Be entrusted to raise up others.',
      completed: checklistDone(d.checklist, 'Empower', 'Completed Empowering Leaders'),
      progress: checklistDone(d.checklist, 'Empower', 'Completed Empowering Leaders') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'circle',
      title: 'Identify your circle',
      detail: 'Name the people God has placed around you to disciple.',
      completed: checklistDone(d.checklist, 'Empower', 'Identified Their Circle'),
      progress: checklistDone(d.checklist, 'Empower', 'Identified Their Circle') ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'lead-gg',
      title: 'Launch A New Grace Group',
      detail: 'Shepherd a group of your own.',
      completed: checklistDone(d.checklist, 'Empower', 'Lead a Grace Group'),
      progress: checklistDone(d.checklist, 'Empower', 'Lead a Grace Group') ? 1 : 0,
      action: 'coach-verified',
    },
  ]

  const levels: JourneyLevel[] = []
  const stepSets: Record<Stage, JourneyStep[]> = {
    Engage: engage,
    Establish: establish,
    Equip: equip,
    Empower: empower,
  }

  // Walk the disciple's order: Establish → Equip → Empower → Engage.
  let prevProgress = 1 // Establish is always open — the journey starts there
  for (const stage of JOURNEY_ORDER) {
    const steps = stepSets[stage]
    const progress = steps.reduce((a, s) => a + s.progress, 0) / steps.length
    const unlocked = prevProgress >= UNLOCK_THRESHOLD
    levels.push({
      stage,
      color: E_COLORS[stage],
      tagline: E_TAGLINES[stage],
      verse: E_VERSES[stage],
      steps,
      progress,
      unlocked,
      completed: progress >= 1,
    })
    prevProgress = progress
  }
  return levels
}

/* Map journey-ordered levels onto the ring's fixed quadrant order */
export function ringProgressFromLevels(levels: JourneyLevel[]): number[] {
  return E_ORDER.map(stage => levels.find(l => l.stage === stage)?.progress ?? 0)
}

export function levelByStage(levels: JourneyLevel[], stage: Stage): JourneyLevel | undefined {
  return levels.find(l => l.stage === stage)
}

// ---------- The guided tour (the story the star tells on first visit) ----------
export type TourStage = {
  stage: Stage
  intro: string
  steps: { title: string; line: string }[]
}

export const TOUR: TourStage[] = [
  {
    stage: 'Establish',
    intro: 'First, put down roots — in church, in the Word, in the faith.',
    steps: [
      { title: 'Connect with your coach', line: 'A companion for the whole road.' },
      { title: 'Join a Grace Group', line: 'Faith grows in community.' },
      { title: 'Start SOAPing', line: 'SOAP daily, and let the Word shape you.' },
      { title: 'Accept Christ As Lord', line: 'Pray, and mark your spiritual birthday.' },
      { title: 'Get Baptized', line: 'Buried and raised with him, filled with the Spirit.' },
      { title: 'Go Through One2One', line: 'The foundations, walked together.' },
    ],
  },
  {
    stage: 'Equip',
    intro: 'Then be sharpened — to serve, to lead, and to tell your story.',
    steps: [
      { title: 'Journey Through Making Disciples', line: 'Learn to pass on what you received.' },
      { title: 'Share Your Story', line: 'Two minutes of light for others to find.' },
      { title: 'Share Your Hope In Christ', line: 'Your story, spoken out loud.' },
      { title: 'Discover and Deploy Your Gifts', line: 'Step into a ministry or mission.' },
      { title: 'Serve Your Grace Group', line: 'Help carry what once carried you.' },
    ],
  },
  {
    stage: 'Empower',
    intro: 'Then — the light you received becomes light you give.',
    steps: [
      { title: 'Journey Through Empowering Leaders', line: 'Entrusted to raise up others.' },
      { title: 'Identify your circle', line: 'Name who God has placed around you.' },
      { title: 'Launch A New Grace Group', line: 'Shepherd a group of your own.' },
    ],
  },
  {
    stage: 'Engage',
    intro: 'And at last, you go — to engage someone new, just as you were once engaged.',
    steps: [
      { title: 'Engage Your Community Using SALT', line: 'Pray, look around: who has God placed near you?' },
      { title: 'Coach Someone Through One2One', line: 'Hear their story. Share yours.' },
      { title: 'Help Establish Them In Faith', line: 'A new star is lit — your light multiplies.' },
    ],
  },
]

// ---------- Badges ----------
export type Badge = {
  id: string
  title: string
  line: string
  color: string
  earned: boolean
}

export function computeBadges(d: JourneyData, levels: JourneyLevel[]): Badge[] {
  const find = (stage: Stage, id: string) =>
    levels.find(l => l.stage === stage)?.steps.find(s => s.id === id)?.completed ?? false
  const stageDone = (stage: Stage) => levels.find(l => l.stage === stage)?.completed ?? false

  return [
    { id: 'connected', title: 'Connected', line: 'You no longer walk alone.', color: E_COLORS.Establish, earned: find('Establish', 'coach') },
    { id: 'found-people', title: 'Found your people', line: 'Planted in a Grace Group.', color: E_COLORS.Establish, earned: find('Establish', 'group') },
    { id: 'first-soap', title: 'First light', line: 'Your first SOAP in the Word.', color: E_COLORS.Establish, earned: d.soapCount >= 1 },
    { id: 'streak-3', title: 'Three days burning', line: 'A rhythm is forming.', color: E_COLORS.Establish, earned: d.soapStreak >= 3 },
    { id: 'streak-7', title: 'Seven days steady', line: 'Your light is steadying.', color: E_COLORS.Establish, earned: d.soapStreak >= 7 },
    { id: 'streak-30', title: 'Thirty days faithful', line: 'A month abiding in the Word.', color: '#F2C879', earned: d.soapStreak >= 30 },
    { id: 'new-birth', title: 'Born of the Spirit', line: 'Your spiritual birthday is written.', color: E_COLORS.Establish, earned: find('Establish', 'salvation') },
    { id: 'baptized', title: 'Through the waters', line: 'Buried and raised with him.', color: E_COLORS.Establish, earned: find('Establish', 'baptism') },
    { id: 'storyteller', title: 'Storyteller', line: 'Your testimony now shines for all.', color: E_COLORS.Equip, earned: find('Equip', 'testimony') },
    { id: 'established', title: 'Established', line: 'Rooted — the Establish ring is full.', color: E_COLORS.Establish, earned: stageDone('Establish') },
    { id: 'equipped', title: 'Equipped', line: 'Sharpened for service.', color: E_COLORS.Equip, earned: stageDone('Equip') },
    { id: 'empowered', title: 'Empowered', line: 'Entrusted — light ready to be given.', color: E_COLORS.Empower, earned: stageDone('Empower') },
    { id: 'engager', title: 'A new star', line: 'You engaged someone — your light multiplies.', color: E_COLORS.Engage, earned: d.disciples.length > 0 },
    { id: 'full-circle', title: 'Full circle', line: 'Engaged to engaging — the journey gives itself away.', color: '#F2C879', earned: stageDone('Engage') },
  ]
}
