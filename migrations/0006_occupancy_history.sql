CREATE TABLE IF NOT EXISTS occupancy_history (id INTEGER PRIMARY KEY AUTOINCREMENT, application_id INTEGER NOT NULL, free_spaces INTEGER NOT NULL, capacity INTEGER, recorded_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_occupancy_history_business_time ON occupancy_history(application_id, recorded_at DESC);
