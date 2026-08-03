// Passion Assessment (Grace Bible Church Maui). A reflective companion to the
// Spiritual Gifts and Big Five assessments: gifts describe WHAT you're gifted
// for, the Big Five HOW/WHERE you thrive, and this surfaces WHO and WHAT stirs
// your heart to serve.
//
// Unlike the other two instruments this is NOT scored. Five open reflection
// prompts draw out the heart's desire, then the person ranks their top three
// people-groups and top three issues. Results are a collation of what they
// wrote and chose — meant to be prayed over and shared with a coach.
//
// Keep this file in sync between the web app and the native app.

export type ReflectionPrompt = { id: number; text: string }

// The five open questions, verbatim from the GBC Passion Assessment.
export const REFLECTIONS: ReflectionPrompt[] = [
  { id: 1, text: 'If you could snap your fingers and know that you could not fail, what would you do?' },
  { id: 2, text: 'At the end of your life, what would you love to look back and know that you had done something about?' },
  { id: 3, text: 'If someone were to mention your name to a group of your friends, what would they say you were really interested in or passionate about?' },
  { id: 4, text: 'What conversations would keep you talking late into the night?' },
  { id: 5, text: 'What would you most like to do for others?' },
]

// People-groups to rank (verbatim from the assessment).
export const PEOPLE_GROUPS: string[] = [
  'Women',
  'Men',
  'Infant',
  'Toddler',
  'Preschool',
  'Elementary (K-5th gr)',
  'Youth (6th-8th gr)',
  'Youth (9th-12th gr)',
  'College (age 18-21)',
  'Singles (age 19-30)',
  'Singles (age 31+)',
  'Married',
  'Young Married',
  'Divorced',
  'Widow/Widower',
]

// Issues to rank (verbatim from the assessment). "Other" is moved to the end so
// the substantive options read first; every other item keeps its listed wording.
export const ISSUES: string[] = [
  'Finances',
  'Marriage',
  'Parenting',
  'Health & Fitness',
  'Addictions',
  'Poverty/Hunger',
  'Domestic Violence',
  'Musical Instruments',
  'Drama',
  'Divorce',
  'Discipleship',
  'Education',
  'Missions',
  'Reaching the Unchurched',
  'Church Ministries',
  'Family',
  'Singing',
  'Technology',
  'Other',
]

// How many people-groups / issues the person ranks. Both lists ASK for three,
// but people-groups only REQUIRE two — some genuinely only have two, and a
// forced third felt fake (Jul 31 2026 feedback, refined Aug 2: ask 3, require 2).
// PEOPLE_RANK_COUNT is that required minimum; RANK_COUNT caps both lists.
// Custom "Other…" people-groups are stored as plain strings alongside presets.
export const RANK_COUNT = 3
export const PEOPLE_RANK_COUNT = 2
export const TOTAL_REFLECTIONS = REFLECTIONS.length

// The stored shape (jsonb `answers` on passion_results). reflections maps a
// prompt id → the person's text; peopleGroups/issues are ordered top-3 picks
// (index 0 = rank 1).
export type PassionAnswers = {
  reflections: Record<number, string>
  peopleGroups: string[]
  issues: string[]
}

export function emptyPassionAnswers(): PassionAnswers {
  return { reflections: {}, peopleGroups: [], issues: [] }
}

// Normalize whatever came back from jsonb into a well-formed PassionAnswers
// (older/partial rows, string-keyed reflection maps, over-long rank arrays).
export function normalizePassionAnswers(raw: unknown): PassionAnswers {
  const a = (raw ?? {}) as Partial<PassionAnswers>
  const reflections: Record<number, string> = {}
  if (a.reflections && typeof a.reflections === 'object') {
    for (const [k, v] of Object.entries(a.reflections)) {
      if (typeof v === 'string') reflections[Number(k)] = v
    }
  }
  const peopleGroups = Array.isArray(a.peopleGroups)
    ? a.peopleGroups.filter((x): x is string => typeof x === 'string').slice(0, RANK_COUNT)
    : []
  const issues = Array.isArray(a.issues)
    ? a.issues.filter((x): x is string => typeof x === 'string').slice(0, RANK_COUNT)
    : []
  return { reflections, peopleGroups, issues }
}

// Complete = all five reflections answered, both rankings filled (two
// people-groups — >= so pre-change drafts holding three still count — and
// three issues).
export function isPassionComplete(a: PassionAnswers): boolean {
  const reflectionsDone = REFLECTIONS.every(r => (a.reflections[r.id] ?? '').trim().length > 0)
  return reflectionsDone && a.peopleGroups.length >= PEOPLE_RANK_COUNT && a.issues.length === RANK_COUNT
}

// Toggle an option in a ranked list: add it to the end (next rank) if absent
// and under the cap, or remove it (the rest re-number automatically) if present.
export function toggleRanked(list: string[], option: string, cap: number = RANK_COUNT): string[] {
  if (list.includes(option)) return list.filter(o => o !== option)
  if (list.length >= cap) return list
  return [...list, option]
}

// A plain-text summary meant for copying to a coach or a Grace Group chat.
// Text-only (no markdown) so it pastes cleanly anywhere. Keep this shared
// between web and native so both share the exact same wording.
export function formatPassionForSharing(a: PassionAnswers, personName?: string): string {
  const who = personName?.trim()
  const lines: string[] = [who ? `My Passion Assessment — ${who}` : 'My Passion Assessment', '']

  lines.push('REFLECTIONS')
  REFLECTIONS.forEach((r, i) => {
    const ans = (a.reflections[r.id] ?? '').trim()
    lines.push(`${i + 1}. ${r.text}`)
    lines.push(`   ${ans || '—'}`)
    lines.push('')
  })

  lines.push("PEOPLE I'M MOST DRAWN TO SERVE")
  if (a.peopleGroups.length) a.peopleGroups.forEach((g, i) => lines.push(`${i + 1}. ${g}`))
  else lines.push('—')
  lines.push('')

  lines.push('ISSUES THAT STIR MY HEART')
  if (a.issues.length) a.issues.forEach((s, i) => lines.push(`${i + 1}. ${s}`))
  else lines.push('—')
  lines.push('')

  lines.push('Discovered with the WikiChurch discipleship app.')
  return lines.join('\n')
}
