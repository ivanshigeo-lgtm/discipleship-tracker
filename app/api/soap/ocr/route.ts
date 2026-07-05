import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  // Two modes:
  //  • journalId  — OCR an existing entry's photo and update the row (single entry).
  //  • imageUrl   — OCR a photo directly and RETURN the result (no DB write). Used
  //    by bulk import to decide new-entry-vs-continuation before persisting.
  // importYear (optional): also detect the written month/day + classify whether
  // the page starts a new SOAP or continues the previous one.
  const { journalId, imageUrl, importYear } = await request.json()

  if (!journalId && !imageUrl) {
    return NextResponse.json({ error: 'journalId or imageUrl required' }, { status: 400 })
  }

  let photoUrl = imageUrl as string | undefined
  if (!photoUrl) {
    const { data: journal, error: fetchError } = await supabase
      .from('soap_journals')
      .select('*')
      .eq('id', journalId)
      .single()
    if (fetchError || !journal) {
      return NextResponse.json({ error: 'Journal not found' }, { status: 404 })
    }
    if (!journal.photo_url) {
      return NextResponse.json({ error: 'No photo to process' }, { status: 400 })
    }
    photoUrl = journal.photo_url
  }

  if (!photoUrl) {
    return NextResponse.json({ error: 'No photo to process' }, { status: 400 })
  }

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: photoUrl,
          },
          {
            type: 'text',
            text: `This is a handwritten SOAP journal entry (Scripture, Observation, Application, Prayer).

Please extract:
1. The full text exactly as written (preserve line breaks)
2. The scripture reference mentioned (e.g., "John 3:16" or "Psalm 23:1-6")${importYear ? `
3. The date written on the page — the MONTH and DAY only (the year is known to be ${importYear}). Look for any date near the top, like "March 3", "3/3", "Mar 3rd", "Wed 3/3". Return numeric month (1-12) and day (1-31), or null if no date is clearly written.
4. Whether this page STARTS a new SOAP entry or CONTINUES the previous page. It starts a new entry if it has a date near the top and/or opens with a Scripture reference or a clear new-entry heading. It is a continuation if it has no date and begins mid-thought (picks up in the middle of an observation, application, or prayer with no new Scripture heading). Return starts_new: true for a new entry, false for a continuation.` : ''}

Respond in this exact JSON format:
{
  "ocr_text": "the full transcribed text here",
  "scripture_reference": "Book Chapter:Verse" or null if not found${importYear ? `,
  "month": 1-12 or null,
  "day": 1-31 or null,
  "starts_new": true or false` : ''}
}

Only respond with the JSON, no other text.`,
          },
        ],
      },
    ],
  })

  let parsed: {
    ocr_text: string
    scripture_reference: string | null
    month?: number | null
    day?: number | null
    starts_new?: boolean
  }
  try {
    // Strip markdown code fences if the model wrapped its response
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    parsed = { ocr_text: text, scripture_reference: null }
  }

  // If importing and a valid month/day was detected, compute the date.
  let detectedDate: string | null = null
  if (importYear) {
    const y = Number(importYear)
    const m = Number(parsed.month)
    const d = Number(parsed.day)
    const valid =
      Number.isInteger(m) && m >= 1 && m <= 12 &&
      Number.isInteger(d) && d >= 1 && d <= 31 &&
      // reject impossible days (e.g. Feb 30) by round-tripping through Date
      new Date(Date.UTC(y, m - 1, d)).getUTCMonth() === m - 1
    if (valid) detectedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
  }
  // Default to a NEW entry when unsure (safer than wrongly merging).
  const startsNew = parsed.starts_new !== false

  // imageUrl mode (bulk import): return the analysis; the caller decides create-vs-append.
  if (imageUrl) {
    return NextResponse.json({
      ocr_text: parsed.ocr_text,
      scripture_reference: parsed.scripture_reference,
      detected_date: detectedDate,
      starts_new: startsNew,
    })
  }

  // journalId mode: persist onto the existing entry.
  const update: Record<string, unknown> = {
    ocr_text: parsed.ocr_text,
    scripture_reference: parsed.scripture_reference,
    updated_at: new Date().toISOString(),
  }
  if (detectedDate) {
    update.journal_date = detectedDate
    update.date_precision = 'day'
  }

  const { error: updateError } = await supabase
    .from('soap_journals')
    .update(update)
    .eq('id', journalId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save OCR result' }, { status: 500 })
  }

  return NextResponse.json({
    ocr_text: parsed.ocr_text,
    scripture_reference: parsed.scripture_reference,
    detected_date: detectedDate,
  })
}
