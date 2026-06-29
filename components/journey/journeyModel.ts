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
  Engage: { text: 'Follow me, and I will make you fishers of men.', ref: 'Matthew 4:19' },
  Establish: { text: 'Rooted and built up in him, strengthened in the faith.', ref: 'Colossians 2:7' },
  Equip: { text: 'To equip his people for works of service.', ref: 'Ephesians 4:12' },
  Empower: { text: 'Entrust to faithful people who will be able to teach others also.', ref: '2 Timothy 2:2' },
}

export const E_TAGLINES: Record<Stage, string> = {
  Engage: 'Go — engage someone new, as you were once engaged.',
  Establish: 'Put down roots — in church, in the Word, in the faith.',
  Equip: 'Be sharpened to serve, lead, and tell your story.',
  Empower: 'The light you received becomes light you give.',
}

// Journey steps a disciple can directly check/uncheck — each is backed 1:1 by a
// stage_checklist_items label, so toggling upserts that item. (Activity-driven
// steps — coach connection, group, SOAP, testimony, engaging others — keep their
// own flows and aren't in here.)
export const STEP_CHECKLIST: Record<string, { stage: Stage; label: string }> = {
  one2one: { stage: 'Establish', label: 'Completed One2One' },
  'biblical-foundation': { stage: 'Establish', label: 'Completed Biblical Foundation' },
  'church-community': { stage: 'Establish', label: 'Completed Church Community' },
  'making-disciples': { stage: 'Equip', label: 'Completed Making Disciples' },
  'empowering-leaders': { stage: 'Empower', label: 'Completed Empowering Leaders' },
}

export const UNLOCK_THRESHOLD = 0.75

export type StepAction =
  | 'coach-code'
  | 'message-coach'
  | 'join-group'
  | 'soap'
  | 'testimony'
  | 'self-confirm'
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
  const leadsGroup =
    d.groups.some(g => g.owner_person_id === d.profile.id) ||
    checklistDone(d.checklist, 'Empower', 'Lead a Grace Group')
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
    {
      // The journey's capstone: multiply — start your own Grace Group.
      id: 'lead-gg',
      title: 'Launch Your Own Grace Group',
      detail: leadsGroup
        ? 'You shepherd a group of your own — the journey multiplies.'
        : 'Start a Grace Group and disciple others — a new star is lit through you.',
      completed: leadsGroup,
      progress: leadsGroup ? 1 : 0,
      action: 'celebrate',
    },
  ]

  const establish: JourneyStep[] = [
    {
      id: 'coach',
      title: 'Connect with your coach',
      detail: d.coach
        ? `Walking with ${d.coach.name} — send a greeting or a prayer request`
        : "Enter your coach's code to begin the journey together.",
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
      action: 'self-confirm',
    },
    {
      id: 'baptism',
      title: 'I got Baptized',
      detail: d.profile.baptism_date
        ? `Baptized ${d.profile.baptism_date}`
        : 'Talk with your coach about water baptism and being filled with the Spirit.',
      completed: Boolean(d.profile.baptism_date) || checklistDone(d.checklist, 'Establish', 'Water baptism conversation'),
      progress: Boolean(d.profile.baptism_date) || checklistDone(d.checklist, 'Establish', 'Water baptism conversation') ? 1 : 0,
      action: 'self-confirm',
    },
    {
      id: 'one2one',
      title: "I'm Going Through One2One",
      detail: 'Walk through the One2One foundations with your coach.',
      completed: checklistDone(d.checklist, 'Establish', 'Completed One2One'),
      progress: checklistDone(d.checklist, 'Establish', 'Completed One2One') ? 1 : 0,
      action: 'self-confirm',
    },
    {
      id: 'biblical-foundation',
      title: 'I Completed Biblical Foundation',
      detail: 'Walk through the Biblical Foundation curriculum with your coach.',
      completed: checklistDone(d.checklist, 'Establish', 'Completed Biblical Foundation'),
      progress: checklistDone(d.checklist, 'Establish', 'Completed Biblical Foundation') ? 1 : 0,
      action: 'self-confirm',
    },
    {
      id: 'church-community',
      title: 'I Completed Church Community',
      detail: 'Walk through the Church Community curriculum with your coach.',
      completed: checklistDone(d.checklist, 'Establish', 'Completed Church Community'),
      progress: checklistDone(d.checklist, 'Establish', 'Completed Church Community') ? 1 : 0,
      action: 'self-confirm',
    },
  ]

  const equip: JourneyStep[] = [
    {
      id: 'making-disciples',
      title: 'Journey Through Making Disciples',
      detail: "Learn to pass on what you've received.",
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

// ---------- The guided tour (the 4E story the star tells on first visit) ----------
// One inspirational beat per stage: the outcome ("what"), a why drawn from the
// Making Disciples booklet, and the stage's verse (E_VERSES). The detailed steps
// live in each quadrant — the tour is for vision, not a checklist.
export type TourStage = {
  stage: Stage
  outcome: string
  why: string
}

export const TOUR: TourStage[] = [
  {
    stage: 'Establish',
    outcome: 'Grounded in the faith, the Word, and the church.',
    why: 'Foundations, not façades — a life rooted in Jesus through repentance, faith, his Word, and his family.',
  },
  {
    stage: 'Equip',
    outcome: 'Equipped to serve.',
    why: 'Ministry was never meant for the experts alone — you’re equipped to serve and build up the body of Christ.',
  },
  {
    stage: 'Empower',
    outcome: 'Empowered to lead.',
    why: 'A healthy church raises up leaders — you’re entrusted to lead, and to make leaders of others.',
  },
  {
    stage: 'Engage',
    outcome: 'Sent to make disciples.',
    why: 'Every soul is worth the search — he left the ninety-nine for the one. Now your light gives light.',
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
