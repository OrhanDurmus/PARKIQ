# Nearby push security rollout (not deployed)

Base: main 9270803. Apply `migrations/nearby_push.sql` followed by the new one-time
`migrations/0007_nearby_push_security.sql` to an isolated test database first.
Do not rerun the ALTER migration. Deploy neither code nor migrations automatically.

The server verifies JWTs through Supabase `/auth/v1/user`, then calls the existing
`rotapark_member_blocked` RPC under that same JWT. Fail closed on auth/ban outages.
No service role key is used. Client user_id is ignored. Both mutations require
an unblocked authenticated account. Only owners can update/delete owned rows.
Legacy unowned rows require both original browser-held push keys to claim/delete.

Limits: 4096 streamed bytes, 5 subscriptions per account, 20 authenticated mutation
attempts/hour (fixed UTC-hour bucket, atomic D1 upsert). Quota enforcement is inside
the subscription INSERT, not a racy count-before-write. Rate state is one row/account;
include removed accounts in future data-retention cleanup. Edge-level/IP limits are
still needed for invalid JWT traffic before the authenticated quota.

Rollout order after separate approval: migration, pause/drain old queue consumers,
updated consumer (which excludes unowned rows), then Pages/client. Old anonymous
subscriptions are not assigned to anyone and no keys are rotated en masse.
Existing users see a renew instruction: turn notifications off then on while signed
in, explicitly confirming location storage/push consent. A compatible caller can
also re-register the existing subscription after explicit consent and JWT login;
legacy key proof permits safe ownership claim. This deliberately pauses legacy
notifications until reconsent. Stage the rollout and communicate that interruption.

Revocation removes the server row when authorized and always unsubscribes locally,
even after logout/ban or an API outage; provider 404/410 cleanup removes expired rows.
Pending server cleanup is reported explicitly. A banned account cannot mutate rows,
but can always stop browser delivery. Stored coordinates still describe last opt-in,
not live location. Bans after enrollment are not rechecked by the delivery worker;
add an authorized ban-to-subscription cleanup flow before promising immediate global
revocation. Queued sends already in flight can race with revocation.

Pre-release: use test accounts in an isolated Preview D1/Supabase environment to test
login/logout, blocked users, two-user ownership, legacy reconsent, quota concurrency,
provider failures and actual PWA/Android push behavior. APK native push remains a
separate integration. Do not merge or deploy as part of this change.
