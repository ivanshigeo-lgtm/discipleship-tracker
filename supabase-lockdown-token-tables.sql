-- Lock down sensitive, server-only tables.
-- RLS stays ENABLED; dropping all permissive policies means the anon/authenticated
-- client is denied, while the server's service-role key still bypasses RLS.
-- Verified: google_calendar_tokens is only accessed server-side (service role),
-- and the invite_tokens client functions are unused. No app functionality changes.

-- google_calendar_tokens: holds OAuth refresh tokens. Server (service role) only.
drop policy if exists "Admin can manage all tokens" on google_calendar_tokens;
drop policy if exists "Users can manage their own tokens" on google_calendar_tokens;

-- invite_tokens: server only (current client functions are dead code; activate via
-- a server route if token-based invites are added later).
drop policy if exists "Anyone can read invite tokens" on invite_tokens;
drop policy if exists "Anyone can update invite tokens" on invite_tokens;
drop policy if exists "Coaches can create invite tokens" on invite_tokens;
