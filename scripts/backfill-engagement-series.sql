-- One-time backfill of public.engagements.series_id for finite recurring
-- series. Standing victory_groups are NOT touched (different table, no end).
--
-- Preferred apply path (same clustering as the web app):
--   npx tsx scripts/backfill-engagement-series.ts          -- dry-run
--   npx tsx scripts/backfill-engagement-series.ts --apply
--
-- This SQL is a fallback for the Supabase SQL editor. It is idempotent
-- (only fills NULL series_id) and uses the same grouping key + cadence
-- windows as lib/engagementSeries.ts. Re-run is a no-op once stamped.
-- Does not send calendar invites.

do $$
declare
  grp record;
  cluster_id uuid;
  dates date[];
  gaps int[];
  g int;
  med numeric;
  cadence text;
  step int;
  max_gap int;
  cluster_dates date[];
  d date;
  prev date;
  weekday_0 int;
  same_weekday boolean;
  same_cal_day boolean;
begin
  for grp in
    select
      created_by_person_id,
      person_id,
      trim(description) as description,
      case
        when follow_up_time is null or btrim(follow_up_time) = '' then ''
        else lpad(split_part(follow_up_time, ':', 1), 2, '0') || ':' ||
             lpad(split_part(split_part(follow_up_time, ':', 2), ':', 1), 2, '0')
      end as tnorm,
      lower(trim(coalesce(meeting_type, ''))) as mt,
      array_agg(id order by follow_up_date, id) as ids,
      array_agg(follow_up_date order by follow_up_date, id) as all_dates
    from public.engagements
    where series_id is null
      and follow_up_date is not null
    group by 1, 2, 3, 4, 5
    having count(*) >= 2
  loop
    select array_agg(x order by x) into dates
    from (select distinct unnest(grp.all_dates) as x) s;

    if coalesce(array_length(dates, 1), 0) < 2 then
      continue;
    end if;

    gaps := array[]::int[];
    for i in 2..array_length(dates, 1) loop
      g := (dates[i] - dates[i - 1]);
      if g > 0 then
        gaps := gaps || g;
      end if;
    end loop;
    if coalesce(array_length(gaps, 1), 0) = 0 then
      continue;
    end if;

    select percentile_cont(0.5) within group (order by x) into med
    from unnest(gaps) as x;

    cadence := null;
    if med >= 6 and med <= 8 then
      cadence := 'weekly'; step := 7;
    elsif med >= 13 and med <= 16 then
      cadence := 'biweekly'; step := 14;
    elsif med >= 19 and med <= 23 then
      cadence := 'triweekly'; step := 21;
    elsif med >= 26 and med <= 35 then
      weekday_0 := extract(dow from dates[1])::int;
      same_weekday := true;
      same_cal_day := true;
      foreach d in array dates loop
        if extract(dow from d)::int <> weekday_0 then
          same_weekday := false;
        end if;
        if abs(extract(day from d)::int - extract(day from dates[1])::int) > 1
           and extract(day from d)::int < 28 then
          same_cal_day := false;
        end if;
      end loop;
      if same_weekday and not same_cal_day then
        cadence := 'monthly-weekday';
      else
        cadence := 'monthly';
      end if;
      step := 30;
    end if;
    if cadence is null then
      continue;
    end if;

    max_gap := step * 3 + 3;
    cluster_dates := array[dates[1]];
    prev := dates[1];
    for i in 2..array_length(dates, 1) loop
      if (dates[i] - prev) <= max_gap then
        cluster_dates := cluster_dates || dates[i];
        prev := dates[i];
      else
        if array_length(cluster_dates, 1) >= 2 then
          cluster_id := gen_random_uuid();
          update public.engagements e
            set series_id = cluster_id
          where e.id = any(grp.ids)
            and e.series_id is null
            and e.follow_up_date = any(cluster_dates);
        end if;
        cluster_dates := array[dates[i]];
        prev := dates[i];
      end if;
    end loop;
    if coalesce(array_length(cluster_dates, 1), 0) >= 2 then
      cluster_id := gen_random_uuid();
      update public.engagements e
        set series_id = cluster_id
      where e.id = any(grp.ids)
        and e.series_id is null
        and e.follow_up_date = any(cluster_dates);
    end if;
  end loop;
end $$;
