import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 120 // decade-wide Sonnet questions can take a minute

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

type J = { journal_date: string; ocr_text: string | null; scripture_reference: string | null }

export async function POST(request: NextRequest) {
  const { journalIds, entries: providedEntries, question } = await request.json() as {
    journalIds?: string[]
    entries?: J[]
    question?: string
  }

  const journals: J[] = []

  if (providedEntries?.length) {
    // Client-provided path: the caller already holds the entry text. The native
    // journal is the iSOAP store (system of record), whose entry ids do NOT live
    // in soap_journals for most people — only Jonavan's bulk-imported decade was
    // copied in with matching ids. Fetching by id there returned zero rows and
    // surfaced "Could not fetch entries" for every other linked user. Trust the
    // text the client already loaded (local + iSOAP, merged) — no DB round-trip,
    // no id-space mismatch.
    journals.push(
      ...providedEntries.map(e => ({
        journal_date: e.journal_date,
        ocr_text: e.ocr_text ?? null,
        scripture_reference: e.scripture_reference ?? null,
      }))
    )
  } else if (journalIds?.length) {
    // Legacy id path (web callers that pass local soap_journals ids). Fetch in
    // id-chunks: Supabase caps responses at 1,000 rows, and decade-wide ranges
    // select ~2,000 entries at once.
    for (let i = 0; i < journalIds.length; i += 500) {
      const { data, error } = await supabase
        .from('soap_journals')
        .select('journal_date, ocr_text, scripture_reference')
        .in('id', journalIds.slice(i, i + 500))
      if (error) return NextResponse.json({ error: 'Could not fetch entries' }, { status: 500 })
      journals.push(...((data ?? []) as J[]))
    }
  } else {
    return NextResponse.json({ error: 'journalIds or entries required' }, { status: 400 })
  }

  journals.sort((a, b) => a.journal_date.localeCompare(b.journal_date))
  if (!journals.length) {
    return NextResponse.json({ error: 'Could not fetch entries' }, { status: 500 })
  }

  // Keep the prompt inside the model's context on huge ranges: clip each
  // entry's text so the total stays under ~400K chars (~110K tokens).
  const withText = journals.filter(j => j.ocr_text)
  const perEntry = Math.max(200, Math.floor(400_000 / Math.max(1, withText.length)))
  const entriesText = withText
    .map(j => {
      const body = j.ocr_text!.length > perEntry ? j.ocr_text!.slice(0, perEntry) + '…' : j.ocr_text!
      return [`--- ${j.journal_date}${j.scripture_reference ? ` (${j.scripture_reference})` : ''} ---`, body].join('\n')
    })
    .join('\n\n')

  if (!entriesText.trim()) {
    return NextResponse.json({ error: 'Selected entries have no readable text. Try running "Read this entry" on photo entries first.' }, { status: 400 })
  }

  const isSummary = !question?.trim()

  const systemPrompt = `You are a compassionate spiritual director reviewing SOAP journal entries (Scripture, Observation, Application, Prayer) from a disciple at Grace Bible Maui. Be warm, pastoral, and encouraging. Speak directly to the person in second person ("you"). Keep your response concise and grounded in what they actually wrote. Write in plain prose only — do NOT use markdown headings (#), bold/italics (*), or bullet points.`

  const userPrompt = isSummary
    ? `Here are my SOAP journal entries:\n\n${entriesText}\n\nPlease write an executive summary (3–4 paragraphs) that:\n1. Identifies the recurring spiritual themes and what God seems to be speaking to me\n2. Notes the scripture passages and patterns in what stood out\n3. Highlights the key applications and commitments I am making\n4. Reflects on the tone and trajectory of my prayer life\n5. Ends with a brief encouraging observation about my spiritual growth`
    : `Here are my SOAP journal entries:\n\n${entriesText}\n\nMy question: ${question}\n\nPlease answer based on what I actually wrote in these entries.`

  const { text } = await generateText({
    // Sonnet 5 — this is a Thread (cross-entry pattern finding over ranges up
    // to a full decade). Adaptive thinking stays on: pattern questions benefit,
    // and the UI already shows a spinner. Haiku stays on per-entry Moments.
    model: anthropic('claude-sonnet-5'),
    maxOutputTokens: 8000, // headroom for thinking + a thorough answer
    system: systemPrompt,
    prompt: userPrompt,
  })

  return NextResponse.json({ response: text, entryCount: withText.length })
}
