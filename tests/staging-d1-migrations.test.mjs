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
