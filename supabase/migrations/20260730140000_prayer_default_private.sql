-- Prayer-request privacy fix: prayers are PRIVATE by default.
--
-- Bug: prayer_requests.visibility defaulted to 'coach', and several create
-- paths omitted/hardcoded a non-private value, so every prayer was auto-shared
-- up the coaching chain and to admins (the admin RLS clause exposes any row
-- with visibility <> 'private'). Result: admins saw everyone's prayers and
-- coaches saw their whole downline's — with no explicit opt-in from the author.
--
-- Model (confirmed w/ user): fully private by default. A prayer is only shared
-- when the author explicitly picks a scope (coach/group/constellation) in the
-- picker. This migration makes the DB honor that and retroactively privatizes
-- the existing rows, which were all created under the old 'coach' default.
--
-- Applied to prod out-of-band on 2026-07-30 via the Management API; this file
-- records it for the repo / future environments.

alter table public.prayer_requests
  alter column visibility set default 'private';

-- Backfill: all 75 existing rows were 'coach' (never an explicit user choice).
-- Reversible — visibility can be re-shared per prayer.
update public.prayer_requests
  set visibility = 'private'
  where visibility <> 'private';
