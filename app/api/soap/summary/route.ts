import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const { personId, period = 'week' } = await request.json()

  if (!personId) {
    return NextResponse.json({ error: 'personId required' }, { status: 400 })
  }

  const daysBack = period === 'month' ? 30 : period === 'year' ? 365 : 7
  const startDate = new Date()
  startDate.setDate(startDate.getDate() - daysBack)

  const { data: journals, error: fetchError } = await supabase
    .from('soap_journals')
    .select('journal_date, ocr_text, scripture_reference')
    .eq('person_id', personId)
    .gte('journal_date', startDate.toISOString().split('T')[0])
    .order('journal_date', { ascending: true })

  if (fetchError) {
    return NextResponse.json({ error: 'Failed to fetch journals' }, { status: 500 })
  }

  if (!journals || journals.length === 0) {
    return NextResponse.json({ summary: null, message: 'No journals found for this period' })
  }

  const journalsWithText = journals.filter((j) => j.ocr_text)
  if (journalsWithText.length === 0) {
    return NextResponse.json({ summary: null, message: 'No OCR text available yet' })
  }

  const journalEntries = journalsWithText
    .map((j) => `[${j.journal_date}] ${j.scripture_reference || 'Scripture not noted'}\n${j.ocr_text}`)
    .join('\n\n---\n\n')

  try {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: [
        {
          role: 'user',
          content: `You are a warm, encouraging Christian mentor reviewing someone's SOAP journal entries from the past ${period}.

Here are their journal entries:

${journalEntries}

Please provide a brief, encouraging summary (3-4 sentences) that:
1. Notes any themes or patterns you see in their scripture study
2. Highlights growth or insights from their observations/applications
3. Offers a gentle word of encouragement for their spiritual journey

Keep the tone warm and pastoral, like a caring mentor. Be specific to what they actually wrote - reference their actual scriptures or observations when possible.`,
        },
      ],
    })

    return NextResponse.json({
      summary: text,
      journalCount: journalsWithText.length,
      period,
    })
  } catch (err) {
    console.error('Weekly summary generation error:', err)
    return NextResponse.json({ error: 'Could not gather your week right now. Please try again.' }, { status: 500 })
  }
}
