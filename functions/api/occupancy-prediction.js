// ETA occupancy predictions from Supabase RPC; no raw snapshot data exposed.
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({request,env}){
 const url=new URL(request.url),parkingId=url.searchParams.get('parkingId')||'';
 const eta=Number(url.searchParams.get('etaMinutes'));
 if(!parkingId||parkingId.length>180||!Number.isInteger(eta)||eta<0||eta>240)return json({ok:false,error:'invalid_parameters'},400);
 const token=/^Bearer (\S+)$/.exec(request.headers.get('Authorization')||'')?.[1];
 if(!token)return json({ok:false,error:'login_required'},401);
 const base=String(env.SUPABASE_URL||'').replace(/\/$/,'');
 const key=String(env.SUPABASE_ANON_KEY||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(base)||!key)return json({ok:false,error:'not_configured'},503);
 try{
  const result=await fetch(base+'/rest/v1/rpc/rotapark_predict_occupancy',{
   method:'POST',headers:{apikey:key,Authorization:'Bearer '+token,'Content-Type':'application/json'},
   body:JSON.stringify({p_parking_id:parkingId,p_eta_minutes:eta}),
   signal:AbortSignal.timeout(6500)
  });
  if(!result.ok)return json({ok:false,error:'prediction_unavailable'},503);
  const data=await result.json();
  const row=Array.isArray(data)?data[0]:data;
  return json({ok:true,prediction:row||null});
 }catch{return json({ok:false,error:'prediction_unavailable'},503)}
}
