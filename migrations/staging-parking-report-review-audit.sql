-- Staging D1 only. Apply once after verifying the selected database.
-- Do not apply to Production.
CREATE TABLE IF NOT EXISTS parking_report_review_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id INTEGER NOT NULL,
  actor_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  reviewed_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_parking_report_review_audit_report
ON parking_report_review_audit (report_id, reviewed_at);
