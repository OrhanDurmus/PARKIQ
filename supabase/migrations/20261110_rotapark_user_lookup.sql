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
