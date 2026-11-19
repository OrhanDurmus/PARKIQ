-- ROTAPARK staff permission matrix, phase 2.
-- REVIEW and run manually in Supabase SQL editor after reviewing existing role RPC.
-- Does not change existing admin endpoints or navigation.
begin;

create table if not exists public.rotapark_staff_role_permissions (
  staff_role text not null check (staff_role in ('admin','moderator')),
  permission_key text not null check (permission_key in (
    'parking_reports.read','parking_reports.moderate','support.read',
    'support.reply','users.block','announcements.publish',
    'staff.moderators.manage','parking_records.edit')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (staff_role,permission_key)
);

create table if not exists public.rotapark_staff_user_permissions (
  user_id uuid not null references auth.users(id) on delete cascade,
  permission_key text not null check (permission_key in (
    'parking_reports.read','parking_reports.moderate','support.read',
    'support.reply','users.block','announcements.publish',
    'staff.moderators.manage','parking_records.edit')),
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  primary key (user_id,permission_key)
);

create table if not exists public.rotapark_staff_permission_audit (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_role text,
  target_user_id uuid,
  permission_key text not null,
  previous_enabled boolean,
  new_enabled boolean not null,
  created_at timestamptz not null default now(),
  constraint staff_permission_audit_target_check check (
    (target_role is not null and target_user_id is null) or
    (target_role is null and target_user_id is not null))
);

alter table public.rotapark_staff_role_permissions enable row level security;
alter table public.rotapark_staff_user_permissions enable row level security;
alter table public.rotapark_staff_permission_audit enable row level security;
revoke all on public.rotapark_staff_role_permissions from public, anon, authenticated;
revoke all on public.rotapark_staff_user_permissions from public, anon, authenticated;
revoke all on public.rotapark_staff_permission_audit from public, anon, authenticated;

-- Founder-only mutation, protected by existing authoritative role RPC.
create or replace function public.rotapark_founder_set_role_permission(
  p_role text, p_permission text, p_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_old boolean;
begin
  if auth.uid() is null or public.rotapark_my_role() is distinct from 'founder' then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_role not in ('admin','moderator') or p_permission not in (
    'parking_reports.read','parking_reports.moderate','support.read',
    'support.reply','users.block','announcements.publish',
    'staff.moderators.manage','parking_records.edit') or p_enabled is null then
    raise exception 'invalid_permission' using errcode='22023';
  end if;
  select enabled into v_old from public.rotapark_staff_role_permissions
    where staff_role=p_role and permission_key=p_permission for update;
  insert into public.rotapark_staff_role_permissions(staff_role,permission_key,enabled,updated_by)
    values(p_role,p_permission,p_enabled,auth.uid())
    on conflict (staff_role,permission_key) do update set
      enabled=excluded.enabled,updated_at=now(),updated_by=excluded.updated_by;
  insert into public.rotapark_staff_permission_audit(
    actor_id,target_role,permission_key,previous_enabled,new_enabled)
    values(auth.uid(),p_role,p_permission,v_old,p_enabled);
end; $$;

create or replace function public.rotapark_founder_set_user_permission(
  p_user_id uuid, p_permission text, p_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare v_old boolean;
begin
  if auth.uid() is null or public.rotapark_my_role() is distinct from 'founder' then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  if p_user_id is null or p_user_id=auth.uid() or
     p_permission not in ('parking_reports.read','parking_reports.moderate',
       'support.read','support.reply','users.block','announcements.publish',
       'staff.moderators.manage','parking_records.edit') or p_enabled is null then
    raise exception 'invalid_permission' using errcode='22023';
  end if;
  -- Overrides may only be stored for current staff, never for ordinary users.
  if not exists(select 1 from auth.users where id=p_user_id) then
    raise exception 'unknown_user' using errcode='22023';
  end if;
  select enabled into v_old from public.rotapark_staff_user_permissions
    where user_id=p_user_id and permission_key=p_permission for update;
  insert into public.rotapark_staff_user_permissions(user_id,permission_key,enabled,updated_by)
    values(p_user_id,p_permission,p_enabled,auth.uid())
    on conflict (user_id,permission_key) do update set
      enabled=excluded.enabled,updated_at=now(),updated_by=excluded.updated_by;
  insert into public.rotapark_staff_permission_audit(
    actor_id,target_user_id,permission_key,previous_enabled,new_enabled)
    values(auth.uid(),p_user_id,p_permission,v_old,p_enabled);
end; $$;

create or replace function public.rotapark_founder_get_role_permissions()
returns table(staff_role text,permission_key text,enabled boolean)
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or public.rotapark_my_role() is distinct from 'founder' then
    raise exception 'permission_denied' using errcode='42501';
  end if;
  return query select p.staff_role,p.permission_key,p.enabled
    from public.rotapark_staff_role_permissions p order by p.staff_role,p.permission_key;
end; $$;

revoke all on function public.rotapark_founder_set_role_permission(text,text,boolean) from public,anon;
revoke all on function public.rotapark_founder_set_user_permission(uuid,text,boolean) from public,anon;
revoke all on function public.rotapark_founder_get_role_permissions() from public,anon;
grant execute on function public.rotapark_founder_set_role_permission(text,text,boolean) to authenticated;
grant execute on function public.rotapark_founder_set_user_permission(uuid,text,boolean) to authenticated;
grant execute on function public.rotapark_founder_get_role_permissions() to authenticated;

-- Start with all role permissions disabled. Existing privileged endpoints remain unchanged.
commit;
