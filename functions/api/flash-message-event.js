const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestPost({request,env}){
 if(!env.DB||!env.ISPARK_SNAPSHOTS)return reply({ok:false},503);
 let raw;try{raw=await request.text();if(raw.length>350)return reply({ok:false},413)}catch{return reply({ok:false},400)}
 let body;try{body=JSON.parse(raw)}catch{return reply({ok:false},400)}
 const id=String(body?.id||''),device=String(body?.device||''),event=String(body?.event||'');
 if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(device)||!['view','ack'].includes(event))return reply({ok:false},400);
 try{
  const active=await env.ISPARK_SNAPSHOTS.get('admin:flash:current','json');
  if(!active||active.id!==id||active.expiresAt<=Date.now())return reply({ok:false},409);
  await env.DB.prepare("CREATE TABLE IF NOT EXISTS flash_message_events (announcement_id TEXT NOT NULL, device_id TEXT NOT NULL, event TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(announcement_id,device_id,event))").run();
  await env.DB.prepare('INSERT OR IGNORE INTO flash_message_events (announcement_id,device_id,event,created_at) VALUES (?,?,?,?)').bind(id,device,event,Date.now()).run();
  return reply({ok:true});
 }catch{return reply({ok:false},503)}
}
