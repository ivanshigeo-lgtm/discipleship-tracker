import type { SupabaseClient } from '@supabase/supabase-js'

// Gather journal context for a book: entries matching the topic's key words,
// plus the most recent ones, deduped, oldest-first, capped for the prompt.
export async function gatherCorpus(
  supabase: SupabaseClient,
  personId: string,
  seedText: string,
  maxEntries = 80
): Promise<string> {
  const words = seedText.toLowerCase().match(/[a-z]{5,}/g) ?? []
  const keyWords = Array.from(new Set(words)).slice(0, 6)
  const seen = new Set<string>()
  const entries: { journal_date: string; ocr_text: string }[] = []
  for (const w of keyWords) {
    const { data } = await supabase
      .from('soap_journals')
      .select('id, journal_date, ocr_text')
      .eq('person_id', personId)
      .ilike('ocr_text', `%${w}%`)
      .limit(20)
    for (const e of data ?? []) {
      if (!seen.has(e.id)) { seen.add(e.id); entries.push(e) }
    }
  }
  const { data: recent } = await supabase
    .from('soap_journals')
    .select('id, journal_date, ocr_text')
    .eq('person_id', personId)
    .not('ocr_text', 'is', null)
    .order('journal_date', { ascending: false })
    .limit(25)
  for (const e of recent ?? []) {
    if (!seen.has(e.id)) { seen.add(e.id); entries.push(e) }
  }
  entries.sort((a, b) => a.journal_date.localeCompare(b.journal_date))
  return entries
    .slice(0, maxEntries)
    .map(e => `--- ${e.journal_date} ---\n${(e.ocr_text ?? '').slice(0, 700)}`)
    .join('\n\n')
}
