export const key='admin:flash:current';
export const historyPrefix='admin:flash:history:';
export const archive=async(kv,item)=>kv.put(historyPrefix+item.id,JSON.stringify(item),{expirationTtl:60*60*24*90});
export const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function publishFlashMessage(request,env){
 if(!env.ISPARK_SNAPSHOTS)return json({ok:false,error:'storage_unavailable'},503);
 let body;try{body=await request.json()}catch{return json({ok:false,error:'invalid_json'},400)}
 const message=String(body?.message||'').trim();
 if(message.length<1||message.length>400)return json({ok:false,error:'Mesaj 1-400 karakter olmalı.'},400);
 const type=String(body?.type||'info');if(!['info','warning','urgent'].includes(type))return json({ok:false,error:'invalid_type'},400);
 const duration=Number(body?.durationHours);
 if(![1,6,24,72].includes(duration))return json({ok:false,error:'invalid_duration'},400);
 const now=Date.now();
 const previous=await env.ISPARK_SNAPSHOTS.get(key,'json');
 const editId=body?.editId===undefined?null:String(body.editId);
 if(editId&&(!previous||previous.id!==editId||previous.expiresAt<=now))return json({ok:false,error:'Duyuru değişmiş veya süresi dolmuş. Sayfayı yenileyin.'},409);
 const item={id:crypto.randomUUID(),message,type,createdAt:now,expiresAt:now+duration*3600000,...(editId?{editedFrom:editId}:{})};
 if(previous)await archive(env.ISPARK_SNAPSHOTS,{...previous,removedAt:now,removalReason:editId?'edited':'replaced'});
 await archive(env.ISPARK_SNAPSHOTS,item);
 await env.ISPARK_SNAPSHOTS.put(key,JSON.stringify(item),{expirationTtl:duration*3600});
 return json({ok:true,message:item});
}
