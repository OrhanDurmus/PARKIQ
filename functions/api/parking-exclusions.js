// Public read-only list of admin-approved OSM records verified as not parking.
// Never expose reporter identities or notes.
export async function onRequestGet({env}){
 if(!env.DB)return Response.json({ids:[],warning:'review_database_unavailable'},{headers:{'Cache-Control':'no-store'}});
 try{
  const rows=await env.DB.prepare("SELECT DISTINCT osm_type,osm_id FROM parking_accuracy_reports WHERE status='approved' AND reason IN ('not_parking','not_public')").all();
  const ids=[...new Set((rows.results||[]).map(r=>{const type=String(r.osm_type||'');const id=String(r.osm_id||'').replace(/^(node|way|relation)\//,'');return ['node','way','relation'].includes(type)&&/^\d+$/.test(id)?type+'/'+id:null}).filter(Boolean))];
  return Response.json({ids},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch{return Response.json({ids:[],warning:'review_list_unavailable'},{headers:{'Cache-Control':'no-store'}})}
}
