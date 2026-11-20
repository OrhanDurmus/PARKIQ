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
