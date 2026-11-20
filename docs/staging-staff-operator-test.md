# Staging staff capability verification — safe operator procedure

This procedure does **not** deploy anything and does not require sharing tokens in chat.

1. Deploy PR #376 to a separate Cloudflare Pages Preview/Staging environment. Never use Production.
2. In Preview environment variables confirm `SUPABASE_URL` is the Staging project URL and `SUPABASE_ANON_KEY` is its public publishable/anon key. Do not copy a service-role key into either field.
3. Verify `/api/auth-config` returns `configured:true` for Staging. This response intentionally contains only the public Supabase URL and public key.
4. Confirm the permission migration is already installed in the **Staging** Supabase project, or review and apply it there only. Do not reapply blindly; inspect current grants.
5. Open `/staff/`, then `/staff/capabilities/` using a test account. Confirm the eight permission labels appear and the count matches Founder-defined grants.
6. Repeat with a user, moderator, admin, and founder test account. An ordinary user should receive zero grants; moderator/admin must only receive explicitly enabled grants; founder receives all eight.
7. Revoke a moderator grant from Founder settings and refresh the capability page: the grant must disappear without redeploying.
8. If the auth service is unavailable or the environment variables are absent, all capability requests must fail closed. Do not use Production secrets to test failure behavior.

Endpoints: `GET /api/staff/capability?permission=support.read` (requires a user Bearer token). No mutations are exposed by this endpoint.

**Stop conditions:** Staging and Production Supabase URLs match, permission migration does not match existing schema, any ordinary user gets a grant, or any revoked permission remains granted. Stop deployment and investigate before enabling management actions.
