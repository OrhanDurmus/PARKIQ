// Opt-in subscriptions only. Coordinates represent the user's last explicitly shared location.
// Push delivery and VAPID signing are deliberately separate from this storage endpoint.
const reply=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const authUser=async(request,env)=>{
 const match=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'');
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(env.SUPABASE_ANON_KEY||'');
 if(!match||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)||!key)return null;
 try{const res=await fetch(base+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(6000)});if(!res.ok)return null;const user=await res.json();return /^[0-9a-f-]{36}$/i.test(user.id)?user:null}catch{return null}
};
const validLocation=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=35.5&&lat<=42.5&&lng>=25.5&&lng<=45;
const idFor=async(endpoint)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(endpoint)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function onRequestPost({request,env}){
 const kv=env.ISPARK_SNAPSHOTS;
 if(!kv?.put)return reply({ok:false,error:'not_configured'},503);
 const user=await authUser(request,env);if(!user)return reply({ok:false,error:'login_required'},401);
 let raw;try{raw=await request.text();if(raw.length>3000)return reply({ok:false,error:'too_large'},413)}catch{return reply({ok:false},400)}
 let data;try{data=JSON.parse(raw)}catch{return reply({ok:false,error:'invalid_json'},400)}
 const sub=data?.subscription,endpoint=sub?.endpoint;
 let origin;try{origin=new URL(endpoint)}catch{return reply({ok:false,error:'invalid_endpoint'},400)}
 const lat=Number(data?.lat),lng=Number(data?.lng);
 if(origin.protocol!=='https:'||origin.username||origin.password||typeof endpoint!=='string'||endpoint.length>1500||!validLocation(lat,lng)||typeof sub?.keys?.p256dh!=='string'||typeof sub?.keys?.auth!=='string'||!/^[A-Za-z0-9_-]{80,120}$/.test(sub.keys.p256dh)||!/^[A-Za-z0-9_-]{15,40}$/.test(sub.keys.auth)||data?.consent!==true)return reply({ok:false,error:'invalid_subscription'},400);
 const id=await idFor(endpoint);
 const record={ownerId:user.id,subscription:{endpoint,expirationTime:null,keys:{p256dh:sub.keys.p256dh,auth:sub.keys.auth}},lat:Math.round(lat*1e4)/1e4,lng:Math.round(lng*1e4)/1e4,updatedAt:Date.now()};
 try{await kv.put('push:subscriber:'+id,JSON.stringify(record),{expirationTtl:60*60*24*30});await kv.put('push:owner:'+user.id+':'+id,'1',{expirationTtl:60*60*24*30});return reply({ok:true})}catch{return reply({ok:false,error:'storage_unavailable'},503)}
}
export async function onRequestDelete({request,env}){
 const kv=env.ISPARK_SNAPSHOTS;if(!kv?.delete)return reply({ok:false,error:'not_configured'},503);
 const user=await authUser(request,env);if(!user)return reply({ok:false,error:'login_required'},401);
 let data;try{const raw=await request.text();if(raw.length>2000)return reply({ok:false},413);data=JSON.parse(raw)}catch{return reply({ok:false},400)}
 const endpoint=data?.endpoint;if(typeof endpoint!=='string'||endpoint.length>1500)return reply({ok:false,error:'invalid_endpoint'},400);
 const id=await idFor(endpoint);
 try{const key='push:subscriber:'+id;const record=await kv.get(key,'json');if(record?.ownerId!==user.id)return reply({ok:false,error:'not_found'},404);await kv.delete(key);await kv.delete('push:owner:'+user.id+':'+id);return reply({ok:true})}catch{return reply({ok:false,error:'storage_unavailable'},503)}
}
