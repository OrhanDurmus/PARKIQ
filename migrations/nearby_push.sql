-- Nearby parking push subscriptions (Cloudflare D1)
-- Apply to production DB before enabling subscription UI.
CREATE TABLE IF NOT EXISTS nearby_push_subscriptions (
 endpoint_hash TEXT PRIMARY KEY,
 endpoint TEXT NOT NULL,
 p256dh TEXT NOT NULL,
 auth TEXT NOT NULL,
 latitude REAL NOT NULL CHECK(latitude BETWEEN -90 AND 90),
 longitude REAL NOT NULL CHECK(longitude BETWEEN -180 AND 180),
 updated_at TEXT NOT NULL DEFAULT (datetime('now')),
 created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nearby_push_updated ON nearby_push_subscriptions(updated_at);
CREATE TABLE IF NOT EXISTS nearby_push_deliveries (
 report_id TEXT NOT NULL,
 endpoint_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 PRIMARY KEY(report_id,endpoint_hash)
);

-- Apply ONCE to existing production D1, not by re-running the CREATE TABLE above:
-- ALTER TABLE nearby_push_subscriptions ADD COLUMN owner_id TEXT;
-- CREATE INDEX IF NOT EXISTS idx_nearby_push_owner ON nearby_push_subscriptions(owner_id);
-- Existing subscriptions have no owner and are intentionally skipped until re-enabled.
