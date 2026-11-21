import { checkStaffPermission } from '../../_lib/staff-permissions.mjs';

// Read-only staff capability probe. No admin data or mutation endpoints are exposed.
const allowedKeys = new Set([
  'parking_reports.read', 'parking_reports.moderate', 'support.read',
  'support.reply', 'users.block', 'announcements.publish',
  'staff.moderators.manage', 'parking_records.edit',
]);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
export async function onRequestGet({ request, env }) {
  const permission = new URL(request.url).searchParams.get('permission');
  if (!allowedKeys.has(permission)) return json({ error: 'invalid_permission' }, 400);
  const result = await checkStaffPermission(request, env, permission);
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ allowed: true, permission });
}
