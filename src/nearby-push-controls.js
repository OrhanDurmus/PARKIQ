import {enableNearbyParkingPush,disableNearbyParkingPush} from './nearby-push-opt-in.js';
if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
  const button=document.createElement('button');
  button.type='button';
  button.id='rotapark-nearby-push-toggle';
  button.textContent='Yakındaki park bildirimleri';
  button.style.cssText='position:fixed;right:12px;bottom:82px;z-index:9000;border:1px solid #475569;border-radius:14px;background:#142333;color:#fff;padding:10px 12px;font:600 12px system-ui;box-shadow:0 3px 12px #0005;max-width:190px';
  const status=document.createElement('span');
  status.setAttribute('role','status');
  status.style.cssText='display:block;font-size:10px;font-weight:400;margin-top:3px';
  button.append(status);
  document.body.append(button);
  const update=async()=>{
    const registration=await navigator.serviceWorker.getRegistration('/');
    const subscription=await registration?.pushManager.getSubscription();
    button.firstChild.textContent=subscription?'Yakın bildirimleri kapat':'Yakın bildirimleri aç';
    status.textContent=subscription?'Açık · 1 km':'İsteğe bağlı';
  };
  button.addEventListener('click',async()=>{
    button.disabled=true;status.textContent='İşleniyor…';
    try{
      const registration=await navigator.serviceWorker.getRegistration('/');
      const subscription=await registration?.pushManager.getSubscription();
      if(subscription){await disableNearbyParkingPush();}
      else{
        if(Notification.permission==='default') {const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('permission_not_granted')}
        if(!navigator.geolocation)throw Error('Konum desteği yok');
        const location=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:true,timeout:12000,maximumAge:30000}));
        await enableNearbyParkingPush({latitude:location.coords.latitude,longitude:location.coords.longitude});
      }
      await update();
    }catch(e){
      const messages={push_not_supported:'Ana ekrana eklenmiş uygulamada açın',permission_denied:'Bildirim izni ayarlardan kapalı',permission_not_granted:'Bildirim izni verilmedi',push_not_configured:'Bildirim sunucusu henüz hazır değil',subscription_save_failed:'Abonelik kaydedilemedi',subscription_delete_failed:'Abonelik silinemedi'};
      status.textContent=messages[e?.message]||'İşlem başarısız, tekrar deneyin';
    }finally{button.disabled=false}
  });
  update().catch(()=>{status.textContent='Bildirim durumu alınamadı'});
}
