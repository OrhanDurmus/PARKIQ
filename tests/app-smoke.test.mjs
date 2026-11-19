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

function operatorParkingFixture({inViewport = () => true, resolveOperator = point => point.operator} = {}) {
 const nodes = new Map();
 const element = () => ({
  children: [], attributes: {}, dataset: {}, classList: {toggle() {}, contains: () => false},
  append(...children) {this.children.push(...children);},
  appendChild(child) {this.append(child);},
  replaceChildren() {this.children = [];},
  setAttribute(name, value) {this.attributes[name] = value;},
  addEventListener(name, listener) {this[name] = listener;},
  scrollIntoView() {},
 });
 const $ = id => {
  if (!nodes.has(id)) nodes.set(id, element());
  return nodes.get(id);
 };
 $('legacyParkingCards').hidden = true;
 const buttons = [];
 const document = {
  createElement: element,
  querySelectorAll: selector => selector === '[data-parking-operator]'
   ? buttons.filter(button => button.dataset.parkingOperator)
   : [],
 };
 const navigator = {onLine: true};
 const pending = [];
 const markers = [];
 const markerLocations = [];
 const parkingLayer = {clearLayers() {markers.length = 0;markerLocations.length = 0;}};
 const window = {};
 let center = {lat: 41, lng: 29};
 const map = {
  setView([lat, lng]) {center = {lat, lng};},
  getCenter: () => center,
  invalidateSize() {},
  getZoom: () => 12,
  getBounds: () => ({contains: inViewport, pad: () => ({contains: () => true})}),
  project: ([lat, lng]) => ({x: lng, y: lat}),
  distance: () => 0,
 };
 const L = {
  divIcon: options => options,
  marker(coords, options) {
   return {
    addTo(layer) {assert.equal(layer, parkingLayer);markers.push(options.title);markerLocations.push(coords);return this;},
    on() {},
    bindPopup() {},
   };
  },
 };
 const context = {
  $, window, document, navigator, map, L, parkingLayer, AbortController,
  setTimeout: () => 1, clearTimeout() {}, allParking: [], parkingSeq: 0,
  parkingAbort: null, parkingTimer: null, parkingListLimit: 60, quickMode: 'all',
  lastParkingFetchCenter: null, lastParkingSuccessAt: 0, parkingDataStale: false, parkingDataPartial: false, routeWatch: null,
  routeGeometry: null, visibleParkingResults: [], parkingType: {}, favKey: 'favorites',
  corporateOperator: resolveOperator, parkingDisplayName: point => point.name,
  fresh: () => false, dist: () => 0, tariffLine: () => '', isSmyrnaParking: () => false,
  renderFavorites() {}, read: () => [], status() {},
  updateParkingFreshness(stale, partial = context.parkingDataPartial) {
   context.parkingDataStale = stale;context.parkingDataPartial = partial;
  },
  fetch(url, options) {
   if (url.startsWith('/api/parking?')) {
    return new Promise(resolve => pending.push({
     url, signal: options.signal,
     finish: points => resolve({ok: true, json: async () => ({points})}),
    }));
   }
   return Promise.resolve({ok: true, json: async () => ({points: []})});
  },
 };
 const part = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, 'Expected source section ' + start);
  return source.slice(from, to);
 };
 runInNewContext([
  part(html, 'const normalizeParkingPlace=', 'window.rotaparkFocusLocation='),
  part(html, 'let parkingTraceApi=', "$('navSearch').onclick="),
  part(html, 'async function loadParking(){', " window.addEventListener('online'"),
  part(html, 'window.rotaparkClearParkingOperator=', "$('resetFilters').onclick="),
 ].join("\n"), context);

 const theme = readFileSync(new URL('../themes/rotapark-premium-home.js', import.meta.url),'utf8');
 Object.assign(context, {quick: {appendChild: button => {buttons.push(button);if(button.id)nodes.set(button.id,button);}}});
 runInNewContext(part(theme, "  [['📍','En Yakın'", '  if(search)search.insertAdjacentElement'), context);
 const select = operator => buttons.find(button => button.dataset.parkingOperator === operator).click();
 const verify = (operator, count, loading = false) => {
  for (const button of document.querySelectorAll('[data-parking-operator]')) {
   assert.equal(button.attributes['aria-pressed'], String(button.dataset.parkingOperator === operator));
  }
  assert.equal(String($('summaryTotal').textContent), loading?'—':String(count));
  assert.equal($('emptyNotice').hidden, loading||count>0);
  const nearby = $('nearestFive').children.filter(node => node.className === 'near-item');
  assert.deepEqual(nearby.map(node => node.children[0].textContent),
   Array.from({length: count}, (_, index) => operator + ' ' + index));
  assert.deepEqual(markers, count > 1 ? [count + ' otopark · Yakınlaştır']
   : count === 1 ? [operator + ' 0 · Doluluk bilinmiyor'] : []);
 };
 return {select, verify, pending, navigator, $, markerLocations, markers, map, reset:()=>$('parkingOperatorReset').click()};
}

const operatorPoints = operator => [
 {name:operator + ' 0', operator, lat:39, lng:29},
 ...(operator === 'İZELMAN' ? [{name:operator + ' 1', operator, lat:39, lng:29.001}] : []),
 {name:'Anonim otopark', lat:39, lng:29.002},
 {name:'Başka işletmeci', operator:operator === 'ANPARK' ? 'İSPARK' : 'ANPARK', lat:39, lng:29.003},
];
const settleParking = () => new Promise(resolve => setImmediate(resolve));

test('operator buttons replace pins, clusters, count and nearby results together', async () => {
 const {select, verify, pending} = operatorParkingFixture();
 for (const operator of ['İZELMAN','İSPARK','ANPARK','İZELMAN']) {
  select(operator);
  verify(operator, 0, true);
  const request = pending.at(-1);
  select(operator);
  assert.equal(pending.at(-1), request, 'repeated selection while loading must reuse the request');
  request.finish(operatorPoints(operator));
  await settleParking();
  verify(operator, operator === 'İZELMAN' ? 2 : 1);
  select(operator);
  assert.equal(pending.at(-1), request, 'repeated selection after success must keep the results');
 }
 assert.equal(pending.length, 4);
 assert.match(pending[1].url, /lat=41\.0082&lng=28\.9784&radius=30$/);
});

test('superseded operator requests cannot render, including when the new selection is offline', async () => {
 const {select, verify, pending, navigator} = operatorParkingFixture();
 select('İZELMAN');
 select('İSPARK');
 select('ANPARK');
 assert.equal(pending[0].signal.aborted, true);
 assert.equal(pending[1].signal.aborted, true);
 pending[2].finish(operatorPoints('ANPARK'));
 await settleParking();
 for (const [index, operator] of [[0,'İZELMAN'],[1,'İSPARK']]) {
  pending[index].finish(operatorPoints(operator));
  await settleParking();
  verify('ANPARK', 1);
 }
 select('İSPARK');
 navigator.onLine = false;
 select('İZELMAN');
 assert.equal(pending[3].signal.aborted, true);
 pending[3].finish(operatorPoints('İSPARK'));
 await settleParking();
 verify('İZELMAN', 0, true);
 navigator.onLine = true;
 select('İZELMAN');
 pending[4].finish(operatorPoints('İZELMAN'));
 await settleParking();
 verify('İZELMAN', 2);
});


test('empty results wait for the latest load and clearing the operator restores regional results', async () => {
 const {select, verify, pending, $, reset, map} = operatorParkingFixture();
 select('ANPARK');
 verify('ANPARK', 0, true);
 reset();
 verify(null, 0, true);
 pending[0].finish([]);
 await settleParking();
 verify(null, 0);
 select('İSPARK');
 verify('İSPARK', 0, true);
 pending[1].finish(operatorPoints('İSPARK'));
 await settleParking();
 verify('İSPARK', 1);
 assert.equal($('parkingOperatorReset').hidden,false);
 const beforeCenter=map.getCenter(),beforeRadius=$('searchRadius').value,beforeRequests=pending.length;
 reset();
 assert.equal($('parkingOperatorReset').hidden,true);
 assert.deepEqual(map.getCenter(),beforeCenter);
 assert.equal($('searchRadius').value,beforeRadius);
 assert.equal(pending.length,beforeRequests,'clearing the filter must reuse all regional records');
 assert.equal($('summaryTotal').textContent, 3);
 assert.equal($('emptyNotice').hidden, true);
 assert.equal($('nearestFive').children.filter(node => node.className === 'near-item').length, 3);
});


test('a cluster with visible members must keep its marker inside the viewport', async () => {
 const inViewport = ([, lng]) => lng >= 29;
 const {select, verify, pending, markerLocations} = operatorParkingFixture({inViewport});
 select('İSPARK');
 pending[0].finish([
  {name:'İSPARK 0', operator:'İSPARK', lat:41, lng:29.001},
  {name:'İSPARK 1', operator:'İSPARK', lat:41, lng:28.990},
  {name:'İSPARK 2', operator:'İSPARK', lat:41, lng:28.991},
 ]);
 await settleParking();
 verify('İSPARK', 3);
 assert.equal(markerLocations.filter(inViewport).length, 1);
});

test('ambiguous operator tags stay in general results and are excluded from operator shortcuts', async () => {
 const {select, verify, pending, reset, $} = operatorParkingFixture();
 select('İSPARK');
 pending[0].finish([
  {name:'İSPARK 0',operator:'İSPARK',lat:41,lng:29},
  {name:'İZELMAN',operator:'İSPARK',lat:41,lng:29.001},
 ]);
 await settleParking();
 verify('İSPARK', 1);
 reset();
 assert.equal($('summaryTotal').textContent, 2);
});

test('a delayed city lookup cannot replace the latest province search', async () => {
 const from = html.indexOf("$('search').onclick=async");
 const to = html.indexOf("$('q').addEventListener", from);
 const pending = new Map();
 const centers = {
  Bursa: {lat:'40.195',lon:'29.06',name:'Bursa',type:'city',display_name:'Bursa'},
  Ankara: {lat:'39.9334',lon:'32.8597',name:'Ankara',type:'city',display_name:'Ankara'},
 };
 const q = {value:'Bursa'};
 const search = {};
 const views = [];
 const fields = {q,search,map:{scrollIntoView(){}},parkingNameSearch:{},feeFilter:{},kindFilter:{}};
 const context = {
  $: id => fields[id],
  window:{rotaparkClearParkingOperator(){}},
  document:{querySelectorAll:()=>[]},
  parkingSelectionRevision:0,
  allParking:[{name:'Ankara Demir Spor Kulübü · Otopark',lat:41,lng:29}],
  parkingProvinceNames:new Set(['bursa','ankara']),
  normalizeParkingPlace:s=>s.toLowerCase(),
  status(){},loadParking(){},
  map:{setView:point=>views.push(Array.from(point))},
  fetch(url){
   const query=new URL(url).searchParams;
   const city=query.get('q').split(',')[0];
   const response={ok:true,json:async()=>[centers[city]]};
   if(city==='Bursa'&&!query.has('featuretype')){
    return new Promise(resolve=>pending.set(city,()=>resolve(response)));
   }
   return Promise.resolve(response);
  },
 };
 runInNewContext(html.slice(from,to),context);
 const outdated=search.onclick();
 q.value='Ankara';
 await search.onclick();
 pending.get('Bursa')();
 await outdated;
 assert.deepEqual(views, [[39.9334,32.8597]]);
});

test('conflicting live operator labels cannot acquire a corporate badge in general results', () => {
 const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)+start.length));
 const context={officialTariff:()=>null,officialOperatorListing:()=>null,izelmanExactOfficialName:()=>false};
 runInNewContext(section('const normalizeParkingPlace=','const parkingOperatorCenters=')+
  section('function isOfficialIspark','function parkingDisplayName'),context);
 // Observed in BOTH real APIs on 2026-11-19: preserve this record, but do not
 // choose one of its contradictory labels as the corporate badge/filter.
 const conflict={osmType:'way',osmId:'866788590',name:'İZELMAN',operator:'İSPARK',lat:38.42,lng:27.14};
 assert.equal(context.corporateOperator(conflict),null);
 assert.equal(context.parkingFilterOperator(conflict),null);
 assert.equal(context.isOfficialIspark({...conflict,name:'İSPARK Test',operator:'İSPARK'}),true);
 assert.equal(context.corporateOperator({...conflict,name:'İZELMAN Test',operator:'İZELMAN A.Ş.'}),'İZELMAN');
 assert.equal(context.corporateOperator({...conflict,name:'ANPARK Test',operator:'ANPARK',lat:39.9334,lng:32.8597}),'ANPARK');
 assert.equal(context.corporateOperator({...conflict,sourceSnapshot:true,isparkParkID:'123'}),'İSPARK');
});

test('real ANPARK directory survives operator switches and restores all regional OSM records', async () => {
 const section=(start,end)=>html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start)+start.length));
 const context={fetch:async()=>({ok:false})};
 runInNewContext(section('const officialParkingTariffs=','function parkingDisplayName')+
  section('const anparkOfficialNames','function nationalTariffSource')+
  section('const normalizeParkingPlace=','const parkingOperatorCenters='),context);
 runInNewContext('izelmanTariffRows='+JSON.stringify(JSON.parse(readFileSync(new URL('../data/izelman-tariffs.json',import.meta.url))).rows),context);
 // Same-name private/corporate lookalikes do not prove ANPARK operation.
 assert.equal(context.corporateOperator({name:'Sıhhiye Çok Katlı Otoparkı',operator:'Özel işletme',lat:39.93,lng:32.85}),null);
 const {onRequestGet}=await import('../functions/api/parking.js');
 const env={ASSETS:{async fetch(input){try{return new Response(readFileSync(new URL('..'+new URL(input).pathname,import.meta.url)))}catch{return new Response('',{status:404})}}}};
 const f=operatorParkingFixture({resolveOperator:context.corporateOperator});
 const rowsByOperator=new Map();
 for(const [operator,lat,lng] of [['İSPARK',41.0082,28.9784],['İZELMAN',38.4237,27.1428],['ANPARK',39.9334,32.8597]]){
  const response=await onRequestGet({request:new Request(`https://test/api/parking?lat=${lat}&lng=${lng}&radius=30`),env});
  rowsByOperator.set(operator,(await response.json()).points);
 }
 for(const operator of ['ANPARK','İSPARK','İZELMAN','ANPARK']){
  f.select(operator);assert.equal(f.markers.length,0,'previous pins must be cleared');
  const rows=rowsByOperator.get(operator);
  f.pending.at(-1).finish(rows);await settleParking();
  const before=JSON.stringify(rows);
  const expected=rows.filter(p=>context.parkingFilterOperator(p)===operator).length;
  assert.equal(f.$('summaryTotal').textContent,expected);
  assert.deepEqual(f.markers,expected>1?[expected+' otopark · Yakınlaştır']:[]);
  if(operator==='ANPARK')assert.equal(expected,22);
  f.reset();assert.equal(f.$('summaryTotal').textContent,rows.length);
  assert.deepEqual(f.markers,[rows.length+' otopark · Yakınlaştır']);
  assert.equal(JSON.stringify(rows),before,'filter switches must not mutate records');
 }
});
