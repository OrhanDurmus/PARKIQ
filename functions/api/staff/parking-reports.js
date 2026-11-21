import { checkStaffPermission } from '../../_lib/staff-permissions.mjs';
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });
// Isolated staff task endpoint. Existing admin mutation routes are unchanged.
export async function onRequestGet({ request, env }) {
  const gate = await checkStaffPermission(request, env, 'parking_reports.read');
  if (!gate.ok) return reply({ error: gate.error }, gate.status);
  if (!env.DB) return reply({ error: 'storage_unavailable' }, 503);
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected'].includes(status)) return reply({ error: 'invalid_status' }, 400);
  try {
    // Never create or alter schema from a read endpoint.
    const rows = await env.DB.prepare(
      'SELECT id,osm_type,osm_id,lat,lng,name,reason,note,status,created_at FROM parking_accuracy_reports WHERE status=? AND archived_at IS NULL ORDER BY id DESC LIMIT 50'
    ).bind(status).all();
    return reply({ reports: rows.results || [] });
  } catch {
    return reply({ error: 'storage_unavailable' }, 503);
  }
}

/**
 * Staging-only review action. The caller needs a separate moderation grant;
 * read permission alone is never sufficient to change a report.
 */
export async function onRequestPatch({ request, env }) {
  const gate = await checkStaffPermission(request, env, 'parking_reports.moderate');
  if (!gate.ok) return reply({ error: gate.error }, gate.status);
  if (!env.DB) return reply({ error: 'storage_unavailable' }, 503);
  let payload;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return reply({ error: 'invalid_request' }, 400);
    payload = JSON.parse(raw);
  } catch { return reply({ error: 'invalid_request' }, 400); }
  const id = payload?.id;
  const status = payload?.status;
  if (!Number.isSafeInteger(id) || id < 1 || !['approved', 'rejected'].includes(status)) {
    return reply({ error: 'invalid_request' }, 400);
  }
  try {
    // D1 batch executes statements in one transaction: a failed audit must roll back the decision.
    // The audit insert is conditional on a successful pending->reviewed transition.
    if (typeof env.DB.batch !== 'function') return reply({ error: 'audit_unavailable' }, 503);
    const decision = env.DB.prepare(
      "UPDATE parking_accuracy_reports SET status=? WHERE id=? AND status='pending' AND archived_at IS NULL"
    ).bind(status, id);
    const audit = env.DB.prepare(
      "INSERT INTO parking_report_review_audit (report_id, actor_user_id, decision, reviewed_at) SELECT ?, ?, ?, datetime('now') WHERE changes() > 0"
    ).bind(id, gate.userId, status);
    const results = await env.DB.batch([decision, audit]);
    if (!results?.[0]?.meta?.changes) return reply({ error: 'pending_report_not_found' }, 404);
    if (results?.[1]?.meta?.changes !== 1) return reply({ error: 'audit_unavailable' }, 503);
    return reply({ ok: true, id, status });
  } catch { return reply({ error: 'storage_unavailable' }, 503); }
}
