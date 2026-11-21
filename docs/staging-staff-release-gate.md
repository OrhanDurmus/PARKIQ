# ROTAPARK Staging staff center — release gate

Scope: PR #376 combines the staff center UI/permission SQL from PR #368 with a read-only Cloudflare Pages permission gate. **Do not merge into main or deploy to Production.**

## Preconditions
1. Use an isolated Staging/Preview deployment and verify its Supabase project reference and database URL are not Production.
2. Verify Preview environment has SUPABASE_URL and SUPABASE_ANON_KEY (public anon/publishable key only). Never expose service-role credentials in the browser.
3. Confirm the role source (rotapark_my_role, rotapark_staff_roles) is installed and founder identity is correct.
4. Review and manually apply supabase/migrations/20261119030000_staff_permissions.sql **only to Staging Supabase** if not already installed. Do not apply blindly to a database that already contains live grants.
5. Verify migration/RPC behavior with supabase/verify_staff_permissions.sql and staging test accounts. Never run verification against Production.

## Manual acceptance tests (Staging only)
- Anonymous GET /api/staff/capability?permission=support.read → 401, no data.
- Unknown permission → 400, no data.
- Signed-in normal user → 403 for all eight permissions.
- Moderator → 200 only for enabled Moderator permissions; 403 for all disabled permissions.
- Admin → 200 only for enabled Admin permissions; 403 for disabled permissions.
- Founder → 200 for eight recognized permissions; only Founder can update the role permission matrix and see its audit.
- Revoke a permission and verify the next request returns 403 without redeployment.
- Missing/broken Supabase configuration → 503, never 200.
- Check /staff/, /staff/permissions/, and /staff/capabilities/ on mobile and desktop. Check that pages are not cached with user-specific permissions.

## Scope limits
- /api/staff/capability is read-only; it does not protect existing admin endpoints.
- Existing Admin/Moderator mutation endpoints remain unavailable through the new staff UI.
- No real-account staging test or database migration execution has been performed by this PR alone.
- PR #368 remains open; avoid independently merging duplicate staff permission migrations.
