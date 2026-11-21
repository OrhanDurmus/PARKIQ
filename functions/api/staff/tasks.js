import { checkStaffPermission } from '../../_lib/staff-permissions.mjs';
import { publishFlashMessage } from '../../_lib/flash-message.mjs';

const json = (body, status = 200) => Response.json(body, {status, headers: {'Cache-Control':'no-store'}});
const sources = new Map([['contact','contact_support_requests'], ['appeal','blocked_account_appeals']]);
const uuid = /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i;

export async function onRequest({request, env}) {
  const url = new URL(request.url);
  const task = url.searchParams.get('task');
  const read = request.method === 'GET';
  if (!read && request.method !== 'POST') return json({}, 405);
  const permission = new Map([
    ['support', read ? 'support.read' : 'support.reply'],
    ['parking','parking_records.edit'], ['announce','announcements.publish']
  ]).get(task);
  if (!permission || (task === 'announce' && read)) return json({}, 404);
  const check = async key => {
    const gate = await checkStaffPermission(request, env, key);
    return gate.ok ? null : json({error:gate.error}, gate.status);
  };
  const denied = await check(permission);
  if (denied) return denied;
  try {
    if (task === 'announce') return await publishFlashMessage(request, env);
    const db = env.DB;
    if (!db) return json({}, 503);
    if (task === 'support' && !read) {
      const deniedRead = await check('support.read');
      if (deniedRead) return deniedRead;
    }
    const table = sources.get(url.searchParams.get('source') || 'contact');
    if (task === 'support' && !table) return json({}, 400);
    if (read) {
      const offset = Number(url.searchParams.get('offset') || 0);
      if (!Number.isSafeInteger(offset) || offset < 0) return json({}, 400);
      let query;
      if (task === 'support') {
        const archive = url.searchParams.get('archive') === '1';
        const topic = table === 'contact_support_requests' ? 't.topic' : "'Engel itirazı'";
        query = db.prepare(`SELECT t.id, ${topic} AS title, t.message, r.message AS answer
          FROM ${table} t LEFT JOIN support_admin_replies r ON r.request_id=t.id
          WHERE t.status ${archive ? '<>' : '='} 'open' ORDER BY t.created_at DESC,t.id LIMIT 26 OFFSET ?`).bind(offset);
      } else {
        query = db.prepare("SELECT id,name,district FROM business_applications WHERE status='approved' ORDER BY id DESC LIMIT 26 OFFSET ?").bind(offset);
      }
      const {results} = await query.all();
      return json({items:results.slice(0,25), more:results.length > 25});
    }
    const body = await request.json().catch(()=>null);
    if (!body) return json({}, 400);
    if (task === 'parking') {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      const district = typeof body.district === 'string' ? body.district.trim() : '';
      if (!Number.isSafeInteger(body.id) || body.id < 1 || typeof body.previousName !== 'string' ||
          typeof body.previousDistrict !== 'string' || name.length < 2 || name.length > 100 ||
          district.length < 5 || district.length > 300) return json({},400);
      const result = await db.prepare(
        "UPDATE business_applications SET name=?,district=?,updated_at=datetime('now') WHERE id=? AND name=? AND district=? AND status='approved'"
      ).bind(name,district,body.id,body.previousName,body.previousDistrict).run();
      return result.meta.changes ? json({ok:true}) : json({},409);
    }
    const message = typeof body.message === 'string' ? body.message.trim() : '';
    if (!uuid.test(body.id) || message.length < 2 || message.length > 2000) return json({},400);
    const [update] = await db.batch([
      db.prepare(`UPDATE ${table} SET status='reviewed' WHERE id=? AND status='open'`).bind(body.id),
      db.prepare('INSERT INTO support_admin_replies(request_id,message,replied_at) SELECT ?,?,? WHERE changes()=1').bind(body.id,message,Date.now())
    ]);
    return update.meta.changes ? json({ok:true}) : json({},409);
  } catch {
    return json({error:'storage_unavailable'},503);
  }
}
