import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { anthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'
import { parseManuscript, paraKey } from '../../../../lib/bookParse'

export const runtime = 'nodejs'
export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Whole-book edit: one instruction, swept across the entire manuscript.
// The model works over the numbered paragraph list (with the author's existing
// per-paragraph edits already applied) and returns index-referenced changes,
// which are stored as ordinary book_edits overlays — so every change shows up
// on /book with a teal marker and can be individually restored.

export async function POST(request: NextRequest) {
  const { personId, instruction } = await request.json()
  if (!personId || !instruction) {
    return NextResponse.json({ error: 'personId and instruction required' }, { status: 400 })
  }

  // Load the deployed manuscript + the author's current overlays.
  const origin = process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : request.nextUrl.origin
  const md = await fetch(`${origin}/book/manuscript.md`).then(r => r.text())
  const { data: editRows } = await supabase
    .from('book_edits')
    .select('block_key, edited_text, deleted')
    .eq('person_id', personId)
  const overlays = new Map((editRows ?? []).map(e => [e.block_key, e]))

  // The paragraph universe, as the reader sees it right now.
  const paras = parseManuscript(md)
    .filter((b): b is { kind: 'p'; text: string } => b.kind === 'p')
    .map(b => {
      const ov = overlays.get(paraKey(b.text))
      return {
        original: b.text,
        current: ov ? (ov.deleted ? null : ov.edited_text) : b.text,
      }
    })

  const numbered = paras
    .map((p, i) => (p.current === null ? null : `[P${i}] ${p.current}`))
    .filter(Boolean)
    .join('\n\n')

  const { text } = await generateText({
    model: anthropic('claude-opus-4-8'),
    providerOptions: { anthropic: { thinking: { type: 'adaptive' } } },
    maxOutputTokens: 24000,
    messages: [{
      role: 'user',
      content: `You are the ghostwriter of "Beauty Past the Ashes," Pastor Jonavan Asato's memoir of the Lahaina fires. He is giving you ONE editorial instruction to apply across the WHOLE manuscript. Below are the book's paragraphs, numbered [P0], [P1], ...

HIS INSTRUCTION:
${String(instruction).slice(0, 3000)}

RULES:
- Change ONLY paragraphs the instruction genuinely touches. Most paragraphs should be untouched — do not list them.
- When a paragraph needs changing, rewrite it minimally in his voice (plain, warm, concrete, pastoral). Do not invent new facts beyond what the instruction supplies.
- If a paragraph should be removed entirely, mark it deleted.
- If removing a passage breaks the flow of an adjacent paragraph, you may adjust that adjacent paragraph too (minimally).
- Preserve inline markdown (*italics*, journal-quote intro lines) where it still applies.

Respond ONLY with JSON:
{"edits":[{"p":<number>,"action":"replace","text":"..."} | {"p":<number>,"action":"delete"}],"note":"one sentence summarizing what you changed"}

PARAGRAPHS:
${numbered}`,
    }],
  })

  let parsed: { edits?: Array<{ p?: number; action?: string; text?: string }>; note?: string }
  try {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : text)
  } catch {
    return NextResponse.json({ error: 'The ghostwriter returned an unreadable response — try again.' }, { status: 502 })
  }

  let replaced = 0
  let deleted = 0
  for (const ed of parsed.edits ?? []) {
    const para = paras[Number(ed.p)]
    if (!para || para.current === null) continue
    const isDelete = ed.action === 'delete'
    if (!isDelete && (typeof ed.text !== 'string' || !ed.text.trim())) continue
    const { error } = await supabase
      .from('book_edits')
      .upsert(
        {
          person_id: personId,
          block_key: paraKey(para.original),
          original_excerpt: para.original.slice(0, 300),
          edited_text: isDelete ? null : ed.text!.trim().slice(0, 20000),
          deleted: isDelete,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'person_id,block_key' }
      )
    if (!error) { if (isDelete) deleted++; else replaced++ }
  }

  return NextResponse.json({ replaced, deleted, note: parsed.note ?? '' })
}
