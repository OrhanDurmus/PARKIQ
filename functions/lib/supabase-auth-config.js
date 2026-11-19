export function supabaseUrl(env){
 return String(env.SUPABASE_URL??'').trim().replace(/\/+$/,'');
}

export function isSupabaseUrl(url){
 return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url);
}

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

export function readSupabasePublicConfig(env){
 const url=supabaseUrl(env);
 const key=String(env.SUPABASE_ANON_KEY??'').trim();
 const issues=[];
 if(!url)issues.push('missing_supabase_url');
 else if(!isSupabaseUrl(url))issues.push('invalid_supabase_url');
 if(!key)issues.push('missing_public_key');
 else if(!isPublicSupabaseKey(key))issues.push('invalid_public_key');
 if(issues.length)return {configured:false,issues};
 return {configured:true,url,anonKey:key};
}
