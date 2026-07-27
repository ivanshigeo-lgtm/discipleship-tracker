-- Ministry-fit: also capture AI-proposed BRAND-NEW ministries (not on the current
-- roster) that fit the disciple's gifts/personality/passion. Stored alongside the
-- roster-based `suggestions`. Additive; existing rows default to an empty array.
alter table public.ministry_fit_results
  add column if not exists new_ministry_ideas jsonb not null default '[]'::jsonb;

comment on column public.ministry_fit_results.new_ministry_ideas is
  'AI-proposed new ministries [{ name, rationale }] the church does not yet have, grounded in the person''s wiring.';
