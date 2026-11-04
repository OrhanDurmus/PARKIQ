CREATE TABLE IF NOT EXISTS business_locations (
 application_id INTEGER PRIMARY KEY,
 lat REAL NOT NULL CHECK(lat BETWEEN 40 AND 42.5),
 lng REAL NOT NULL CHECK(lng BETWEEN 26 AND 31),
 created_at TEXT NOT NULL DEFAULT (datetime('now')),
 FOREIGN KEY(application_id) REFERENCES business_applications(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_business_locations_coords ON business_locations(lat,lng);