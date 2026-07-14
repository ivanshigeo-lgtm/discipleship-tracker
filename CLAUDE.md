@AGENTS.md

# Constellation — Discipleship Tracker

A discipleship app for **Grace Bible Maui (GBM)**. It helps leaders shepherd people
through the church's **4E process — Engage → Establish → Equip → Empower** — and
helps disciples see their own growth as a **star maturing in a Jesus-centered
constellation**. The product name shown to users is **"Constellation"**; the repo
is `discipleship-tracker`.

Two intertwined surfaces:
- **Coach CRM** (`/my-constellations`): remember to pray for people, track spiritual
  progress and next steps, run curriculum meetings and Grace/Victory Groups.
- **Disciple self-view** (`/my-journey`): a personal "star" showing milestones, SOAP
  journaling, prayers, and stage progress — plus a decade of imported handwritten SOAP
  journals (OCR'd).

## ⚠️ Read first: this Next.js is not the one you know

The single most important rule (also in `AGENTS.md`, auto-injected each session):
**this repo runs a version of Next.js with breaking changes vs. your training data.**
Before writing or editing any Next.js code, read the relevant guide under
`node_modules/next/dist/docs/` and heed deprecation notices. APIs, conventions, and
file structure may differ. (Deps may not be installed in a fresh checkout — run
`npm install` first if that directory is missing.)

## Tech stack

- **Next.js 16.2.6** (App Router) · **React 19** · **TypeScript** (strict)
- **Tailwind CSS v4** (via `@tailwindcss/postcss`) — global styles in `app/globals.css`
- **Supabase** (Postgres + Auth + Storage) — the entire backend
- **Vercel AI SDK** (`ai` + `@ai-sdk/anthropic`) — OCR, summaries, book generation
- **Google Calendar** integration (`googleapis`) for meeting sync
- Media: `sharp`, `exifr`, `@ffmpeg-installer/ffmpeg` (video transcode), `puppeteer`
- Deployed on **Vercel** (prod alias: `discipleship-tracker-ten.vercel.app`)

## Commands

```bash
npm run dev      # next dev — local at http://localhost:3000
npm run build    # next build
npm run start    # next start (prod server)
npm run lint     # eslint (flat config in eslint.config.mjs)
```

There is **no test suite**. Verify changes by running the app.

## Architecture

### Surfaces & routing (`app/`, App Router)
- `app/page.tsx` → redirects to `/my-journey` (the home surface).
- `app/my-journey/` — the disciple's personal star view. Heavy client component with
  cached-instant-paint (localStorage) then background refresh.
- `app/my-constellations/` — the coach dashboard/CRM (gated to the **Empowered tier**).
  Sidebar-nav sections: Our Journey, Snapshot, Emerging Team, Engagements, Points of
  Action, Groups, Messages, SOAPs.
- `app/my-journey/embed/*` and `app/embed/boot/` — **WikiChurch embed** routes. These
  render the journey (story/star/milestones) inside an external WebView with a
  session hand-off (`/api/embed/session`, magiclink `token_hash`). Be careful with
  viewport/scroll/session assumptions when touching these.
- `app/books/`, `app/book/`, `app/answered/`, `app/setup/`, `app/invite/[personId]/`,
  `app/reset-password/`, `app/privacy/`.
- `app/api/*/route.ts` — ~28 server routes (see below).

### Data layer — two client patterns
1. **Browser (anon key):** `lib/supabaseClient.js` exports `supabase`. Most reads/writes
   go directly from the client through `lib/supabaseQueries.ts`. Note: URL + anon key are
   **hardcoded** in this file (public by design today), and it wraps `fetch` with a 20s
   timeout because a stale session can otherwise hang forever.
2. **Server (service role):** `lib/supabaseServer.ts` (`getSupabaseAdmin()`) and API routes
   build a client from `SUPABASE_SERVICE_ROLE_KEY`, which **bypasses RLS**. Use this only in
   `app/api/*` for privileged operations (uploads, AI, calendar, invite tokens).

**`lib/supabaseQueries.ts` (~1600 lines) is the canonical query module.** Almost every
DB operation has a function here, grouped by domain with `// ===` banners (People,
Engagements, Prayer Requests, Action Items, Victory Groups, Booklet Progress, Stage
Checklists, Group Attendance, Discipleship Connections, SOAP Journals, Invite Tokens,
Messages/Conversations, …). It also implements **in-flight request de-duplication** so
concurrent components sharing a read fire one network request. **Add new queries here**
rather than calling Supabase ad hoc from components.

### Types — `types/database.ts`
The single source of truth for row shapes: `Person`, `Engagement`, `PrayerRequest`,
`VictoryGroup`, `StageChecklistItem`, `DiscipleshipConnection`, `SoapJournal`,
`LevelSignoff`, `Message`/`Conversation*`, `BookletProgress`, `PipelineEvent`, etc.
Keep this in sync when a migration changes the schema.

### Auth — `contexts/AuthContext.tsx`
`AuthProvider` (mounted via `components/Providers.tsx` in the root layout) exposes
`user`, `session`, `profile` (the linked `people` row), `downline` (coaching tree),
and helpers (`signIn`, `signUp`, `resetPassword`, `signOut`, `refreshProfile`,
`canEdit`). Identity maps `auth.uid()` → `people.auth_user_id` → `people.id`. Profile +
downline are cached in localStorage for instant paint on return visits.

### Domain logic — `lib/`
- `curriculum.ts` — the 4 chapter booklets (One2One, Church Community, Making Disciples,
  Empowering Leadership = 32 chapters) + 5 milestones; group-focus → stage mapping.
- `stageLabels.ts` — 4E display names/actions and `stageOrder`.
- `stageChecklistTemplates.ts` — default Tool/Action-Step checklist per stage.
- `empowerForecast.ts` — "time to Empowered leader" forecast from cadence + progress.
- `recurrence.ts`, `googleCalendar.ts` — meeting scheduling / calendar sync.
- `bookCorpus.ts` / `bookForms.ts` / `bookParse.ts` — the "Beauty Past the Ashes" book
  authoring pipeline built from SOAP journals.

### Components — `components/` (~72 files)
Flat top-level components for the coach dashboard; `components/journey/` holds the
disciple star view (StarQuadrants, Milestones, SOAP modals, tour/intro, etc.).
`components/journey/journeyModel.ts` computes journey/badges/ring progress.

### AI routes — `@ai-sdk/anthropic`
Model choice is deliberate per route; **use the current model IDs**:
- `claude-opus-4-8` — book generation/rewrite (`app/api/book*`, `app/api/books/*`)
- `claude-sonnet-5` — SOAP OCR / vision / import / insights / answered-prayer scan
- `claude-haiku-4-5-20251001` — cheap SOAP summaries
When building new AI features default to the latest capable Claude model; follow the
inline comments (e.g. the import route notes Sonnet is ~40% of Opus cost for vision).

## Database & migrations

There is **no ORM and no migration runner**. Schema changes are hand-written SQL files
in the repo root (`supabase-*.sql`) plus `supabase-migrations/` and `supabase-schema.sql`,
**applied manually in the Supabase SQL editor**. When you change the schema:
1. Add a new `supabase-<feature>-migration.sql` (idempotent where possible —
   `if not exists`; "safe" variants exist for some tables).
2. Update `types/database.ts` and any affected `lib/supabaseQueries.ts` functions.
3. Ensure the app still works under the current wide-open RLS (see below).

**RLS status (important):** RLS is enabled on all tables but policies are effectively
`using (true)` — the app is **staff-only** today, so the anon key can read/write broadly.
Only `google_calendar_tokens` and `invite_tokens` are locked to service-role. Real
per-row policies are planned for launch prep. See `docs/RLS_ROLES_PLAN.md` and
`docs/ROADMAP.md` before doing anything security-sensitive. Don't assume the anon key is
trusted long-term.

## Environment variables

Server-only (set in Vercel / `.env`, never committed — `.gitignore` excludes `.env*`):
- `SUPABASE_SERVICE_ROLE_KEY` — service-role DB access in API routes
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (also hardcoded in some clients)
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google Calendar OAuth
- `VERCEL_PROJECT_PRODUCTION_URL` — used to build absolute redirect URLs
- Anthropic API key — read by the AI SDK from its standard env var

## Domain language & UX conventions (follow exactly)

The app is intentionally **relational, not task-oriented / not gamified**. Voice is warm,
encouraging, pastoral (see `design-system/README.md`). Use this vocabulary in UI copy:
- "**Next Step**" — never "Action Item" / "Task"
- "**Follow-up Date**" — never "Due Date"
- "**Log Follow-up**" — never "Mark as Done"
- "**Engagements**" — the meetings/next-steps section
- Prayer requests read "**Praying for…**" while active; answered ones become a
  **praise report** with an answered date
- **Grace Groups** / **Victory Groups** for small groups

The **4E stages**: Engage (Reach) → Establish (Build) → Equip (Train) → Empower (Release).
"Empowered" is the leader tier that unlocks the coach dashboard.

## Conventions & gotchas

- **Path alias:** `@/*` → repo root (see `tsconfig.json`). Match existing files, which
  mostly use relative imports.
- **`force-dynamic` layouts:** root and `my-journey` layouts set `export const dynamic =
  "force-dynamic"` to stop Vercel's edge from serving stale HTML that references an old JS
  bundle after deploy. Keep this when adding top-level layouts.
- **Supabase 1000-row cap:** every `select` is capped at 1000 rows — paginate with
  `.range()` loops for large datasets (learned the hard way on SOAP import).
- **Instant-paint pattern:** journey/dashboard pages hydrate from localStorage, then
  refetch in the background and overwrite. Preserve this when editing those pages.
- **SOAP import** is self-driving: routes self-chain via `after()`, claim photos
  atomically in `processing_started_at`, ~200s budget per call. `soap_journals` carries
  import-only fields (`date_precision`, `source`, `import_batch_id`, `import_seq`,
  `photo_urls`). Undated imports file under `YYYY-01-01` with `date_precision='year'`.
- **`serverExternalPackages`:** `@ffmpeg-installer/ffmpeg` is excluded from bundling and
  its binary is force-included for `/api/video/transcode` (see `next.config.ts`).

## Where things live

| Need | Location |
| --- | --- |
| DB queries (client) | `lib/supabaseQueries.ts` |
| Server/admin DB + AI + uploads | `app/api/*/route.ts`, `lib/supabaseServer.ts` |
| Row/type definitions | `types/database.ts` |
| Auth / current user | `contexts/AuthContext.tsx` |
| 4E stages & curriculum | `lib/stageLabels.ts`, `lib/curriculum.ts`, `lib/stageChecklistTemplates.ts` |
| Coach dashboard | `app/my-constellations/page.tsx` + `components/*` |
| Disciple star view | `app/my-journey/` + `components/journey/*` |
| WikiChurch embeds | `app/my-journey/embed/*`, `app/embed/boot/`, `app/api/embed/session/` |
| Schema migrations | `supabase-*.sql`, `supabase-migrations/`, `supabase-schema.sql` |
| Design/voice/brand | `design-system/` |
| Product plans & status | `docs/ROADMAP.md`, `docs/RLS_ROLES_PLAN.md`, `HANDOFF.md`, `MODEL_HANDOFF.md` |

## Working style

The maintainer prefers **incremental, well-explained changes** tested in small steps, and
cares that the app *feels* like real discipleship support — not a CRM or a game. Match the
surrounding code's style and comment density (this codebase favors explanatory comments on
non-obvious decisions). Confirm before schema changes or anything that could affect live
staff data.
