import type { Person, StageChecklistItem, VictoryGroup, Stage, DiscipleshipConnection, ChecklistCategory, LevelSignoff } from '../../types/database'

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
  Equip: 'Be sharpened to serve, lead, and share your 2-minute miracle.',
  Empower: 'The light you received becomes light you give.',
}

// Journey steps whose circle can be checked AND unchecked. Each maps to a
// stage_checklist_items label. For activity-derived steps (coach, group, SOAP,
// salvation, baptism, testimony) this row acts as a non-destructive OVERRIDE:
// when the row exists its `completed` wins; otherwise we fall back to the live
// data (see `stepDone`). So unchecking never deletes a journal, group
// membership, date, or testimony — it just marks the step not-done.
export const STEP_CHECKLIST: Record<string, { stage: Stage; label: string; category: ChecklistCategory }> = {
  coach: { stage: 'Establish', label: 'Connected with Coach', category: 'Action Step' },
  group: { stage: 'Establish', label: 'Connect to Small Group', category: 'Action Step' },
  word: { stage: 'Establish', label: 'Start SOAPing', category: 'Action Step' },
  salvation: { stage: 'Establish', label: 'Confirm salvation / spiritual birthday', category: 'Action Step' },
  baptism: { stage: 'Establish', label: 'Water baptism conversation', category: 'Action Step' },
  one2one: { stage: 'Establish', label: 'Completed One2One', category: 'Tool' },
  'church-community': { stage: 'Establish', label: 'Completed Church Community', category: 'Tool' },
  'making-disciples': { stage: 'Equip', label: 'Completed Making Disciples', category: 'Tool' },
  'spiritual-gifts': { stage: 'Equip', label: 'Discover Your Spiritual Gifts', category: 'Action Step' },
  'big-five': { stage: 'Equip', label: 'Discover Your Personality (Big Five)', category: 'Action Step' },
  passion: { stage: 'Equip', label: 'Discover Your Passion', category: 'Action Step' },
  testimony: { stage: 'Equip', label: 'Shared Their 2min Miracle', category: 'Action Step' },
  'empowering-leaders': { stage: 'Empower', label: 'Completed Empowering Leaders', category: 'Tool' },
}

// Static, explanatory hover descriptions for each step (what it is / how to do it).
export const STEP_DESCRIPTIONS: Record<string, string> = {
  coach: "A companion for the whole journey. Enter your coach's code to connect, then reach out anytime.",
  group: 'Faith grows in community — find a Grace Group and join it.',
  word: 'Time in the Word — Scripture, Observation, Application, Prayer, Surrender. Log an entry to start your rhythm.',
  salvation: 'Pray to receive Jesus as Lord and mark your spiritual birthday.',
  baptism: 'Be baptized in water and filled with the Spirit — buried and raised with Christ.',
  one2one: 'Walk the One2One booklet with your coach — the foundations of following Jesus.',
  'church-community': 'Learn what it means to belong to the body of Christ.',
  'making-disciples': 'Journey through the Making Disciples booklet — learn to help others follow Jesus.',
  'spiritual-gifts': 'Take a short assessment to discover the gifts God has given you — and how to put them to work.',
  'big-five': 'Take a short personality assessment to understand how and where you tend to thrive in serving.',
  passion: 'Reflect on who and what stirs your heart — and discover where God may be calling you to serve.',
  testimony: 'Record your two-minute miracle — your story becomes light for others.',
  'empowering-leaders': 'Be equipped to raise up and release new leaders.',
  identify: 'Look around your world — Start a conversation, Ask questions, Listen, Tell your story.',
  'start-one2one': 'Begin walking someone through One2One, as you were walked through it.',
  'actively-disciple': 'Help your disciple get rooted in the faith, the Word, and the church.',
  'lead-gg': 'Start and shepherd a Grace Group of your own — the journey multiplies.',
}

export const UNLOCK_THRESHOLD = 0.75

export type StepAction =
  | 'coach-code'
  | 'message-coach'
  | 'join-group'
  | 'soap'
  | 'testimony'
  | 'spiritual-gifts'
  | 'big-five'
  | 'passion'
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
  // Coach sign-off gate: 'none' = not yet requested, 'requested' = awaiting the
  // coach, 'approved' = signed off (this is what unlocks the next level).
  signoff: 'none' | 'requested' | 'approved'
  congrats: string | null
}

export type JourneyData = {
  profile: Person
  coach: Person | null
  groups: VictoryGroup[]
  /* true if this person OWNS (leads) a Grace Group — ownership is independent of
     membership, so an owner who isn't a listed member still counts. */
  ownsGroup?: boolean
  soapStreak: number
  soapCount: number
  hasSoapToday: boolean
  checklist: StageChecklistItem[]
  /* connections where THIS person is the discipler — their own engaging */
  disciples: DiscipleshipConnection[]
  /* coach sign-offs on completed levels */
  signoffs: LevelSignoff[]
  /* true if this person has completed the spiritual-gifts assessment */
  hasGiftsResult?: boolean
  /* true if this person has completed the Big Five personality assessment */
  hasBigFiveResult?: boolean
  /* true if this person has completed the Passion assessment */
  hasPassionResult?: boolean
}

const SOAP_STREAK_TARGET = 7

function checklistDone(checklist: StageChecklistItem[], stage: Stage, label: string): boolean {
  return checklist.some(i => i.stage === stage && i.label === label && i.completed)
}

// Completion for a togglable step. If the disciple has explicitly set this
// step's checklist row (via the circle), that wins; otherwise fall back to the
// live/derived value. This is what lets the circle UNcheck an activity-derived
// step (e.g. SOAP) without deleting the underlying data.
function stepDone(checklist: StageChecklistItem[], stepId: string, derived: boolean): boolean {
  const t = STEP_CHECKLIST[stepId]
  if (!t) return derived
  const item = checklist.find(i => i.stage === t.stage && i.label === t.label)
  return item ? item.completed : derived
}

export function computeJourney(d: JourneyData): JourneyLevel[] {
  // Admins oversee the whole tree, so their "Your Coach" step counts as done.
  const isConnected = d.coach !== null || Boolean(d.profile.is_admin)
  const inGroup = d.groups.length > 0
  const leadsGroup =
    Boolean(d.ownsGroup) ||
    d.groups.some(g => g.owner_person_id === d.profile.id) ||
    checklistDone(d.checklist, 'Empower', 'Lead a Grace Group')
  const hasTestimony = Boolean(d.profile.testimony_text || d.profile.testimony_video_url)

  /*
   * Engage — the disciple's own engaging, nothing inherited from being
   * engaged. The Engage checklist a coach marks on this person's profile
   * records the COACH's work and deliberately does not light this quadrant.
   * It stays blank until this disciple engages someone new.
   */
  // Derive from each disciple's REAL stage, not the (often-stale) connection
  // status. One2One is the Establish tool, so a disciple in Establish is being
  // walked through it; one who has moved past Establish (Equip+) has been
  // established. We also honor the legacy status field as a fallback.
  const STAGE_RANK: Record<Stage, number> = { Establish: 1, Equip: 2, Empower: 3, Engage: 4 }
  const rankOf = (c: DiscipleshipConnection) => (c.disciple?.current_stage ? STAGE_RANK[c.disciple.current_stage] : 0)
  const identified = d.disciples.length
  const started = d.disciples.filter(c => rankOf(c) >= 1 || c.status === 'One2One Started' || c.status === 'Actively Discipling').length
  const discipling = d.disciples.filter(c => rankOf(c) >= 2 || c.status === 'Actively Discipling').length

  const engage: JourneyStep[] = [
    {
      id: 'identify',
      title: 'Engage (SALT)',
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
      title: 'Coach One2One',
      detail: started > 0 ? `You're walking ${started} ${started === 1 ? 'person' : 'people'} through One2One` : 'Hear their story. Share yours.',
      completed: started > 0,
      progress: started > 0 ? 1 : 0,
      action: 'celebrate',
    },
    {
      id: 'actively-disciple',
      title: 'Establish Them',
      detail:
        discipling > 0
          ? `${discipling} ${discipling === 1 ? 'person has' : 'people have'} completed Establish through you`
          : 'Walk a disciple all the way through the Establish stage.',
      completed: discipling > 0,
      progress: discipling > 0 ? 1 : 0,
      action: 'celebrate',
    },
    {
      // The journey's capstone: multiply — start your own Grace Group.
      id: 'lead-gg',
      title: 'Launch a Grace Group',
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
      title: 'Your Coach',
      detail: d.coach
        ? `Walking with ${d.coach.name} — send a greeting or a prayer request`
        : d.profile.is_admin
        ? 'You oversee the journey for everyone.'
        : "Enter your coach's code to begin the journey together.",
      completed: stepDone(d.checklist, 'coach', isConnected),
      progress: stepDone(d.checklist, 'coach', isConnected) ? 1 : 0,
      action: d.coach ? 'message-coach' : 'coach-code',
    },
    {
      id: 'group',
      title: 'Grace Group',
      detail: inGroup
        ? `You belong to ${d.groups.map(g => g.name).join(', ')}`
        : 'Find your people — pick a group and join.',
      completed: stepDone(d.checklist, 'group', inGroup),
      progress: stepDone(d.checklist, 'group', inGroup) ? 1 : 0,
      action: 'join-group',
    },
    {
      id: 'word',
      title: 'SOAP',
      detail:
        d.soapCount > 0
          ? d.soapStreak >= SOAP_STREAK_TARGET
            ? `A ${d.soapStreak}-day rhythm — keep it burning`
            : `You've started SOAPing${d.soapStreak > 0 ? ` — ${d.soapStreak}-day streak` : ''}`
          : 'SOAP daily — start your rhythm in the Word.',
      completed: stepDone(d.checklist, 'word', d.soapCount > 0),
      progress: stepDone(d.checklist, 'word', d.soapCount > 0) ? 1 : 0,
      action: 'soap',
    },
    {
      id: 'salvation',
      title: 'Salvation',
      detail: d.profile.spiritual_birthday
        ? `Your spiritual birthday: ${d.profile.spiritual_birthday}`
        : 'Pray the prayer of salvation with your coach — mark your spiritual birthday.',
      completed: stepDone(d.checklist, 'salvation', Boolean(d.profile.spiritual_birthday)),
      progress: stepDone(d.checklist, 'salvation', Boolean(d.profile.spiritual_birthday)) ? 1 : 0,
      action: 'self-confirm',
    },
    {
      id: 'baptism',
      title: 'Baptism',
      detail: d.profile.baptism_date
        ? `Baptized ${d.profile.baptism_date}`
        : 'Talk with your coach about water baptism and being filled with the Spirit.',
      completed: stepDone(d.checklist, 'baptism', Boolean(d.profile.baptism_date)),
      progress: stepDone(d.checklist, 'baptism', Boolean(d.profile.baptism_date)) ? 1 : 0,
      action: 'self-confirm',
    },
    {
      id: 'one2one',
      title: 'One2One',
      detail: 'Walk through the One2One foundations with your coach.',
      completed: stepDone(d.checklist, 'one2one', false),
      progress: stepDone(d.checklist, 'one2one', false) ? 1 : 0,
      action: 'self-confirm',
    },
    {
      id: 'church-community',
      title: 'Church Community',
      detail: 'Walk through the Church Community curriculum with your coach.',
      completed: stepDone(d.checklist, 'church-community', false),
      progress: stepDone(d.checklist, 'church-community', false) ? 1 : 0,
      action: 'self-confirm',
    },
  ]

  const equip: JourneyStep[] = [
    {
      id: 'making-disciples',
      title: 'Making Disciples',
      detail: "Learn to pass on what you've received.",
      completed: stepDone(d.checklist, 'making-disciples', false),
      progress: stepDone(d.checklist, 'making-disciples', false) ? 1 : 0,
      action: 'coach-verified',
    },
    {
      id: 'spiritual-gifts',
      title: 'Discover Your Gifts',
      detail: stepDone(d.checklist, 'spiritual-gifts', Boolean(d.hasGiftsResult))
        ? 'You know your top gifts — now put them to work.'
        : 'Take a short assessment to discover how God has gifted you.',
      completed: stepDone(d.checklist, 'spiritual-gifts', Boolean(d.hasGiftsResult)),
      progress: stepDone(d.checklist, 'spiritual-gifts', Boolean(d.hasGiftsResult)) ? 1 : 0,
      action: 'spiritual-gifts',
    },
    {
      id: 'big-five',
      title: 'Discover Your Personality',
      detail: stepDone(d.checklist, 'big-five', Boolean(d.hasBigFiveResult))
        ? 'You know how you tend to thrive — lean into it as you serve.'
        : 'Take a short personality assessment to see how and where you thrive.',
      completed: stepDone(d.checklist, 'big-five', Boolean(d.hasBigFiveResult)),
      progress: stepDone(d.checklist, 'big-five', Boolean(d.hasBigFiveResult)) ? 1 : 0,
      action: 'big-five',
    },
    {
      id: 'passion',
      title: 'Discover Your Passion',
      detail: stepDone(d.checklist, 'passion', Boolean(d.hasPassionResult))
        ? 'You know what stirs your heart — pray about where to serve.'
        : 'Reflect on who and what stirs your heart to serve.',
      completed: stepDone(d.checklist, 'passion', Boolean(d.hasPassionResult)),
      progress: stepDone(d.checklist, 'passion', Boolean(d.hasPassionResult)) ? 1 : 0,
      action: 'passion',
    },
    {
      id: 'testimony',
      title: 'Your 2min Miracle',
      detail: hasTestimony
        ? 'Your two-minute miracle shines in the constellation.'
        : 'Record your two-minute miracle — your story becomes light for others.',
      completed: stepDone(d.checklist, 'testimony', hasTestimony),
      progress: stepDone(d.checklist, 'testimony', hasTestimony) ? 1 : 0,
      action: 'testimony',
    },
  ]

  const empower: JourneyStep[] = [
    {
      id: 'empowering-leaders',
      title: 'Empowering Leaders',
      detail: 'Be entrusted to raise up others.',
      completed: stepDone(d.checklist, 'empowering-leaders', false),
      progress: stepDone(d.checklist, 'empowering-leaders', false) ? 1 : 0,
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
  // A level unlocks only when the PREVIOUS level's coach sign-off is approved.
  const signoffFor = (stage: Stage) => d.signoffs.find(s => s.stage === stage)
  let prevApproved = true // Establish is always open — the journey starts there
  for (const stage of JOURNEY_ORDER) {
    const steps = stepSets[stage]
    const progress = steps.reduce((a, s) => a + s.progress, 0) / steps.length
    const so = signoffFor(stage)
    const signoff: 'none' | 'requested' | 'approved' = so ? so.status : 'none'
    levels.push({
      stage,
      color: E_COLORS[stage],
      tagline: E_TAGLINES[stage],
      verse: E_VERSES[stage],
      steps,
      progress,
      unlocked: prevApproved,
      completed: progress >= 1,
      signoff,
      congrats: so?.congrats_message ?? null,
    })
    prevApproved = signoff === 'approved'
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
  // The story shows the full verse (E_VERSES holds the short accent used in the
  // quadrant popups); the tour carries its own full-length text + ref.
  verse: { text: string; ref: string }
}

export const TOUR: TourStage[] = [
  {
    stage: 'Establish',
    outcome: 'Establish Biblical Foundations',
    why: 'In the Word, faith, prayer, and the church.',
    verse: {
      text: 'rooted and built up in him and established in the faith, just as you were taught, abounding in thanksgiving.',
      ref: 'Colossians 2:7',
    },
  },
  {
    stage: 'Equip',
    outcome: 'Equipped to Minister',
    why: 'Not for the experts alone — to serve and build up the body.',
    verse: {
      text: 'And he gave the apostles, the prophets, the evangelists, the shepherds and teachers, to equip the saints for the work of ministry, for building up the body of Christ.',
      ref: 'Ephesians 4:11–12',
    },
  },
  {
    stage: 'Empower',
    outcome: 'Empowered to Make Disciples',
    why: 'A healthy church raises up leaders who make leaders.',
    verse: {
      text: 'Go therefore and make disciples of all nations, baptizing them in the name of the Father and of the Son and of the Holy Spirit, teaching them to observe all that I have commanded you. And behold, I am with you always, to the end of the age.',
      ref: 'Matthew 28:19–20',
    },
  },
  {
    stage: 'Engage',
    outcome: 'Engage Your Community',
    why: 'He left the ninety-nine for the one — now your light gives light.',
    verse: {
      text: 'Follow me, and I will make you fishers of men.',
      ref: 'Matthew 4:19',
    },
  },
]

// ---------- Badges ----------
export type Badge = {
  id: string
  title: string
  stage: Stage
  // 'gem' = the stage-name capstone (hexagon), earned when the coach signs off
  // that stage; 'badge' = a milestone medallion within the stage.
  kind: 'gem' | 'badge'
  icon: string // line-icon name (see MilestoneArt ICONS)
  line: string
  color: string
  earned: boolean
}

export function computeBadges(d: JourneyData, levels: JourneyLevel[]): Badge[] {
  const find = (stage: Stage, id: string) =>
    levels.find(l => l.stage === stage)?.steps.find(s => s.id === id)?.completed ?? false

  // Badges are grouped by stage. Within each stage: milestone MEDALLIONS, then
  // the stage's capstone GEM last — earned when the coach signs off that stage.
  const signedOff = (stage: Stage) => levels.find(l => l.stage === stage)?.signoff === 'approved'

  return [
    // ===== ESTABLISH =====
    { id: 'connected', title: 'Coached', kind: 'badge', stage: 'Establish', icon: 'compass', line: 'Connected with your coach — you no longer walk alone.', color: E_COLORS.Establish, earned: find('Establish', 'coach') },
    { id: 'found-people', title: 'Grace Group', kind: 'badge', stage: 'Establish', icon: 'users', line: 'Planted in a Grace Group.', color: E_COLORS.Establish, earned: find('Establish', 'group') },
    { id: 'first-soap', title: 'First SOAP', kind: 'badge', stage: 'Establish', icon: 'pen-line', line: 'Your first SOAP in the Word.', color: E_COLORS.Establish, earned: d.soapCount >= 1 },
    { id: 'streak-3', title: '3-Day Streak', kind: 'badge', stage: 'Establish', icon: 'flame', line: 'A SOAP rhythm is forming.', color: E_COLORS.Establish, earned: d.soapStreak >= 3 },
    { id: 'streak-7', title: '7-Day Streak', kind: 'badge', stage: 'Establish', icon: 'flame', line: 'Your light is steadying — a week in the Word.', color: E_COLORS.Establish, earned: d.soapStreak >= 7 },
    { id: 'streak-30', title: '30-Day Streak', kind: 'badge', stage: 'Establish', icon: 'flame', line: 'A month abiding in the Word.', color: E_COLORS.Establish, earned: d.soapStreak >= 30 },
    { id: 'new-birth', title: 'Salvation', kind: 'badge', stage: 'Establish', icon: 'sunrise', line: 'Born of the Spirit — your spiritual birthday is written.', color: E_COLORS.Establish, earned: find('Establish', 'salvation') },
    { id: 'baptized', title: 'Baptized', kind: 'badge', stage: 'Establish', icon: 'droplets', line: 'Through the waters — buried and raised with him.', color: E_COLORS.Establish, earned: find('Establish', 'baptism') },
    { id: 'one2one', title: 'One2One', kind: 'badge', stage: 'Establish', icon: 'footprints', line: 'You walked the One2One foundations.', color: E_COLORS.Establish, earned: find('Establish', 'one2one') },
    { id: 'church-community', title: 'Church Community', kind: 'badge', stage: 'Establish', icon: 'church', line: 'Planted in the body of Christ.', color: E_COLORS.Establish, earned: find('Establish', 'church-community') },
    { id: 'gem-establish', title: 'Establish', kind: 'gem', stage: 'Establish', icon: 'book-open', line: 'Rooted — your coach has signed off Establish.', color: E_COLORS.Establish, earned: signedOff('Establish') },

    // ===== EQUIP =====
    { id: 'making-disciples', title: 'Making Disciples', kind: 'badge', stage: 'Equip', icon: 'book-marked', line: 'You journeyed through Making Disciples.', color: E_COLORS.Equip, earned: find('Equip', 'making-disciples') },
    { id: 'storyteller', title: 'Your Story', kind: 'badge', stage: 'Equip', icon: 'mic', line: 'Your testimony now shines for all.', color: E_COLORS.Equip, earned: find('Equip', 'testimony') },
    { id: 'gem-equip', title: 'Equip', kind: 'gem', stage: 'Equip', icon: 'flame', line: 'Equipped to serve — your coach has signed off Equip.', color: E_COLORS.Equip, earned: signedOff('Equip') },

    // ===== EMPOWER =====
    { id: 'empowering-leaders', title: 'Empowering Leaders', kind: 'badge', stage: 'Empower', icon: 'sparkles', line: 'Entrusted to raise up others.', color: E_COLORS.Empower, earned: find('Empower', 'empowering-leaders') },
    { id: 'gem-empower', title: 'Empower', kind: 'gem', stage: 'Empower', icon: 'cross', line: 'Empowered to lead — your coach has signed off Empower.', color: E_COLORS.Empower, earned: signedOff('Empower') },

    // ===== ENGAGE =====
    { id: 'engage-salt', title: 'Engage (SALT)', kind: 'badge', stage: 'Engage', icon: 'compass', line: 'You looked around — who has God placed near you?', color: E_COLORS.Engage, earned: find('Engage', 'identify') },
    { id: 'engage-coach', title: 'Coach One2One', kind: 'badge', stage: 'Engage', icon: 'users', line: 'You began coaching someone through One2One.', color: E_COLORS.Engage, earned: find('Engage', 'start-one2one') },
    { id: 'engage-establish', title: 'Establish Them', kind: 'badge', stage: 'Engage', icon: 'sprout', line: 'A new light is being established through you.', color: E_COLORS.Engage, earned: find('Engage', 'actively-disciple') },
    { id: 'engage-launch', title: 'Launch a Group', kind: 'badge', stage: 'Engage', icon: 'send', line: 'You launched a Grace Group of your own.', color: E_COLORS.Engage, earned: find('Engage', 'lead-gg') },
    { id: 'gem-engage', title: 'Engage', kind: 'gem', stage: 'Engage', icon: 'coffee', line: 'Full circle — your coach has signed off your sending.', color: E_COLORS.Engage, earned: signedOff('Engage') },
  ]
}
