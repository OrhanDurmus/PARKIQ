// Community reports are short-lived observations, not verified legal parking permissions.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const keyPrefix='community:street:';
const authenticatedUser=async(request,env)=>{const auth=request.headers.get('Authorization')||'';const match=/^Bearer (\\S+)$/.exec(auth);if(!match)return null;const url=String(env.SUPABASE_URL||'').replace(/\\/$/,'');const key=String(env.SUPABASE_ANON_KEY||'');if(!/^https:\/\/[a-z0-9-]+\\.supabase\\.co$/i.test(url)||!key)return null;try{const res=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:'Bearer '+match[1]},signal:AbortSignal.timeout(6000)});if(!res.ok)return null;const user=await res.json();return typeof user.id==='string'&&user.id.length>0?user:null}catch{return null}};

const validCoord=(lat,lng)=>Number.isFinite(lat)&&Number.isFinite(lng)&&lat>=40&&lat<=42.5&&lng>=26&&lng<=31;
const store=env=>env?.ISPARK_SNAPSHOTS;
const tokenValid=t=>typeof t==='string'&&/^[a-f0-9]{64}$/.test(t);
const tokenHash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(b=>b.toString(16).padStart(2,'0')).join('');
export async function onRequestGet({env}){
 const kv=store(env);if(!kv?.list||!kv?.get)return json({ok:false,error:'not_configured'},503);
 try{
  const keys=await kv.list({prefix:keyPrefix,limit:200});
  const items=(await Promise.all(keys.keys.map(x=>kv.get(x.name,'json')))).filter(x=>x&&x.expiresAt>Date.now()&&validCoord(x.lat,x.lng)).sort((a,b)=>b.createdAt-a.createdAt).slice(0,150);
  return json({ok:true,points:items.map(({ownerTokenHash,ownerId,...point})=>point)});
 }catch(e){return json({ok:false,error:'storage_unavailable'},503)}
}
export async function onRequestPost({request,env}){
 const kv=store(env);if(!kv?.put||!kv?.get)return json({ok:false,error:'not_configured'},503);
 const length=Number(request.headers.get('content-length')||0);if(length>2500)return json({ok:false,error:'too_large'},413);
 let data;try{const raw=await request.text();if(raw.length>2500)return json({ok:false,error:'too_large'},413);data=JSON.parse(raw)}catch{return json({ok:false,error:'invalid_json'},400)}
 const lat=Number(data.lat),lng=Number(data.lng),note=String(data.note||'').trim(),address=String(data.address||'').trim(),ownerToken=data.ownerToken,displayName=String(data.displayName||'').trim();
 if(!tokenValid(ownerToken)||!validCoord(lat,lng)||note.length>160||address.length>200||displayName.length>32||/[<>\x00-\x1f\x7f]/.test(displayName)||!['space','no_space'].includes(data.type))return json({ok:false,error:'invalid_report'},400);
 const user=await authenticatedUser(request,env);if(!user)return json({ok:false,error:'login_required'},401);
 const ip=request.headers.get('CF-Connecting-IP')||'unknown';
 // Short cooldown plus hourly quota. KV is eventually consistent; these are soft abuse limits.
 const ipKey='community:rate:'+ip, hourKey='community:hour:'+ip;
 try{
  if(await kv.get(ipKey))return json({ok:false,error:'rate_limited',retryAfterSeconds:120},429);
  const hourly=Number(await kv.get(hourKey)||0);
  if(hourly>=5)return json({ok:false,error:'hourly_limit'},429);
  const id=crypto.randomUUID(),now=Date.now();
  const point={id,lat:Math.round(lat*1e5)/1e5,lng:Math.round(lng*1e5)/1e5,type:data.type,note,address,displayName:displayName||String(user.user_metadata?.full_name||user.user_metadata?.name||user.email?.split('@')[0]||'ROTAPARK kullanıcısı').slice(0,32),verifiedAccount:true,createdAt:now,expiresAt:now+2*60*60*1000};
  const stored={...point,ownerId:user.id,ownerTokenHash:await tokenHash(ownerToken)};
  await kv.put(keyPrefix+id,JSON.stringify(stored),{expirationTtl:7200});
  await kv.put(ipKey,id,{expirationTtl:120});
  await kv.put(hourKey,String(hourly+1),{expirationTtl:3600});
  return json({ok:true,point},201);
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}

export async function onRequestDelete({request,env}){
 const kv=store(env);if(!kv?.get||!kv?.delete)return json({ok:false,error:'not_configured'},503);
 let data;try{const raw=await request.text();if(raw.length>500)return json({ok:false,error:'too_large'},413);data=JSON.parse(raw)}catch{return json({ok:false,error:'invalid_json'},400)}
 const id=String(data?.id||''),ownerToken=data?.ownerToken;
 if(!/^[0-9a-f-]{36}$/i.test(id))return json({ok:false,error:'invalid_request'},400);
 try{const point=await kv.get(keyPrefix+id,'json');if(!point)return json({ok:false,error:'not_found'},404);
  const user=await authenticatedUser(request,env);
  const accountOwner=!!(point.ownerId&&user?.id===point.ownerId);
  const legacyOwner=!point.ownerId&&tokenValid(ownerToken)&&point.ownerTokenHash===await tokenHash(ownerToken);
  if(!accountOwner&&!legacyOwner)return json({ok:false,error:'forbidden'},403);
  await kv.delete(keyPrefix+id);
  // Let the verified report owner correct a mistake without waiting for the short cooldown.
  // The hourly quota remains in place to prevent repeated delete-and-repost spam.
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',ipKey='community:rate:'+ip;
  if(await kv.get(ipKey)===id)await kv.delete(ipKey);
  return json({ok:true});
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
