-- RotaPark: historical occupancy and ETA-based estimate.
-- Apply in Supabase SQL Editor; no existing tables are modified.
create table if not exists public.rotapark_occupancy_snapshots (
  id bigint generated always as identity primary key,
  parking_id text not null check (length(parking_id) between 1 and 180),
  observed_at timestamptz not null default now(),
  free_spaces integer not null check (free_spaces >= 0),
  capacity integer check (capacity is null or capacity >= 0),
  source text not null default 'provider',
  constraint rotapark_snapshot_capacity_check check (capacity is null or free_spaces <= capacity)
);
create index if not exists rotapark_occupancy_snapshots_lookup
  on public.rotapark_occupancy_snapshots (parking_id, observed_at desc);
alter table public.rotapark_occupancy_snapshots enable row level security;
revoke all on public.rotapark_occupancy_snapshots from anon, authenticated;
-- Insert snapshots through a trusted server using the service role, never from browser clients.

create or replace function public.rotapark_predict_occupancy(
  p_parking_id text,
  p_eta_minutes integer
)
returns table (
  predicted_free_spaces integer,
  latest_free_spaces integer,
  sample_count integer,
  confidence text,
  latest_observed_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  with target as (
    select now() + make_interval(mins => greatest(0, least(p_eta_minutes, 240))) as arrival
  ),
  latest as (
    select s.free_spaces, s.observed_at
    from public.rotapark_occupancy_snapshots s
    where s.parking_id = p_parking_id
    order by s.observed_at desc
    limit 1
  ),
  comparable as (
    select s.free_spaces
    from public.rotapark_occupancy_snapshots s cross join target t
    where s.parking_id = p_parking_id
      and s.observed_at >= now() - interval '56 days'
      and s.observed_at < now() - interval '1 hour'
      and extract(isodow from s.observed_at at time zone 'Europe/Istanbul') =
          extract(isodow from t.arrival at time zone 'Europe/Istanbul')
      and abs(extract(epoch from (
        (s.observed_at at time zone 'Europe/Istanbul')::time -
        (t.arrival at time zone 'Europe/Istanbul')::time
      ))) <= 3600
  ),
  stats as (
    select count(*)::integer n, avg(free_spaces) historical_average from comparable
  )
  select
    case when stats.n < 5 or latest.observed_at < now() - interval '30 minutes'
      then null
      else greatest(0, round(0.65 * stats.historical_average + 0.35 * latest.free_spaces)::integer)
    end as predicted_free_spaces,
    latest.free_spaces as latest_free_spaces,
    stats.n as sample_count,
    case when stats.n < 5 or latest.observed_at < now() - interval '30 minutes' then 'insufficient'
         when stats.n >= 20 then 'high'
         else 'medium' end as confidence,
    latest.observed_at as latest_observed_at
  from stats left join latest on true
  where p_parking_id is not null and length(p_parking_id) between 1 and 180
    and p_eta_minutes between 0 and 240;
$$;
revoke all on function public.rotapark_predict_occupancy(text, integer) from public, anon;
grant execute on function public.rotapark_predict_occupancy(text, integer) to authenticated, service_role;
-- SECURITY DEFINER is required because authenticated users cannot SELECT snapshots.
-- The function has no dynamic SQL, fixes its search_path, and returns aggregate results only.
-- Run migration as the trusted database owner (Supabase SQL Editor), not an untrusted role.
