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
