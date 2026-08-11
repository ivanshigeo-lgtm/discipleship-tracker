// Verse of the day, sourced from Sunday's message. Scrapes the current series
// page on gracebiblemaui.org (Squarespace — no structured feed, so we parse the
// audio-block HTML), finds the most recent sermon on or before today, and
// generates a themed 7-verse week (one per day, Sun-indexed) with Fable 5.
// Results are cached per sermon_date in sermon_verse_weeks, so generation runs
// once per new sermon; every other request is a cache hit. The client falls
// back to its static rotation if this route errors or has nothing.
//
// Service-role route: bypasses RLS for the cache table.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateObject, jsonSchema } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Fable 5 — same pastoral-prose rationale as ministry-fit; one generation per
// week makes cost/latency a non-issue.
const MODEL = 'claude-fable-5'

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
    const res = await fetch(SERMONS_INDEX_URL, { headers: UA, next: { revalidate: 3600 } })
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
type Sermon = { date: string; title: string; speaker: string | null; series: string | null }

const verseWeekSchema = jsonSchema<{ verses: Verse[] }>({
  type: 'object',
  additionalProperties: false,
  required: ['verses'],
  properties: {
    verses: {
      type: 'array',
      minItems: 7,
      maxItems: 7,
      description:
        'Exactly 7 verses, one per day of the week starting Sunday, that walk out the theme of the sermon across the week.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ref', 'text', 'whyLine'],
        properties: {
          ref: { type: 'string', description: 'Scripture reference, e.g. "Ephesians 4:11-12".' },
          text: {
            type: 'string',
            description: 'The verse text, quoted accurately from the NIV. Keep to 1-2 sentences; trim with ellipsis if the passage is long.',
          },
          whyLine: {
            type: 'string',
            description: 'One short line connecting this verse to the sermon theme, warm and devotional. Max ~15 words.',
          },
        },
      },
    },
  },
})

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
}

// Parse sermons from the series page. Each sermon has a Squarespace audio
// block whose mp3 filename encodes `M.D.YY Title` (with `_` standing in for
// `:`); the adjacent page text carries `Title  Speaker . Month D, YYYY`.
// Title comes from the filename (the text window can catch srcset junk);
// speaker and date prefer the text, with the filename date as fallback.
function parseSermons(html: string): Sermon[] {
  const series =
    html
      .match(/<title>([^<]+)/)?.[1]
      ?.split(/—|&mdash;|\||&#8212;/)[0]
      ?.trim() || null
  const sermons: Sermon[] = []
  const mp3Re = /href="([^"]+\.mp3)"/g
  let m: RegExpExecArray | null
  while ((m = mp3Re.exec(html)) !== null) {
    let fname = m[1].split('/').pop() || ''
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
      .slice(Math.max(0, m.index - 3000), m.index + 3000)
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
    sermons.push({ date, title, speaker, series })
  }
  return sermons
}

export async function GET() {
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
          const r = await fetch(url, { headers: UA, next: { revalidate: 3600 } })
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

    const cached = await supabase
      .from('sermon_verse_weeks')
      .select('*')
      .eq('sermon_date', sermon.date)
      .maybeSingle()
    if (cached.data) {
      return NextResponse.json({ status: 'ready', week: cached.data, cached: true })
    }

    const { object } = await generateObject({
      model: anthropic(MODEL),
      schema: verseWeekSchema,
      maxOutputTokens: 2500,
      system: [
        'You are a warm, biblically careful pastor at Grace Bible Church Maui choosing a "verse of the day" set for the congregation\'s discipleship app.',
        'Given the title of last Sunday\'s message (and its series), choose exactly 7 Scripture verses — one for each day of the week, Sunday first — that help someone sit with and live out that message all week.',
        'Rules: quote verse text accurately (NIV). Vary books/authors across the week. Sunday\'s verse should be the most central to the message; the rest should develop the theme (understand it, pray it, practice it, share it). Keep whyLine short, warm, and concrete — no clichés.',
      ].join('\n'),
      prompt: [
        `Series: ${sermon.series ?? 'unknown'}`,
        `Sermon title: ${sermon.title}`,
        `Speaker: ${sermon.speaker ?? 'unknown'}`,
        `Preached: ${sermon.date}`,
      ].join('\n'),
    })

    const { data: saved, error: saveErr } = await supabase
      .from('sermon_verse_weeks')
      .upsert(
        {
          sermon_date: sermon.date,
          sermon_title: sermon.title,
          speaker: sermon.speaker,
          series: sermon.series,
          verses: object.verses,
          model: MODEL,
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
