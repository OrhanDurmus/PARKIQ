-- TASLAK: yalnızca yeni boş rotapark-preview-db için. ÇALIŞTIRILMADI.

-- Kaynak: schema.sql
CREATE TABLE IF NOT EXISTS business_applications (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 district TEXT NOT NULL,
 contact TEXT NOT NULL DEFAULT '',
 kind TEXT NOT NULL DEFAULT '',
 capacity TEXT NOT NULL DEFAULT '',
 fee TEXT NOT NULL DEFAULT '',
 details TEXT NOT NULL DEFAULT '',
 request_type TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_business_applications_status ON business_applications(status,created_at);

-- Kaynak: migrations/0002_business_locations.sql
CREATE TABLE IF NOT EXISTS business_locations (
 application_id INTEGER PRIMARY KEY,
 lat REAL NOT NULL CHECK(lat BETWEEN 40 AND 42.5),
 lng REAL NOT NULL CHECK(lng BETWEEN 26 AND 31),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(application_id) REFERENCES business_applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_business_locations_coords ON business_locations(lat,lng);

-- Kaynak: migrations/0003_occupancy.sql
CREATE TABLE IF NOT EXISTS business_occupancy (application_id INTEGER PRIMARY KEY, token_hash TEXT NOT NULL, free_spaces INTEGER, updated_at TEXT);

-- Kaynak: migrations/0004_business_hours.sql
CREATE TABLE IF NOT EXISTS business_hours (application_id INTEGER PRIMARY KEY, opens_at TEXT, closes_at TEXT, is_24h INTEGER NOT NULL DEFAULT 0);

-- Kaynak: migrations/0005_business_pricing.sql
CREATE TABLE IF NOT EXISTS business_pricing (application_id INTEGER PRIMARY KEY, hourly_price REAL, daily_price REAL, currency TEXT NOT NULL DEFAULT 'TRY', updated_at TEXT NOT NULL DEFAULT (datetime('now')));


-- Kaynak: migrations/0006_occupancy_history.sql
CREATE TABLE IF NOT EXISTS occupancy_history (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL, free_spaces INTEGER NOT NULL, capacity INTEGER, recorded_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_occupancy_history_business_time ON occupancy_history(application_id, recorded_at DESC);


-- Kaynak: migrations/nearby_push.sql
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

