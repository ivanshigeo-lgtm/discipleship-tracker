// Synthetic calibration fixtures for the assessment photo-scan route.
// Renders /print/assessments in headless Chromium, digitally "hand-fills" the
// four sheets with a known answer set (pen-style bubble fills plus deliberate
// messy marks: X, check, blank, double-mark), screenshots each sheet, and
// writes a ground-truth JSON next to the images. Real pen-on-paper photos from
// Jonavan remain the acceptance test — these bootstrap read-accuracy tuning.
//
// Usage: node scripts/assessment-scan/make_fixtures.mjs [outDir]
//        (dev server must be running: npm run dev -- --port 3456)
import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.PRINT_URL ?? 'http://localhost:3456/print/assessments'
const outDir = process.argv[2] ?? path.join(process.cwd(), 'scripts/assessment-scan/fixtures')
fs.mkdirSync(outDir, { recursive: true })

// Deterministic PRNG so fixtures regenerate identically.
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260802)
const pick = (min, max) => min + Math.floor(rand() * (max - min + 1))

// ── ground truth ──────────────────────────────────────────────────────────────
// Messy marks: style 'x' / 'check' still count as that value (flag ok);
// 'blank' has no mark; 'multiple' marks two bubbles (value + value2, truth null).
const MESSY = {
  G: {
    7: { style: 'x' },
    13: { style: 'check' },
    22: { style: 'blank' },
    31: { style: 'multiple' },
    66: { style: 'blank' },
    77: { style: 'x' },
  },
  B: {
    9: { style: 'multiple' },
    25: { style: 'blank' },
    38: { style: 'check' },
  },
}

function makeAnswers(count, min, max, messy) {
  const out = {}
  for (let id = 1; id <= count; id++) {
    const m = messy[id]
    if (m?.style === 'blank') {
      out[id] = { value: null, style: 'blank' }
    } else if (m?.style === 'multiple') {
      const value = pick(min, max)
      let value2 = pick(min, max)
      if (value2 === value) value2 = value === max ? min : value + 1
      out[id] = { value: null, style: 'multiple', marks: [value, value2] }
    } else {
      out[id] = { value: pick(min, max), style: m?.style ?? 'fill' }
    }
  }
  return out
}

const gifts = makeAnswers(100, 0, 3, MESSY.G)
const bigFive = makeAnswers(50, 1, 5, MESSY.B)

const passion = {
  name: 'Malia Kahale',
  date: '8/2/26',
  reflections: {
    1: 'Start a surf ministry for the youth on the west side and teach them to follow Jesus.',
    2: 'Helping young people know God loves them before they leave the island.',
    3: 'Surfing, my church family, and mentoring teenagers.',
    4: 'How to reach kids who have given up on church.',
    5: 'Teach them to read the Bible for themselves.',
  },
  peopleGroups: [
    { rank: 1, label: 'Youth (9th-12th gr)' },
    { rank: 2, label: 'College (age 18-21)' },
    { rank: 3, label: 'Singles (age 19-30)' },
  ],
  issues: [
    { rank: 1, label: 'Discipleship' },
    { rank: 2, label: 'Reaching the Unchurched' },
    { rank: 3, label: 'Surf ministry', other: true },
  ],
}

const truth = {
  seed: 20260802,
  name: passion.name,
  date: passion.date,
  gifts, // id -> {value, style}
  bigFive,
  passion,
}
fs.writeFileSync(path.join(outDir, 'truth.json'), JSON.stringify(truth, null, 2))

// ── render + mark ─────────────────────────────────────────────────────────────
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1000, height: 1400 }, deviceScaleFactor: 2 })
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('.sheet')

await page.evaluate(({ gifts, bigFive, passion }) => {
  const PEN = '#232a6b' // ballpoint blue
  const HAND = '"Bradley Hand", "Comic Sans MS", cursive'

  function markBubble(bubble, style) {
    if (style === 'fill') {
      bubble.style.background = PEN
      bubble.style.color = 'transparent'
      bubble.style.boxShadow = `0 0 1px 0.5px ${PEN}`
    } else if (style === 'x' || style === 'check') {
      bubble.style.color = PEN
      bubble.style.fontWeight = '900'
      bubble.style.fontSize = '9pt'
      bubble.style.lineHeight = '0.13in'
      bubble.textContent = style === 'x' ? '✗' : '✓'
    }
  }

  function handwrite(el, text, size = '9pt') {
    el.style.fontFamily = HAND
    el.style.fontSize = size
    el.style.color = PEN
    el.style.fontWeight = '600'
    el.textContent = text
  }

  const sheets = [...document.querySelectorAll('.sheet')]
  for (const sheet of sheets) {
    const code = sheet.querySelector('.page-code')?.textContent?.trim()
    // Name + date on every sheet.
    const lines = sheet.querySelectorAll('.identity-row .field .line')
    if (lines[0]) handwrite(lines[0], passion.name)
    if (lines[1]) handwrite(lines[1], passion.date)

    if (code === 'G1' || code === 'G2' || code === 'B1') {
      const answers = code === 'B1' ? bigFive : gifts
      const min = code === 'B1' ? 1 : 0
      for (const row of sheet.querySelectorAll('.bubble-table tbody tr')) {
        const id = Number(row.querySelector('.num')?.textContent)
        const a = answers[id]
        if (!a) continue
        const bubbles = [...row.querySelectorAll('.bubble')]
        if (a.style === 'blank') continue
        if (a.style === 'multiple') {
          for (const v of a.marks) markBubble(bubbles[v - min], 'fill')
        } else {
          markBubble(bubbles[a.value - min], a.style)
        }
      }
    }

    if (code === 'P1') {
      const blocks = [...sheet.querySelectorAll('.prompt-block')]
      blocks.forEach((block, i) => {
        const text = passion.reflections[i + 1] ?? ''
        const writeLines = [...block.querySelectorAll('.write-line')]
        // Split the answer across the ruled lines like real handwriting.
        const words = text.split(' ')
        const per = Math.ceil(words.length / writeLines.length)
        writeLines.forEach((line, j) => {
          const chunk = words.slice(j * per, (j + 1) * per).join(' ')
          if (chunk) handwrite(line, chunk, '8.5pt')
          line.style.lineHeight = '0.2in'
        })
      })
      const sections = [...sheet.querySelectorAll('.rank-section')]
      const fillRanks = (section, picks) => {
        const options = [...section.querySelectorAll('.rank-option')]
        for (const p of picks) {
          const opt = p.other
            ? options.find(o => o.textContent.includes('Other'))
            : options.find(o => o.textContent.trim().startsWith(p.label))
          if (!opt) continue
          const box = opt.querySelector('.rank-box')
          handwrite(box, String(p.rank), '9pt')
          box.style.textAlign = 'center'
          box.style.lineHeight = '0.16in'
          if (p.other) {
            const line = opt.querySelector('.rank-other-line')
            if (line) handwrite(line, p.label, '8pt')
          }
        }
      }
      if (sections[0]) fillRanks(sections[0], passion.peopleGroups)
      if (sections[1]) fillRanks(sections[1], passion.issues)
    }
  }
}, { gifts, bigFive, passion })

const codes = ['G1', 'G2', 'B1', 'P1']
const sheetEls = page.locator('.sheet')
for (let i = 0; i < codes.length; i++) {
  const file = path.join(outDir, `${codes[i]}.png`)
  await sheetEls.nth(i).screenshot({ path: file })
  console.log('wrote', file)
}
await browser.close()
console.log('wrote', path.join(outDir, 'truth.json'))
