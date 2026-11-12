// RFC 8291 Web Push payload encryption + RFC 8292 VAPID for Cloudflare Workers.
const encoder=new TextEncoder();
const b64url=b=>btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const from64=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=')),c=>c.charCodeAt(0));
const concat=(...xs)=>{const parts=xs.map(x=>new Uint8Array(x));const b=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let off=0;for(const x of parts){b.set(x,off);off+=x.length}return b};
const hkdf=async(secret,salt,info,length)=>{
 const key=await crypto.subtle.importKey('raw',secret,'HKDF',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'HKDF',hash:'SHA-256',salt,info},key,length*8));
};
const u16=n=>new Uint8Array([n>>>8,n&255]);
const publicPoint=key=>concat(new Uint8Array([4]),from64(key.x),from64(key.y));
async function encrypt(subscription,payload){
 const receiver=from64(subscription.p256dh),auth=from64(subscription.auth);
 if(receiver.length!==65||receiver[0]!==4||auth.length!==16)throw Error('invalid_push_keys');
 const receiverKey=await crypto.subtle.importKey('raw',receiver,{name:'ECDH',namedCurve:'P-256'},false,[]);
 const sender=await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const senderPublic=new Uint8Array(await crypto.subtle.exportKey('raw',sender.publicKey));
 const shared=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:receiverKey},sender.privateKey,256));
 const info=concat(encoder.encode('WebPush: info\0'),receiver,senderPublic);
 const ikm=await hkdf(shared,auth,info,32);
 const salt=crypto.getRandomValues(new Uint8Array(16));
 const cek=await hkdf(ikm,salt,encoder.encode('Content-Encoding: aes128gcm\0'),16);
 const nonce=await hkdf(ikm,salt,encoder.encode('Content-Encoding: nonce\0'),12);
 const plaintext=concat(encoder.encode(JSON.stringify(payload)),new Uint8Array([2]));
 const aes=await crypto.subtle.importKey('raw',cek,'AES-GCM',false,['encrypt']);
 const ciphertext=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce,tagLength:128},aes,plaintext));
 const rs=4096;
 if(ciphertext.length>rs)throw Error('push_payload_too_large');
 const header=concat(salt,new Uint8Array([0,0,16,0,senderPublic.length]),senderPublic);
 return concat(header,ciphertext);
}
async function vapidToken(endpoint,env){
 const url=new URL(endpoint),aud=url.origin,now=Math.floor(Date.now()/1000);
 const publicBytes=from64(env.WEB_PUSH_PUBLIC_KEY),privateBytes=from64(env.WEB_PUSH_PRIVATE_KEY);
 if(publicBytes.length!==65||publicBytes[0]!==4||privateBytes.length!==32)throw Error('invalid_vapid_keys');
 const pub=await crypto.subtle.importKey('raw',publicBytes,{name:'ECDSA',namedCurve:'P-256'},true,['verify']);
 const jwk=await crypto.subtle.exportKey('jwk',pub);
 const privateKey=await crypto.subtle.importKey('jwk',{...jwk,d:b64url(privateBytes),key_ops:['sign']},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const header=b64url(encoder.encode(JSON.stringify({typ:'JWT',alg:'ES256'})));
 const claims=b64url(encoder.encode(JSON.stringify({aud,exp:now+3600,sub:'mailto:'+String(env.WEB_PUSH_CONTACT_EMAIL||'support@rotapark.app')})));
 const signingInput=header+'.'+claims;
 const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},privateKey,encoder.encode(signingInput));
 return signingInput+'.'+b64url(sig);
}
export async function sendNearbyParkingPush(env,recipient,{reportId,distanceMeters}){
 const endpoint=new URL(recipient.endpoint);
 if(endpoint.protocol!=='https:'||!/^(?:[a-z0-9-]+\.)*(?:push\.apple\.com|push\.services\.mozilla\.com|fcm\.googleapis\.com)$/i.test(endpoint.hostname))throw Error('invalid_push_endpoint');
 const jwt=await vapidToken(recipient.endpoint,env);
 const body=await encrypt({p256dh:recipient.p256dh,auth:recipient.auth},{type:'nearby-parking',reportId,distanceMeters});
 const res=await fetch(recipient.endpoint,{method:'POST',headers:{
  'TTL':'300','Urgency':'normal','Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',
  'Authorization':'vapid t='+jwt+', k='+env.WEB_PUSH_PUBLIC_KEY
 },body,signal:AbortSignal.timeout(8000)});
 return {ok:res.status===201||res.status===202||res.status===200,status:res.status,expired:res.status===404||res.status===410};
}
