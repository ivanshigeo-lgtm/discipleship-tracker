import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const { journalIds, question } = await request.json() as {
    journalIds: string[]
    question?: string
  }

  if (!journalIds?.length) {
    return NextResponse.json({ error: 'journalIds required' }, { status: 400 })
  }

  const { data: journals, error } = await supabase
    .from('soap_journals')
    .select('journal_date, ocr_text, scripture_reference')
    .in('id', journalIds)
    .order('journal_date', { ascending: true })

  if (error || !journals?.length) {
    return NextResponse.json({ error: 'Could not fetch entries' }, { status: 500 })
  }

  const entriesText = journals
    .filter(j => j.ocr_text)
    .map(j => {
      const lines = [`--- ${j.journal_date}${j.scripture_reference ? ` (${j.scripture_reference})` : ''} ---`]
      lines.push(j.ocr_text!)
      return lines.join('\n')
    })
    .join('\n\n')

  if (!entriesText.trim()) {
    return NextResponse.json({ error: 'Selected entries have no readable text. Try running "Read this entry" on photo entries first.' }, { status: 400 })
  }

  const isSummary = !question?.trim()

  const systemPrompt = `You are a compassionate spiritual director reviewing SOAP journal entries (Scripture, Observation, Application, Prayer) from a disciple at Grace Bible Maui. Be warm, pastoral, and encouraging. Speak directly to the person in second person ("you"). Keep your response concise and grounded in what they actually wrote.`

  const userPrompt = isSummary
    ? `Here are my SOAP journal entries:\n\n${entriesText}\n\nPlease write an executive summary (3–4 paragraphs) that:\n1. Identifies the recurring spiritual themes and what God seems to be speaking to me\n2. Notes the scripture passages and patterns in what stood out\n3. Highlights the key applications and commitments I am making\n4. Reflects on the tone and trajectory of my prayer life\n5. Ends with a brief encouraging observation about my spiritual growth`
    : `Here are my SOAP journal entries:\n\n${entriesText}\n\nMy question: ${question}\n\nPlease answer based on what I actually wrote in these entries.`

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001'),
    system: systemPrompt,
    prompt: userPrompt,
  })

  return NextResponse.json({ response: text, entryCount: journals.filter(j => j.ocr_text).length })
}
