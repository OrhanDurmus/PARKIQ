const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({request,env}){
 const token=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 if(!token)return json({ok:false,error:'login_required'},401);
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(env.SUPABASE_ANON_KEY||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)||!key)return json({ok:false,error:'not_configured'},503);
 try{
  const headers={apikey:key,Authorization:'Bearer '+token};
  const u=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(7000)});
  if(!u.ok)return json({ok:false,error:'invalid_session'},401);
  const user=await u.json();
  const result=await fetch(base+'/rest/v1/rpc/rotapark_member_blocked',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(7000)});
  if(!result.ok)return json({ok:false,error:'ban_check_failed',status:result.status},503);
  const blocked=await result.json();
  if(typeof blocked!=='boolean')return json({ok:false,error:'invalid_ban_response'},503);
  let reason=null;if(blocked){try{const why=await fetch(base+'/rest/v1/rpc/rotapark_my_ban_reason',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(7000)});if(why.ok){const value=await why.json();if(typeof value==='string')reason=value.slice(0,300)}}catch{}}
  return json({ok:true,blocked,reason,userId:user.id,version:3});
 }catch{return json({ok:false,error:'ban_check_unavailable'},503)}
}
