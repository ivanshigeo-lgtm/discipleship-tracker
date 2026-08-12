// Verse of the day, sourced from Sunday's message. Scrapes the current series
// page on gracebiblemaui.org (Squarespace — no structured feed, so we parse the
// audio-block HTML), finds the most recent sermon on or before today, then reads
// that sermon's "Sermon Notes" PDF (a bit.ly → Google Drive link) and pulls the
// actual Scripture references the pastor cited. The verses shown are exactly the
// ones in the notes — no AI, no invented references. We spread up to 7 across the
// week (one per day, Sun-indexed), Sunday-first. Results are cached per
// sermon_date in sermon_verse_weeks, so the scrape runs once per new sermon;
// every other request is a cache hit. The client falls back to its static
// rotation if this route errors or the notes yield nothing.
//
// Service-role route: bypasses RLS for the cache table.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Provenance tag stored in the `model` column — the set is scraped, not generated.
const SOURCE = 'sermon-notes'

const SITE_ORIGIN = 'https://www.gracebiblemaui.org'

// The sermons index is the canonical list of every series, so we discover the
// current series from it instead of hardcoding a slug that goes stale when GBM
// starts a new series. FALLBACK_SERIES_URL is always kept in the candidate set
// so we still work if the index changes shape; if everything 404s or parses to
// nothing, the client's static rotation covers us.
const SERMONS_INDEX_URL = `${SITE_ORIGIN}/sermons`
const FALLBACK_SERIES_URL = `${SITE_ORIGIN}/identity`

const UA = { 'user-agent': 'Mozilla/5.0 (verse-week)' }

// Structural / nav pages on the sermons index that are never a sermon series.
// Ministry pages (leadership, outreach, prayer, …) are deliberately NOT excluded:
// if one has no dated sermon audio it parses to nothing (harmless), and if GBM
// ever names a series after one it still gets picked up.
const NON_SERIES_SLUGS = new Set([
  'sermons', 'previous-sermons', 'give', 'giving', 'online-giving', 'events',
  'connect', 'connect-1', 'connect-activities', 'home', 'plan-your-visit',
  'about-us', 'who-we-are', 'contact', 'contact-1', 'how-to-soap',
  'privacy-policy', 'terms-of-use',
])

// Discover candidate series pages from the sermons index. Returns absolute URLs
// (fallback always included). parseSermons naturally ignores any candidate with
// no dated sermon audio, and the caller picks the newest sermon across all of
// them — so a new series is tracked automatically, no hardcoded slug to update.
async function discoverSeriesUrls(): Promise<string[]> {
  const urls = new Set<string>([FALLBACK_SERIES_URL])
  try {
    const res = await fetchWithTimeout(
      SERMONS_INDEX_URL,
      { headers: UA, next: { revalidate: 3600 } },
      10000
    )
    if (res.ok) {
      const html = await res.text()
      const linkRe = /href="\/([a-z0-9][a-z0-9-]*)"/gi
      let m: RegExpExecArray | null
      while ((m = linkRe.exec(html)) !== null) {
        const slug = m[1].toLowerCase()
        if (NON_SERIES_SLUGS.has(slug)) continue
        urls.add(`${SITE_ORIGIN}/${slug}`)
      }
    }
  } catch {
    /* fall back to just FALLBACK_SERIES_URL */
  }
  return [...urls]
}

type Verse = { ref: string; text: string; whyLine: string }
type Sermon = {
  date: string
  title: string
  speaker: string | null
  series: string | null
  notesUrl: string | null
}

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

// Anchors on a series page whose visible text mentions "note" — the per-sermon
// "Sermon Notes" links (bit.ly on /identity, sometimes a direct Drive link).
// We keep their positions so parseSermons can pair each with its sermon.
function collectNoteAnchors(html: string): { pos: number; href: string }[] {
  const out: { pos: number; href: string }[] = []
  const re = /<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(html)) !== null) {
    const label = m[2].replace(/<[^>]+>/g, '').toLowerCase()
    if (label.includes('note')) out.push({ pos: m.index, href: m[1] })
  }
  return out
}

// Parse sermons from the series page. Each sermon has a Squarespace audio
// block whose mp3 filename encodes `M.D.YY Title` (with `_` standing in for
// `:`); the adjacent page text carries `Title  Speaker . Month D, YYYY`.
// Title comes from the filename (the text window can catch srcset junk);
// speaker and date prefer the text, with the filename date as fallback.
// notesUrl = the first "Sermon Notes" anchor after this sermon's mp3 and before
// the next one (the links interleave 1:1 with the audio blocks, newest first).
function parseSermons(html: string): Sermon[] {
  const series =
    html
      .match(/<title>([^<]+)/)?.[1]
      ?.split(/—|&mdash;|\||&#8212;/)[0]
      ?.trim() || null
  const noteAnchors = collectNoteAnchors(html)

  const mp3s: { idx: number; href: string }[] = []
  const mp3Re = /href="([^"]+\.mp3)"/g
  let m: RegExpExecArray | null
  while ((m = mp3Re.exec(html)) !== null) mp3s.push({ idx: m.index, href: m[1] })

  const sermons: Sermon[] = []
  for (let k = 0; k < mp3s.length; k++) {
    const { idx, href } = mp3s[k]
    let fname = href.split('/').pop() || ''
    try {
      fname = decodeURIComponent(fname)
    } catch {
      /* keep raw */
    }
    const fdate = fname.match(/(\d{1,2})\.(\d{1,2})\.(\d{2})\b/)
    if (!fdate) continue
    const fileDate = `20${fdate[3]}-${fdate[1].padStart(2, '0')}-${fdate[2].padStart(2, '0')}`
    const title = fname
      .slice(fname.indexOf(fdate[0]) + fdate[0].length)
      .replace(/\.mp3$/i, '')
      .replace(/\+/g, ' ')
      .replace(/_/g, ':')
      .replace(/\s+/g, ' ')
      .trim()
    if (!title) continue

    const text = html
      .slice(Math.max(0, idx - 3000), idx + 3000)
      .replace(/<script[\s\S]*?<\/script>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    const tm = text.match(
      /((?:Pastor|Ps\.?|Rev\.?)\s+[A-Z][^.]{2,40}|Jonavan[^.]{0,40})\s*\.\s*(\w+) (\d{1,2}), (\d{4})/
    )
    let date = fileDate
    let speaker: string | null = null
    if (tm) {
      speaker = tm[1].trim()
      const mo = MONTHS[tm[2].toLowerCase()]
      if (mo) date = `${tm[4]}-${String(mo).padStart(2, '0')}-${tm[3].padStart(2, '0')}`
    }

    // The notes link sits between this audio block and the next one.
    const nextIdx = k + 1 < mp3s.length ? mp3s[k + 1].idx : html.length
    const note = noteAnchors.find((a) => a.pos > idx && a.pos < nextIdx)

    sermons.push({ date, title, speaker, series, notesUrl: note?.href ?? null })
  }
  return sermons
}

// Every external hop here (bit.ly, Google Drive, pd.js) can stall on Vercel's
// egress IP, and a stalled hop burns the whole function budget → 504. Bound each
// one so the worst case is a fast "unavailable" (client shows its static verse),
// never a hang.
async function fetchWithTimeout(
  url: string,
  opts: RequestInit & { next?: { revalidate?: number } } = {},
  ms = 15000
): Promise<Response> {
  const ac = new AbortController()
  const t = setTimeout(() => ac.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ac.signal })
  } finally {
    clearTimeout(t)
  }
}

function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

// A "Sermon Notes" link is either a direct Drive file URL or a bit.ly that
// redirects to one. Return the Drive file id so we can download the PDF.
function driveIdFromUrl(u: string): string | null {
  return (
    u.match(/\/file\/d\/([^/?#]+)/)?.[1] ??
    u.match(/[?&]id=([^&]+)/)?.[1] ??
    null
  )
}

async function resolveNotesPdfId(notesUrl: string): Promise<string | null> {
  const direct = driveIdFromUrl(notesUrl)
  if (direct) return direct
  try {
    // bit.ly → Drive "view" URL; we only need the final URL, not the body.
    const res = await fetchWithTimeout(notesUrl, { headers: UA, redirect: 'follow' }, 12000)
    try {
      await res.body?.cancel()
    } catch {
      /* ignore */
    }
    return driveIdFromUrl(res.url)
  } catch {
    return null
  }
}

// Download the notes PDF from Drive and extract its text. unpdf is a pure-JS,
// serverless-friendly pd.js build — no native binary needed on Vercel.
async function fetchNotesText(fileId: string): Promise<string> {
  try {
    const res = await fetchWithTimeout(
      `https://drive.google.com/uc?export=download&id=${fileId}`,
      { headers: UA },
      20000
    )
    if (!res.ok) return ''
    const buf = new Uint8Array(await res.arrayBuffer())
    // Must be a real PDF (%PDF); Drive can return an HTML interstitial otherwise.
    if (!(buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)) return ''
    // Cap pd.js parsing too — it's CPU-bound and can wedge in serverless.
    const extract = (async () => {
      const { extractText, getDocumentProxy } = await import('unpdf')
      const pdf = await getDocumentProxy(buf)
      const { text } = await extractText(pdf, { mergePages: true })
      return Array.isArray(text) ? text.join('\n') : (text ?? '')
    })()
    return await withTimeout(extract, 25000, '')
  } catch {
    return ''
  }
}

// Book Chapter:Verse(-Verse), incl. numbered books (1 Corinthians, 2 Timothy)
// and two-word books (Song of Songs is rare and out of scope). \s spans the
// stray newlines pd.js leaves between a leading number and the book name.
const REF_SRC = String.raw`(?:[1-3]\s+)?[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\s\d+:\d+(?:[-–]\d+)?`

// Pull the cited references straight out of the notes text. The notes list each
// point's verses as `"quoted line" - Book C:V`, grouped under numbered point
// headings ("1. Engage the Community"). We take the reference and the pastor's
// own quoted line verbatim, tag each with its point heading, and stop before the
// discussion guide (whose warm-up questions are also numbered).
function extractVersesFromNotes(raw: string): Verse[] {
  const cut = raw.split(/Small Group Discussion Guide|Discussion Guide/i)[0] || raw
  const cleaned = cut
    .split('\n')
    .filter((l) => !/DOWN?LOAD|gracebiblemaui|FIND OUT MORE|PHONE:|EMAIL:|FACEBOOK/i.test(l))
    .join(' ')
  const flat = cleaned.replace(/\s+/g, ' ')

  // Numbered point headings, e.g. "1. Engage the Community". Require ≥2-letter
  // words so the trailing "a." sub-item marker isn't swallowed.
  const heads: { pos: number; name: string }[] = []
  const headRe = /(?:^|\s)[1-9]\.\s+([A-Z][A-Za-z]+(?:\s+[A-Za-z]{2,}){0,4})/g
  let hm: RegExpExecArray | null
  while ((hm = headRe.exec(flat)) !== null) {
    heads.push({ pos: hm.index, name: hm[1].trim().replace(/[.,;:]+$/, '') })
  }

  const pairRe = new RegExp(
    `["“]([^"”]{3,200})["”]\\s*[-–—]\\s*(${REF_SRC})`,
    'g'
  )
  const verses: Verse[] = []
  const seen = new Set<string>()
  let pm: RegExpExecArray | null
  while ((pm = pairRe.exec(flat)) !== null) {
    const ref = pm[2].replace(/\s+/g, ' ').trim()
    if (seen.has(ref)) continue
    seen.add(ref)
    const text = pm[1].replace(/\s+/g, ' ').trim()
    let name = ''
    for (const h of heads) {
      if (h.pos < pm.index) name = h.name
      else break
    }
    verses.push({ ref, text, whyLine: name })
  }
  if (verses.length <= 7) return verses

  // More than 7 references: evenly sample 7 across the sermon's flow so Sunday
  // gets the opening verse and Saturday the closing one, with the points spread
  // across the week in between.
  const N = verses.length
  const idxs = [...new Set(Array.from({ length: 7 }, (_, i) => Math.round((i * (N - 1)) / 6)))].sort(
    (a, b) => a - b
  )
  return idxs.map((i) => verses[i])
}

export async function GET(req: Request) {
  const probe = new URL(req.url).searchParams.get('probe') === '1'
  try {
    // Auto-discover every series page, then parse sermons from all of them and
    // take the single most-recent one across the lot — so whichever series has
    // the newest message wins, even in the brief window when a new series page
    // exists but the old series' last sermon is still the latest preached.
    const seriesUrls = await discoverSeriesUrls()

    const pages = await Promise.all(
      seriesUrls.map(async (url) => {
        try {
          // Revalidate hourly; the pages only change weekly.
          const r = await fetchWithTimeout(url, { headers: UA, next: { revalidate: 3600 } }, 10000)
          return r.ok ? await r.text() : ''
        } catch {
          return ''
        }
      })
    )

    const today = new Date().toISOString().slice(0, 10)
    const sermon = pages
      .flatMap(parseSermons)
      .filter((s) => s.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))[0]
    if (!sermon) return NextResponse.json({ status: 'unavailable' }, { status: 200 })

    // Read-only diagnostics: run the generation pipeline with per-stage timings
    // and return the result WITHOUT touching the cache. Lets us confirm the
    // scrape works in the serverless runtime without disturbing the live set.
    if (probe) {
      const t: Record<string, number> = {}
      let mark = Date.now()
      const lap = (k: string) => {
        t[k] = Date.now() - mark
        mark = Date.now()
      }
      const fileId = sermon.notesUrl ? await resolveNotesPdfId(sermon.notesUrl) : null
      lap('resolve_ms')
      const notesText = fileId ? await fetchNotesText(fileId) : ''
      lap('fetch_and_parse_ms')
      const verses = notesText ? extractVersesFromNotes(notesText) : []
      lap('extract_ms')
      return NextResponse.json({
        status: 'probe',
        sermon,
        fileId,
        notesTextLen: notesText.length,
        timings: t,
        count: verses.length,
        verses,
      })
    }

    const cached = await supabase
      .from('sermon_verse_weeks')
      .select('*')
      .eq('sermon_date', sermon.date)
      .maybeSingle()
    if (cached.data) {
      return NextResponse.json({ status: 'ready', week: cached.data, cached: true })
    }

    // Read the sermon's notes PDF and pull the actual cited verses. If there are
    // no notes, or nothing parses, we return unavailable rather than invent
    // anything — the client's static rotation covers that case.
    let verses: Verse[] = []
    if (sermon.notesUrl) {
      const fileId = await resolveNotesPdfId(sermon.notesUrl)
      if (fileId) {
        const notesText = await fetchNotesText(fileId)
        if (notesText) verses = extractVersesFromNotes(notesText)
      }
    }
    if (verses.length === 0) {
      return NextResponse.json(
        { status: 'unavailable', detail: 'no verses in sermon notes' },
        { status: 200 }
      )
    }

    const { data: saved, error: saveErr } = await supabase
      .from('sermon_verse_weeks')
      .upsert(
        {
          sermon_date: sermon.date,
          sermon_title: sermon.title,
          speaker: sermon.speaker,
          series: sermon.series,
          verses,
          model: SOURCE,
          generated_at: new Date().toISOString(),
        },
        { onConflict: 'sermon_date' }
      )
      .select()
      .single()
    if (saveErr) {
      return NextResponse.json({ status: 'unavailable', detail: saveErr.message }, { status: 200 })
    }
    return NextResponse.json({ status: 'ready', week: saved, cached: false })
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ status: 'unavailable', detail }, { status: 200 })
  }
}
