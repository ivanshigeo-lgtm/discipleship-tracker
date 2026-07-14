# Journey iOS App — Architecture & Phased Plan (started Jul 13, 2026)

**Decision (Jonavan, Jul 13):** bring the Journey app to iOS — hybrid WebView for the
cinematic pieces (intro), native iOS for as much as possible.

## Architecture

- **New standalone Expo app at `~/journey-app`** — same stack and pipeline as iSOAP
  (Expo + expo-router + Supabase JS), so the entire proven TestFlight/ASC toolchain
  (archive → altool, asc_status.mjs patterns, purpose-string rules, Podfile gotchas)
  carries over. Separate repo/folder like soap-app; NOT inside the Next.js tree.
- **Same Supabase project as the web app** (yddjlhdptsundeimugba) — same tables, same
  RLS, same auth users. The app is a second client of the existing backend; server AI
  routes (`/api/soap/*` etc.) are called over HTTPS on the deployed web app.
- **Scope: disciple surface only.** The coach CRM (`/my-constellations`, ~12k lines)
  stays on web. "Journey app" = My Journey.

## Native vs WebView split

| Native (RN) | Why |
|---|---|
| `journeyModel.ts` | 445 lines pure logic — ported verbatim, single source of truth risk noted below |
| Quadrant step lists, self-confirm, sign-off requests | plain data-UI |
| SOAP entry + calendar/streak, prayer entry | plain data-UI (iSOAP has native patterns to borrow) |
| Message coach, conversations, join groups, coach-code connect | plain data-UI |
| Tab shell, auth screens | native feel is the point |

| WebView (hosted embed routes on the deployed Next app) | Why |
|---|---|
| Cinematic intro (Ken Burns, meteor, music) | 25 CSS keyframes + `<audio>`; highest effort / lowest value to rebuild |
| Journey tour + star quadrant constellation rendering | same |
| Book reader (page-peel) if ever needed | same |

WebView approach: add `?embedded=1` routes under `/my-journey/embed/*` on the web app
that render ONLY the cinematic component, receive the Supabase access token via
`postMessage` bridge, and signal completion events back (`intro_done`, `tour_done`).
Native side persists the seen-flags in AsyncStorage (replaces localStorage keys
`journey_intro_seen`, `journey_quadrant_demo_seen`, `journey_badges_seen`).

## Auth

Email/password only at first (same as web — no Sign-in-with-Apple requirement since we
offer no third-party social login). Profile link = `people.auth_user_id`, with the same
email-based auto-relink the web AuthContext does. Coach-code connect calls the existing
`/api/connect-coach`.

## Known risks / rules

- **journeyModel.ts is duplicated** (web + native). Any step/label change must land in
  BOTH copies — same rule as the existing "steps map to stageChecklistTemplates" rule.
- Supabase caps selects at 1,000 rows — paginate with `.range()` (learned Jul 5).
- After every `expo prebuild`: re-verify purpose strings in app.json `ios.infoPlist`
  (ITMS-90683 lesson from iSOAP).
- New ASC app record needed (new bundle ID, same team FDYACJ6R6A). Name/bundle TBD with
  Jonavan before first TestFlight build.

## Phases

1. **Skeleton (now):** scaffold Expo app, Supabase client + auth (sign-in screen),
   profile load, port journeyModel, native home screen showing the 4E quadrants +
   step checklist with live data.
2. **Actions:** self-confirm milestones, SOAP entry + streak, prayer entry, message
   coach, join groups, coach-code connect, sign-off request.
3. **Cinema:** web embed routes + WebView bridge for intro/tour/star; StoryMusic via
   the embed (or expo-audio if we go native later).
4. **Ship:** icon/brand via constellation-design skill, ASC app record, TestFlight
   internal.
