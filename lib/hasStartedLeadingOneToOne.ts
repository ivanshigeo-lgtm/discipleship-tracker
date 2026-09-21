// True when this person has already started leading a 1:1 — either as a
// discipler on a discipleship_connection, or by creating a Making Disciples /
// One2One engagement. Used to open Add Person / Constellations without waiting
// for full Empower sign-off (Ivan product ask via Jarvis, 2026-09-21).
import { supabase } from './supabaseClient'

export const hasStartedLeadingOneToOne = async (personId: string): Promise<boolean> => {
  const { count: connCount, error: connErr } = await supabase
    .from('discipleship_connections')
    .select('id', { count: 'exact', head: true })
    .eq('discipler_person_id', personId)
  if (!connErr && (connCount ?? 0) > 0) return true

  const { count: engCount, error: engErr } = await supabase
    .from('engagements')
    .select('id', { count: 'exact', head: true })
    .eq('created_by_person_id', personId)
    .in('meeting_type', ['Making Disciples', 'One2One'])
  if (engErr) return false
  return (engCount ?? 0) > 0
}
