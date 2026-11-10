const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request,env}){
 const auth=request.headers.get('Authorization')||'';
 if(!/^Bearer \S+$/.test(auth))return json({ok:false,error:'login_required'},401);
 const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(env.SUPABASE_ANON_KEY||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key)return json({ok:false,error:'not_configured'},503);
 let user;
 try{const response=await fetch(url+'/auth/v1/user',{headers:{apikey:key,Authorization:auth},signal:AbortSignal.timeout(6000)});if(!response.ok)return json({ok:false,error:'login_required'},401);user=await response.json();if(!/^[0-9a-f-]{36}$/i.test(user.id||''))return json({ok:false,error:'login_required'},401)}catch{return json({ok:false,error:'auth_unavailable'},503)}
 const kv=env.ISPARK_SNAPSHOTS;if(!kv?.list||!kv?.get)return json({ok:false,error:'not_configured'},503);
 try{
  const result=await kv.list({prefix:'community:user:history:'+user.id+':',limit:200});
  const now=Date.now();
  const items=(await Promise.all(result.keys.map(async k=>{
   const h=await kv.get(k.name,'json');if(!h)return null;
   const active=h.status==='active'?await kv.get('community:street:'+h.id,'json'):null;
   return {...h,status:h.status==='active'&&(!active||active.expiresAt<=now)?'expired':h.status};
  }))).filter(Boolean).sort((a,b)=>b.createdAt-a.createdAt);
  return json({ok:true,items,partial:!result.list_complete});
 }catch{return json({ok:false,error:'storage_unavailable'},503)}
}
