// Founder-only moderation of all registered ROTAPARK users, including accounts without reports.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const uuid=s=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s||'');
async function founder(request,env){
 const token=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');const key=String(env.SUPABASE_ANON_KEY||'');
 if(!token||!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key)return null;
 const headers={apikey:key,Authorization:'Bearer '+token};
 try{
 const userRes=await fetch(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(6000)});if(!userRes.ok)return null;
 const user=await userRes.json();
 const roleRes=await fetch(url+'/rest/v1/rpc/rotapark_my_role',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(6000)});
 if(!roleRes.ok||(await roleRes.json())!=='founder')return null;
 return user;
 }catch{return null}
}
export async function onRequestGet({request,env}){
 const actor=await founder(request,env);if(!actor)return json({ok:false,error:'founder_required'},403);
 const id=new URL(request.url).searchParams.get('id');
 if(!uuid(id))return json({ok:false,error:'invalid_id'},400);
 const kv=env.ISPARK_SNAPSHOTS;if(!kv?.get)return json({ok:false,error:'not_configured'},503);
 try{return json({ok:true,blocked:!!(await kv.get('community:user:blocked:'+id))})}
 catch{return json({ok:false,error:'storage_unavailable'},503)}
}
export async function onRequestPost({request,env}){
 const actor=await founder(request,env);if(!actor)return json({ok:false,error:'founder_required'},403);
 const kv=env.ISPARK_SNAPSHOTS;if(!kv?.put||!kv?.delete||!kv?.get)return json({ok:false,error:'not_configured'},503);
 let data;try{data=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const id=data?.id,action=data?.action;
 if(!uuid(id)||!['block','unblock'].includes(action))return json({ok:false,error:'invalid_request'},400);
 if(id===actor.id)return json({ok:false,error:'cannot_block_self'},403);
 const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');const key=String(env.SUPABASE_ANON_KEY||'');
 const auth=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 try{
 // Verify target exists and is not founder through founder-only directory RPC, without service role key.
 const res=await fetch(url+'/rest/v1/rpc/rotapark_find_user',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+auth,'Content-Type':'application/json'},body:JSON.stringify({lookup_email:String(data.email||'')}),signal:AbortSignal.timeout(6000)});
 if(!res.ok)return json({ok:false,error:'lookup_failed'},502);
 const users=await res.json();const target=users?.[0];
 if(!target||target.user_id!==id)return json({ok:false,error:'unknown_user'},404);
 if(target.staff_role==='founder')return json({ok:false,error:'founder_protected'},403);
 if(action==='block')await kv.put('community:user:blocked:'+id,JSON.stringify({blockedAt:Date.now(),by:actor.id}));
 else await kv.delete('community:user:blocked:'+id);
 await kv.put('community:audit:user:'+Date.now()+':'+crypto.randomUUID(),JSON.stringify({id,action,at:Date.now(),by:actor.id}),{expirationTtl:7776000});
 return json({ok:true,blocked:action==='block'});
 }catch{return json({ok:false,error:'moderation_failed'},503)}
}
