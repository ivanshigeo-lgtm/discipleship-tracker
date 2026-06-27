# Roadmap — Constellations (Grace Bible Maui)

Sequencing logic: the app is **staff-only now**, so build/feature churn is free.
Lock down with RLS at **launch prep**, once the schema/flows are stable — changes
after RLS can break things silently. See `docs/RLS_ROLES_PLAN.md` for the security
detail.

## Where we are
- Feature-rich, in active daily use (staff only).
- Crown-jewel tables already locked (`google_calendar_tokens`, `invite_tokens`) —
  zero functionality cost.
- Auth basics fixed (password reset, `site_url` → prod).
- Full RLS + roles plan written; decisions D1–D4 resolved.

## Phase 1 — Build freely (now, staff-only)
Do all schema/flow churn here, before RLS.

- **Outstanding product asks:**
  - **Unify "Constellations" with "My Journey"** + lock the coach view ("My
    Constellations") to the **Empowered tier**. ← starting here
  - **Auto-email the register / resend invite link** (needs an email provider —
    Resend).
- **Role-shaping features** (settle what RLS will encode):
  - **Admin-management toggle** (promote/demote `is_admin`, admin-gated).
  - **Directory view** (`people_directory` = name + color only); repoint broad
    people reads at it.
  - **Owner-managed group membership** (remove disciple self-join; owner adds
    anyone, app-user or not).
- Plus any new features.

## Phase 2 — Pre-launch hardening (when feature set stabilizes)
- Audit client vs service-role writes; move privileged client writes to API routes.
- Write the RLS migration (helpers + per-table policies).
- Test on a throwaway/preview Supabase with a non-admin coach + a disciple account.
- Roll out table-by-table on prod, low-risk first, rollbacks ready.
- Email provider (Resend) wired for invites/notifications at scale.
- Final onboarding/auth polish.

## Phase 3 — Launch
App-store prep, multi-admin onboarding, monitoring.

## Optional anytime (belt-and-suspenders)
- Lock down `prayer_requests` + `soap_journals` sooner — sensitive but low-churn.

## The rule that keeps it safe
The big RLS flip is **tested on a preview with non-admin accounts**, not rushed on
launch day. Locking the roles model in Phase 1 means new tables get correct
policies as they're built — no 16-table big-bang.
