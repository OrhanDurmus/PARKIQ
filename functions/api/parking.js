export async function onRequestGet({request,env}) {
  const url=new URL(request.url),lat=Number(url.searchParams.get('lat')),lng=Number(url.searchParams.get('lng'));
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<40||lat>42.5||lng<26||lng>31)
    return Response.json({error:'Geçersiz koordinat'},{status:400});
  const asset=await env.ASSETS.fetch(new URL('/data/parking.json',url.origin).toString());
  if(!asset.ok) return Response.json({error:'İstanbul otopark veri dosyası henüz oluşturulmadı. GitHub Actions > Refresh Istanbul parking dataset çalıştırılmalı.'},{status:503});
  try {
    const data=await asset.json();
    if(!Array.isArray(data.points))throw Error('Invalid data');
    const radius=3000,rad=Math.PI/180;
    const points=data.points.filter(p=>{
      const dlat=(p.lat-lat)*111195,dlng=(p.lng-lng)*111195*Math.cos(lat*rad);
      return dlat*dlat+dlng*dlng<=radius*radius;
    }).slice(0,250);
    return Response.json({points,source:data.source,updatedAt:data.updatedAt},{headers:{'Cache-Control':'public,max-age=120'}});
  }catch{
    return Response.json({error:'Otopark veri dosyası okunamadı'},{status:503});
  }
}
