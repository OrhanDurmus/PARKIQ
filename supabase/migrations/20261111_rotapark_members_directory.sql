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
