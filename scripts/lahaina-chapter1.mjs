// Draft chapter one of "Beauty Past the Ashes" — Opus 4.8, ghostwriting from
// the journal thread + the completed interview.
// Run: node scripts/lahaina-chapter1.mjs > docs/beauty-past-the-ashes-ch1.md
import { readFileSync } from 'fs'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const ENTRIES = readFileSync('scripts/lahaina-entries.txt', 'utf8')
const ANSWERS = readFileSync('docs/lahaina-answers.md', 'utf8')

const { text } = await generateText({
  model: anthropic('claude-opus-4-8'),
  providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
  maxOutputTokens: 20000,
  messages: [{
    role: 'user',
    content: `You are ghostwriting "Beauty Past the Ashes: Lahaina" for Pastor Jonavan Asato of Grace Bible Church, Maui. Below are (1) his handwritten SOAP journal entries mentioning Lahaina, digitized, and (2) the completed ghostwriter interview with his verbatim answers. Draft CHAPTER ONE now.

VOICE — write as Jonavan, first person. His register (from his own writing): plain, warm, concrete, pastoral; short declaratives when moved ("He never came back."); scripture woven naturally, not decorative; local texture (Maui, west side, upcountry) without tour-guide explanation; zero self-importance. He talks story, then lands the truth.

CHAPTER ONE SHAPE (suggested, adapt if the material leads you better):
- Open in scene: the evening of August 8 — the red glow across the clouds, smoke over the West Maui mountains, rumors — then the morning: the helicopter pilot friend's aerial video. Lahaina gone.
- Establish what Lahaina was to him: dates with his wife, kids at the beach, surfing in high school. Small island; everyone's town.
- The turn to action: opening the church, meals for first responders, truckloads, the four-tragedy family, the $500 checks — "the speed of relationships, the speed of trust." The influencer moment and God's word to him: keep helping; the money will come. It did.
- Close the chapter at the journal itself: months behind, he catches up through Jeremiah in September writing July's pages from inside the aftermath — and prays, without knowing it will name a book, "help me to see the beauty past the ashes." Plant the banyan tree image briefly as a promise of where this story is going. End with a short foretaste of the exchange (Isaiah 61) — one or two lines only; the full theology comes later in the book.

RULES — these are hard constraints:
- Use ONLY facts, scenes, names, numbers, and quotes present in the materials below. Do NOT invent dialogue, names, weather details, or interior states not evidenced. Where material is thin, write general rather than specific.
- Journal quotes may be lightly cleaned for spelling but never reworded; set them apart with the date, e.g. — *From my journal, filed under July 9:*
- The July-dated entries were WRITTEN in September (he catches up; sequence correct, dates lag). Handle this honestly in the narrative — it is part of the story, not an error to hide.
- Do not use the "Lord Jesus Christ have mercy on me" retreat note with any invented scene (he does not remember its context). You may reference that the prayer thread predates the fire (Dec 2022/Jan 2023 entries) if useful.
- The compassion-fatigue / daughter-in-Spokane / Joce material belongs to LATER chapters — you may foreshadow in one clause at most, do not tell those stories here.
- Length: 2,200–3,000 words. No headings inside the chapter except the chapter title. No bullet points. No em-dash overuse. Prose only.
- Begin with: the book title, a suggested subtitle, then "Chapter One" and a chapter title of your choosing drawn from the material.

(1) JOURNAL ENTRIES:
${ENTRIES}

(2) INTERVIEW (questions summarized in headers; answers verbatim):
${ANSWERS}`,
  }],
})

console.log(text)
