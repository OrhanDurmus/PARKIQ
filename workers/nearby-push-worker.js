import {distanceMeters} from '../functions/lib/nearby-push-recipients.js';
import {reserveNearbyPushDelivery,releaseNearbyPushDelivery,deleteExpiredPushSubscription} from '../functions/lib/nearby-push-delivery.js';
import {sendNearbyParkingPush} from '../functions/lib/web-push.js';

const radius=1000;
async function fanout(env,job){
 const {reportId,latitude,longitude}=job;
 if(!/^[0-9a-f-]{36}$/i.test(reportId)||![latitude,longitude].every(Number.isFinite))throw Error('invalid_report');
 const latDelta=radius/110500,lonDelta=radius/(110500*Math.max(0.01,Math.cos(latitude*Math.PI/180)));
 const cursor=typeof job.cursor==='string'?job.cursor:'';
 const {results=[]}=await env.DB.prepare(`
 SELECT endpoint_hash,latitude,longitude FROM nearby_push_subscriptions
 WHERE endpoint_hash>? AND latitude BETWEEN ? AND ? AND longitude BETWEEN ? AND ?
 AND user_id IS NOT NULL AND consented_at IS NOT NULL
 AND updated_at>=datetime('now','-30 days')
 ORDER BY endpoint_hash LIMIT 100
 `).bind(cursor,latitude-latDelta,latitude+latDelta,longitude-lonDelta,longitude+lonDelta).all();
 const messages=results.filter(r=>distanceMeters(latitude,longitude,r.latitude,r.longitude)<=radius)
   .map(r=>({body:{kind:'nearby-delivery',reportId,endpointHash:r.endpoint_hash,distanceMeters:Math.round(distanceMeters(latitude,longitude,r.latitude,r.longitude))}}));
 if(messages.length)await env.NEARBY_PUSH_QUEUE.sendBatch(messages);
 if(results.length===100)await env.NEARBY_PUSH_QUEUE.send({kind:'nearby-report',reportId,latitude,longitude,cursor:results[results.length-1].endpoint_hash});
}
async function deliver(env,job){
 if(!/^[0-9a-f-]{36}$/i.test(job.reportId)||!/^[a-f0-9]{64}$/.test(job.endpointHash))throw Error('invalid_delivery');
 const row=await env.DB.prepare('SELECT endpoint,p256dh,auth FROM nearby_push_subscriptions WHERE endpoint_hash=? AND user_id IS NOT NULL AND consented_at IS NOT NULL')
  .bind(job.endpointHash).first();
 if(!row)return;
 const reserved=await reserveNearbyPushDelivery(env.DB,job.reportId,job.endpointHash);
 if(!reserved)return;
 try{
  const result=await sendNearbyParkingPush(env,row,{reportId:job.reportId,distanceMeters:job.distanceMeters});
  if(result.expired){await deleteExpiredPushSubscription(env.DB,job.endpointHash);return}
  if(!result.ok)throw Error('push_provider_'+result.status);
 }catch(error){
  await releaseNearbyPushDelivery(env.DB,job.reportId,job.endpointHash);
  throw error;
 }
}
export default {
 async queue(batch,env){
  for(const message of batch.messages){
   try{
    const job=message.body;
    if(job?.kind==='nearby-report')await fanout(env,job);
    else if(job?.kind==='nearby-delivery')await deliver(env,job);
    else throw Error('invalid_job_kind');
    message.ack();
   }catch(e){console.error('nearby_push_job_failed',String(e?.message||e));message.retry()}
  }
 }
};
