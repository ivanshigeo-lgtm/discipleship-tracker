-- Store the Google account email that owns the OAuth tokens so we can refuse
-- connecting Ivan's personal Gmail (ivanshigeo@gmail.com) as the church calendar.

alter table public.google_calendar_tokens
  add column if not exists google_account_email text;

comment on column public.google_calendar_tokens.google_account_email is
  'Google account email that owns the OAuth tokens (primary calendar). Used to refuse writes to ivanshigeo@gmail.com.';
