-- Multi-day weekly meetings: a group can meet more than one day a week
-- (e.g. Tuesday AND Thursday). meeting_day stays the primary/first day so
-- existing readers keep working; meeting_days is the full list. App writes
-- keep the two in sync (meeting_day = meeting_days[1]).
alter table victory_groups add column if not exists meeting_days text[];

update victory_groups
set meeting_days = array[meeting_day]
where meeting_day is not null and meeting_days is null;
