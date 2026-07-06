// Overnight run: draft chapters 2-10 + epilogue of "Beauty Past the Ashes"
// sequentially (each chapter sees all previous ones for voice continuity).
// Gaps are marked [FOR THE INTERVIEW: ...] — never invented.
// Run: node scripts/lahaina-book.mjs
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const ENTRIES = readFileSync('scripts/lahaina-entries.txt', 'utf8')
const ANSWERS = readFileSync('docs/lahaina-answers.md', 'utf8')
const CH1 = readFileSync('docs/beauty-past-the-ashes-ch1.md', 'utf8')

mkdirSync('docs/book', { recursive: true })

const OUTLINE = `
1. The Speed of Trust (DRAFTED) — Aug 8, red glow, helicopter video, relief, $500 checks, influencer word from God, journal catch-up, seed prayer, banyan glimpse, exchange foretaste.
2. Everyone's Town — what Lahaina was to Maui and to him; the four-tragedy family; the church become free store; people (and his own family) sleeping in the sanctuary for security; homes of the congregation opened; the boat run when the caravan couldn't get through (STUB ONLY — one short honest passage + interview marker; do not invent details).
3. Catching Up with Jeremiah — the journal discipline as spiritual survival; writing July in September; Jeremiah 29-33 chosen by the reading plan months before there was anything to grieve; build houses in exile; the rebuild will take time; Lam 3 mercy entry.
4. No Permission to Grieve — the daughter's story in full (Spokane, the counselor's circle, first uncontrollable tears, proms/beach/restaurants = adolescence); the helper's grief pattern; his own delayed grief named but the retreat is saved for ch5.
5. The Night the Oil Ran Dry — funerals, rescue/relief/recovery on high tilt 6-12 months, the funeral where he joked like at a party and knew something broke, compassion fatigue, the HIM pastors retreat, ten virgins/extra oil, survival guilt, "Don't Blink — life is beautiful, Lahaina is gone, everything is temporary." (Funeral specifics are thin — write general, one interview marker.)
6. Tears I Had Only Seen Twice — Joce; the counseling room; the three times he'd seen her cry; "she felt broken for me"; why pastors carry alone (protection, not reliving, confidentiality); "carrying many things alone that I didn't need to be carrying alone"; solitude-support-silence-stress; the mercy prayer thread that predated the fire (Dec 2022/Jan 2023 journal entries) as the quiet undertone — NO invented retreat scene for the Jesus Prayer.
7. The Banyan Tree — the full chapter of the book's central image and theology: the tree by the harbor, black, written off, green shoots months later, roots deep enough to find water; Isaiah 61 the EXCHANGE (beauty FOR ashes — the ashes have value to God); grief counseling truth: trauma never heals, it changes the depth we feel; pain and joy share receptors; medicating pain amputates joy; embrace and exchange. The woman who prayed in a bathroom that was the only structure standing at dawn belongs to this chapter's territory (STUB ONLY — one reverent short passage + interview marker; do not invent her story).
8. The Widows — the war widow (Afghanistan, pregnant on his last tour, three children); the runner's widow (the 11:30pm call at the bottom of his own hill, telling the boys, the unanswerable Why); years later both housing strangers, one sheltering 40+ alone; "we know what loss is — how can we not be there"; victims revealed as heroes; strength produced by suffering as the exchange proven.
9. Praying with the Mayor — the mayor opening his office to monthly prayer since the fires; the documented answered-prayer ledger (cleanup ahead of schedule, first house in 10 months, first homeowners Mar 2025, fentanyl highest-to-lowest, toxic waste moved twice federally paid, no traffic delays, $1.6B highest disaster award, rain ending the drought, construction +125%, visitor spending +24%, 175 homes occupied under 3 years); honest costs too: FEMA rents inflating the island, scarcity, the long unwitnessed middle (one interview marker for a year-two scene).
10. The First Plant After the Fire — what was born: Aʻaliʻi Village (126 homes, 8 acres Kahului, 88 affordable rentals, tenants earning ownership through financial education and sweat equity, exit fund, named for the first plant to grow after a lava flow, pulling water from the air in arid ground); the studio built for the woman who lost her parents and her home; leadership doubling promise (Dec 2022) → monthly baptisms doubling (2025); the Aug 23 prayer for wisdom raising leaders now visibly answered; the island itself as a tree of righteousness.
EPILOGUE. The Correct Exchange — short (800-1,100 words). Built around his Q14 answer nearly verbatim: pain never leaves you the same; the holes in Jesus' hands were there for Thomas and will be there when we see Him; a mother's love; embrace instead of medicate; bring the ashes to the correct exchange. Direct address to the reader in their own ashes. End the book here — quiet, sure, unadorned.
`

const RULES = `RULES — hard constraints:
- Use ONLY facts, scenes, names, numbers, and quotes present in the materials. NEVER invent dialogue, names, dates, weather, or interior states not evidenced.
- Where the outline marks a STUB or the material is thin: write at most a short honest passage that claims only what is known, then leave an italic inline marker in this exact form: *[FOR THE INTERVIEW: <specific question>]* and move on. Do not pad around gaps.
- Journal quotes may be lightly cleaned for spelling but never reworded; introduce them as — *From my journal, filed under <date>:*
- First person as Jonavan. His register: plain, warm, concrete, pastoral; short declaratives when moved; scripture woven naturally; local texture without tour-guide explanation; zero self-importance.
- 1,800-2,800 words per chapter (epilogue 800-1,100). No headings inside a chapter except "Chapter <N>" and its title. No bullet lists in chapters 2-8 and the epilogue; chapter 9 may render the answered-prayer ledger as a simple list if it serves the reader. Prose otherwise.
- Do not re-tell what a previous chapter already told; reference it in a clause at most. Do not steal material assigned to a later chapter; foreshadow in one clause at most.
- Match the voice and rhythm of the previous chapters provided.`

const CHAPTERS = [
  { n: 2, key: 'ch2', title: 'Everyone’s Town' },
  { n: 3, key: 'ch3', title: 'Catching Up with Jeremiah' },
  { n: 4, key: 'ch4', title: 'No Permission to Grieve' },
  { n: 5, key: 'ch5', title: 'The Night the Oil Ran Dry' },
  { n: 6, key: 'ch6', title: 'Tears I Had Only Seen Twice' },
  { n: 7, key: 'ch7', title: 'The Banyan Tree' },
  { n: 8, key: 'ch8', title: 'The Widows' },
  { n: 9, key: 'ch9', title: 'Praying with the Mayor' },
  { n: 10, key: 'ch10', title: 'The First Plant After the Fire' },
  { n: 11, key: 'epilogue', title: 'Epilogue: The Correct Exchange' },
]

let manuscript = CH1
for (const ch of CHAPTERS) {
  const outPath = `docs/book/${ch.key}.md`
  if (existsSync(outPath)) { // resumable across reruns
    manuscript += '\n\n' + readFileSync(outPath, 'utf8')
    console.log(`SKIP ${ch.key} (exists)`)
    continue
  }
  const label = ch.n === 11 ? 'the EPILOGUE' : `CHAPTER ${ch.n} — "${ch.title}"`
  let text = null
  for (let attempt = 1; attempt <= 2 && !text; attempt++) {
    try {
      const res = await generateText({
        model: anthropic('claude-opus-4-8'),
        providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
        maxOutputTokens: 20000,
        messages: [{
          role: 'user',
          content: `You are ghostwriting "Beauty Past the Ashes: Lahaina" for Pastor Jonavan Asato (Grace Bible Church, Maui). The book is drafted chapter by chapter; the chapters written so far are below, followed by the full source materials. Write ${label} now, following the book outline and the rules exactly.

BOOK OUTLINE:
${OUTLINE}

${RULES}

CHAPTERS WRITTEN SO FAR:
${manuscript}

SOURCE (1) JOURNAL ENTRIES:
${ENTRIES}

SOURCE (2) INTERVIEW ANSWERS (verbatim):
${ANSWERS}

Output only the chapter itself, beginning with "Chapter ${ch.n === 11 ? '' : ch.n}" ${ch.n === 11 ? '— begin with "Epilogue" —' : ''} and its title.`,
        }],
      })
      text = res.text
    } catch (e) {
      console.log(`RETRY ${ch.key} after error: ${String(e).slice(0, 120)}`)
      if (attempt === 2) throw e
    }
  }
  writeFileSync(outPath, text)
  manuscript += '\n\n' + text
  console.log(`DONE ${ch.key} (${text.split(/\s+/).length} words)`)
}
console.log('ALL CHAPTERS COMPLETE')
