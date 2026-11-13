// ROTAPARK nearby parking Web Push opt-in helper.
// Call enableNearbyParkingPush() ONLY from a user-initiated click/tap.
// iOS 16.4+ requires the website to be installed on the Home Screen.
const decodeKey = key => {
  const base64 = key.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
  return Uint8Array.from(raw, char => char.charCodeAt(0));
};
const authHeaders=async()=>{
 const token=await window.rotaparkAuthToken?.();
 if(!token)throw new Error('login_required');
 return {'Content-Type':'application/json',Authorization:'Bearer '+token};
};
const responseError=async(response,fallback)=>{
 const body=await response.json().catch(()=>({}));
 return new Error(body.error||fallback);
};
export async function enableNearbyParkingPush({latitude,longitude,consent}) {
 if(consent!==true)throw new Error('consent_required');
 if(!isSecureContext||!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('push_not_supported');
 if(!Number.isFinite(latitude)||!Number.isFinite(longitude))throw new Error('location_required');
 const headers=await authHeaders();
 if(Notification.permission==='denied')throw new Error('permission_denied');
 const permission=Notification.permission==='granted'?'granted':await Notification.requestPermission();
 if(permission!=='granted')throw new Error('permission_not_granted');
 const keyResponse=await fetch('/api/nearby-push',{cache:'no-store',credentials:'same-origin'});
 if(!keyResponse.ok)throw new Error('push_not_configured');
 const {publicKey}=await keyResponse.json();
 if(typeof publicKey!=='string')throw new Error('push_not_configured');
 await navigator.serviceWorker.register('/sw.js',{scope:'/'});
 const ready=await navigator.serviceWorker.ready;
 const previous=await ready.pushManager.getSubscription();
 const subscription=previous||await ready.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(publicKey)});
 try{
  const response=await fetch('/api/nearby-push',{method:'POST',credentials:'same-origin',headers,
   body:JSON.stringify({subscription:subscription.toJSON(),latitude,longitude,consent:true})});
  if(!response.ok)throw await responseError(response,'subscription_save_failed');
 }catch(error){if(!previous)await subscription.unsubscribe();throw error}
 return {enabled:true};
}
export async function disableNearbyParkingPush() {
 if(!('serviceWorker' in navigator))return {enabled:false};
 const registration=await navigator.serviceWorker.getRegistration('/');
 const subscription=await registration?.pushManager.getSubscription();
 if(!subscription)return {enabled:false};
 let failure;
 try{
  const headers=await authHeaders();
  const keys=subscription.toJSON().keys;
  const response=await fetch('/api/nearby-push',{method:'DELETE',credentials:'same-origin',headers,
   body:JSON.stringify({endpoint:subscription.endpoint,auth:keys?.auth,p256dh:keys?.p256dh})});
  if(!response.ok)failure=await responseError(response,'subscription_delete_failed');
 }catch(error){failure=error}
 // Withdraw browser delivery even when logout, ban or an outage prevents server cleanup.
 if(!await subscription.unsubscribe())throw new Error('subscription_unsubscribe_failed');
 if(failure)throw new Error('local_disabled_cleanup_pending');
 return {enabled:false};
}
