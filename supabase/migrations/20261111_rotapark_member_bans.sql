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
create or replace function public.rotapark_list_members(page_number integer default 1, page_size integer default 25, search_email text default '')
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
