# ROTAPARK occupancy rollout (draft PR #268)

This feature is **not active** until the migration, secrets and scheduler are configured.
Keep the PR in draft until the smoke checks and real-device tests pass.

## 1. Database

In the existing ROTAPARK Supabase project's SQL Editor, execute
`supabase/migrations/20261112_occupancy_eta.sql` **once** as the database owner.
Confirm that `public.rotapark_occupancy_snapshots` exists and
`public.rotapark_predict_occupancy(text,integer)` is callable.
The snapshot table has RLS enabled and no direct access for browser users.

## 2. Cloudflare Pages environment

Set these **server-side** variables for the deployment environment:

- `SUPABASE_URL` — existing Supabase project URL
- `SUPABASE_ANON_KEY` — existing public project key
- `SUPABASE_SERVICE_ROLE_KEY` — **secret**, server-side only, never commit or expose in HTML
- `ROTAPARK_OCCUPANCY_INGEST_SECRET` — new long random secret, server-side only

Do not place either secret in `index.html`, GitHub Actions logs or screenshots.

## 3. Connect the isolated Cloudflare Worker to GitHub

In Worker **rotapark-occupancy-cron** → Settings → Builds → Connect:

- Git repository: `OrhanDurmus/PARKIQ`
- Production branch (until PR #268 is merged): `feature/eta-occupancy-and-smart-parking`
- Build command: leave empty
- **Deploy command: `npx wrangler deploy --config workers/wrangler.occupancy.toml`**
- This config targets **only** `rotapark-occupancy-cron`, never the existing Pages app.
- Keep cron disabled until the Pages ingestion API is deployed and secrets are configured.
- After PR is merged, update the Worker production branch to `main`.

## 4. Scheduled collector

Configure a separate trusted Cloudflare Worker Cron Trigger (e.g. every 5 minutes)
to POST to `https://parkiq.pages.dev/api/occupancy-ingest` with
`Authorization: Bearer <ROTAPARK_OCCUPANCY_INGEST_SECRET>`.
Store the same secret as a **Worker secret**, not in the Worker source.
Cron runs only after the Pages endpoint is deployed.

The collector accepts only timestamped, provider-verified live readings.
If İSPARK does not provide a reliable timestamp, it correctly inserts **zero**
rows; do not fabricate freshness or use the receipt time as an observation time.
Repeated runs ignore duplicate observations.

## 5. Verification

1. GitHub Actions: `Smart parking smoke checks` must pass on PR #268.
2. Without a bearer token, `POST /api/occupancy-ingest` must return 401.
3. With a valid secret, the ingestion endpoint must return `ok:true`.
   `inserted:0` with `no_verified_live_rows` is expected if the source lacks timestamps.
4. Confirm database rows, freshness, and RPC output with a signed-in test account.
5. Test driving navigation on an iPhone: 45-second polling, stop/resume cleanup,
   GPS loss, offline behavior, a verified full target and a verified available alternative.
6. Test a departure report, its 15-minute expiry and nearby push notifications.
7. Only after checks pass: merge and publish; keep a rollback commit ready.

**Important:** GPS checks sent by the browser are not cryptographically attested.
The departure-report flow still needs abuse testing before general release.

<!-- Cloudflare Git build trigger: isolated occupancy cron worker -->
