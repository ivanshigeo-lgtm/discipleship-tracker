-- Marks an undated imported SOAP as intentionally filed under its year ("misc"),
-- so it stops appearing in the "needs a date" review.
alter table soap_journals add column if not exists date_reviewed boolean not null default false;
