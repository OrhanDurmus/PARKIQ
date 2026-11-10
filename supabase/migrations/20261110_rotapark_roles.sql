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

-- IMPORTANT: After running the migration, run the following ONCE with the real
-- founder auth.users UUID from Authentication > Users (not email, not GitHub username):
-- insert into public.rotapark_staff_roles(user_id,role)
-- values ('REPLACE_WITH_FOUNDER_AUTH_UUID'::uuid,'founder')
-- on conflict (user_id) do nothing;
-- Never put the service_role key in browser code.
