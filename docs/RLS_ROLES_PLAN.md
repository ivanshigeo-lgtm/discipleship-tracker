# RLS + Roles Plan — Constellations (Grace Bible Maui)

Status: **DRAFT / not implemented.** Goal: before public / app-store launch,
replace the wide-open `using (true)` policies with real per-row enforcement so
the exposed anon key can't be used to read/write data it shouldn't.

## Current state (verified against live DB)
- RLS is **enabled** on all 18 tables, but every policy is effectively
  `using (true) / with check (true)` → anyone with the anon key can do anything.
- Sensitive tables today: `prayer_requests`, `soap_journals`, `people` (PII:
  email/phone/notes/spiritual_birthday/baptism_date), `google_calendar_tokens`
  (OAuth refresh tokens), `messages`/`conversation_*`.
- The **client (anon key) does most queries directly** via `lib/supabaseQueries.ts`.
  API routes under `app/api/*` use the **service role key** (bypasses RLS).
  → Any policy we add must still allow every legitimate client operation, or the
  UI breaks. This is the main risk.

## Roles model
Roles are derived, not stored as a separate column (except `is_admin`):
- **admin** — `people.is_admin = true`. Full read/write everywhere.
- **coach** — a person who disciples others (`discipleship_connections` as
  discipler) or `current_stage = 'Empower'`. Sees/edits their **constellation**
  (downline) + things they own (groups).
- **disciple** — any authenticated person. Sees their **own** data + explicitly
  shared data. Can self-confirm specific milestones and self-join groups.
- **unauthenticated** — no access (except the public invite lookup, below).

Identity mapping: `auth.uid()` → `people.auth_user_id` → `people.id`.

## Helper functions (SECURITY DEFINER, schema `app`)
Definer functions read people/connections *without* re-triggering RLS, which
prevents infinite recursion in policies. All `STABLE`.

```sql
create schema if not exists app;

-- The person row for the logged-in user.
create or replace function app.current_person_id() returns uuid
language sql stable security definer set search_path=public as $$
  select id from people where auth_user_id = auth.uid() limit 1
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path=public as $$
  select coalesce((select is_admin from people where auth_user_id = auth.uid() limit 1), false)
$$;

-- My constellation: me + everyone in my downline (recursive) + my direct coach.
create or replace function app.my_downline() returns setof uuid
language sql stable security definer set search_path=public as $$
  with recursive me as (select app.current_person_id() as id),
  down as (
    select id from me
    union
    select dc.disciple_person_id
    from discipleship_connections dc
    join down on down.id = dc.discipler_person_id
    where dc.disciple_person_id is not null
  )
  select id from down
  union
  select dc.discipler_person_id from discipleship_connections dc
  where dc.disciple_person_id = app.current_person_id()
$$;

-- Groups I own (or admin).
create or replace function app.my_group_ids() returns setof uuid
language sql stable security definer set search_path=public as $$
  select id from victory_groups
  where app.is_admin() or owner_person_id = app.current_person_id()
$$;

-- Group ids whose membership/visibility includes me (for group-scoped reads).
create or replace function app.my_member_group_ids() returns setof uuid
language sql stable security definer set search_path=public as $$
  select victory_group_id from person_victory_groups
  where person_id = app.current_person_id()
$$;
```

## Per-table policy matrix
Legend — who may **SELECT** / **WRITE** (insert/update/delete). "owner" = the
person the row is about (`person_id`); "coach" = a coach in whose downline that
person sits; admin always full.

| Table | SELECT | WRITE |
|---|---|---|
| **people** | self (full); coach → downline; admin → all. *Directory:* see decision D1 below. | self → limited fields; coach → downline; admin → all. INSERT coach/admin. DELETE admin only. |
| **discipleship_connections** | discipler, disciple, admin | discipler, admin |
| **engagements** | owner, their coach, admin | owner's coach, admin |
| **engagement_action_items** | via parent engagement (owner/coach/admin) | owner's coach, admin |
| **stage_checklist_items** | owner, coach, admin | coach/admin; **disciple may upsert own self-confirm labels** (salvation, baptism, One2One, serving, assisting) |
| **booklet_progress** | owner, coach, admin | coach/admin (disciple may update own, per My Journey) |
| **pipeline_events** | owner, coach, admin | **service role only** (written by `updatePersonStage`); no client insert |
| **prayer_requests** | owner, admin, + by `visibility`: coach→coach; group→that person's group members; constellation→same constellation | owner (own), owner's coach, admin |
| **soap_journals** | owner, admin, + by `visibility` (coach/group/constellation); aggregates via existing SECURITY DEFINER leaderboard RPCs | owner, admin |
| **victory_groups** | any authenticated (church can browse/join) | INSERT any auth (creator=owner); UPDATE/DELETE owner or admin |
| **person_victory_groups** | any authenticated (member lists) | group owner/admin; **self-join allowed** (person_id = me) |
| **group_attendance** | group owner, admin, the attendee | group owner, admin |
| **messages** | from/to person only | INSERT sender=self; UPDATE read_at by recipient |
| **conversations / _members / _messages** | conversation members only | members; sender=self for messages |
| **google_calendar_tokens** | **none for client** (owner-only at most); server uses service role | **service role only** |
| **invite_tokens** | coach/admin + service role | coach/admin + service role |

### Example policy shape (prayer_requests SELECT)
```sql
drop policy if exists "prayer read" on prayer_requests;
create policy "prayer read" on prayer_requests for select using (
  app.is_admin()
  or person_id = app.current_person_id()
  or (visibility = 'coach'         and person_id in (select app.my_downline()))
  or (visibility = 'constellation' and person_id in (select app.my_downline()))
  or (visibility = 'group'         and person_id in (
        select person_id from person_victory_groups
        where victory_group_id in (select app.my_member_group_ids())))
);
```

## Sensitive data needing more than row-level RLS
- **people PII** (email, phone, notes, spiritual_birthday, baptism_date): RLS is
  row-level, not column-level. If we want the *church directory* visible to all
  but PII restricted, expose a **view** (`people_directory` = id, name,
  current_stage, avatar) for broad reads and keep the base table coach/admin
  scoped. **Decision D1.**
- **google_calendar_tokens**: never expose to client. Confirm all token reads go
  through API routes (service role). Today `lib/googleCalendar.ts` uses
  `getSupabaseAdmin()` (service role) ✓.

## Client vs service-role audit (do before flipping policies)
1. Grep `lib/supabaseQueries.ts` for every table the **anon client** writes, and
   confirm the new WRITE policy allows it for the acting role. High-risk ones:
   stage_checklist_items (self-confirm), person_victory_groups (self-join),
   prayer_requests/soap_journals (disciple creates), messages.
2. Move any privileged client write that RLS would block to an **API route**
   (service role) — e.g. pipeline_events is already server-only.

## Rollout & testing
1. Write helpers + policies as one migration (`supabase-rls-hardening.sql`).
2. **Test on a branch/preview first** (or a throwaway Supabase project) with two
   accounts: a non-admin coach and a plain disciple. Walk every screen.
3. Roll out **table-by-table** on prod, lowest-risk first
   (google_calendar_tokens, invite_tokens, pipeline_events → then groups →
   then people/prayer/soap last), watching for empty-result breakage.
4. Keep a one-line rollback per table (`using (true)`) ready during cutover.

## Open decisions for Jonavan
- **D1 — Church directory:** can every authenticated member see the basic roster
  (name + stage) of the whole church, or only their own constellation? (Affects
  the GBC Constellation view for non-admins.) Recommend: yes to a *minimal*
  directory view; full PII coach/admin-only.
- **D2 — Coach definition:** is "coach" = has disciples, = stage Empower, or an
  explicit role flag we add? Recommend adding an explicit `people.role` later for
  clarity; derive for now.
- **D3 — Groups browsing:** keep group list visible to all (for self-join), or
  restrict to a person's coach's groups? Current app shows all.
- **D4 — Multi-admin:** how are new admins promoted? (Admin UI toggle on a
  person's profile, gated to existing admins.) Worth building alongside.

## Effort estimate
~1 focused build session for helpers + policies + the directory view, plus a
careful testing pass with non-admin accounts. Best bundled with the auth/
onboarding work (invites, password reset already done) and the multi-admin UI.
