import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

const support = readFileSync(new URL('../migrations/staging-staff-support.sql', import.meta.url), 'utf8');
const audit = readFileSync(new URL('../migrations/staging-parking-report-review-audit.sql', import.meta.url), 'utf8');

test('Staging D1 migrations replay without losing existing rows', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(support);
    db.exec(audit);
    db.exec("INSERT INTO contact_support_requests(id,email,topic,message,created_at) VALUES ('fixture','test@example.invalid','topic','message',1)");
    db.exec("INSERT INTO parking_report_review_audit(report_id,actor_user_id,decision) VALUES (1,'fixture','approved')");
    db.exec(support);
    db.exec(audit);
    assert.equal(db.prepare('SELECT count(*) AS n FROM contact_support_requests').get().n, 1);
    assert.equal(db.prepare('SELECT count(*) AS n FROM parking_report_review_audit').get().n, 1);
    assert.throws(() => db.exec("INSERT INTO parking_report_review_audit(report_id,actor_user_id,decision) VALUES (1,'fixture','invalid')"));
  } finally { db.close(); }
});

test('Staging D1 migration can be rolled back in an isolated SQLite transaction', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('BEGIN');
    db.exec(support);
    db.exec(audit);
    db.exec('ROLLBACK');
    assert.equal(db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name IN ('contact_support_requests','blocked_account_appeals','support_admin_replies','parking_report_review_audit')").get().n, 0);
  } finally { db.close(); }
});

test('Staging D1 replay detects a pre-existing incompatible support table instead of treating IF NOT EXISTS as a schema upgrade', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE contact_support_requests (id TEXT PRIMARY KEY, email TEXT NOT NULL)");
    db.exec("INSERT INTO contact_support_requests(id,email) VALUES ('legacy','legacy@example.invalid')");
    db.exec(support);
    db.exec(audit);
    const columns = db.prepare("PRAGMA table_info(contact_support_requests)").all().map(row => row.name);
    const required = ['id', 'email', 'topic', 'message', 'status', 'created_at'];
    const missing = required.filter(name => !columns.includes(name));
    assert.deepEqual(missing, ['topic', 'message', 'status', 'created_at']);
    assert.equal(db.prepare("SELECT email FROM contact_support_requests WHERE id='legacy'").get().email, 'legacy@example.invalid');
    // A successful CREATE TABLE IF NOT EXISTS is not proof of an API-compatible schema.
    assert.throws(() => db.prepare("INSERT INTO contact_support_requests(id,email,topic,message,created_at) VALUES ('new','new@example.invalid','t','m',1)").run(), /no column named topic/);
  } finally { db.close(); }
});
