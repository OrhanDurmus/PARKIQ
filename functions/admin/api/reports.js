// Protected by Cloudflare Access application covering /admin/*.
// Read-only endpoint; never return ownership hashes or moderation secrets.
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({env,request}){
  // Cloudflare Access injects this header after a successful access policy evaluation.
  // This header alone is not a cryptographic proof; the /admin/* Access policy must be enforced at the edge.
  if(!request.headers.get('Cf-Access-Jwt-Assertion'))return json({ok:false,error:'access_session_required'},401);
  const kv=env?.ISPARK_SNAPSHOTS;
  if(!kv?.list||!kv?.get)return json({ok:false,error:'not_configured'},503);
  try{
    let cursor,keys=[],pages=0;
    do{
      const batch=await kv.list({prefix:'community:street:',limit:200,...(cursor?{cursor}:{})});
      keys.push(...batch.keys.map(k=>k.name));cursor=batch.list_complete?undefined:batch.cursor;pages++;
    }while(cursor&&pages<5);
    const now=Date.now();
    const items=(await Promise.all(keys.map(k=>kv.get(k,'json'))))
      .filter(x=>x&&x.expiresAt>now&&Number.isFinite(x.lat)&&Number.isFinite(x.lng))
      .sort((a,b)=>b.createdAt-a.createdAt).slice(0,200)
      .map(({ownerTokenHash,...publicFields})=>publicFields);
    return json({ok:true,points:items,partial:!!cursor,checkedAt:now});
  }catch{return json({ok:false,error:'storage_unavailable'},503)}
}