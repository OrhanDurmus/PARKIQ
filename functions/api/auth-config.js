const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function isPublicSupabaseKey(key){
 if(/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))return true;
 const jwt=/^[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]+$/.exec(key);
 if(!jwt)return false;
 try{
  return JSON.parse(atob(jwt[1].replace(/-/g,'+').replace(/_/g,'/')))?.role==='anon';
 }catch{
  return false;
 }
}
export async function onRequestGet({env}){
 const url=String(env.SUPABASE_URL||'').trim().replace(/\/+$/,'');
 const key=String(env.SUPABASE_ANON_KEY||'').trim();
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!isPublicSupabaseKey(key))return json({configured:false});
 return json({configured:true,url,anonKey:key});
}
