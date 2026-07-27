// AI ministry-fit summary (capstone). Given a person who has completed all three
// Equip assessments (spiritual gifts + Big Five + passion), produce a short
// summary of how they're wired to serve plus a ranked list of best-fitting GBC
// ministries. The result is PERSISTED (ministry_fit_results) and shared with both
// the person and their coach. Generation is idempotent + cached on an inputs hash:
// this route is safe to call on every My Journey / coach-profile load — it only
// spends tokens when an assessment has actually changed since the last generation.
//
// Service-role API routes bypass RLS (the table is read-only to authenticated users).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject, jsonSchema } from 'ai'
import { createHash } from 'crypto'
import { formatMinistriesForPrompt, MINISTRY_NAMES } from '@/lib/ministries'
import type { GiftScore } from '@/lib/spiritualGifts'
import type { TraitScore } from '@/lib/bigFive'
import { REFLECTIONS, normalizePassionAnswers } from '@/lib/passion'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fable 5 — chosen for its warm, pastoral prose on this human-facing spiritual
// summary. Volume is tiny (one cached generation per disciple), so latency/cost
// are non-issues; it still supports structured output for the schema below.
const MODEL = 'claude-fable-5'

type Suggestion = { ministry: string; rationale: string; fitScore: number }
type NewIdea = { name: string; rationale: string }
type MinistryFit = { summary: string; suggestions: Suggestion[]; newMinistryIdeas: NewIdea[] }

const resultSchema = jsonSchema<MinistryFit>({
  type: 'object',
  additionalProperties: false,
  required: ['summary', 'suggestions', 'newMinistryIdeas'],
  properties: {
    summary: {
      type: 'string',
      description:
        "An executive summary: 3–4 warm, encouraging sentences describing how God has wired this person to serve, grounded in their gifts, personality, and passion. Written to be read by both the disciple and their coach.",
    },
    newMinistryIdeas: {
      type: 'array',
      minItems: 0,
      maxItems: 3,
      description:
        'Optional brand-new ministries the church does NOT currently have but that this person is uniquely wired to help start, grounded in their gifts/personality/passion. Empty array if nothing compelling.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'rationale'],
        properties: {
          name: { type: 'string', description: 'A short, clear name for the proposed new ministry.' },
          rationale: {
            type: 'string',
            description: "1–2 sentences: the need it meets and why THIS person could launch it. Address them as 'you'.",
          },
        },
      },
    },
    suggestions: {
      type: 'array',
      minItems: 3,
      maxItems: 5,
      description: 'Best-fitting ministries, ranked most-fitting first.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ministry', 'rationale', 'fitScore'],
        properties: {
          ministry: {
            type: 'string',
            enum: MINISTRY_NAMES,
            description: 'Exact ministry name from the provided roster.',
          },
          rationale: {
            type: 'string',
            description:
              "1–2 sentences on why this person fits, citing specific gifts, personality traits, and/or passions. Address the person as 'you'.",
          },
          fitScore: {
            type: 'number',
            description: 'Strength of fit, 0–100 (higher = stronger). Reserve 85+ for standout matches.',
          },
        },
      },
    },
  },
})

// ── assessment → prompt-text helpers ──────────────────────────────────────────
function giftsSummary(scores: unknown): string {
  const arr = Array.isArray(scores) ? (scores as GiftScore[]) : []
  const top = arr.slice(0, 6)
  if (!top.length) return '(no gift scores)'
  return top
    .map((g, i) => `${i + 1}. ${g.name} — ${g.tier} (${g.score}/${g.max})`)
    .join('\n')
}

function bigFiveSummary(scores: unknown): string {
  const arr = Array.isArray(scores) ? (scores as TraitScore[]) : []
  if (!arr.length) return '(no personality scores)'
  return arr
    .map((t) => {
      const fit = t.level?.ministry ? ` — ${t.level.ministry}` : ''
      return `- ${t.name}: ${t.band} (${t.percent}%)${fit}`
    })
    .join('\n')
}

function passionSummary(answers: unknown): string {
  const a = normalizePassionAnswers(answers)
  const reflections = REFLECTIONS.map((r) => {
    const text = (a.reflections[r.id] ?? '').trim()
    return text ? `Q: ${r.text}\nA: ${text}` : null
  })
    .filter(Boolean)
    .join('\n\n')
  const people = a.peopleGroups.length ? a.peopleGroups.join(', ') : '(none ranked)'
  const issues = a.issues.length ? a.issues.join(', ') : '(none ranked)'
  return [
    reflections || '(no reflections)',
    `\nPeople groups they're drawn to (ranked): ${people}`,
    `Issues/causes they care about (ranked): ${issues}`,
  ].join('\n')
}

function hashInputs(gifts: unknown, big: unknown, passion: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify({ gifts, big, passion }))
    .digest('hex')
}

export async function POST(request: NextRequest) {
  let personId: string | undefined
  let force = false
  try {
    const body = await request.json()
    personId = body?.personId
    force = body?.force === true
  } catch {
    /* no body */
  }
  if (!personId) {
    return NextResponse.json({ error: 'personId is required' }, { status: 400 })
  }

  // Fetch the three assessments.
  const [gifts, big, passion] = await Promise.all([
    supabase.from('spiritual_gifts_results').select('scores, updated_at').eq('person_id', personId).maybeSingle(),
    supabase.from('big_five_results').select('scores, updated_at').eq('person_id', personId).maybeSingle(),
    supabase.from('passion_results').select('answers, updated_at').eq('person_id', personId).maybeSingle(),
  ])

  const dbErr = gifts.error || big.error || passion.error
  if (dbErr) {
    return NextResponse.json({ error: 'Could not load assessments', detail: dbErr.message }, { status: 500 })
  }

  if (!gifts.data || !big.data || !passion.data) {
    return NextResponse.json({
      status: 'incomplete',
      missing: {
        gifts: !gifts.data,
        bigFive: !big.data,
        passion: !passion.data,
      },
    })
  }

  const inputsHash = hashInputs(gifts.data.scores, big.data.scores, passion.data.answers)

  // Return the cached result unless inputs changed or a regen was forced.
  const existing = await supabase
    .from('ministry_fit_results')
    .select('*')
    .eq('person_id', personId)
    .maybeSingle()

  if (!force && existing.data && existing.data.inputs_hash === inputsHash) {
    return NextResponse.json({ status: 'ready', result: existing.data, cached: true })
  }

  // Generate.
  const system = [
    'You are a seasoned spiritual coach and pastor of assimilation for Grace Bible Church on Maui, deeply versed in the best practices of church volunteer-ministry placement.',
    'You think in the tradition of team-based ministry leaders and resources — Wayne Cordeiro and New Hope ("Doing Church as a Team"; every member a minister, fractal/team leadership, releasing people into their God-given design), Cornerstone, and gift-and-design frameworks like SHAPE (Spiritual gifts, Heart/passion, Abilities, Personality, Experiences) and New Hope\'s DESIGN. Your goal is to place each person in their "sweet spot" — the intersection of their gifting, passion, and personality — where they will thrive, bear fruit, and stay, not just fill an open slot.',
    'You are given a disciple\'s three assessments — Spiritual Gifts (Wagner-modified), personality (Big Five), and ministry Passion — and the church\'s ministry roster.',
    'Produce (1) an executive summary of how God has uniquely wired them to serve (their design/sweet spot), (2) a ranked shortlist of the best-fitting EXISTING ministries, and (3) optionally, 1–3 brand-new ministry ideas the church does not yet have but that this person is uniquely positioned to help pioneer.',
    'Rules: for `suggestions`, choose ONLY ministries from the provided roster (use the exact names). For `newMinistryIdeas`, propose fresh ministries NOT on the roster (or an empty array if nothing compelling). Ground every rationale in concrete assessment results (name specific gifts, traits, people-groups, or issues) — never generic. Watch for a person being over-placed into a visible role their personality would drain in, or under-placed away from their true passion. Address the person directly as "you". Prefer 3–5 suggestions, strongest first. Be specific, warm, pastoral, and Christ-centered — this is read by both the disciple and their coach.',
  ].join('\n')

  const prompt = [
    '# Spiritual Gifts (top gifts, strongest first)',
    giftsSummary(gifts.data.scores),
    '',
    '# Personality — Big Five',
    bigFiveSummary(big.data.scores),
    '',
    '# Ministry Passion',
    passionSummary(passion.data.answers),
    '',
    '# Grace Bible Church ministry roster (choose only from these)',
    formatMinistriesForPrompt(),
  ].join('\n')

  let generated: MinistryFit
  try {
    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: resultSchema,
      maxOutputTokens: 2000,
      system,
      prompt,
    })
    // Normalize fitScore: the model sometimes answers on a 0–1 scale despite the
    // 0–100 instruction. Coerce to an integer 0–100 so the UI renders consistently.
    generated = {
      summary: object.summary ?? '',
      suggestions: (object.suggestions ?? []).map((s) => {
        let score = Number(s.fitScore) || 0
        if (score > 0 && score <= 1) score *= 100
        score = Math.max(0, Math.min(100, Math.round(score)))
        return { ministry: s.ministry, rationale: s.rationale, fitScore: score }
      }),
      newMinistryIdeas: (object.newMinistryIdeas ?? []).map((n) => ({ name: n.name, rationale: n.rationale })),
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: 'Generation failed', detail }, { status: 502 })
  }

  const { data: saved, error: saveErr } = await supabase
    .from('ministry_fit_results')
    .upsert(
      {
        person_id: personId,
        summary: generated.summary,
        suggestions: generated.suggestions,
        new_ministry_ideas: generated.newMinistryIdeas,
        inputs_hash: inputsHash,
        model: MODEL,
        generated_at: new Date().toISOString(),
      },
      { onConflict: 'person_id' }
    )
    .select()
    .single()

  if (saveErr) {
    return NextResponse.json({ error: 'Could not save result', detail: saveErr.message }, { status: 500 })
  }

  return NextResponse.json({ status: 'ready', result: saved, cached: false })
}
