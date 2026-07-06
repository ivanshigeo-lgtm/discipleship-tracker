// The four dials of a book: FORM (what it is), LENS (what the scan hunts for),
// ADD-ONS (per-unit reader engagement), VOICE (register). Shared by the
// suggestion scan, interview generation, and the drafting engine.

export type BookForm = 'memoir' | 'devotional' | 'teaching' | 'testimony' | 'letters'
export type BookLens = 'auto' | 'event' | 'topic' | 'person' | 'answered' | 'whole_life'
export type BookVoice = 'my_voice' | 'talk_story' | 'teaching' | 'meditative'

export type BookDials = {
  form: BookForm
  lens: BookLens
  lensDetail: string
  duration: number | null // devotionals only: 30 / 60 / 90
  addons: string[] // 'questions' | 'challenges' | 'prayers' | 'journaling'
  voice: BookVoice
}

export const FORM_LABELS: Record<BookForm, { label: string; desc: string }> = {
  memoir: { label: '📖 Story / Memoir', desc: 'Narrative chapters — a season or arc told as story' },
  devotional: { label: '🌅 Devotional', desc: 'Daily readings: scripture, reflection, prayer' },
  teaching: { label: '🎓 Teaching', desc: 'Structured lessons on a subject, with application' },
  testimony: { label: '🙏 Testimony collection', desc: 'Short standalone faith stories' },
  letters: { label: '✉️ Legacy letters', desc: 'Written to someone — your kids, your church' },
}

export const LENS_LABELS: Record<BookLens, string> = {
  auto: 'Let the scan decide',
  event: 'An event or season',
  topic: 'A topic or theme',
  person: 'A person or relationship',
  answered: 'Answered prayers',
  whole_life: 'The whole journey',
}

export const VOICE_LABELS: Record<BookVoice, string> = {
  my_voice: 'My voice (from my journals)',
  talk_story: 'Talk-story conversational',
  teaching: 'Teaching / expository',
  meditative: 'Quiet & meditative',
}

export const ADDON_LABELS: Record<string, string> = {
  questions: 'Reflection questions',
  challenges: 'Challenges / action steps',
  prayers: 'Prayer prompts',
  journaling: 'Journaling space',
}

// ── Prompt fragments ──

export function formSpec(d: BookDials): string {
  switch (d.form) {
    case 'devotional':
      return `FORM: a ${d.duration ?? 30}-DAY DEVOTIONAL. Each day is a unit of roughly 300-450 words: a dated day number and title, one scripture (prefer passages the author's journals actually dwell on), a grounded reflection that uses the author's real material, and a closing prayer${d.addons.includes('challenges') ? ', then a one-line challenge for the reader' : ''}${d.addons.includes('questions') ? ', plus one reflection question' : ''}. Days build across the arc — not 30 disconnected thoughts.`
    case 'teaching':
      return `FORM: a TEACHING book. Each chapter is a lesson: a principle named plainly, grounded in scripture and in the author's lived material (journals + interview), ending with application${d.addons.includes('questions') ? ' and 2-3 discussion questions (small-group usable)' : ''}${d.addons.includes('challenges') ? ' and a concrete challenge' : ''}. Teach like a pastor who has lived it, not a lecturer.`
    case 'testimony':
      return `FORM: a TESTIMONY COLLECTION. Each chapter is one short, complete faith story (800-1,500 words): the situation, the prayer or need, what happened, and what it taught — the author's own words from journals quoted where they land hardest${d.addons.includes('prayers') ? '. Each story closes with a short prayer the reader can borrow' : ''}.`
    case 'letters':
      return `FORM: LEGACY LETTERS. Each chapter is a letter written directly to the recipient(s) named in the premise — second person, intimate, unhurried. Each letter carries one thing the author needs them to know, anchored in a real story or journal moment${d.addons.includes('prayers') ? ', and ends with a blessing-prayer over them' : ''}.`
    default:
      return `FORM: a narrative MEMOIR. Chapters of 1,500-2,400 words telling the story with scenes, honesty, and the author's own journal lines quoted where they land hardest${d.addons.includes('questions') ? '. Each chapter ends with 2-3 reflection questions for the reader' : ''}${d.addons.includes('challenges') ? ' and one challenge to act on' : ''}.`
  }
}

export function lensSpec(d: BookDials): string {
  const detail = d.lensDetail.trim() ? ` — specifically: ${d.lensDetail.trim()}` : ''
  switch (d.lens) {
    case 'event': return `LENS: center the book on an event or season${detail}.`
    case 'topic': return `LENS: center the book on a topic or theme${detail}.`
    case 'person': return `LENS: center the book on a person or relationship${detail}.`
    case 'answered': return `LENS: center the book on prayers that were later answered${detail}.`
    case 'whole_life': return `LENS: the whole span of the journals — the long arc${detail}.`
    default: return detail ? `LENS: the author suggests: ${d.lensDetail.trim()}.` : ''
  }
}

export function voiceSpec(d: BookDials): string {
  switch (d.voice) {
    case 'talk_story': return 'VOICE: talk-story — conversational, unhurried, like the author telling it on a lanai; contractions welcome, formality out.'
    case 'teaching': return 'VOICE: clear teaching register — direct statements, numbered thinking where natural, still warm.'
    case 'meditative': return 'VOICE: quiet and meditative — shorter sentences, white space, room to breathe; invites stillness rather than momentum.'
    default: return "VOICE: the author's own — match the register heard in the journal entries and interview answers."
  }
}

export function journalingNote(d: BookDials): string {
  return d.addons.includes('journaling')
    ? 'Include, at the end of each unit, a line: *Journal: <one specific prompt>* — the print edition leaves space below it.'
    : ''
}

export function dialsSummary(d: BookDials): string {
  return [formSpec(d), lensSpec(d), voiceSpec(d), journalingNote(d)].filter(Boolean).join('\n')
}

export function scanKeyOf(d: BookDials): string {
  return [d.form, d.lens, d.lensDetail.trim().toLowerCase().slice(0, 40), d.duration ?? '', [...d.addons].sort().join('+'), d.voice].join('|')
}

export function normalizeDials(raw: Partial<BookDials> | undefined): BookDials {
  const forms: BookForm[] = ['memoir', 'devotional', 'teaching', 'testimony', 'letters']
  const lenses: BookLens[] = ['auto', 'event', 'topic', 'person', 'answered', 'whole_life']
  const voices: BookVoice[] = ['my_voice', 'talk_story', 'teaching', 'meditative']
  const form = forms.includes(raw?.form as BookForm) ? (raw!.form as BookForm) : 'memoir'
  return {
    form,
    lens: lenses.includes(raw?.lens as BookLens) ? (raw!.lens as BookLens) : 'auto',
    lensDetail: String(raw?.lensDetail ?? '').slice(0, 200),
    duration: form === 'devotional' ? ([30, 60, 90].includes(Number(raw?.duration)) ? Number(raw?.duration) : 30) : null,
    addons: Array.isArray(raw?.addons) ? (raw!.addons as string[]).filter(a => a in ADDON_LABELS).slice(0, 4) : [],
    voice: voices.includes(raw?.voice as BookVoice) ? (raw!.voice as BookVoice) : 'my_voice',
  }
}
