import { checkStaffPermission } from '../../_lib/staff-permissions.mjs';
const reply = (body, status = 200) => Response.json(body, { status, headers: {
  'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff',
} });
// Isolated, read-only staff task endpoint. Existing admin mutation routes are unchanged.
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
    const result = await env.DB.prepare(
      "UPDATE parking_accuracy_reports SET status=? WHERE id=? AND status='pending' AND archived_at IS NULL"
    ).bind(status, id).run();
    if (!result.meta?.changes) return reply({ error: 'pending_report_not_found' }, 404);
    return reply({ ok: true, id, status });
  } catch { return reply({ error: 'storage_unavailable' }, 503); }
}
