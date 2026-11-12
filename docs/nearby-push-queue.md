# ROTAPARK Web Push queue deployment

This branch replaces the old **25-recipient cap** with keyset-paginated fanout.
The queue must be configured **before merging this branch into production**.

1. Create a Cloudflare Queue named `rotapark-nearby-push`.
2. In **Cloudflare Pages → ROTAPARK → Settings → Bindings**, add a Queue **producer** binding named `NEARBY_PUSH_QUEUE` pointing to `rotapark-nearby-push`. Deploy the Pages project again.
3. Deploy `workers/nearby-push-worker.js` as a **separate Cloudflare Worker** with a Queue **consumer** trigger on `rotapark-nearby-push` and a Queue **producer** binding named `NEARBY_PUSH_QUEUE` (same queue; used for pagination and delivery jobs).
4. Bind the same existing ROTAPARK D1 database to the Worker as `DB`.
5. Configure Worker secrets `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY` (same VAPID pair as Pages), and `WEB_PUSH_CONTACT_EMAIL` (a real controlled mailto contact). Never commit private keys.
6. Ensure the existing D1 tables `nearby_push_subscriptions` and `nearby_push_deliveries` are present.
7. Set a Queue dead-letter queue and retry policy, and monitor failures. Test on a Home Screen-installed iPhone PWA.

Do not merge until the consumer is deployed: otherwise reports may enqueue without any notifications being delivered. No fixed 25-recipient cap remains; each page processes up to 100 rows, enqueues eligible recipients, then queues the next page. Cloudflare Queue quotas, retries and billing still apply.

**Limitations:** Delivery dedup uses the existing table and is not a transactional exactly-once guarantee. A provider-accepted push is not proof the device displayed it. Subscription coordinates represent last opt-in location, not continuous live location. A production hardening pass should add reservation leases and report expiry/deletion checks before delivering delayed queue jobs.
