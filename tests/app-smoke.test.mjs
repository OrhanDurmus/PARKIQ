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
test('regional parking refresh preserves cache until replacement data succeeds',()=>{
  const load=html.split('async function loadParking(){')[1]?.split("window.addEventListener('online'")[0];
  const move=html.split("map.on('moveend',()=>{").at(-1)?.split('setTimeout(loadParking,400)')[0];
  assert.ok(load&&move,'Parking refresh and map move handlers must exist');
  assert.ok(!load.includes('allParking=[];lastParkingFetchCenter=null'),'Loading another region must not discard the last successful data');
  assert.ok(!move.includes('allParking=[];lastParkingFetchCenter=null'),'Panning must not discard cached parking data');
  assert.ok(load.includes('lastParkingFetchCenter=c;lastParkingSuccessAt=Date.now()'),'Only a successful fetch should update the cache center');
  assert.ok(move.includes('showParking();updateParkingFreshness(true)'),'Old-city pins should be filtered out while the next region loads');
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
