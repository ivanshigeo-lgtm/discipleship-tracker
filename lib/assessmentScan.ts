// Server-side glue for the paper-assessment photo-scan feature. The printed
// packet (app/print/assessments) and this file share a machine-readability
// contract: page code top-right (G1/G2/B1/P1), items in QUESTIONS lib order,
// value digit printed inside every bubble. The vision model only READS marks —
// all scoring runs through the same lib code the in-app assessments use
// (scoreGifts / scoreTraits), so a scanned paper result and a tapped-in result
// can never disagree on math.
//
// Used only by the /api/assessments/* routes (server-only — imports nothing
// client-side and nothing here should be imported by components).
import { jsonSchema } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  QUESTIONS as GIFT_QUESTIONS,
  scoreGifts,
  topGifts,
  type GiftScore,
} from './spiritualGifts'
import {
  QUESTIONS as BIG5_QUESTIONS,
  MIN_PER_ITEM as BIG5_MIN,
  MAX_PER_ITEM as BIG5_MAX,
  scoreTraits,
  type TraitScore,
} from './bigFive'
import {
  REFLECTIONS,
  PEOPLE_GROUPS,
  ISSUES,
  RANK_COUNT,
  normalizePassionAnswers,
  type PassionAnswers,
} from './passion'

// ── parsed-page shape (what the vision model returns per photo) ───────────────
export type PageCode = 'G1' | 'G2' | 'B1' | 'P1' | 'unknown'
export type ItemFlag = 'ok' | 'blank' | 'multiple' | 'unclear'
export type ParsedItem = { id: number; value: number | null; flag: ItemFlag }
export type ParsedRank = { rank: number; label: string }
export type ParsedPassion = {
  reflections: { id: number; text: string }[]
  peopleGroups: ParsedRank[]
  issues: ParsedRank[]
}
export type ParsedPage = {
  page: PageCode
  name: string | null
  date: string | null
  items: ParsedItem[]
  passion: ParsedPassion | null
}

export const parsedPageSchema = jsonSchema<ParsedPage>({
  type: 'object',
  additionalProperties: false,
  required: ['page', 'name', 'date', 'items', 'passion'],
  properties: {
    page: {
      type: 'string',
      enum: ['G1', 'G2', 'B1', 'P1', 'unknown'],
      description: 'The page code printed in the box at the top-right of the sheet.',
    },
    name: { type: ['string', 'null'], description: 'Handwritten name from the header, or null if blank.' },
    date: { type: ['string', 'null'], description: 'Handwritten date from the header exactly as written, or null if blank.' },
    items: {
      type: 'array',
      description:
        'One entry per numbered statement row, in printed order. Empty for P1/unknown pages.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'value', 'flag'],
        properties: {
          id: { type: 'integer', description: 'The printed item number at the left of the row.' },
          value: {
            type: ['integer', 'null'],
            description: 'The value of the single marked bubble, or null if blank/ambiguous.',
          },
          flag: {
            type: 'string',
            enum: ['ok', 'blank', 'multiple', 'unclear'],
            description:
              'ok = one clear mark; blank = no mark; multiple = 2+ marks with no clear correction; unclear = smudged/erased/illegible.',
          },
        },
      },
    },
    passion: {
      type: ['object', 'null'],
      description: 'Only for a P1 sheet; null for every other page.',
      additionalProperties: false,
      required: ['reflections', 'peopleGroups', 'issues'],
      properties: {
        reflections: {
          type: 'array',
          description: 'The five numbered reflection answers, transcribed verbatim.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['id', 'text'],
            properties: {
              id: { type: 'integer', description: 'Prompt number 1-5.' },
              text: { type: 'string', description: 'The handwriting transcribed verbatim; empty string if blank.' },
            },
          },
        },
        peopleGroups: {
          type: 'array',
          description: "Options in PEOPLE I'M MOST DRAWN TO SERVE with a handwritten rank number in their box.",
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['rank', 'label'],
            properties: {
              rank: { type: 'integer', description: 'The handwritten number (1, 2, or 3).' },
              label: {
                type: 'string',
                description: "The option's printed label, or the handwritten text if it is the Other write-in.",
              },
            },
          },
        },
        issues: {
          type: 'array',
          description: 'Options in ISSUES THAT STIR MY HEART with a handwritten rank number in their box.',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['rank', 'label'],
            properties: {
              rank: { type: 'integer', description: 'The handwritten number (1, 2, or 3).' },
              label: {
                type: 'string',
                description: "The option's printed label, or the handwritten text if it is the Other write-in.",
              },
            },
          },
        },
      },
    },
  },
})

// The reading brief the vision model gets alongside each photo. Mirrors the
// print contract in app/print/assessments — update BOTH if the sheets change.
export const SCAN_PROMPT = `You are reading a photograph of one sheet from a printed paper assessment packet.

Layout contract (every sheet): black square markers in the four corners; a header with the assessment title and the PAGE CODE in a bordered box at the top-right — one of G1, G2, B1, P1; below the header, handwritten Name and Date lines.

Sheet types:
- G1 — Spiritual Gifts, items 1–50. Each row: item number, statement text, then 4 answer bubbles for 0, 1, 2, 3.
- G2 — Spiritual Gifts, items 51–100. Same layout as G1 (row numbers run 51–100).
- B1 — Personality (Big Five), items 1–50. Each row has 5 answer bubbles for 1, 2, 3, 4, 5.
- P1 — Passion: five numbered reflection questions answered in handwriting on ruled lines, then two ranking sections ("PEOPLE I'M MOST DRAWN TO SERVE" and "ISSUES THAT STIR MY HEART") where the person wrote a rank number (1, 2, or 3) in the small box next to their top choices. Each section may also have an "Other:" write-in line.

Every answer bubble has its value digit printed in light gray inside it; a filled bubble obscures that digit. People mark imperfectly: a solid fill, an X, a check mark, or a circle around the bubble all count as a mark. If one mark is scribbled out and another bubble is marked, the un-scribbled one is the intended answer (flag "ok").

For bubble sheets (G1/G2/B1): read EVERY numbered row in printed order and report each one — do not skip rows, and look carefully at both shaded and unshaded rows. Report the marked value, or null with flag "blank" (no mark at all), "multiple" (2+ marks, no clear correction), or "unclear" (smudged/too faint/illegible). Never guess a value from patterns in neighboring rows — report only what is actually marked.

Cross-check every marked row with the printed gray digits: in a marked row the digits of the UNMARKED bubbles are still readable, while the marked bubble's digit is obscured. The value you report must be the digit you can NO LONGER read — e.g. if you can still read 0, 1, 3 the answer is 2. If your column estimate and this digit check disagree, trust the digit check; if you cannot resolve the row, flag it "unclear" rather than guessing.

For P1: transcribe each reflection answer verbatim (empty string if blank). For each ranking section, list ONLY the options that have a handwritten number in their box, with that number and the option's printed label; for the Other line, use the handwritten text as the label.

Also transcribe the handwritten Name and Date from the header (null if blank).

If the photo is not one of these four sheets, return page "unknown" with an empty items array.`

// ── flagged-row recheck (second, focused pass) ────────────────────────────────
// The full-sheet read occasionally drops a clearly-marked row (attention slip
// on 50-row grids). Before surfacing blank/unclear flags to the leader, the
// scan route re-asks about just those rows — a focused look recovers real
// marks while a genuine blank stays blank.
export type RecheckResult = { items: ParsedItem[] }
export const recheckItemsSchema = jsonSchema<RecheckResult>({
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      description: 'One entry per requested row number.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'value', 'flag'],
        properties: {
          id: { type: 'integer' },
          value: { type: ['integer', 'null'] },
          flag: { type: 'string', enum: ['ok', 'blank', 'multiple', 'unclear'] },
        },
      },
    },
  },
})

export function buildRecheckPrompt(code: PageCode, ids: number[]): string {
  return `${SCAN_PROMPT}

This photo is sheet ${code}. A first reading pass could not confirm an answer for row(s) ${ids.join(', ')}. Re-examine ONLY those rows, one at a time: find the row by its printed number, look closely across all of its bubbles (a fill, X, check, or circle counts as a mark), and apply the gray-digit cross-check. It is entirely possible a row truly has no mark — report "blank" honestly rather than inventing a value. If a row turns out to have TWO OR MORE marks with no clear correction, report flag "multiple" with value null — never choose between them. Report exactly one entry per requested row.`
}

// Rows on a bubble sheet worth a second look: reported blank/unclear, or never
// reported at all. (Deliberately excludes "multiple" — two marks is a definite
// observation only the leader can resolve.)
export function idsNeedingRecheck(parsed: ParsedPage): number[] {
  const spec = PAGE_SPECS[parsed.page]
  if (!spec) return []
  const byId = new Map(parsed.items.map(i => [i.id, i]))
  const ids: number[] = []
  for (let id = spec.ids[0]; id <= spec.ids[1]; id++) {
    const item = byId.get(id)
    if (!item || item.flag === 'blank' || item.flag === 'unclear') ids.push(id)
  }
  return ids
}

// Fold a recheck's answers back into the original parse (only for the rows that
// were asked about).
export function mergeRecheckedItems(parsed: ParsedPage, asked: number[], rechecked: ParsedItem[]): ParsedPage {
  const askedSet = new Set(asked)
  const updates = new Map(rechecked.filter(i => askedSet.has(i.id)).map(i => [i.id, i]))
  if (!updates.size) return parsed
  const items = parsed.items.map(i => updates.get(i.id) ?? i)
  const present = new Set(items.map(i => i.id))
  for (const [id, item] of updates) if (!present.has(id)) items.push(item)
  return { ...parsed, items }
}

// ── caller authorization (coach = admin or approved Empower sign-off) ─────────
export type ScanCaller = { id: string; name: string | null; is_admin: boolean }

export async function authorizeScanCaller(
  supabase: SupabaseClient,
  accessToken: string | null | undefined
): Promise<{ caller: ScanCaller } | { error: string; status: number }> {
  if (!accessToken) return { error: 'Not authenticated', status: 401 }
  const { data: { user } } = await supabase.auth.getUser(accessToken)
  if (!user) return { error: 'Not authenticated', status: 401 }

  const { data: caller } = await supabase
    .from('people')
    .select('id, name, is_admin')
    .eq('auth_user_id', user.id)
    .single()
  if (!caller) return { error: 'No profile found', status: 403 }
  if (caller.is_admin) return { caller }

  // Same "empowered" definition the coach dashboard and connect-coach use.
  const { data: signoff } = await supabase
    .from('level_signoffs')
    .select('id')
    .eq('person_id', caller.id)
    .eq('stage', 'Empower')
    .eq('status', 'approved')
    .maybeSingle()
  if (!signoff) return { error: 'Only coaches can scan assessments', status: 403 }
  return { caller }
}

// ── assembling parsed pages into a reviewable draft ───────────────────────────
type PageSpec = { ids: [number, number]; min: number; max: number }
const PAGE_SPECS: Partial<Record<PageCode, PageSpec>> = {
  G1: { ids: [1, 50], min: 0, max: 3 },
  G2: { ids: [51, 100], min: 0, max: 3 },
  B1: { ids: [1, 50], min: BIG5_MIN, max: BIG5_MAX },
}

export type FlaggedItem = { id: number; flag: ItemFlag }
export type BubbleDraft = {
  /* confirmed reads only — flagged/blank ids are absent and listed in flagged */
  responses: Record<number, number>
  flagged: FlaggedItem[]
  pagesSeen: PageCode[]
  complete: boolean
}
export type GiftsDraft = BubbleDraft & { scores: GiftScore[] | null; topGifts: GiftScore[] | null }
export type BigFiveDraft = BubbleDraft & { scores: TraitScore[] | null }
export type PassionDraft = {
  answers: PassionAnswers
  /* rank labels that didn't match a printed option and were kept verbatim */
  unmatched: { section: 'peopleGroups' | 'issues'; label: string }[]
}
export type ScanDraft = {
  name: string | null
  date: string | null
  gifts: GiftsDraft | null
  bigFive: BigFiveDraft | null
  passion: PassionDraft | null
  warnings: string[]
}

// Loose label matching for the P1 rank sections: exact (case/punctuation
// insensitive) first, then prefix/contains — handwriting like "Elementary" must
// still hit "Elementary (K-5th gr)". Unmatched labels are kept verbatim (the
// Other write-in is a real answer, not an error).
function normalizeLabel(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}
export function matchPassionOption(label: string, options: string[]): string | null {
  const n = normalizeLabel(label)
  if (!n) return null
  for (const o of options) if (normalizeLabel(o) === n) return o
  for (const o of options) {
    const no = normalizeLabel(o)
    if (no.startsWith(n) || n.startsWith(no)) return o
  }
  return null
}

function rankedList(
  parsed: ParsedRank[],
  options: string[],
  section: 'peopleGroups' | 'issues',
  unmatched: PassionDraft['unmatched']
): string[] {
  const out: string[] = []
  for (const r of [...parsed].sort((a, b) => a.rank - b.rank)) {
    const label = (r.label ?? '').trim()
    if (!label) continue
    const canonical = matchPassionOption(label, options)
    if (!canonical) unmatched.push({ section, label })
    const value = canonical ?? label
    if (!out.includes(value)) out.push(value)
    if (out.length >= RANK_COUNT) break
  }
  return out
}

function collectBubbles(
  pages: ParsedPage[],
  codes: PageCode[],
  warnings: string[]
): { responses: Record<number, number>; flagged: FlaggedItem[]; pagesSeen: PageCode[] } {
  const responses: Record<number, number> = {}
  const flagged: FlaggedItem[] = []
  const pagesSeen: PageCode[] = []
  for (const code of codes) {
    const matching = pages.filter(p => p.page === code)
    if (!matching.length) continue
    if (matching.length > 1) warnings.push(`Multiple ${code} photos — using the last one.`)
    const page = matching[matching.length - 1]
    pagesSeen.push(code)
    const spec = PAGE_SPECS[code]!
    const seen = new Set<number>()
    for (const item of page.items) {
      if (!Number.isInteger(item.id) || item.id < spec.ids[0] || item.id > spec.ids[1] || seen.has(item.id)) continue
      seen.add(item.id)
      const v = item.value
      if (item.flag === 'ok' && typeof v === 'number' && Number.isInteger(v) && v >= spec.min && v <= spec.max) {
        responses[item.id] = v
      } else {
        flagged.push({ id: item.id, flag: item.flag === 'ok' ? 'unclear' : item.flag })
      }
    }
    // Rows the model never reported read as blanks needing review.
    for (let id = spec.ids[0]; id <= spec.ids[1]; id++) {
      if (!seen.has(id)) flagged.push({ id, flag: 'blank' })
    }
  }
  flagged.sort((a, b) => a.id - b.id)
  return { responses, flagged, pagesSeen }
}

export function assembleDraft(pages: ParsedPage[]): ScanDraft {
  const warnings: string[] = []
  const unknownCount = pages.filter(p => p.page === 'unknown').length
  if (unknownCount) warnings.push(`${unknownCount} photo(s) did not look like a packet sheet and were skipped.`)

  const headerPage = pages.find(p => p.name || p.date)
  const draft: ScanDraft = {
    name: headerPage?.name ?? null,
    date: headerPage?.date ?? null,
    gifts: null,
    bigFive: null,
    passion: null,
    warnings,
  }

  const g = collectBubbles(pages, ['G1', 'G2'], warnings)
  if (g.pagesSeen.length) {
    const complete = g.pagesSeen.length === 2 && g.flagged.length === 0
    if (g.pagesSeen.length < 2) warnings.push(`Spiritual Gifts is missing sheet ${g.pagesSeen.includes('G1') ? 'G2' : 'G1'}.`)
    // Scores need both sheets — scoreGifts treats missing items as 0, which
    // would silently misrank gifts on a half-scanned assessment.
    const scorable = g.pagesSeen.length === 2
    draft.gifts = {
      ...g,
      complete,
      scores: scorable ? scoreGifts(g.responses) : null,
      topGifts: scorable ? topGifts(g.responses) : null,
    }
  }

  const b = collectBubbles(pages, ['B1'], warnings)
  if (b.pagesSeen.length) {
    draft.bigFive = {
      ...b,
      complete: b.flagged.length === 0,
      // scoreTraits averages only answered items, so a partial read still gives
      // a usable preview; flagged items are surfaced for the leader to resolve.
      scores: scoreTraits(b.responses),
    }
  }

  const p1 = pages.filter(p => p.page === 'P1').pop()
  if (p1?.passion) {
    const unmatched: PassionDraft['unmatched'] = []
    const reflections: Record<number, string> = {}
    for (const r of p1.passion.reflections) {
      if (Number.isInteger(r.id) && r.id >= 1 && r.id <= REFLECTIONS.length && typeof r.text === 'string') {
        reflections[r.id] = r.text.trim()
      }
    }
    draft.passion = {
      answers: normalizePassionAnswers({
        reflections,
        peopleGroups: rankedList(p1.passion.peopleGroups, PEOPLE_GROUPS, 'peopleGroups', unmatched),
        issues: rankedList(p1.passion.issues, ISSUES, 'issues', unmatched),
      }),
      unmatched,
    }
  }

  return draft
}

// ── commit-time validation (leader has resolved flags; require full forms) ────
export function validateGiftResponses(raw: unknown): { responses: Record<number, number> } | { error: string } {
  return validateBubbleResponses(raw, GIFT_QUESTIONS.map(q => q.id), 0, 3, 'Spiritual Gifts')
}
export function validateBigFiveResponses(raw: unknown): { responses: Record<number, number> } | { error: string } {
  return validateBubbleResponses(raw, BIG5_QUESTIONS.map(q => q.id), BIG5_MIN, BIG5_MAX, 'Big Five')
}
function validateBubbleResponses(
  raw: unknown,
  ids: number[],
  min: number,
  max: number,
  label: string
): { responses: Record<number, number> } | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: `${label}: responses missing` }
  const src = raw as Record<string, unknown>
  const responses: Record<number, number> = {}
  const missing: number[] = []
  for (const id of ids) {
    const v = src[String(id)]
    if (typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max) responses[id] = v
    else missing.push(id)
  }
  if (missing.length) {
    return { error: `${label}: ${missing.length} unanswered/invalid item(s): ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? '…' : ''}` }
  }
  return { responses }
}
