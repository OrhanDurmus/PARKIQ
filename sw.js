const CACHE='parkiq-shell-v53';const SHELL=['/','/index.html','/manifest.webmanifest','/icon.svg','/apple-touch-icon.jpg'];self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET'||new URL(r.url).origin!==self.location.origin)return;const u=new URL(r.url);if(u.pathname.startsWith('/api/')||u.pathname.startsWith('/functions/')||u.pathname==='/version.json')return;e.respondWith(fetch(r).then(res=>{if(res.ok&&SHELL.includes(u.pathname)){const copy=res.clone();caches.open(CACHE).then(c=>c.put(r,copy))}return res}).catch(()=>caches.match(r).then(hit=>hit||Response.error())))})
/* Nearby parking Web Push: server must send only opted-in, eligible notifications. */
self.addEventListener('push',event=>{
 let payload={};
 try{payload=event.data?.json()||{}}catch{return}
 if(payload.type!=='nearby-parking'||typeof payload.reportId!=='string'||!payload.reportId||payload.reportId.length>128)return;
 const distance=Number(payload.distanceMeters);
 if(!Number.isFinite(distance)||distance<0||distance>1000)return;
 const title='ROTAPARK · Yakınında boş park yeri';
 const body=Math.round(distance)+' metre uzağında yeni bir park yeri bildirildi.';
 const target=new URL('/',self.location.origin);
 target.searchParams.set('parkingReport',payload.reportId);
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'/icon.svg',badge:'/icon.svg',tag:'parking-'+payload.reportId,
  data:{url:target.href},renotify:false
 }));
});
self.addEventListener('notificationclick',event=>{
 event.notification.close();
 const raw=event.notification.data?.url;
 if(typeof raw!=='string')return;
 let target;
 try{target=new URL(raw,self.location.origin)}catch{return}
 if(target.origin!==self.location.origin)return;
 event.waitUntil((async()=>{
  const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>new URL(c.url).origin===self.location.origin);
  if(existing){await existing.navigate(target.href);return existing.focus()}
  return self.clients.openWindow(target.href);
 })());
});
