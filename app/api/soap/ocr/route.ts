import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  // importYear (optional): when set, also detect the month/day written on the
  // page and file the entry on that date within importYear.
  const { journalId, importYear } = await request.json()

  if (!journalId) {
    return NextResponse.json({ error: 'journalId required' }, { status: 400 })
  }

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

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            image: journal.photo_url,
          },
          {
            type: 'text',
            text: `This is a handwritten SOAP journal entry (Scripture, Observation, Application, Prayer).

Please extract:
1. The full text exactly as written (preserve line breaks)
2. The scripture reference mentioned (e.g., "John 3:16" or "Psalm 23:1-6")${importYear ? `
3. The date written on the page — the MONTH and DAY only (the year is known to be ${importYear}). Look for any date near the top, like "March 3", "3/3", "Mar 3rd", "Wed 3/3". Return numeric month (1-12) and day (1-31), or null if no date is clearly written.` : ''}

Respond in this exact JSON format:
{
  "ocr_text": "the full transcribed text here",
  "scripture_reference": "Book Chapter:Verse" or null if not found${importYear ? `,
  "month": 1-12 or null,
  "day": 1-31 or null` : ''}
}

Only respond with the JSON, no other text.`,
          },
        ],
      },
    ],
  })

  let parsed: { ocr_text: string; scripture_reference: string | null; month?: number | null; day?: number | null }
  try {
    // Strip markdown code fences if the model wrapped its response
    const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    parsed = JSON.parse(clean)
  } catch {
    parsed = { ocr_text: text, scripture_reference: null }
  }

  const update: Record<string, unknown> = {
    ocr_text: parsed.ocr_text,
    scripture_reference: parsed.scripture_reference,
    updated_at: new Date().toISOString(),
  }

  // If importing and a valid month/day was detected, file the entry on that day.
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
    if (valid) {
      detectedDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
      update.journal_date = detectedDate
      update.date_precision = 'day'
    }
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
