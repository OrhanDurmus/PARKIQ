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

test('parking uses one İSPARK request per search and reuses it for late live occupancy', async () => {
 const load = html.split('async function loadParking(){')[1]?.split(" window.addEventListener('online'")[0];
 const refresh = html.match(/async function refreshIsparkOccupancy\(seq,occupancyPromise\)\{.*?\}(?=window.rotaparkFilterOperator)/)?.[0];
 assert.ok(load && refresh, 'Expected parking data loading functions');
 assert.equal(load.match(/fetch\('\/api\/ispark-occupancy'/g)?.length, 1);
 assert.match(load, /refreshIsparkOccupancy\(seq,occupancyPromise\)/);

 const point = {name: 'İSPARK Test', lat: 41, lng: 29};
 let renders = 0;
 const context = {parkingSeq: 2, allParking: [point], showParking: () => renders++};
 const apply = runInNewContext(refresh + ';refreshIsparkOccupancy', context);
 await apply(1, Promise.resolve({points: [{...point, verifiedLive: true, freeSpaces: 5}]}));
 assert.equal(renders, 0);
 await apply(2, Promise.resolve({points: [{...point, sourceSnapshot: true, freeSpaces: 5}]}));
 assert.equal(renders, 0);
 const live = {...point, verifiedLive: true, freeSpaces: 5};
 await apply(2, Promise.resolve({points: [live]}));
 assert.equal(point.isparkLive, live);
 assert.equal(renders, 1);
});

test('initial map uses a valid last viewport or central Istanbul', () => {
 const declaration = html.match(/function initialParkingView\(\)\{[\s\S]*?\n\}(?=\nfunction updateParkingFilterCount)/)?.[0];
 assert.ok(declaration);
 const getView = saved => runInNewContext(declaration + ';JSON.stringify(initialParkingView())', {read: () => saved});
 assert.deepEqual(JSON.parse(getView({lat:38.42,lng:27.13,zoom:14})), [[38.42,27.13],14]);
 for(const saved of [null,{lat:99,lng:27,zoom:14},{lat:38,lng:27,zoom:50}]){
   assert.deepEqual(JSON.parse(getView(saved)), [[41.0082,28.9784],11]);
 }
 const init = html.split('function init(){')[1]?.split("map.on('zoomend'")[0];
 assert.match(init, /setView\(\.\.\.initialParkingView\(\)\)/);
 assert.doesNotMatch(init, /permissions\.query|locateOnStartup/);
});

test('parking combines source identities and respects exclusions', () => {
 const declaration = html.match(/function combineParkingRecords\(points,excluded\)\{[\s\S]*?\n\}(?=\nasync function loadParking)/)?.[0];
 assert.ok(declaration);
 const combine = runInNewContext(declaration + ';combineParkingRecords');
 const verified = {lat:41,lng:29,osmId:'101',osmType:'node',isparkParkID:7,verifiedBusiness:true};
 const osm = {...verified,osmId:'node/101',verifiedBusiness:false};
 const official = {lat:41,lng:29.001,isparkParkID:'7',name:'İSPARK'};
 const excluded = {lat:41,lng:29.002,osmId:'way/102'};
 assert.deepEqual(Array.from(combine([verified,osm,official,excluded],new Set(['way/102']))),[verified]);
});

test('parking links use a nearby confirmed entrance and fall back to the facility coordinates', () => {
 const source = html.match(/function parkingNavigationLinks\([\s\S]*?\n\}(?=\nfunction parkingCardNavigation)/)?.[0];
 assert.ok(source);
 const document = {createElement: tag => ({tag,children:[],setAttribute(){},appendChild(node){this.children.push(node)}})};
 const links = runInNewContext(source+';parkingNavigationLinks',{document,dist:()=>40});
 const point = {lat:41,lng:29,entranceLat:41.001,entranceLng:29.001,entranceVerified:true};
 const confirmed = links(point).children;
 assert.equal(confirmed.length,3);
 for(const link of confirmed)assert.match(decodeURIComponent(link.href), /41\.001,29\.001/);
 const fallback = links({...point,entranceVerified:false}).children;
 assert.equal(fallback[3].tag,'small');
 for(const link of fallback.slice(0,3))assert.match(decodeURIComponent(link.href), /41,29/);
 assert.equal(links({lat:null,lng:29}),null);
});
