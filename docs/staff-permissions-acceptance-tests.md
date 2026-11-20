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

## Permission audit history acceptance criteria

The founder-only `rotapark_founder_get_permission_audit(30)` RPC must return an array and the latest records in descending creation order. Admin, moderator, ordinary user, and anonymous requests must be rejected as authorization failures, not treated as passing merely because the RPC is missing. The founder's `p_limit=101` request must fail with SQLSTATE `22023`; other authenticated roles must receive a permission denial before limit validation.

On a **separate staging project only**, perform a founder permission change, verify its audit record has the correct actor ID, role, permission key, previous state, new state, and timestamp, then reverse the permission and confirm a second record. Refresh the founder browser panel and verify both records appear. Audit records must be displayed as plain text; no HTML from database values may be executed. No direct table SELECT access is allowed to authenticated clients.

The audit RPC is read-only; the existing staging probe verifies founder/non-founder access and the query limit but does **not** create audit records or prove the mutation-to-audit transaction is correct. That requires the explicit staging write test above.

## Release readiness status (not evidence of deployment)

- **Automated GitHub checks:** code syntax, smoke, bundle, and Android builds; they do not authenticate against a staging Supabase project.
- **Prepared:** permission schema, founder-only role changes, read-only audit RPC and UI, read-only four-role staging probe.
- **Not yet verified:** separate staging project and four accounts, migration execution, real RPC authorization, audit writes and immediate revocation, Cloudflare Access and browser role testing.
- **Not enabled:** privileged admin/moderator task endpoints. Displayed permission names are informational until those endpoints enforce the same permission on every request.
- **Release gate:** keep PR #368 draft and do not merge into main or deploy Production before the missing checks are evidenced.

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

Run `scripts/probe-staff-staging.mjs` locally against the separate staging Supabase URL, supplying `SUPABASE_STAGING_URL`, `SUPABASE_STAGING_PROJECT_REF` (the 20-character project reference in that URL), `STAGING_TEST_CONFIRMED=yes`, `SUPABASE_STAGING_ANON_KEY`, `STAGING_FOUNDER_JWT`, `STAGING_ADMIN_JWT`, `STAGING_MODERATOR_JWT`, and `STAGING_USER_JWT` as environment variables. The script makes only RPC reads and direct table SELECT attempts, checking founder-only reads, current roles, unknown permission rejection, and denial of direct table SELECT for all four authenticated roles. Do not commit credentials or print JWTs in CI logs. It does not verify writes, audit entries, revocation, or full browser/API security; those still require the manual matrix above.

The probe checks that each JWT issuer matches the staging URL before sending requests. These checks prevent accidental cross-project token use but **do not independently prove the project is non-production**; verify the project in the Supabase dashboard before setting `STAGING_TEST_CONFIRMED=yes`.
