// Resolve identity and bans from Supabase, never from client claims or decoded JWTs.
export async function requirePushUser(request,env) {
 const token=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 if(!token)throw {status:401,error:'login_required'};
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=env.SUPABASE_ANON_KEY;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)||!key)throw {status:503,error:'auth_not_configured'};
 const headers={apikey:key,Authorization:'Bearer '+token};
 const response=await fetch(base+'/auth/v1/user',{headers,signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw {status:response.status===401||response.status===403?401:503,error:'invalid_session'};
 const user=await response.json();
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id))throw {status:401,error:'invalid_session'};
 const check=await fetch(base+'/rest/v1/rpc/rotapark_member_blocked',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(7000)});
 if(!check.ok)throw {status:503,error:'ban_check_unavailable'};
 const blocked=await check.json();
 if(typeof blocked!=='boolean')throw {status:503,error:'ban_check_unavailable'};
 if(blocked)throw {status:403,error:'account_blocked'};
 return {id:user.id};
}
