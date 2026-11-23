# ROTAPARK — public-domain cutover gate (staging only)

**Status: BLOCKED. Do not change Production, DNS, main, or existing mobile release.**

## Verified repository dependencies (2026-11-23)
- `capacitor.config.json`: Capacitor `server.url` points to `https://rotapark.com.tr`; `allowNavigation` includes that hostname. Previously distributed APKs may continue loading the public origin even after a new build is prepared.
- `scripts/prepare-mobile.cjs` copies the website into `www/`, but a configured remote `server.url` means the app may still load the remote origin at runtime. Creating `www/` alone does not decouple the app.
- `admin/index.html` and Cloudflare Pages Functions rely on application-specific paths. Moving the public landing alone does not migrate the admin/API origin.
- `sw.js` and browser caches require dedicated verification during a hostname change.
- `launch-preview/index.html` is a staging landing candidate, not proof of a deployed production page.

## Required before cutover
1. Choose and verify a protected app origin (candidate: `beta.rotapark.com.tr`) and confirm its Pages deployment and API bindings are correct. A Cloudflare Access login screen alone is not proof that all paths are protected.
2. Protect app HTML, static assets, `/api/*`, `/admin/*`, alternate `*.pages.dev` hostnames, preview URLs and direct origin paths. Confirm anonymous requests are denied. Never put Access service tokens or secrets in client-side HTML or APKs.
3. Confirm Access browser login and token/session behavior **inside Android/iOS Capacitor WebView**, including login redirects, cookies, logout and expired sessions. A successful desktop browser login is insufficient.
4. Create an isolated beta mobile build pointing to the verified protected app origin (or use bundled assets with an explicitly configured API origin). Do not edit the production Capacitor configuration until this build passes device tests.
5. Test parking data, authentication, map, navigation, notifications, admin permissions, API failures and service-worker/cache updates on beta. Verify unauthorized and revoked identities cannot fetch private data.
6. Test already-installed APKs that still reference `rotapark.com.tr`. Provide an update/migration plan; do not assume users have installed the new build.
7. Confirm the public landing renders on phone, tablet and common desktop viewport widths (1366, 1440, 1920 and 2560 px), without changing the approved mobile/tablet artwork. Verify there is no personal phone number, duplicated footer, or false launch claim.
8. Prepare a reversible Cloudflare Pages custom-domain/DNS change and a tested rollback. Only then request explicit approval for the Production switch.

## Automated local gate
Run `node scripts/check-public-landing-cutover.cjs` from the repository root. It is read-only and intentionally returns a nonzero exit code while the mobile configuration points at the public hostname. Passing this check is **necessary, not sufficient**: Cloudflare Access, existing APKs and real devices require separate verification.

## Test matrix (record evidence before approval)

| Check | Anonymous | Approved tester | Revoked tester |
| --- | --- | --- | --- |
| Beta home | Denied | Loads | Denied |
| Beta direct API request | Denied | Authorized response | Denied |
| Beta static assets | Denied if private | Loads | Denied if private |
| Admin and privileged API | Denied | Role-based only | Denied |
| Alternate Pages/preview URL | Denied | Only if approved | Denied |

**Do not treat a redirect or a visible Access login page as conclusive evidence of API or origin protection.**

## Cutover and rollback
- Before: export the current domain mappings, DNS records, Access policies and active Pages deployment IDs; capture passing test evidence.
- Cutover: attach the public host to the landing project only after beta isolation is confirmed and approved.
- After: check public landing, beta app, admin, direct API paths, old mobile builds, caching and TLS.
- Rollback: restore the recorded prior domain mappings and DNS configuration if app availability or privacy checks fail. Retest all paths.

No production deployment or DNS change is authorized by this document.
