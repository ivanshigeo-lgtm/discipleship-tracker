import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { recipientsForActor, type CoachLink } from './coachRecipients.ts'

const links: CoachLink[] = [
  { discipler_person_id: 'ivan', disciple_person_id: 'kai', pending: false },
  { discipler_person_id: 'coach-b', disciple_person_id: 'kai', pending: false },
  { discipler_person_id: 'other', disciple_person_id: 'stranger', pending: false },
  { discipler_person_id: 'pending-coach', disciple_person_id: 'kai', pending: true },
]

describe('recipientsForActor', () => {
  it('notifies every accepted coach of the disciple, not the church', () => {
    assert.deepEqual(recipientsForActor(links, 'kai').sort(), ['coach-b', 'ivan'])
  })

  it('restricts a directed message to that coach when they are a coach', () => {
    assert.deepEqual(recipientsForActor(links, 'kai', 'ivan'), ['ivan'])
    assert.deepEqual(recipientsForActor(links, 'kai', 'stranger'), [])
  })

  it('does not notify on a pending (unaccepted) connection', () => {
    assert.equal(recipientsForActor(links, 'kai').includes('pending-coach'), false)
  })

  it('does not notify when the actor has no coach', () => {
    assert.deepEqual(recipientsForActor(links, 'nobody'), [])
  })
})
