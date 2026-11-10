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
  assert.match(html,/function stopTracking\(\)\{(?:stopDrive3d\(\);)?gpsTrackingSession\+\+/);
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
  assert.match(html,/function stopTracking\(\)\{(?:stopDrive3d\(\);)?gpsTrackingSession\+\+;rerouting=false/);
});

test('reroute result requires a fresh trusted GPS fix before replacing route',()=>{
  assert.match(html,/if\(gpsSignalLost\|\|gpsQualityRecoveryPending\|\|!gpsLastAcceptedAt\|\|Date\.now\(\)-gpsLastAcceptedAt>15000\)/);
  assert.match(html,/Rota hesaplandı ancak GPS konumu güncel değil/);
});
