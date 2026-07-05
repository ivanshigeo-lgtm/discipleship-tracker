// One-off pilot: Opus 4.8 reads the Lahaina journal thread and generates the
// ghostwriter interview questions for "Beauty Past the Ashes".
// Run: node scripts/lahaina-interview.mjs  (reads ANTHROPIC_API_KEY from .env.local)
import { readFileSync } from 'fs'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ENTRIES = readFileSync('scripts/lahaina-entries.txt', 'utf8')

const { text } = await generateText({
  model: anthropic('claude-opus-4-8'),
  providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
  maxOutputTokens: 4000,
  messages: [{
    role: 'user',
    content: `You are the ghostwriter for a short work of testimony called "Beauty Past the Ashes: Lahaina," built from a pastor's handwritten SOAP journal entries. The author is Jonavan Asato, a pastor at Grace Bible Church on Maui. The Lahaina fire happened August 8, 2023.

Below are his journal entries that mention Lahaina, with the dates the digitization assigned them. Note: handwritten dates can be misread (a sloppy 9 can look like a 7), so dates may be wrong — some "July" entries reference displaced residents, which would be impossible before August 8.

Your job right now is NOT to write. It is to interview him — the way a ghostwriter does before drafting. Generate the interview: the questions whose answers you need to write this book truthfully and vividly. Rules:

- Start with any factual/timeline questions you MUST resolve to avoid publishing errors (flag the date question directly).
- Then ask the story questions: sensory, specific, one moment at a time — not "how did you feel" but questions that retrieve scenes, names, dollar figures, first moments.
- Ask about what the journals conspicuously DON'T say (his own losses — one entry says "In my loss & the loss of lahaina"; what was his loss?).
- 10-14 questions max, ordered, each with a one-line note on why it matters for the book.
- Warm, direct, pastoral-respectful tone. He will answer these by voice memo.

JOURNAL ENTRIES:
${ENTRIES}`,
  }],
})

console.log(text)
