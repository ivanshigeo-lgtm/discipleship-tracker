# Discipleship Tracker - Model Handoff Document

## Project Overview

This is a **Discipleship Tracker** app designed to help a pastor/leader track people through a 4E discipleship process (Engage → Establish → Equip → Empower). The app supports both one-on-one curriculum meetings and Victory Groups.

**Core Goal**: Help the leader remember to pray for people, track spiritual progress, manage next steps, and maintain relational (not task-oriented) language.

---

## Language & Tone Preferences (Very Important)

- Use **"Next Step"** instead of "Action Item" or "Task"
- Use **"Follow-up Date"** instead of "Due Date"
- Use **"Log Follow-up"** instead of "Mark as Done"
- Use **"Engagements"** as the section name
- Prefer **relational language** over task language
- Prayer requests should show as **"Praying for..."** when active
- When answered, show as a **praise report** with the answered date

---

## Data Model

### Person
- `id`, `name`, `email`, `phone`
- `current_stage`: 'Engage' | 'Establish' | 'Equip' | 'Empower'
- `spiritual_birthday`, `baptism_date`
- `notes`
- `status`: 'Active' | 'Inactive'
- `victory_group_id`
- `created_at`, `updated_at`

### Engagement (Next Steps)
- `id`, `person_id`
- `description`
- `follow_up_date`
- `status`: 'Pending' | 'Completed'

### Prayer Request
- `id`, `person_id`
- `request`
- `status`: 'Active' | 'Answered'
- `answered_date`

### Victory Group
- `id`, `name`
- `meeting_day`, `meeting_time`

---

## Current State of the App (as of latest session)

### What's Working Well
- Add Person form with stage selection
- People list with stage badges and expandable cards
- **Stage progression** — can change a person's stage directly from their card
- **Next Steps** (Engagements) with follow-up dates
- **Prayer Requests** flow:
  - Shows as "Praying for..." when active
  - "Answered" button moves it to Answered section
  - Shows answered date as praise report
- **Victory Groups** sidebar (basic creation)

### What's Missing / Needs Work

1. **Victory Groups Assignment**
   - No way to assign people to groups yet (from person card or group box)
   - No recurring meeting time support

2. **Curriculum Progress**
   - No checkboxes or progress tracking per 4E stage
   - No visibility into what curriculum has been covered

3. **UI Polish**
   - Some contrast issues have been fixed, but more refinement is needed
   - Mobile responsiveness not yet addressed

4. **Prayer Requests**
   - Currently working, but needs final testing on the "Answered" flow

---

## Known Issues

- Occasional "Failed to fetch" errors when Supabase credentials are incorrect
- Some components had missing exports after file overwrites (now fixed)
- Prayer request "Answered" flow was buggy but recently improved

---

## Next Priorities (Recommended Order)

1. **Victory Groups** — Allow assigning people to groups from both the person card and the group box. Add meeting time.
2. **Curriculum Checkboxes** — Add simple progress tracking under each 4E stage.
3. **Better Prayer Request UX** — Ensure "Praying for..." and answered date flow is smooth.
4. **UI Refinement** — Improve overall readability and mobile experience.
5. **Recurring vs One-time Engagements** — Distinguish between recurring meetings and single next steps.

---

## Development Workflow Preferences

- The user prefers **step-by-step** building with clear explanations.
- Likes to test small changes before moving to the next feature.
- Values **relational language** throughout the UI.
- Wants the app to feel supportive of real discipleship, not just a CRM.

---

## Files of Note

- `types/database.ts` — Current TypeScript types
- `lib/supabaseQueries.ts` — All database functions
- `components/PeopleList.tsx` — Main people view with stage changes
- `components/PrayerRequestsList.tsx` — Current prayer request implementation
- `app/page.tsx` — Main dashboard layout

---

**Last Updated**: May 2026
**Current Model Context**: This document was created to allow a smooth transition between models while maintaining full project context.