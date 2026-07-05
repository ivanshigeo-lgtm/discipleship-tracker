-- Allow multiple SOAP entries per person per day. Required so a single imported
-- photo can split into several dated entries, and so undated imports can coexist
-- (they park at YYYY-01-01). The old one-per-day constraint blocked both.
alter table soap_journals drop constraint if exists soap_journals_person_id_journal_date_key;
