import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const { journalId } = await request.json()

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
2. The scripture reference mentioned (e.g., "John 3:16" or "Psalm 23:1-6")

Respond in this exact JSON format:
{
  "ocr_text": "the full transcribed text here",
  "scripture_reference": "Book Chapter:Verse" or null if not found
}

Only respond with the JSON, no other text.`,
          },
        ],
      },
    ],
  })

  let parsed: { ocr_text: string; scripture_reference: string | null }
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = { ocr_text: text, scripture_reference: null }
  }

  const { error: updateError } = await supabase
    .from('soap_journals')
    .update({
      ocr_text: parsed.ocr_text,
      scripture_reference: parsed.scripture_reference,
      updated_at: new Date().toISOString(),
    })
    .eq('id', journalId)

  if (updateError) {
    return NextResponse.json({ error: 'Failed to save OCR result' }, { status: 500 })
  }

  return NextResponse.json({
    ocr_text: parsed.ocr_text,
    scripture_reference: parsed.scripture_reference,
  })
}
