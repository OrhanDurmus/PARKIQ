-- ROTAPARK / rotapark-preview: yalnızca boş Preview Supabase için.
-- Kaynak: OrhanDurmus/PARKIQ @ 927080347ab2a31277ad55b2146feb0a955a8dc8
-- Bu dosya hiçbir veritabanında çalıştırılmadı. Production verisi/anahtarı/UUID yok.
-- /api/occupancy-ingest bu kaynak sürümünde YOK; ingest şeması kapsam dışı.
-- Otomatik migration dizinine bilerek konulmadı.
-- Önkoşul: Supabase auth şeması ve anon/authenticated/service_role rolleri.
-- Hedef ref: dwlphvkcmvuroljxcdnq. Kimlik için oturum GUC'si kullanılmaz.
-- Önkoşul: bağımsız doğrulama sonrası ayrı yönetici adımında kaydedilmiş
-- database düzeyi rotapark.preview_project_ref ayarı (README.md).
-- Bu dosya güven kaydını oluşturmaz; eksik/yanlış kayıtta DURUR.
-- SQL Editor'da transaction'ın TAMAMINI tek seferde çalıştırmak gerekir.
BEGIN;
DO $preview_guard$
DECLARE
 expected_ref constant text := 'dwlphvkcmvuroljxcdnq';
 observed_refs text[];
BEGIN
 -- pg_db_role_setting kalıcı database ayarını okur. SET / SET LOCAL /
 -- set_config ile değiştirilen oturum değerleri bu kataloğu değiştirmez.
 -- Yalnızca bu database'e ait, role özel olmayan kaydı kabul et.
 SELECT pg_catalog.array_agg(pg_catalog.substr(s.setting,
          pg_catalog.length('rotapark.preview_project_ref=') + 1))
 INTO observed_refs
 FROM pg_catalog.pg_db_role_setting AS d
 CROSS JOIN LATERAL pg_catalog.unnest(d.setconfig) AS s(setting)
 WHERE d.setdatabase = (
   SELECT oid FROM pg_catalog.pg_database
   WHERE datname = pg_catalog.current_database()
 )
 AND d.setrole = 0
 AND pg_catalog.starts_with(s.setting, 'rotapark.preview_project_ref=');

 IF observed_refs IS DISTINCT FROM ARRAY[expected_ref]::text[] THEN
  RAISE EXCEPTION 'Kalıcı Preview kimliği eksik veya hedef farklı; README önkoşulunu doğrulayın';
 END IF;
 IF pg_catalog.to_regclass('auth.users') IS NULL
    OR pg_catalog.to_regprocedure('auth.uid()') IS NULL
    OR (SELECT count(*) FROM pg_catalog.pg_roles
        WHERE rolname IN ('anon', 'authenticated', 'service_role')) <> 3 THEN
  RAISE EXCEPTION 'Supabase auth şeması/rolleri eksik; kurulum engellendi';
 END IF;
 -- Tablo dışında eski işlev/sequence/index kalıntıları da boş kurulum değildir.
 IF EXISTS (
   SELECT 1 FROM pg_catalog.pg_class AS c
   JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND pg_catalog.starts_with(c.relname, 'rotapark_')
 ) OR EXISTS (
   SELECT 1 FROM pg_catalog.pg_proc AS p
   JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND pg_catalog.starts_with(p.proname, 'rotapark_')
 ) THEN
  RAISE EXCEPTION 'Bu dosya yalnızca boş Preview kurulumu içindir';
 END IF;
END
$preview_guard$;

-- Kaynak migration: 20261110_rotapark_roles.sql
-- ROTAPARK role management. Run in Supabase SQL Editor.
create table if not exists public.rotapark_staff_roles (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null check(role in ('founder','admin','moderator')),
 assigned_by uuid references auth.users(id),
 assigned_at timestamptz not null default now()
);
alter table public.rotapark_staff_roles enable row level security;
revoke all on public.rotapark_staff_roles from anon, authenticated;
grant select on public.rotapark_staff_roles to authenticated;
drop policy if exists "read own staff role" on public.rotapark_staff_roles;
create policy "read own staff role" on public.rotapark_staff_roles for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.rotapark_my_role()
returns text language sql stable security definer set search_path = ''
as $$ select coalesce((select role from public.rotapark_staff_roles where user_id = (select auth.uid())), 'user') $$;
revoke all on function public.rotapark_my_role() from public;
grant execute on function public.rotapark_my_role() to authenticated;

create or replace function public.rotapark_list_staff()
returns table(user_id uuid, email text, role text, assigned_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
 if (select public.rotapark_my_role()) not in ('founder','admin') then
  raise exception 'Yetkisiz işlem' using errcode='42501';
 end if;
 return query select r.user_id, u.email::text, r.role, r.assigned_at
 from public.rotapark_staff_roles r join auth.users u on u.id=r.user_id
 order by case r.role when 'founder' then 0 when 'admin' then 1 else 2 end, r.assigned_at;
end $$;
revoke all on function public.rotapark_list_staff() from public;
grant execute on function public.rotapark_list_staff() to authenticated;

create or replace function public.rotapark_set_staff_role(target_email text, new_role text)
returns void language plpgsql security definer set search_path = ''
as $$
declare actor_role text; target_id uuid; old_role text;
begin
 actor_role := (select public.rotapark_my_role());
 if actor_role <> 'founder' and not (actor_role='admin' and new_role in ('moderator','user')) then
  raise exception 'Bu rolü atama yetkiniz yok' using errcode='42501';
 end if;
 if new_role not in ('admin','moderator','user') then
  raise exception 'Geçersiz rol';
 end if;
 select id into target_id from auth.users where lower(email)=lower(trim(target_email)) limit 1;
 if target_id is null then raise exception 'Kullanıcı bulunamadı'; end if;
 if target_id=(select auth.uid()) then raise exception 'Kendi rolünüzü değiştiremezsiniz'; end if;
 select role into old_role from public.rotapark_staff_roles where user_id=target_id for update;
 if old_role='founder' then raise exception 'Kurucu rolü değiştirilemez' using errcode='42501'; end if;
 if actor_role='admin' and old_role='admin' then raise exception 'Yönetici rolünü değiştiremezsiniz' using errcode='42501'; end if;
 if new_role='user' then
  delete from public.rotapark_staff_roles where user_id=target_id;
 else
  insert into public.rotapark_staff_roles(user_id,role,assigned_by)
  values(target_id,new_role,(select auth.uid()))
  on conflict(user_id) do update set role=excluded.role,assigned_by=excluded.assigned_by,assigned_at=now();
 end if;
end $$;
revoke all on function public.rotapark_set_staff_role(text,text) from public;
grant execute on function public.rotapark_set_staff_role(text,text) to authenticated;


-- Kaynak migration: 20261110_rotapark_role_audit.sql
-- Apply after 20261110_rotapark_roles.sql
create table if not exists public.rotapark_role_audit (
 id bigint generated always as identity primary key,
 actor_id uuid references auth.users(id) on delete set null,
 target_id uuid references auth.users(id) on delete set null,
 previous_role text,
 new_role text not null,
 occurred_at timestamptz not null default now()
);
alter table public.rotapark_role_audit enable row level security;
revoke all on public.rotapark_role_audit from anon,authenticated;

create or replace function public.rotapark_guard_founder()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='DELETE' then
  if old.role='founder' then raise exception 'Kurucu silinemez' using errcode='42501'; end if;
  return old;
 end if;
 if tg_op='UPDATE' and (old.role='founder' or new.role='founder') then
  if old.role is distinct from new.role or old.user_id is distinct from new.user_id then
   raise exception 'Kurucu değiştirilemez' using errcode='42501';
  end if;
 end if;
 if tg_op='INSERT' and new.role='founder' then
  perform pg_advisory_xact_lock(783421,20261110);
  if exists(select 1 from public.rotapark_staff_roles where role='founder') then
   raise exception 'Kurucu zaten tanımlı' using errcode='42501';
  end if;
 end if;
 return new;
end $$;
drop trigger if exists rotapark_guard_founder_trigger on public.rotapark_staff_roles;
create trigger rotapark_guard_founder_trigger
before insert or update or delete on public.rotapark_staff_roles
for each row execute function public.rotapark_guard_founder();

create or replace function public.rotapark_audit_staff_changes()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 if tg_op='INSERT' then
  insert into public.rotapark_role_audit(actor_id,target_id,previous_role,new_role)
  values (auth.uid(),new.user_id,'user',new.role);
  return new;
 elsif tg_op='UPDATE' then
  if old.role is distinct from new.role then
   insert into public.rotapark_role_audit(actor_id,target_id,previous_role,new_role)
   values (auth.uid(),new.user_id,old.role,new.role);
  end if;
  return new;
 else
  insert into public.rotapark_role_audit(actor_id,target_id,previous_role,new_role)
  values (auth.uid(),old.user_id,old.role,'user');
  return old;
 end if;
end $$;
drop trigger if exists rotapark_audit_staff_trigger on public.rotapark_staff_roles;
create trigger rotapark_audit_staff_trigger
after insert or update or delete on public.rotapark_staff_roles
for each row execute function public.rotapark_audit_staff_changes();

create or replace function public.rotapark_list_role_audit()
returns table(actor_email text,target_email text,previous_role text,new_role text,occurred_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if (select public.rotapark_my_role())<>'founder' then
  raise exception 'Kurucu yetkisi gerekli' using errcode='42501';
 end if;
 return query select a.email::text,t.email::text,l.previous_role,l.new_role,l.occurred_at
 from public.rotapark_role_audit l
 left join auth.users a on a.id=l.actor_id
 left join auth.users t on t.id=l.target_id
 order by l.occurred_at desc limit 100;
end $$;
revoke all on function public.rotapark_list_role_audit() from public;
grant execute on function public.rotapark_list_role_audit() to authenticated;

-- Kaynak migration: 20261110_rotapark_user_lookup.sql
-- Apply in Supabase SQL Editor after the role management migrations.
-- Founder-only exact-email lookup. No public user directory or write access.
create or replace function public.rotapark_find_user(lookup_email text)
returns table(email text, created_at timestamptz, last_sign_in_at timestamptz, email_verified boolean, phone_verified boolean, staff_role text)
language plpgsql stable security definer set search_path=''
as $$
begin
 if (select public.rotapark_my_role()) <> 'founder' then
   raise exception 'Kurucu yetkisi gerekli' using errcode='42501';
 end if;
 if lookup_email is null or length(trim(lookup_email)) > 254 or
    trim(lookup_email) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then
   raise exception 'Geçerli bir e-posta girin';
 end if;
 return query
 select u.email::text,u.created_at,u.last_sign_in_at,
        (u.email_confirmed_at is not null),
        (u.phone_confirmed_at is not null),
        coalesce(r.role,'user')
 from auth.users u
 left join public.rotapark_staff_roles r on r.user_id=u.id
 where lower(u.email)=lower(trim(lookup_email))
 limit 1;
end $$;
revoke all on function public.rotapark_find_user(text) from public;
grant execute on function public.rotapark_find_user(text) to authenticated;

-- Kaynak migration: 20261111_rotapark_members_directory.sql
-- ROTAPARK member directory: founder-only, paginated and read-only.
-- Run after 20261110_rotapark_roles.sql.
create or replace function public.rotapark_list_members(page_number integer default 1, page_size integer default 25, search_email text default '')
returns table(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,email_verified boolean,phone_verified boolean,staff_role text,total_count bigint)
language plpgsql stable security definer set search_path=''
as $$
declare q text;
begin
 if (select public.rotapark_my_role()) <> 'founder' then
  raise exception 'Kurucu yetkisi gerekli' using errcode='42501';
 end if;
 if page_number is null or page_number < 1 or page_number > 100000 or page_size is null or page_size < 1 or page_size > 50 then
  raise exception 'Geçersiz sayfalama';
 end if;
 if length(coalesce(search_email,'')) > 254 then raise exception 'Arama çok uzun'; end if;
 q := lower(trim(coalesce(search_email,'')));
 return query
 select u.id,u.email::text,u.created_at,u.last_sign_in_at,
        (u.email_confirmed_at is not null),(u.phone_confirmed_at is not null),
        coalesce(r.role,'user'),
        count(*) over()
 from auth.users u left join public.rotapark_staff_roles r on r.user_id=u.id
 where q='' or position(q in lower(coalesce(u.email,'')))>0
 order by u.created_at desc,u.id
 limit page_size offset ((page_number-1)*page_size);
end $$;
revoke all on function public.rotapark_list_members(integer,integer,text) from public;
grant execute on function public.rotapark_list_members(integer,integer,text) to authenticated;

-- Kaynak migration: 20261111_rotapark_member_bans.sql
-- Founder-managed platform bans. Apply in Supabase SQL Editor.
create table if not exists public.rotapark_member_bans (
 user_id uuid primary key references auth.users(id) on delete cascade,
 blocked_at timestamptz not null default now(),
 blocked_by uuid references auth.users(id),
 reason text
);
alter table public.rotapark_member_bans enable row level security;
revoke all on public.rotapark_member_bans from anon, authenticated;
create or replace function public.rotapark_member_blocked()
returns boolean language sql stable security definer set search_path=''
as $$select exists(select 1 from public.rotapark_member_bans where user_id=(select auth.uid()))$$;
revoke all on function public.rotapark_member_blocked() from public;
grant execute on function public.rotapark_member_blocked() to authenticated;
create or replace function public.rotapark_set_member_block(target_id uuid, should_block boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if (select public.rotapark_my_role()) <> 'founder' then raise exception 'Kurucu yetkisi gerekli' using errcode='42501'; end if;
 if target_id is null or not exists(select 1 from auth.users where id=target_id) then raise exception 'Üye bulunamadı'; end if;
 if target_id=(select auth.uid()) or exists(select 1 from public.rotapark_staff_roles where user_id=target_id and role='founder') then raise exception 'Kurucu engellenemez'; end if;
 if should_block then
  insert into public.rotapark_member_bans(user_id,blocked_by) values(target_id,(select auth.uid()))
  on conflict(user_id) do nothing;
 else
  delete from public.rotapark_member_bans where user_id=target_id;
 end if;
end $$;
revoke all on function public.rotapark_set_member_block(uuid,boolean) from public;
grant execute on function public.rotapark_set_member_block(uuid,boolean) to authenticated;
drop function if exists public.rotapark_list_members(integer,integer,text);
create function public.rotapark_list_members(page_number integer default 1, page_size integer default 25, search_email text default '')
returns table(user_id uuid,email text,created_at timestamptz,last_sign_in_at timestamptz,email_verified boolean,phone_verified boolean,staff_role text,total_count bigint,blocked boolean)
language plpgsql stable security definer set search_path=''
as $$
declare q text;
begin
 if (select public.rotapark_my_role()) <> 'founder' then raise exception 'Kurucu yetkisi gerekli' using errcode='42501'; end if;
 if page_number is null or page_number < 1 or page_number > 100000 or page_size is null or page_size < 1 or page_size > 50 then raise exception 'Geçersiz sayfalama'; end if;
 if length(coalesce(search_email,'')) > 254 then raise exception 'Arama çok uzun'; end if;
 q:=lower(trim(coalesce(search_email,'')));
 return query select u.id,u.email::text,u.created_at,u.last_sign_in_at,
  u.email_confirmed_at is not null,u.phone_confirmed_at is not null,
  coalesce(r.role,'user'),count(*) over(),b.user_id is not null
 from auth.users u
 left join public.rotapark_staff_roles r on r.user_id=u.id
 left join public.rotapark_member_bans b on b.user_id=u.id
 where q='' or position(q in lower(coalesce(u.email,'')))>0
 order by u.created_at desc,u.id
 limit page_size offset ((page_number-1)*page_size);
end $$;
revoke all on function public.rotapark_list_members(integer,integer,text) from public;
grant execute on function public.rotapark_list_members(integer,integer,text) to authenticated;

-- Kaynak migration: 20261111_rotapark_member_ban_reasons.sql
-- Run once in Supabase SQL Editor after member bans migration.
create or replace function public.rotapark_set_member_block_with_reason(target_id uuid, should_block boolean, block_reason text default null)
returns void language plpgsql security definer set search_path=''
as $$
declare cleaned text := nullif(trim(coalesce(block_reason,'')),'');
begin
 if (select public.rotapark_my_role()) <> 'founder' then raise exception 'Kurucu yetkisi gerekli' using errcode='42501'; end if;
 if target_id is null or not exists(select 1 from auth.users where id=target_id) then raise exception 'Üye bulunamadı'; end if;
 if target_id=(select auth.uid()) or exists(select 1 from public.rotapark_staff_roles where user_id=target_id and role='founder') then raise exception 'Kurucu engellenemez'; end if;
 if length(coalesce(cleaned,'')) > 300 then raise exception 'Engel nedeni en fazla 300 karakter olabilir'; end if;
 if should_block then
  if cleaned is null then raise exception 'Engel nedeni zorunludur'; end if;
  insert into public.rotapark_member_bans(user_id,blocked_by,reason) values(target_id,(select auth.uid()),cleaned)
  on conflict(user_id) do update set blocked_at=now(),blocked_by=excluded.blocked_by,reason=excluded.reason;
 else
  delete from public.rotapark_member_bans where user_id=target_id;
 end if;
end $$;
revoke all on function public.rotapark_set_member_block_with_reason(uuid,boolean,text) from public;
grant execute on function public.rotapark_set_member_block_with_reason(uuid,boolean,text) to authenticated;

create or replace function public.rotapark_my_ban_reason()
returns text language sql stable security definer set search_path=''
as $$ select reason from public.rotapark_member_bans where user_id=(select auth.uid()) $$;
revoke all on function public.rotapark_my_ban_reason() from public;
grant execute on function public.rotapark_my_ban_reason() to authenticated;

create or replace function public.rotapark_founder_ban_reason(target_id uuid)
returns text language plpgsql stable security definer set search_path=''
as $$
begin
 if (select public.rotapark_my_role()) <> 'founder' then raise exception 'Kurucu yetkisi gerekli' using errcode='42501'; end if;
 return (select reason from public.rotapark_member_bans where user_id=target_id);
end $$;
revoke all on function public.rotapark_founder_ban_reason(uuid) from public;
grant execute on function public.rotapark_founder_ban_reason(uuid) to authenticated;

-- Kaynak migration: 20261111_rotapark_otp_preflight.sql
-- Optional OTP preflight, callable ONLY with Supabase service_role.
create or replace function public.rotapark_email_is_blocked(lookup_email text)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists (
  select 1 from auth.users u
  join public.rotapark_member_bans b on b.user_id=u.id
  where lower(u.email)=lower(trim(lookup_email))
 )
$$;
revoke all on function public.rotapark_email_is_blocked(text) from public, anon, authenticated;
grant execute on function public.rotapark_email_is_blocked(text) to service_role;

-- Kaynak migration'larının örtük varsayılan yetkilerini açıklaştır.
-- Mevcut PK indeksleri: staff_roles(user_id), role_audit(id), member_bans(user_id).
-- FK denetimi ve son 100 denetim kaydı sorgusu için ek indeksler:
CREATE INDEX rotapark_staff_roles_assigned_by_idx ON public.rotapark_staff_roles(assigned_by);
CREATE INDEX rotapark_role_audit_actor_idx ON public.rotapark_role_audit(actor_id);
CREATE INDEX rotapark_role_audit_target_idx ON public.rotapark_role_audit(target_id);
CREATE INDEX rotapark_role_audit_occurred_idx ON public.rotapark_role_audit(occurred_at DESC);
CREATE INDEX rotapark_member_bans_blocked_by_idx ON public.rotapark_member_bans(blocked_by);

GRANT USAGE ON SCHEMA public TO authenticated, service_role;
REVOKE ALL ON public.rotapark_staff_roles, public.rotapark_role_audit,
 public.rotapark_member_bans FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rotapark_staff_roles TO authenticated;
-- authenticated: yalnızca kendi rolünü SELECT politikasıyla görür.
-- audit ve bans: doğrudan istemci politikası/yetkisi yok; kontrollü RPC kullanılır.
REVOKE ALL ON SEQUENCE public.rotapark_role_audit_id_seq FROM PUBLIC, anon, authenticated;
-- Trigger işlevleri istemcilerden RPC olarak çağrılamaz.
REVOKE ALL ON FUNCTION public.rotapark_guard_founder(),
 public.rotapark_audit_staff_changes() FROM PUBLIC, anon, authenticated;
-- service_role yalnızca OTP preflight RPC'sinde açıkça yetkilidir.
-- Uygulamanın diğer RPC'leri authenticated rolü ve işlev içi rol kontrollerini kullanır.
-- Preview deployment 6550a78b / kaynak commit 70264e6358340caaa51fd4512aad96f7d0125d40
-- Kaynak: supabase/migrations/20261112_occupancy_eta.sql
-- RotaPark: historical occupancy and ETA-based estimate.
-- Apply in Supabase SQL Editor; no existing tables are modified.
create table if not exists public.rotapark_occupancy_snapshots (
  id bigint generated always as identity primary key,
  parking_id text not null check (length(parking_id) between 1 and 180),
  observed_at timestamptz not null default now(),
  free_spaces integer not null check (free_spaces >= 0),
  capacity integer check (capacity is null or capacity >= 0),
  source text not null default 'provider',
  constraint rotapark_snapshot_unique unique(parking_id, observed_at, source),
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
    case when stats.n < 5 or latest.observed_at is null or latest.observed_at < now() - interval '30 minutes'
      then null
      else greatest(0, round(0.65 * stats.historical_average + 0.35 * latest.free_spaces)::integer)
    end as predicted_free_spaces,
    latest.free_spaces as latest_free_spaces,
    stats.n as sample_count,
    case when stats.n < 5 or latest.observed_at is null or latest.observed_at < now() - interval '30 minutes' then 'insufficient'
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

-- Ingest yalnızca INSERT ... ON CONFLICT DO NOTHING yapar; istemci erişimi yok.
REVOKE ALL ON public.rotapark_occupancy_snapshots FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT ON public.rotapark_occupancy_snapshots TO service_role;
REVOKE ALL ON SEQUENCE public.rotapark_occupancy_snapshots_id_seq FROM PUBLIC, anon, authenticated, service_role;
GRANT USAGE ON SEQUENCE public.rotapark_occupancy_snapshots_id_seq TO service_role;
-- Supabase service_role BYPASSRLS kullanır; anonim INSERT politikası eklenmez.
-- SECURITY DEFINER tahmin RPC'si güvenilir kurulum sahibi olarak SELECT yapar.
COMMIT;
-- Kullanıcı/kurucu seed'i YOK. Kurucu için ayrı bir Preview auth hesabı gerekir;
-- bu dosya Production kullanıcılarını veya rol atamalarını taşımaz.
