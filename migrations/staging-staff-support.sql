-- Compatible with the existing contact, appeal and reply handlers on a fresh Staging D1.
CREATE TABLE IF NOT EXISTS contact_support_requests (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, topic TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blocked_account_appeals (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS support_admin_replies (
  request_id TEXT PRIMARY KEY, message TEXT NOT NULL, replied_at INTEGER NOT NULL
);
