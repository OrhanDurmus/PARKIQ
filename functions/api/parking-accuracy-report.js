// User-submitted parking accuracy reports are review requests, never automatic deletions.
const reasons=new Set(['not_public','not_parking','wrong_location','closed','other']);
const authenticatedUser=async(request,env)=>{const auth=request.headers.get('Authorization')||'';const match=/^Bearer (\S+)$/.exec(auth);if(!match)return null;const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');const key=String(env.SUPABASE_ANON_KEY||'');if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key)return null;try{const res=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(6000)});if(!res.ok)return null;const user=await res.json();return typeof user.id==='string'&&user.id.length>0?user:null}catch{return null}};;
export async function onRequestPost({request,env}){
 const user=await authenticatedUser(request,env);if(!user)return Response.json({error:'Bildirim göndermek için giriş yapmalısın.'},{status:401});
 if(!env.DB)return Response.json({error:'Bildirim servisi henüz hazır değil.'},{status:503});
 let data;try{data=await request.json()}catch{return Response.json({error:'Geçersiz bildirim.'},{status:400})}
 const lat=Number(data?.lat),lng=Number(data?.lng),reason=String(data?.reason||''),osmType=String(data?.osmType||''),osmId=String(data?.osmId||''),name=String(data?.name||'').trim().slice(0,160),note=String(data?.note||'').trim().slice(0,500);
 if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<35.5||lat>42.5||lng<25.5||lng>45||!reasons.has(reason)||!['node','way','relation'].includes(osmType)||!/^\d{1,20}$/.test(osmId))return Response.json({error:'Eksik veya geçersiz otopark bilgisi.'},{status:400});
 try{
  await env.DB.prepare('CREATE TABLE IF NOT EXISTS parking_accuracy_reports (id INTEGER PRIMARY KEY AUTOINCREMENT, osm_type TEXT NOT NULL, osm_id TEXT NOT NULL, lat REAL NOT NULL, lng REAL NOT NULL, name TEXT, reason TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT \'pending\', created_at TEXT NOT NULL DEFAULT (datetime(\'now\')))').run();
  // Avoid repeated identical reports for one location while allowing different issues.
  const recent=await env.DB.prepare("SELECT COUNT(*) AS total FROM parking_accuracy_reports WHERE osm_type=? AND osm_id=? AND reason=? AND created_at>=datetime('now','-1 day')").bind(osmType,osmId,reason).first();
  if(Number(recent?.total||0)>=10)return Response.json({error:'Bu kayıt için yeterli sayıda bildirim alındı. İnceleme bekleniyor.'},{status:429});
  await env.DB.prepare('INSERT INTO parking_accuracy_reports (osm_type,osm_id,lat,lng,name,reason,note) VALUES (?,?,?,?,?,?,?)').bind(osmType,osmId,lat,lng,name,reason,note).run();
  return Response.json({ok:true,message:'Bildirim alındı; inceleme bekliyor.'},{headers:{'Cache-Control':'no-store'}});
 }catch{return Response.json({error:'Bildirim şu anda kaydedilemedi.'},{status:503})}
}
