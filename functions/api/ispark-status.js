// Lightweight public diagnostics: never expose tokens or individual parking data.
export async function onRequestGet({request}){
  try{
    const origin=new URL(request.url).origin;
    const response=await fetch(origin+'/api/ispark-occupancy',{headers:{Accept:'application/json'},signal:AbortSignal.timeout(8500)});
    if(!response.ok)return Response.json({ok:false,status:'api_http_error',httpStatus:response.status},{headers:{'Cache-Control':'no-store'}});
    const data=await response.json();
    const points=Array.isArray(data.points)?data.points:[];
    const fallback=data.upstreamUnavailable===true;
    const state=data.unavailable?'unavailable':fallback?'stored_snapshot':points.length?'source_response':'empty';
    return Response.json({ok:points.length>0,status:state,source:data.source||null,parkingCount:points.length,verifiedLiveCount:points.filter(p=>p.verifiedLive===true).length,receivedAt:data.receivedAt||null,snapshotAgeMinutes:data.snapshotAgeMinutes??null,upstreamUnavailable:fallback,diagnostic:data.diagnostic||null,exampleName:points[0]?.name||null,note:fallback?'İBB erişimi başarısız; kayıtlı veri kullanılıyor.':'Kaynak yanıtı mevcut; canlı doluluk yalnızca doğrulanmışsa gösterilir.'},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }catch(error){return Response.json({ok:false,status:'check_failed',errorType:error?.name||'UnknownError'},{headers:{'Cache-Control':'no-store'}});}
}
