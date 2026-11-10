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
