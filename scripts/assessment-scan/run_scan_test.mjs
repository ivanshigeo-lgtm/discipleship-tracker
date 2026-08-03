// End-to-end accuracy test for /api/assessments/scan against the synthetic
// fixtures from make_fixtures.mjs. Signs in as the coach test account, posts
// the four sheet images, and diffs the returned draft against truth.json.
//
// Usage: node scripts/assessment-scan/run_scan_test.mjs [fixturesDir]
//        (dev server must be running: npm run dev -- --port 3456)
import fs from 'node:fs'
import path from 'node:path'

const API = process.env.SCAN_URL ?? 'http://localhost:3456/api/assessments/scan'
const dir = process.argv[2] ?? path.join(process.cwd(), 'scripts/assessment-scan/fixtures')
const truth = JSON.parse(fs.readFileSync(path.join(dir, 'truth.json'), 'utf8'))

// env
const env = Object.fromEntries(
  fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8')
    .split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
)
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Sign in as the coach test account.
const authRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', apikey: ANON },
  body: JSON.stringify({
    email: process.env.COACH_EMAIL ?? 'claude.coach@wikichurch.test',
    password: process.env.COACH_PASSWORD ?? 'CoachVerify2026!',
  }),
})
const auth = await authRes.json()
if (!auth.access_token) {
  console.error('Sign-in failed:', auth)
  process.exit(1)
}

// The coach's own person row doubles as the scan target (parse-only, no writes).
const meRes = await fetch(
  `${SUPABASE_URL}/rest/v1/people?auth_user_id=eq.${auth.user.id}&select=id,name`,
  { headers: { apikey: ANON, Authorization: `Bearer ${auth.access_token}` } }
)
const [me] = await meRes.json()
if (!me) {
  console.error('No people row for coach account')
  process.exit(1)
}
console.log(`Scanning as ${me.name} (${me.id})`)

const form = new FormData()
form.set('accessToken', auth.access_token)
form.set('personId', me.id)
for (const code of ['G1', 'G2', 'B1', 'P1']) {
  const buf = fs.readFileSync(path.join(dir, `${code}.png`))
  form.append('photos', new Blob([buf], { type: 'image/png' }), `${code}.png`)
}

const t0 = Date.now()
const res = await fetch(API, { method: 'POST', body: form })
const out = await res.json()
console.log(`scan HTTP ${res.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`)
if (!res.ok) {
  console.error(out)
  process.exit(1)
}
fs.writeFileSync(path.join(dir, 'last_scan_result.json'), JSON.stringify(out, null, 2))
console.log('pages detected:', out.pages.map(p => p.code).join(', '))

// ── diff bubbles ──────────────────────────────────────────────────────────────
function diffBubbles(label, truthMap, draft) {
  if (!draft) {
    console.log(`${label}: MISSING from draft`)
    return { wrong: Number.MAX_SAFE_INTEGER }
  }
  let right = 0
  const wrong = []
  const flaggedIds = new Set(draft.flagged.map(f => f.id))
  for (const [idStr, a] of Object.entries(truthMap)) {
    const id = Number(idStr)
    const got = draft.responses[id]
    if (a.value === null) {
      // truth blank/multiple → must NOT carry a confident value; flag expected
      if (got === undefined && flaggedIds.has(id)) right++
      else wrong.push(`#${id} expected flagged(${a.style}) got value=${got}`)
    } else if (got === a.value) {
      right++
    } else {
      wrong.push(`#${id} expected ${a.value}(${a.style}) got ${got === undefined ? `flagged:${draft.flagged.find(f => f.id === id)?.flag ?? 'missing'}` : got}`)
    }
  }
  const total = Object.keys(truthMap).length
  console.log(`${label}: ${right}/${total} correct${wrong.length ? ` — ${wrong.length} wrong:` : ''}`)
  for (const w of wrong) console.log('   ', w)
  return { wrong: wrong.length }
}

const g = diffBubbles('Gifts (G1+G2)', truth.gifts, out.draft.gifts)
const b = diffBubbles('Big Five (B1)', truth.bigFive, out.draft.bigFive)

// ── diff passion ──────────────────────────────────────────────────────────────
let pWrong = 0
const p = out.draft.passion
if (!p) {
  console.log('Passion: MISSING from draft')
  pWrong++
} else {
  const wantPeople = truth.passion.peopleGroups.map(x => x.label)
  const wantIssues = truth.passion.issues.map(x => x.label)
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
  if (!eq(p.answers.peopleGroups, wantPeople)) {
    console.log('Passion peopleGroups: expected', wantPeople, 'got', p.answers.peopleGroups)
    pWrong++
  } else console.log('Passion peopleGroups: ✓')
  if (!eq(p.answers.issues, wantIssues)) {
    console.log('Passion issues: expected', wantIssues, 'got', p.answers.issues)
    pWrong++
  } else console.log('Passion issues: ✓')
  for (const [id, want] of Object.entries(truth.passion.reflections)) {
    const got = (p.answers.reflections[id] ?? '').trim()
    // Transcription tolerance: normalized comparison.
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    if (norm(got) === norm(want)) console.log(`Passion reflection ${id}: ✓`)
    else {
      console.log(`Passion reflection ${id}: MISMATCH\n    want: ${want}\n    got:  ${got}`)
      pWrong++
    }
  }
}

console.log(`Name: want "${truth.name}" got "${out.draft.name}" · Date: want "${truth.date}" got "${out.draft.date}"`)
if (out.draft.warnings?.length) console.log('warnings:', out.draft.warnings)
console.log(out.draft.gifts?.scores ? `Top gifts: ${out.draft.gifts.topGifts.map(x => x.name).join(', ')}` : 'Gifts not scored')

const totalWrong = g.wrong + b.wrong + pWrong
console.log(totalWrong === 0 ? '\nALL CHECKS PASSED ✓' : `\n${totalWrong} mismatches`)
process.exit(totalWrong === 0 ? 0 : 2)
