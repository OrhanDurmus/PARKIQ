import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('main HTML has parseable inline JavaScript',()=>{
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([,attributes,body])=>!(/\bsrc\s*=/.test(attributes))&&body.trim());
  assert.ok(scripts.length>=2,'Expected inline startup and application scripts');
  scripts.forEach(([,attributes,body],index)=>{
    if(/\btype\s*=\s*["']module["']/i.test(attributes)){
      const check=spawnSync(process.execPath,['--input-type=module','--check'],{input:body,encoding:'utf8'});
      assert.equal(check.status,0,'Module syntax error in inline script '+index+': '+check.stderr);
    }else{
      new Script(body,{filename:'index.html:inline-'+index});
    }
  });
});
test('critical navigation and parking controls are present',()=>{
  for(const id of ['map','parkingNameSearch','nearestFive','parkingList','navOverlay','navStop','navRecenter','navGpsQuality','navDiagnosticPanel','navDiagnosticText','navDiagnosticCopy','navDiagnosticClose','navDiagnostics','navCompact','navRemaining','navEta','mapSearchHere','mapLocateMe','mapFitParking']){
    assert.match(html,new RegExp('id=["\\x27]'+id+'["\\x27]'),'Missing #'+id);
  }
});
test('version in HTML matches deployed version manifest',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../version.json',import.meta.url),'utf8'));
  const version=html.match(/const APP_VERSION\s*=\s*['"]([^'"]+)['"]/);
  assert.ok(version,'Missing APP_VERSION');
  assert.equal(version[1],manifest.version);
});
test('navigation controls have handlers',()=>{
  for(const id of ['navStop','navCompact','navDiagnostics','navRecenter','mapHome','mapSearchHere','mapLocateMe','mapFitParking']){
    const direct=html.includes("$('"+id+"').onclick");
    const recenterAlias=id==='navRecenter'&&/\brecenter\s*=\s*\$\(['"]navRecenter['"]\)/.test(html)&&/\brecenter\.onclick\s*=/.test(html);
    const delegatedDiagnostics=id==='navDiagnostics'&&/document\.addEventListener\(['"]click['"]/.test(html)&&html.includes("closest('#navDiagnostics,#navDiagnosticClose,#navDiagnosticCopy')")&&html.includes("button.id==='navDiagnostics'")&&html.includes('openReport()');
    assert.ok(direct||recenterAlias||delegatedDiagnostics,'Missing click handler for '+id);
  }
});

test('diagnostics button actually opens, copies and closes the report',async()=>{
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const diagnostic=scripts.map(m=>m[2]).find(body=>body.includes("function openReport()")&&body.includes("navDiagnosticCopy"));
  assert.ok(diagnostic,'Missing standalone diagnostics script');
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{
      id,hidden:id==='navDiagnosticPanel',style:{},textContent:id==='navGpsQuality'?'● GPS iyi ±9 m':'',value:'',
      parentElement:null,attributes:{},setAttribute(k,v){this.attributes[k]=v},getAttribute(k){return this.attributes[k]??null},
      focus(){},select(){}
    });
    return elements.get(id);
  }
  const body={appendChild(node){node.parentElement=body}};
  let listener,clipboard='';
  const document={
    body,documentElement:{innerHTML:html},
    getElementById:element,
    addEventListener(type,fn,capture){if(type==='click'&&capture)listener=fn}
  };
  runInNewContext(diagnostic,{document,navigator:{onLine:true,clipboard:{writeText:async text=>{clipboard=text}}},Date});
  assert.equal(typeof listener,'function');
  const event=id=>({target:{closest:()=>element(id)},preventDefault(){},stopImmediatePropagation(){}});
  listener(event('navDiagnostics'));
  assert.equal(element('navDiagnosticPanel').hidden,false);
  assert.match(element('navDiagnosticText').value,/GPS:/);
  assert.ok(element('navDiagnosticText').value.includes('Sürüm: '+JSON.parse(readFileSync(new URL('../version.json',import.meta.url),'utf8')).version));
  listener(event('navDiagnosticCopy'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(clipboard,element('navDiagnosticText').value);
  listener(event('navDiagnosticClose'));
  assert.equal(element('navDiagnosticPanel').hidden,true);
  assert.equal(element('navDiagnostics').attributes['aria-expanded'],'false');
  // Offline state must remain reportable even when the route has no network.
  const offlineDocument={...document,addEventListener(type,fn,capture){if(type==='click'&&capture)offlineListener=fn}};
  let offlineListener;
  runInNewContext(diagnostic,{document:offlineDocument,navigator:{onLine:false},Date});
  offlineListener(event('navDiagnostics'));
  assert.match(element('navDiagnosticText').value,/Bağlantı: çevrimdışı/);
  offlineListener(event('navDiagnosticCopy'));
  assert.equal(element('navDiagnosticCopy').textContent,'Metni seçip kopyalayın');
  offlineListener(event('navDiagnosticClose'));
  assert.equal(element('navDiagnosticPanel').hidden,true);
});

test('stale GPS fixes are rejected before route progress is updated',()=>{
  assert.match(html,/Date\.now\(\)-pos\.timestamp>15000/);
  assert.match(html,/GPS ölçümü güncel değil/);
  assert.match(html,/GPS zaman bilgisi geçersiz/);
});

test('stale geolocation callbacks cannot update a new tracking session',()=>{
  assert.match(html,/gpsTrackingSession=0/);
  assert.match(html,/currentGpsSession=\+\+gpsTrackingSession/);
  assert.match(html,/watchPosition\(pos=>\{if\(currentGpsSession!==gpsTrackingSession\)return/);
  assert.match(html,/err=>\{if\(currentGpsSession!==gpsTrackingSession\)return/);
  assert.match(html,/function stopTracking\(\)\{(?:cancelNavMotion\(\);)?(?:stopDrive3d\(\);)?gpsTrackingSession\+\+/);
});

test('foreground GPS probe callbacks respect the active tracking session',()=>{
  assert.match(html,/currentProbeSession=gpsTrackingSession/);
  assert.match(html,/currentProbeSession!==gpsTrackingSession/);
  assert.match(html,/currentProbeSession===gpsTrackingSession/);
});

test('async reroute results cannot overwrite a restarted GPS session',()=>{
  assert.match(html,/const rerouteSession=gpsTrackingSession/);
  assert.match(html,/if\(gpsTrackingSession!==rerouteSession\|\|navigationRequestId!==rerouteRequestId/);
});

test('stale reroute cleanup cannot reset a new navigation reroute',()=>{
  assert.match(html,/finally\{if\(gpsTrackingSession===rerouteSession&&navigationRequestId===rerouteRequestId\)rerouting=false/);
  assert.match(html,/function stopTracking\(\)\{(?:cancelNavMotion\(\);)?(?:stopDrive3d\(\);)?gpsTrackingSession\+\+;rerouting=false/);
});

test('reroute result requires a fresh trusted GPS fix before replacing route',()=>{
  assert.match(html,/if\(gpsSignalLost\|\|gpsQualityRecoveryPending\|\|!gpsLastAcceptedAt\|\|Date\.now\(\)-gpsLastAcceptedAt>15000\)/);
  assert.match(html,/Rota hesaplandı ancak GPS konumu güncel değil/);
});

const navigationVoice = readFileSync(new URL('../navigation-voice.js', import.meta.url), 'utf8');

function loadNavigationSpeech({useVoiceEngine = true, azureAvailable = true} = {}) {
  const requests = [];
  const utterances = [];
  const turkishVoice = {lang: 'tr_TR'};
  const context = {
    AbortController, setTimeout, clearTimeout,
    console: {info() {}},
    document: {
      createElement: () => ({style: {}, setAttribute() {}, pause() {}, async play() {}}),
      body: {appendChild() {}},
      getElementById: () => null,
    },
    URL: {createObjectURL: () => 'blob:voice', revokeObjectURL() {}},
    async fetch(url, options) {
      requests.push({url, ...JSON.parse(options.body)});
      return {ok: azureAvailable, status: 503, blob: async () => ({size: 1})};
    },
    speechSynthesis: {
      getVoices: () => [{lang: 'en-US'}, turkishVoice],
      cancel() {},
      speak: utterance => utterances.push(utterance),
    },
    SpeechSynthesisUtterance: class {
      constructor(text) { this.text = text; }
    },
  };
  context.window = context;
  let playback;
  if (useVoiceEngine) {
    runInNewContext(navigationVoice, context);
    const {speak} = context.RotaParkVoice;
    context.RotaParkVoice.speak = text => { playback = speak(text); };
  }
  const source = html.match(/const speakTurkish=sentence=>\{[\s\S]*?\};(?=const decodeWalkShape)/)?.[0];
  assert.ok(source, 'Expected the navigation speech entry point');
  const speakTurkish = runInNewContext(source + 'speakTurkish', context);
  return {
    async speak(input) {
      assert.equal(speakTurkish(input), true);
      await playback;
    },
    requests, utterances, turkishVoice,
  };
}

const turkishCommands = [
  ['Sağa dönün', 'Sağa dönün'],
  ['Sola dönün', 'Sola dönün'],
  ['Düz devam edin', 'Düz devam edin'],
  ['50 metre sonra hafif sağa dönün.', '50 metre sonra hafif sağa dönün.'],
  ['⬅️ Hafif sola dönün · 50 m', 'Hafif sola dönün'],
  ['Sağa dön, düz devam et.', 'Sağa dönün, düz devam edin.'],
  ['Yola çıkın, yola katılın.', 'Yola çıkın, yola katılın.'],
  ['Geri dönünüz.', 'Geri dönünüz.'],
];

test('navigation sends whole Turkish imperatives to the Azure endpoint', async () => {
  const {speak, requests} = loadNavigationSpeech();
  for (const [input] of turkishCommands) await speak(input);
  assert.deepEqual(requests, turkishCommands.map(([, text]) => ({url: '/api/tts', text, style: 'clear'})));
});

test('navigation sends the same text to phone TTS with the Turkish voice', async () => {
  for (const useVoiceEngine of [true, false]) {
    const {speak, utterances, turkishVoice} = loadNavigationSpeech({
      useVoiceEngine, azureAvailable: false,
    });
    for (const [input, expected] of turkishCommands) {
      await speak(input);
      const utterance = utterances.pop();
      assert.equal(utterance?.text, expected);
      assert.equal(utterance.lang, 'tr-TR');
      assert.equal(utterance.voice, turkishVoice);
    }
  }
});

test('parking uses one shared İSPARK request and reuses it for late live occupancy', async () => {
 const load = html.split('function loadIsparkOccupancy(){')[1]?.split(" window.addEventListener('online'")[0];
 const refresh = html.match(/function currentIsparkLive\(point\)\{[\s\S]*?(?=const parkingOperatorAssets)/)?.[0];
 assert.ok(load && refresh, 'Expected parking data loading functions');
 assert.equal(load.match(/fetch\('\/api\/ispark-occupancy'/g)?.length, 1);
 assert.match(load, /refreshIsparkOccupancy\(seq,occupancyPromise,false\)/);

 const point = {name: 'İSPARK Test', lat: 41, lng: 29};
 let renders = 0;
 const context = {parkingSeq: 2, allParking: [point], showParking: () => renders++,clearTimeout,setTimeout:()=>1,dist:()=>0};
 const apply = runInNewContext(refresh + ';refreshIsparkOccupancy', context);
 await apply(1, Promise.resolve({points: [{...point, verifiedLive: true, freeSpaces: 5}]}));
 assert.equal(renders, 0);
 await apply(2, Promise.resolve({points: [{...point, sourceSnapshot: true, freeSpaces: 5}]}));
 assert.equal(renders, 0);
 const live = {...point, verifiedLive: true, freeSpaces: 5,occupancyUpdatedAt:new Date().toISOString()};
 await apply(2, Promise.resolve({points: [live]}));
 assert.equal(point.isparkLive, live);
 assert.equal(renders, 1);
 await apply(2, Promise.resolve({upstreamUnavailable:true,points:[live]}));
 assert.equal(point.isparkLive,null);
 assert.equal(renders,2);
 await apply(2, Promise.resolve({points:[{...live,occupancyUpdatedAt:new Date(Date.now()-901000).toISOString()}]}));
 assert.equal(point.isparkLive,null);
});

test('parking publishes map data before slow business data and coalesces repeated searches', async () => {
 const source = html.split('const parkingCacheMs=')[1]?.split(" window.addEventListener('online'")[0];
 assert.ok(source);
 const center={lat:41.0082,lng:28.9784};
 const osmPoint={...center,name:'Map parking'};
 const businessPoint={lat:41.01,lng:28.98,name:'Verified parking'};
 const responses=new Map();
 const requests=[];
 const renders=[];
 const elements={searchRadius:{value:'10'},parking:{}};
 const context={
  navigator:{onLine:true},map:{getCenter:()=>center,distance:()=>0},
  allParking:[],parkingAbort:null,parkingSeq:0,parkingDataStale:false,selectedParkingOperator:null,lastParkingFetchCenter:null,lastParkingSuccessAt:0,
  AbortController,setTimeout,clearTimeout,
  $:id=>elements[id],status(){},updateParkingFreshness(){},
  showParking:()=>renders.push(context.allParking.map(p=>p.name)),
  fetch(url){
   const path=url.split('?')[0];
   requests.push(path);
   return new Promise(resolve=>responses.set(path,points=>resolve({ok:true,json:async()=>({points})})));
  }
 };
 const load=runInNewContext('const parkingCacheMs='+source+';loadParking',context);
 const first=load();
 const repeated=load();
 responses.get('/api/parking')([osmPoint]);
 await new Promise(resolve=>setImmediate(resolve));
 assert.deepEqual(Array.from(renders[0]), ['Map parking']);
 assert.equal(renders.length,1);
 responses.get('/api/business-parking')([businessPoint]);
 responses.get('/api/ispark-occupancy')([]);
 context.refreshIsparkOccupancy=async()=>false;
 await Promise.all([first,repeated]);
 assert.deepEqual(Array.from(renders[1]), ['Map parking','Verified parking']);
 await load();
 assert.deepEqual(requests,['/api/parking','/api/business-parking','/api/ispark-occupancy']);
});

test('municipal shortcuts select the operator and load its city at 30 km', () => {
 const source=html.match(/const parkingOperatorCenters=\{[\s\S]*?(?=window.rotaparkFocusLocation)/)?.[0];
 assert.ok(source);
 const asset=readFileSync(new URL('../themes/rotapark-premium-home.js',import.meta.url),'utf8');
 assert.match(asset,/\['İSPARK','ANPARK','İZELMAN'\]\.includes\(a\[1\]\)/);
 const elements={q:{value:'previous search'},searchRadius:{value:'10'},mapWrap:{classList:{contains:()=>false},scrollIntoView(){}}};
 const loads=[];
 let center,zoom,finish;
 const context={
  window:{matchMedia:()=>({matches:false})},$:(id)=>elements[id],selectedParkingOperator:null,
  routeWatch:null,parkingTimer:null,clearTimeout,
  map:{
   stop(){},getZoom:()=>zoom,getCenter:()=>center,distance:()=>100,
   once(event,callback){assert.equal(event,'moveend');finish=callback;},
   off(event,callback){assert.equal(event,'moveend');assert.equal(finish,callback);finish=null;},
   flyTo(position,level,options){center=Array.from(position);zoom=level;assert.ok(options.duration>0);}
  },
  resetParkingFilterValues(){context.selectedParkingOperator=null;},showParking(){},
  loadParking(){loads.push([context.selectedParkingOperator,center,zoom,elements.searchRadius.value,elements.q.value]);}
 };
 runInNewContext(source,context);
 assert.equal(context.window.rotaparkFilterOperator('İSPARK'),true);
 assert.equal(context.window.rotaparkFilterOperator('ANPARK'),true);
 assert.equal(loads.length,0);
 finish();
 for(const operator of ['İZELMAN','İSPARK']){
  assert.equal(context.window.rotaparkFilterOperator(operator),true);
  finish();
 }
 assert.deepEqual(loads,[
  ['ANPARK',[39.9334,32.8597],13,'30',''],
  ['İZELMAN',[38.4237,27.1428],13,'30',''],
  ['İSPARK',[41.0082,28.9784],13,'30','']
 ]);
 assert.equal(context.window.rotaparkFilterOperator('toString'),false);
 assert.match(html,/allParking\.filter\(p=>\(!selectedParkingOperator\|\|corporateOperator\(p\)===selectedParkingOperator\)/);
});

test('reviewed İSPARK aliases preserve catalog and OSM coordinates without merging unconfirmed neighbors',()=>{
 const source=html.match(/const reviewedIsparkOsm=\{[\s\S]*?(?=function matchesParkingRegion)/)?.[0];
 assert.ok(source);
 const api=runInNewContext(source+';({mergeReviewedOsm,mergeMunicipalParking})',{corporateOperator:()=> 'İSPARK',dist:()=>0});
 const way={osmType:'way',osmId:'719661158',name:'Merter',fee:'yes',lat:41.01,lng:28.88};
 const node={osmType:'node',osmId:'7592484269',name:'Merter',fee:'unknown',lat:41.011,lng:28.881};
 const other={osmType:'node',osmId:'4876032103',name:'Bostancı Vergi Dairesi',fee:'yes',lat:40.96,lng:29.1};
 const catalog={id:'ispark:2793',operator:'İSPARK',isparkParkID:'2793',name:'İspark Merter Katlı Otoparkı',fee:'unknown',lat:41.012,lng:28.882};
 const bostanci={id:'ispark:2150',operator:'İSPARK',isparkParkID:'2150',name:'Bostancı Vergi Dairesi Açık Otoparkı',fee:'unknown',lat:40.961,lng:29.101};
 const result=api.mergeMunicipalParking(api.mergeReviewedOsm([node,way,other]),[catalog,bostanci],'İSPARK');
 assert.equal(result.length,3);
 assert.equal(result[0].id,catalog.id);
 assert.equal(result[0].osmId,way.osmId);
 assert.equal(result[0].osmAliases[0].osmId,node.osmId);
 assert.equal(result[0].fee,'yes');
 assert.equal(result[0].lat,way.lat);
 assert.equal(result[0].catalogCoordinates.lat,catalog.lat);
 assert.strictEqual(result[1],other);
 assert.equal(result[2].id,bostanci.id);
});

test('operator refresh keeps last complete sources through delayed, failed and partial replies',async()=>{
 const source=html.split('const parkingCacheMs=')[1]?.split(" window.addEventListener('online'")[0];
 const classifier=html.match(/function isOfficialIspark\(p\)\{[\s\S]*?(?=function corporateOperator)/)?.[0];
 assert.ok(source&&classifier);
 const center={lat:41.0082,lng:28.9784};
 const catalog={...center,id:'ispark:1',isparkParkID:'1',operator:'İSPARK',name:'Official site',sourceSnapshot:true};
 const primary={lat:41.02,lng:28.98,osmId:'node/7',operator:'İSPARK',name:'Tagged site'};
 const unsupported={lat:41.03,lng:28.98,osmId:'node/8',name:'Kartal İspark'};
 const storage=new Map();
 const makeContext=()=>{
  const responses=new Map(),renders=[];
  const ctx={
   sessionStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
   navigator:{onLine:true},map:{getCenter:()=>center,distance:()=>0},
   allParking:[],parkingAbort:null,parkingSeq:0,parkingDataStale:false,selectedParkingOperator:'İSPARK',lastParkingFetchCenter:null,lastParkingSuccessAt:0,
   parkingOperatorAssets:{'İSPARK':'/data/catalog.json'},
   AbortController,setTimeout,clearTimeout,
   $:id=>id==='searchRadius'?{value:'30'}:{},status(){},updateParkingFreshness(){},refreshIsparkOccupancy:async()=>false,
   corporateOperator:p=>operator(p)?'İSPARK':null,dist:()=>999,
   showParking:()=>renders.push(Array.from(ctx.allParking).filter(operator).map(p=>p.id||p.osmId).sort()),
   fetch(url){
    const path=url.split('?')[0];
    if(path==='/api/ispark-occupancy')return Promise.resolve(Response.json({points:[]}));
    return new Promise(resolve=>responses.set(path,resolve));
   }
  };
  const {load,operator}=runInNewContext(classifier+';const parkingCacheMs='+source+';({load:loadParking,operator:isOfficialIspark})',ctx);
  return {responses,renders,load,operator};
 };
 async function request(app,osm,catalogResponse=Response.json({points:[catalog]})){
  const loading=app.load({force:true});
  app.responses.get('/data/catalog.json')(catalogResponse);
  app.responses.get('/api/business-parking')(Response.json({points:[]}));
  const renderCount=app.renders.length;
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(app.renders.length,renderCount,'Do not publish a transient catalog-only result');
  app.responses.get('/api/parking')(osm);
  await loading;
 }
 let app=makeContext();
 assert.equal(app.operator(unsupported),false);
 assert.equal(app.operator({...primary,operator:'Bağcılar Belediyesi İspark'}),true);
 const expected=['ispark:1','node/7'];
 await request(app,Response.json({points:[primary,unsupported]}));
 await request(app,new Response(null,{status:503}));
 await request(app,Response.json({points:[]},{headers:{'X-Parking-Partial':'1'}}));
 await request(app,Response.json({points:[primary]}),new Response(null,{status:503}));
 assert.deepEqual(app.renders,[expected,expected,expected,expected]);
 app=makeContext();
 await request(app,new Response(null,{status:503}));
 assert.deepEqual(app.renders,[expected]);
 await request(app,Response.json({points:[]}));
 assert.deepEqual(app.renders.at(-1),['ispark:1'],'A complete source can intentionally remove records');
 storage.clear();
 app=makeContext();
 await request(app,Response.json({points:[primary]},{headers:{'X-Parking-Partial':'1'}}));
 await request(app,new Response(null,{status:503}));
 assert.deepEqual(app.renders,[expected,expected],'A verified subset also survives when no complete response has arrived');
});
