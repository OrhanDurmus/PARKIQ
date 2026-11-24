-- Apply only to the dedicated SHIELD staging D1 database.
CREATE TABLE IF NOT EXISTS shield_quota (
  route TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  subject TEXT NOT NULL,
  used INTEGER NOT NULL CHECK (used > 0),
  PRIMARY KEY (route, bucket, subject)
);

CREATE TABLE IF NOT EXISTS shield_signals (
  route TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  reason TEXT NOT NULL,
  total INTEGER NOT NULL CHECK (total > 0),
  PRIMARY KEY (route, bucket, reason)
);
