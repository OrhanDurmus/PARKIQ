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
