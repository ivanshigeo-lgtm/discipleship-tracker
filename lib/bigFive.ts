// Big Five (OCEAN) personality instrument for ministry fit. Complements the
// Spiritual Gifts assessment: gifts describe WHAT you're gifted for, the Big
// Five describes HOW and WHERE you'll tend to thrive in serving.
//
// Items are the public-domain IPIP Big-Five Factor Markers (Goldberg, 1992) —
// 50 statements, 10 per trait, rated 1-5 (Disagree → Agree). Scoring is
// NORMATIVE (rate each item on its own), same shape as the gifts instrument.
// Half of each trait's items are reverse-keyed. Every trait is scored so a HIGH
// score means MORE of the named (positive-framed) pole — note we score the
// fifth factor as EMOTIONAL STABILITY (the calm end of Neuroticism), which
// reads more graciously for a church audience.
//
// Big Five is descriptive, not affirming by default, so the results frame BOTH
// ends of every trait as a genuine ministry strength.
//
// Keep this file in sync between the web app and the native app.

export type TraitKey = 'openness' | 'conscientiousness' | 'extraversion' | 'agreeableness' | 'stability'

export const SCALE = [
  { value: 1, label: 'Disagree' },
  { value: 2, label: 'A little' },
  { value: 3, label: 'Neutral' },
  { value: 4, label: 'Mostly' },
  { value: 5, label: 'Agree' },
] as const

export type BandKey = 'high' | 'balanced' | 'lower'

export type TraitLevelText = { headline: string; ministry: string }

export type Trait = {
  key: TraitKey
  name: string
  // One-line description of what the trait measures (positive pole).
  description: string
  // Ministry-fit guidance for each band. Both ends are framed as real strengths.
  high: TraitLevelText
  lower: TraitLevelText
  balanced: TraitLevelText
}

export const TRAITS: Trait[] = [
  {
    key: 'openness',
    name: 'Openness',
    description: 'Curiosity, imagination, and openness to new ideas and ways of doing things.',
    high: {
      headline: 'Creative and future-facing',
      ministry: 'You bring vision and fresh ideas — a fit for church planting, launching new ministries, creative arts, and teaching people to see Scripture in new light.',
    },
    balanced: {
      headline: 'Grounded but open',
      ministry: 'You can dream new things and steward proven ones — helpful bridging vision teams with the people who keep things running.',
    },
    lower: {
      headline: 'Faithful and consistent',
      ministry: 'You value what is tried and true — a fit for stewarding traditions, guarding sound doctrine, and providing the stability a ministry needs to last.',
    },
  },
  {
    key: 'conscientiousness',
    name: 'Conscientiousness',
    description: 'Organization, follow-through, and dependability in getting things done.',
    high: {
      headline: 'Organized and dependable',
      ministry: 'You get things done and done well — a fit for ministry operations, logistics, serve-team scheduling, finances, and anything that needs reliable follow-through.',
    },
    balanced: {
      headline: 'Flexible and reliable',
      ministry: 'You can plan a project and adapt when it changes — useful wherever structure and spontaneity both matter.',
    },
    lower: {
      headline: 'Flexible and spontaneous',
      ministry: 'You thrive in the moment and go with the flow — a fit for dynamic, relational settings: hospitality, outreach conversations, and meeting people where they are.',
    },
  },
  {
    key: 'extraversion',
    name: 'Extraversion',
    description: 'Energy drawn from people, social settings, and being out front.',
    high: {
      headline: 'Energized by people',
      ministry: 'You come alive around others — a fit for welcome and first-impressions teams, group leading, outreach, hosting, and up-front roles.',
    },
    balanced: {
      headline: 'Comfortable either way',
      ministry: 'You can work a crowd or go deep one-on-one — flexible across greeting, leading, and personal discipleship.',
    },
    lower: {
      headline: 'Depth over spotlight',
      ministry: 'You pour into people best in smaller, deeper settings — a fit for one-on-one discipleship, intercession, behind-the-scenes support, and focused study.',
    },
  },
  {
    key: 'agreeableness',
    name: 'Compassion',
    description: 'Warmth, empathy, and a cooperative, others-first posture.',
    high: {
      headline: 'Warm and caring',
      ministry: 'You put others at ease and feel their burdens — a fit for care and hospitality, welcome teams, benevolence, and peacemaking.',
    },
    balanced: {
      headline: 'Caring and candid',
      ministry: 'You can comfort and challenge as the moment needs — valuable in coaching and shepherding.',
    },
    lower: {
      headline: 'Direct and decisive',
      ministry: 'You speak the truth plainly and make hard calls — a fit for leadership, teaching that confronts, stewardship decisions, and holding a vision steady.',
    },
  },
  {
    key: 'stability',
    name: 'Emotional Stability',
    description: 'Calm, steadiness, and resilience under pressure.',
    high: {
      headline: 'Steady under pressure',
      ministry: 'You stay calm when things get hard — a fit for crisis care, frontline and hard-place ministry, leadership in stressful seasons, and being a non-anxious presence.',
    },
    balanced: {
      headline: 'Feeling but steady',
      ministry: 'You feel deeply yet keep your footing — able to sit with people in pain without being overwhelmed.',
    },
    lower: {
      headline: 'Deeply feeling',
      ministry: 'You feel things intensely and sense what others carry — a fit for empathy, intercession, and grief and recovery care. Guard your own heart and rhythms so you serve from rest, not depletion.',
    },
  },
]

export const TRAIT_BY_KEY: Record<TraitKey, Trait> = Object.fromEntries(TRAITS.map(t => [t.key, t])) as Record<TraitKey, Trait>

// A question: which trait it loads onto, and whether it is reverse-keyed (i.e.
// agreeing means LESS of the named positive pole).
export type Question = { id: number; trait: TraitKey; text: string; reverse: boolean }

// IPIP-50 Big-Five Factor Markers, interleaved by trait (10 per trait). Reverse
// items are marked; for the stability trait the classic Neuroticism items are
// reverse-keyed so a high score reads as calm/steady.
export const QUESTIONS: Question[] = [
  // Extraversion
  { id: 1, trait: 'extraversion', text: 'I am the life of the party.', reverse: false },
  { id: 2, trait: 'extraversion', text: "I don't talk a lot.", reverse: true },
  { id: 3, trait: 'extraversion', text: 'I feel comfortable around people.', reverse: false },
  { id: 4, trait: 'extraversion', text: 'I keep in the background.', reverse: true },
  { id: 5, trait: 'extraversion', text: 'I start conversations.', reverse: false },
  { id: 6, trait: 'extraversion', text: 'I have little to say.', reverse: true },
  { id: 7, trait: 'extraversion', text: 'I talk to a lot of different people at gatherings.', reverse: false },
  { id: 8, trait: 'extraversion', text: "I don't like to draw attention to myself.", reverse: true },
  { id: 9, trait: 'extraversion', text: "I don't mind being the center of attention.", reverse: false },
  { id: 10, trait: 'extraversion', text: 'I am quiet around strangers.', reverse: true },
  // Agreeableness (Compassion)
  { id: 11, trait: 'agreeableness', text: 'I feel little concern for others.', reverse: true },
  { id: 12, trait: 'agreeableness', text: 'I am interested in people.', reverse: false },
  { id: 13, trait: 'agreeableness', text: 'I insult people.', reverse: true },
  { id: 14, trait: 'agreeableness', text: "I sympathize with others' feelings.", reverse: false },
  { id: 15, trait: 'agreeableness', text: "I am not interested in other people's problems.", reverse: true },
  { id: 16, trait: 'agreeableness', text: 'I have a soft heart.', reverse: false },
  { id: 17, trait: 'agreeableness', text: 'I am not really interested in others.', reverse: true },
  { id: 18, trait: 'agreeableness', text: 'I take time out for others.', reverse: false },
  { id: 19, trait: 'agreeableness', text: "I feel others' emotions.", reverse: false },
  { id: 20, trait: 'agreeableness', text: 'I make people feel at ease.', reverse: false },
  // Conscientiousness
  { id: 21, trait: 'conscientiousness', text: 'I am always prepared.', reverse: false },
  { id: 22, trait: 'conscientiousness', text: 'I leave my belongings around.', reverse: true },
  { id: 23, trait: 'conscientiousness', text: 'I pay attention to details.', reverse: false },
  { id: 24, trait: 'conscientiousness', text: 'I make a mess of things.', reverse: true },
  { id: 25, trait: 'conscientiousness', text: 'I get chores done right away.', reverse: false },
  { id: 26, trait: 'conscientiousness', text: 'I often forget to put things back in their proper place.', reverse: true },
  { id: 27, trait: 'conscientiousness', text: 'I like order.', reverse: false },
  { id: 28, trait: 'conscientiousness', text: 'I shirk my duties.', reverse: true },
  { id: 29, trait: 'conscientiousness', text: 'I follow a schedule.', reverse: false },
  { id: 30, trait: 'conscientiousness', text: 'I am exacting in my work.', reverse: false },
  // Emotional Stability (reverse-keyed Neuroticism items)
  { id: 31, trait: 'stability', text: 'I get stressed out easily.', reverse: true },
  { id: 32, trait: 'stability', text: 'I am relaxed most of the time.', reverse: false },
  { id: 33, trait: 'stability', text: 'I worry about things.', reverse: true },
  { id: 34, trait: 'stability', text: 'I seldom feel blue.', reverse: false },
  { id: 35, trait: 'stability', text: 'I am easily disturbed.', reverse: true },
  { id: 36, trait: 'stability', text: 'I get upset easily.', reverse: true },
  { id: 37, trait: 'stability', text: 'I change my mood a lot.', reverse: true },
  { id: 38, trait: 'stability', text: 'I have frequent mood swings.', reverse: true },
  { id: 39, trait: 'stability', text: 'I get irritated easily.', reverse: true },
  { id: 40, trait: 'stability', text: 'I remain calm in tense situations.', reverse: false },
  // Openness
  { id: 41, trait: 'openness', text: 'I have a rich vocabulary.', reverse: false },
  { id: 42, trait: 'openness', text: 'I have difficulty understanding abstract ideas.', reverse: true },
  { id: 43, trait: 'openness', text: 'I have a vivid imagination.', reverse: false },
  { id: 44, trait: 'openness', text: 'I am not interested in abstract ideas.', reverse: true },
  { id: 45, trait: 'openness', text: 'I have excellent ideas.', reverse: false },
  { id: 46, trait: 'openness', text: 'I do not have a good imagination.', reverse: true },
  { id: 47, trait: 'openness', text: 'I am quick to understand things.', reverse: false },
  { id: 48, trait: 'openness', text: 'I enjoy thinking about new ideas.', reverse: false },
  { id: 49, trait: 'openness', text: 'I spend time reflecting on things.', reverse: false },
  { id: 50, trait: 'openness', text: 'I am full of ideas.', reverse: false },
]

export const TOTAL_QUESTIONS = QUESTIONS.length
export const ITEMS_PER_TRAIT = 10
export const MIN_PER_ITEM = 1
export const MAX_PER_ITEM = 5

export const BAND_LABEL: Record<BandKey, string> = { high: 'High', balanced: 'Balanced', lower: 'Lower' }

// Band from the per-item average (1-5), split into thirds of the scale.
export function bandFor(avg: number): BandKey {
  if (avg >= 3.667) return 'high'
  if (avg >= 2.334) return 'balanced'
  return 'lower'
}

export type TraitScore = {
  key: TraitKey
  name: string
  description: string
  score: number // summed 0-based points across the trait's items, high = positive pole
  max: number // maximum possible for the trait
  avg: number // per-item average, 1-5
  percent: number // 0-100 across the scale
  band: BandKey
  level: TraitLevelText // the ministry-fit text for this band
}

// Apply reverse-keying: a reverse item contributes (MAX+MIN - value).
function itemPoints(value: number, reverse: boolean): number {
  return reverse ? MAX_PER_ITEM + MIN_PER_ITEM - value : value
}

// responses: map of question id -> 1..5. Returns all five traits in OCEAN order.
export function scoreTraits(responses: Record<number, number>): TraitScore[] {
  const totals: Record<string, number> = {}
  const counts: Record<string, number> = {}
  for (const q of QUESTIONS) {
    const v = responses[q.id]
    if (typeof v !== 'number') continue
    totals[q.trait] = (totals[q.trait] ?? 0) + itemPoints(v, q.reverse)
    counts[q.trait] = (counts[q.trait] ?? 0) + 1
  }
  return TRAITS.map(t => {
    const n = counts[t.key] ?? 0
    const score = totals[t.key] ?? 0
    const max = ITEMS_PER_TRAIT * MAX_PER_ITEM
    const avg = n > 0 ? score / n : 0
    const percent = Math.round(((avg - MIN_PER_ITEM) / (MAX_PER_ITEM - MIN_PER_ITEM)) * 100)
    const band = bandFor(avg)
    const level = band === 'high' ? t.high : band === 'lower' ? t.lower : t.balanced
    return { key: t.key, name: t.name, description: t.description, score, max, avg, percent, band, level }
  })
}

// A plain-text summary meant for copying into a message to a coach or a Grace
// Group chat. Text-only (no markdown) so it pastes cleanly anywhere. Keep this
// shared between web and native so both share the exact same wording.
export function formatBigFiveForSharing(scores: TraitScore[], personName?: string): string {
  const who = personName?.trim()
  const lines: string[] = [who ? `My Personality Profile (Big Five) — ${who}` : 'My Personality Profile (Big Five)', '']
  scores.forEach(t => {
    lines.push(`${t.name}: ${BAND_LABEL[t.band]} (${t.percent}%) — ${t.level.headline}`)
    lines.push(`   ${t.level.ministry}`)
    lines.push('')
  })
  lines.push('Discovered with the WikiChurch discipleship app.')
  return lines.join('\n')
}
