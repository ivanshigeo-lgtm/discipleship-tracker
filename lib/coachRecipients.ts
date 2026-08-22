export type CoachLink = {
  discipler_person_id: string
  disciple_person_id: string | null
  pending?: boolean | null
}

// Coaches of `actorId` (accepted connections only). Optionally restrict to
// one recipient — used when a message already has a single `to` person.
export function recipientsForActor(
  connections: CoachLink[],
  actorId: string,
  onlyRecipientId?: string | null,
): string[] {
  const ids = connections
    .filter(c =>
      c.disciple_person_id === actorId &&
      !!c.discipler_person_id &&
      c.discipler_person_id !== actorId &&
      c.pending !== true
    )
    .map(c => c.discipler_person_id)
  const unique = Array.from(new Set(ids))
  if (onlyRecipientId) return unique.filter(id => id === onlyRecipientId)
  return unique
}
