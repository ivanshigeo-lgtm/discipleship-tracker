import { supabase } from './supabaseClient'
import { recipientsForActor, type CoachLink } from './coachRecipients'
import type { CoachNotificationKind, CoachNotificationTarget } from '../types/database'

export type { CoachLink }
export { recipientsForActor }

export async function notifyCoaches(opts: {
  actorPersonId: string
  kind: CoachNotificationKind
  targetType: CoachNotificationTarget
  targetId: string
  preview?: string | null
  onlyRecipientId?: string | null
}): Promise<void> {
  if (!opts.actorPersonId || !opts.targetId) return
  const { data, error } = await supabase
    .from('discipleship_connections')
    .select('discipler_person_id, disciple_person_id, pending')
    .eq('disciple_person_id', opts.actorPersonId)
  if (error || !data?.length) return
  const recipients = recipientsForActor(data as CoachLink[], opts.actorPersonId, opts.onlyRecipientId)
  if (recipients.length === 0) return
  const rows = recipients.map(recipient_person_id => ({
    recipient_person_id,
    actor_person_id: opts.actorPersonId,
    kind: opts.kind,
    target_type: opts.targetType,
    target_id: opts.targetId,
    preview: opts.preview ?? null,
  }))
  await supabase
    .from('coach_notifications')
    .upsert(rows, { onConflict: 'recipient_person_id,kind,target_id', ignoreDuplicates: true })
}
