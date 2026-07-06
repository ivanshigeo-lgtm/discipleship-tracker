import { NextRequest, NextResponse } from 'next/server'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

export const runtime = 'nodejs'
export const maxDuration = 60

// "Ask the ghostwriter": rewrite one paragraph of the book draft per the
// author's instruction. Same model that wrote the book, same voice rules.

export async function POST(request: NextRequest) {
  const { paragraph, instruction } = await request.json()
  if (!paragraph || !instruction) {
    return NextResponse.json({ error: 'paragraph and instruction required' }, { status: 400 })
  }

  const { text } = await generateText({
    model: anthropic('claude-opus-4-8'),
    providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
    maxOutputTokens: 4000,
    messages: [{
      role: 'user',
      content: `You are the ghostwriter of "Beauty Past the Ashes," Pastor Jonavan Asato's memoir of the Lahaina fires. He is editing the draft and asks you to rework ONE paragraph.

VOICE: first person as Jonavan — plain, warm, concrete, pastoral; short declaratives when moved; scripture woven naturally; zero self-importance.

RULES:
- Follow his instruction faithfully.
- Do NOT invent facts, names, dialogue, or details that are not in the paragraph or in his instruction. Facts he supplies in the instruction are authoritative — work them in.
- Preserve inline markdown (*italics*, **bold**, and journal-quote intro lines) where it still applies.
- Return ONLY the rewritten paragraph. No preamble, no explanation, no quotes around it.

HIS INSTRUCTION: ${String(instruction).slice(0, 1000)}

THE PARAGRAPH:
${String(paragraph).slice(0, 8000)}`,
    }],
  })

  return NextResponse.json({ rewritten: text.trim() })
}
