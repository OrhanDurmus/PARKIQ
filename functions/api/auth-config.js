import {readSupabasePublicConfig} from '../lib/supabase-auth-config.js';

export async function onRequestGet({env}){
 return Response.json(readSupabasePublicConfig(env),{headers:{'Cache-Control':'no-store'}});
}
