// Shared staging-ready permission gate for future human-staff API routes.
// This module does not modify existing routes. Fail closed on all upstream failures.
const PERMISSIONS = new Set([
  'parking_reports.read', 'parking_reports.moderate', 'support.read',
  'support.reply', 'users.block', 'announcements.publish',
  'staff.moderators.manage', 'parking_records.edit',
]);
// Never forward a service-role or secret key to Supabase as the public API key.
function isPublicSupabaseKey(key) {
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return true;
  const jwt = /^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(key);
  if (!jwt) return false;
  try {
    const payload = JSON.parse(atob(jwt[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload?.role === 'anon';
  } catch { return false; }
}
const deny = (status, error) => ({
  ok: false, status, error,
});
export async function checkStaffPermission(request, env, permission, fetcher = fetch) {
  if (!PERMISSIONS.has(permission)) return deny(403, 'permission_denied');
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('Authorization') || '');
  if (!match) return deny(401, 'authentication_required');
  const url = String(env?.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = String(env?.SUPABASE_ANON_KEY || '').trim();
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) || !isPublicSupabaseKey(key)) {
    return deny(503, 'authorization_unavailable');
  }
  const headers = { apikey: key, Authorization: 'Bearer ' + match[1] };
  try {
    const userResponse = await fetcher(url + '/auth/v1/user', {
      headers, signal: AbortSignal.timeout(6000),
    });
    if (userResponse.status === 401 || userResponse.status === 403) {
      return deny(401, 'authentication_required');
    }
    if (!userResponse.ok) return deny(503, 'authorization_unavailable');
    const user = await userResponse.json();
    if (typeof user?.id !== 'string' || !user.id) {
      return deny(401, 'authentication_required');
    }
    const rpcResponse = await fetcher(url + '/rest/v1/rpc/rotapark_staff_has_permission', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_permission: permission }),
      signal: AbortSignal.timeout(6000),
    });
    if (!rpcResponse.ok) return deny(503, 'authorization_unavailable');
    const allowed = await rpcResponse.json();
    if (allowed !== true) return allowed === false
      ? deny(403, 'permission_denied')
      : deny(503, 'authorization_unavailable');
    return { ok: true, userId: user.id };
  } catch {
    return deny(503, 'authorization_unavailable');
  }
}
