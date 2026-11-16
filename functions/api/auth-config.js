const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({env}){
 const url=String(env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
 const key=String(env.SUPABASE_ANON_KEY||'').trim();
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key)return json({configured:false});
 return json({configured:true,url,anonKey:key});
}
