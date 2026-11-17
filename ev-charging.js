/* ROTAPARK EV charging stations — OpenStreetMap / Overpass, source-labelled, no invented availability. */
(function(){
'use strict';
var layer=null,active=false,controller=null,lastKey='',cache=new Map();
var endpoints=['https://overpass.kumi.systems/api/interpreter','https://overpass.nchc.org.tw/api/interpreter'];
function status(t){var e=document.getElementById('status');if(e)e.textContent=t}
function map(){return window.rotaparkLeafletMap}
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function center(){var m=map();return m&&m.getCenter()}
function query(c){var lat=c.lat,lng=c.lng;return '[out:json][timeout:24];(node["amenity"="charging_station"](around:15000,'+lat+','+lng+');way["amenity"="charging_station"](around:15000,'+lat+','+lng+'););out center 250;'}
async function load(){
 var m=map();if(!m||!window.L){status('⚠️ Harita henüz hazır değil.');return}
 if(controller)controller.abort();controller=new AbortController();var signal=controller.signal;
 var c=center(),key=c.lat.toFixed(2)+','+c.lng.toFixed(2);
 var data=cache.get(key);
 if(!data){
  status('⚡ Yakındaki gerçek şarj istasyonları yükleniyor…');
  var error=null;
  for(var i=0;i<endpoints.length;i++){
   try{
    var timeout=setTimeout(function(){controller.abort()},18000);
    var res=await fetch(endpoints[i],{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'data='+encodeURIComponent(query(c)),signal:signal});
    clearTimeout(timeout);
    if(!res.ok)throw Error('HTTP '+res.status);
    var json=await res.json();if(!Array.isArray(json.elements))throw Error('Invalid response');
    data=json.elements;cache.set(key,data);break;
   }catch(e){clearTimeout(timeout);error=e;if(signal.aborted)return}
  }
  if(!data){status('⚠️ Şarj istasyonu verisi alınamadı. Daha sonra tekrar deneyin.');return}
 }
 if(!active)return;
 if(layer)m.removeLayer(layer);layer=L.layerGroup().addTo(m);
 var seen=new Set(),n=0;
 data.forEach(function(p){
  var lat=p.lat||(p.center&&p.center.lat),lng=p.lon||(p.center&&p.center.lon);
  if(!Number.isFinite(lat)||!Number.isFinite(lng))return;
  var id=lat.toFixed(5)+','+lng.toFixed(5);if(seen.has(id))return;seen.add(id);
  var t=p.tags||{},name=t.name||t.operator||'Elektrikli araç şarj istasyonu';
  var marker=L.marker([lat,lng],{icon:L.divIcon({className:'',html:'<div style="width:30px;height:30px;border-radius:50%;background:#17120b;border:2px solid #f5c75b;color:#ffd86d;display:grid;place-items:center;box-shadow:0 2px 10px #000b;font-size:18px">⚡</div>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(layer);
  var html='<div style="min-width:190px"><strong>⚡ '+escapeHtml(name)+'</strong><p>Operatör: '+escapeHtml(t.operator||'Belirtilmemiş')+'</p><p>Bağlantı: '+escapeHtml(t['socket:type2']?'Type 2':'')+' '+escapeHtml(t['socket:ccs']?'CCS':'')+' '+escapeHtml(t['socket:chademo']?'CHAdeMO':'')+'</p><small>Kaynak: OpenStreetMap · Canlı doluluk doğrulanmadı</small><p><button type="button" class="rp-ev-nav">🚗 Yol tarifi</button></p></div>';
  marker.bindPopup(html);
  marker.on('popupopen',function(){var btn=marker.getPopup().getElement().querySelector('.rp-ev-nav');if(btn)btn.addEventListener('click',function(){if(window.rotaparkNavigateToParking)window.rotaparkNavigateToParking(lat,lng,name);else status('⚠️ Navigasyon henüz hazır değil.')})});
  n++;
 });
 lastKey=key;status('⚡ '+n+' şarj istasyonu haritada gösteriliyor · Kaynak: OpenStreetMap (15 km). Canlı doluluk bilgisi yok.');
}
window.rotaparkToggleEV=function(){
 var m=map();if(!m){status('⚠️ Harita yükleniyor, tekrar deneyin.');return}
 active=!active;
 if(!active){if(controller)controller.abort();if(layer)m.removeLayer(layer);status('⚡ Şarj istasyonu katmanı kapatıldı.');return}
 load();
};
})();