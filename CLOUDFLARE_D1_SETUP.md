# PARKIQ D1 setup (manual Cloudflare account steps)
1. Cloudflare dashboard > Workers & Pages > D1 > Create database; name it `parkiq-db`.
2. D1 database > Console: run the complete SQL from `schema.sql`.
3. Workers & Pages > PARKIQ Pages project > Settings > Bindings > Add > D1 database. Variable name **DB**, choose `parkiq-db`. Apply to Production and Preview as needed.
4. Pages project > Settings > Variables and Secrets > add encrypted secret **ADMIN_TOKEN**, a random secret of at least 32 characters. Do not commit the secret to GitHub. Configure production environment.
5. Redeploy the Pages project so the new binding and secret are available.
6. Test `/api/business` with a sample application from the business panel. Confirm the application in D1.
7. Admin endpoint: GET `/api/admin/applications`, PATCH `/api/admin/applications` with `Authorization: Bearer <ADMIN_TOKEN>`. Keep the token private. Do not expose it in frontend HTML, screenshots or URLs.

Security/limits: This is an initial API and admin-token foundation, NOT multi-user authentication or a complete secure production admin dashboard. Before publicly promoting the application, add Turnstile/rate limiting, privacy notice/retention policy, verified business ownership and proper account-based login. Approval changes application status only and does not alter public map data. The mailto fallback remains available until D1 is configured.
