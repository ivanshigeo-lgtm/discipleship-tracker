-- Bulk-import handwritten SOAP journals across past years.
-- journal_date stays NOT NULL (27 code usages assume it). Undated imported pages
-- are filed at the year's start (YYYY-01-01) with date_precision='year' — they
-- stay searchable by year but are excluded from calendar day-dots.

alter table soap_journals
  add column if not exists date_precision text not null default 'day'
    check (date_precision in ('day','year')),
  add column if not exists source text not null default 'manual'
    check (source in ('manual','imported')),
  add column if not exists import_batch_id uuid;

create index if not exists soap_journals_person_year_idx
  on soap_journals (person_id, (extract(year from journal_date)));
