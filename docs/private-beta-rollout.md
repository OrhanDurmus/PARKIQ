# ROTAPARK private beta rollout

Public rotapark.com.tr must serve only the coming-soon landing page. Host the full application on a separate protected hostname using Cloudflare Access identity allowlist (founder and approved testers). Protect every application path, API and alternate Pages hostname; disable or protect preview deployments and direct origin access. Never rely on client-side hiding or a secret URL.

Keep existing production deployment unchanged until explicitly approved. First validate on isolated staging hostnames. Test anonymous requests, authorized accounts, revoked accounts, direct URLs, static assets, API requests and cache isolation. Existing mobile builds pointing at rotapark.com.tr need a separate authenticated beta configuration before switching domains. Do not embed credentials in APKs.

Landing artwork: use founder-supplied original promotional image, not Instagram interface screenshot; crop to artwork and preserve aspect ratio. Add "ÇOK YAKINDA TÜM PLATFORMLARDA". No claim of store availability. Keep launch switch as reversible routing configuration.
