-- Duplicate-profile root fix (WikiChurch #5).
--
-- Before this migration NOTHING at the DB level stopped two `people` rows from
-- pointing at the same auth user or (once claimed) the same login email. That is
-- how Kailana ended up with two rows that had to be merged by hand: a coach-made
-- row and a self-signup row, never reconciled. The app-layer claim flow (#3) is
-- the primary fix; these partial unique indexes are the backstop so a race, a bug,
-- or a future code path can never silently mint a duplicate again.
--
-- Both are PARTIAL on purpose:
--   * auth_user_id: only CLAIMED rows have one, and each auth user must map to
--     exactly one person. Unclaimed coach-made rows (auth_user_id IS NULL) are
--     unconstrained — there can be many of those, that is fine.
--   * email: coach-made rows legitimately share or blank an email before the
--     disciple signs up (69 rows currently have null email; two unclaimed pairs
--     currently share an email). So we only enforce uniqueness on the email of a
--     CLAIMED row — i.e. an actual login must be unique, unclaimed rows are free.
--
-- Verified against prod before writing: 0 duplicate auth_user_id groups, and the
-- only duplicate emails are on unclaimed (auth_user_id IS NULL) rows, so neither
-- index conflicts with existing data.

create unique index if not exists ux_people_auth_user_id
  on public.people (auth_user_id)
  where auth_user_id is not null;

create unique index if not exists ux_people_email_claimed
  on public.people (lower(email))
  where auth_user_id is not null and email is not null;
