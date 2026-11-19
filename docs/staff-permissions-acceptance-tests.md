# ROTAPARK — Staff permission acceptance tests

Run against a **separate Supabase staging project**, never the production database.
Apply `supabase/migrations/20261119030000_staff_permissions.sql` only after confirming the existing `rotapark_my_role()` RPC returns `founder`, `admin`, `moderator`, and `user` as expected. Run `supabase/verify_staff_permissions.sql` afterward.

## Required test accounts

Use four staging accounts with verified server-side roles: founder, admin, moderator, user. Use separate sessions, not browser UI visibility as evidence. Never use service-role credentials for these tests: they bypass normal RLS.

## Negative authorization matrix

| Caller | `rotapark_founder_get_role_permissions()` | `rotapark_founder_set_role_permission('moderator','support.read',true)` | `rotapark_staff_has_permission('support.read')` |
|---|---|---|---|
| Anonymous | DENIED | DENIED | false or EXECUTE denied |
| User | DENIED | DENIED | false |
| Moderator | DENIED | DENIED | false by default |
| Admin | DENIED | DENIED | false by default |
| Founder | allowed | allowed | true |

The founder write test must run only on staging. After enabling a moderator permission, moderator reads should become true and admin reads should remain false. Set it back to false and confirm immediate revocation. Unknown permission keys must always return false, including for founder. Check `rotapark_staff_permission_audit` records the change.

Attempt direct `select`, `insert`, `update`, and `delete` on all three permission tables with an authenticated non-founder token: every attempt must fail. Ensure users cannot execute founder RPCs by direct PostgREST calls. Verify a removed staff role loses permissions on the next request.

## Browser / routing tests

- Logged-out and ordinary users do not see the side-menu link. Directly visiting `/staff/` must not reveal staff content.
- Founder sees `/staff/permissions/`, can edit role permissions and sees `/admin/`.
- Admin and moderator see only the staff center and their granted permissions; they must not be offered founder-only Cloudflare Access routes.
- Visiting `/staff/permissions/` as non-founder must not reveal permission data.
- Confirm Cloudflare Access still protects `/admin/*`; UI hiding alone is not an authorization boundary.
- **Do not** enable any privileged staff action endpoints until they verify Supabase JWT, current server-side role, and exact permission on every request.

## Release gate

Do not merge or deploy to Production until staging results and migration review are documented. Existing navigation, GPS, camera, voice, and map code must remain untouched.

## Automated staging read-only probes

Run `scripts/probe-staff-staging.mjs` locally against the separate staging Supabase URL, supplying `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_ANON_KEY`, `STAGING_FOUNDER_JWT`, `STAGING_ADMIN_JWT`, `STAGING_MODERATOR_JWT`, and `STAGING_USER_JWT` as environment variables. The script makes only RPC reads and checks founder-only reads, current roles, and unknown permission rejection. Do not commit credentials or print JWTs in CI logs. It does not verify writes, audit entries, revocation, or full browser/API security; those still require the manual matrix above.
