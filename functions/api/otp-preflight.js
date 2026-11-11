const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestPost({request,env}){
 let email;try{const body=await request.json();email=String(body.email||'').trim().toLowerCase()}catch{return json({ok:false,error:'invalid_request'},400)}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)return json({ok:false,error:'invalid_email'},400);
 const url=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const service=String(env.SUPABASE_SERVICE_ROLE_KEY||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!service)return json({ok:false,error:'preflight_unavailable'},503);
 try{
  const r=await fetch(url+'/rest/v1/rpc/rotapark_email_is_blocked',{method:'POST',headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json'},body:JSON.stringify({lookup_email:email}),signal:AbortSignal.timeout(6000)});
  if(!r.ok)return json({ok:false,error:'preflight_unavailable'},503);
  const blocked=await r.json();if(typeof blocked!=='boolean')return json({ok:false,error:'preflight_unavailable'},503);
  return json({ok:true,blocked});
 }catch{return json({ok:false,error:'preflight_unavailable'},503)}
}
