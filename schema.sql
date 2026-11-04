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