const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function onRequestGet({env}){
 if(!env.ISPARK_SNAPSHOTS)return json({message:null});
 try{const item=await env.ISPARK_SNAPSHOTS.get('admin:flash:current','json');return json({message:item&&typeof item.message==='string'&&item.expiresAt>Date.now()?item:null})}catch{return json({message:null},503)}
}
