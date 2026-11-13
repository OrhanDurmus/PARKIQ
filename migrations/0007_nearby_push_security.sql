-- Apply once after migrations/nearby_push.sql, in an isolated test DB first.
-- Do not assign legacy subscriptions to an arbitrary account.
ALTER TABLE nearby_push_subscriptions ADD COLUMN user_id TEXT;
ALTER TABLE nearby_push_subscriptions ADD COLUMN consented_at TEXT;
CREATE INDEX idx_nearby_push_user ON nearby_push_subscriptions(user_id);
CREATE TABLE nearby_push_rate_limits (
 user_id TEXT PRIMARY KEY,
 bucket INTEGER NOT NULL,
 requests INTEGER NOT NULL
);
