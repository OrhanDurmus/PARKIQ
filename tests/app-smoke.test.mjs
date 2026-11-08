import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script,runInNewContext} from 'node:vm';
import {test} from 'node:test';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('main HTML has parseable inline JavaScript',()=>{
  const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
    .filter(([,attributes,body])=>!(/\bsrc\s*=/.test(attributes))&&body.trim());
  assert.ok(scripts.length>=2,'Expected inline startup and application scripts');
  scripts.forEach(([,attributes,body],index)=>{
    assert.doesNotMatch(attributes,/\btype\s*=\s*["']module["']/i,'Module scripts need separate parser');
    new Script(body,{filename:'index.html:inline-'+index});
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
  const scripts=[...html.matchAll(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script\\s*>/gi)];
  const diagnostic=scripts.map(m=>m[2]).find(body=>body.includes("function openReport()")&&body.includes("navDiagnosticCopy"));
  assert.ok(diagnostic,'Missing standalone diagnostics script');
  const elements=new Map();
  function element(id){
    if(!elements.has(id))elements.set(id,{
      id,hidden:id==='navDiagnosticPanel',style:{},textContent:id==='navGpsQuality'?'● GPS iyi ±9 m':'',value:'',
      parentElement:null,attributes:{},setAttribute(k,v){this.attributes[k]=v},
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
  assert.match(element('navDiagnosticText').value,/Sürüm: 7\\.31/);
  listener(event('navDiagnosticCopy'));
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(clipboard,element('navDiagnosticText').value);
  listener(event('navDiagnosticClose'));
  assert.equal(element('navDiagnosticPanel').hidden,true);
  assert.equal(element('navDiagnostics').attributes['aria-expanded'],'false');
});
