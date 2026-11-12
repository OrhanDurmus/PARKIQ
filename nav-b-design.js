/* ROTAPARK B - Canlı & Dinamik. Presentation-only overlay; GPS, route and map stay untouched. */
(()=>{'use strict';
function init(){
 const map=document.getElementById('mapWrap'),old=document.getElementById('navOverlay');
 if(!map||!old||document.getElementById('rpBNav'))return;
 const host=document.createElement('div');host.id='rpBNav';map.appendChild(host);
 const sh=host.attachShadow({mode:'open'});
 sh.innerHTML=`<style>
 :host{display:none;position:absolute;inset:0;z-index:12000;pointer-events:none;font-family:system-ui,-apple-system,sans-serif;color:white}
 *{box-sizing:border-box}
 .brand{position:absolute;top:calc(env(safe-area-inset-top) + 5px);left:12px;right:12px;height:37px;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:12px;background:#0a2341e8;box-shadow:0 3px 12px #00162d50;font-size:13px;font-weight:850;letter-spacing:1.1px}
 .logo{color:#58e5cb;font-size:17px}
 .turn{position:absolute;top:calc(env(safe-area-inset-top) + 51px);left:12px;right:12px;background:linear-gradient(125deg,#067df2,#0553bd);border:1px solid #6ec8ff;border-radius:18px;box-shadow:0 7px 18px #00367870;padding:11px 14px 13px}
 .dest{font-size:11px;color:#d4edff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-bottom:7px}
 .instruction{display:flex;align-items:center;gap:10px}
 .arrow{font-size:32px;font-weight:800;line-height:1;flex:0 0 auto;filter:drop-shadow(0 2px 2px #003772)}
 .direction{font-size:clamp(19px,5vw,27px);line-height:1.18;font-weight:850;max-height:2.5em;overflow:hidden}
 .tools{position:absolute;right:12px;top:calc(env(safe-area-inset-top) + 174px);display:grid;gap:10px;pointer-events:auto}
 .round{border:1px solid #a4d8ff;border-radius:50%;width:42px;height:42px;background:#092b52e8;color:white;font-size:21px;box-shadow:0 3px 12px #00223e65;display:grid;place-items:center;cursor:pointer}
 .bottom{position:absolute;bottom:calc(env(safe-area-inset-bottom) + 18px);left:12px;right:12px;background:linear-gradient(140deg,#0c294aee,#071b32f7);border:1px solid #4d92d0;border-radius:22px;padding:13px 15px 12px;box-shadow:0 8px 25px #00182b88}
 .stats{display:flex;align-items:center;gap:10px}
 .car{font-size:24px}.numbers{flex:1;min-width:0}.primary{font-size:clamp(18px,5vw,23px);font-weight:850;white-space:nowrap}.secondary{font-size:12px;color:#b9d5ed;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
 .close{width:39px;height:39px;flex:0 0 39px;border-radius:50%;border:1px solid #ed8aa7;background:#a32d53;color:white;font-size:24px;cursor:pointer;pointer-events:auto}
 .progress{height:4px;background:#355674;border-radius:10px;margin-top:12px;overflow:hidden}.fill{height:100%;width:0;background:#4ce6cc;transition:width .4s}
 .gps{font-size:10px;color:#8fe8d4;margin-top:7px}
 @media(max-height:620px){.brand{display:none}.turn{top:calc(env(safe-area-inset-top) + 6px)}.tools{top:calc(env(safe-area-inset-top) + 110px)}}
 </style>
 <div class="brand"><span class="logo">📍</span> ROTAPARK <span style="margin-left:auto;color:#a9d6f4;font-size:10px;letter-spacing:0">NAVİGASYON</span></div>
 <div class="turn"><div class="dest" id="dest"></div><div class="instruction"><span class="arrow" id="arrow">↱</span><div class="direction" id="direction">GPS bekleniyor…</div></div></div>
 <div class="tools"><button class="round" id="voice" aria-label="Sesi aç veya kapat">🔊</button><button class="round" id="recenter" aria-label="Konumuma dön">⌖</button></div>
 <div class="bottom"><div class="stats"><span class="car">🚙</span><div class="numbers"><div class="primary"><span id="eta">—</span> <span style="opacity:.5">|</span> <span id="distance">—</span></div><div class="secondary" id="arrival">ROTAPARK · Yolculuk devam ediyor</div></div><button class="close" id="stop" aria-label="Rotayı bitir">×</button></div><div class="progress"><div class="fill" id="fill"></div></div><div class="gps" id="gps"></div></div>`;
 const $=id=>sh.getElementById(id);
 $('voice').onclick=()=>document.getElementById('navVoice')?.click();
 $('recenter').onclick=()=>document.getElementById('navRecenter')?.click();
 $('stop').onclick=()=>document.getElementById('navStop')?.click();
 const get=id=>document.getElementById(id);
 const txt=id=>get(id)?.textContent?.trim()||'';
 const sync=()=>{
  const active=map.classList.contains('navigation-fullscreen')&&!old.hidden;
  host.style.display=active?'block':'none';
  if(!active)return;
  const turn=txt('navTurnText');const cleanTurn=turn.replace(/[⬅➡⬆⬇↖↗↘↙↰↱←→↑↓↪↩]+/gu,'').replace(/\s+/g,' ').trim();$('direction').textContent=cleanTurn||'GPS bekleniyor…';
  $('arrow').textContent=/sola|sol\b/i.test(turn)?'↰':/sağa|sağ\b/i.test(turn)?'↱':/düz|devam/i.test(turn)?'↑':'➜';
  $('dest').textContent=txt('navDestination');
  $('distance').textContent=txt('navRemaining')||'—';
  $('eta').textContent=txt('navEta')||'—';
  $('voice').textContent=/açık/i.test(txt('navVoice'))?'🔊':'🔇';
  $('gps').textContent=txt('navGpsQuality');
  const progress=get('navProgress');const percent=Number(progress?.getAttribute('aria-valuenow'))||0;
  $('fill').style.width=Math.min(100,Math.max(0,percent))+'%';
 };
 const ob=new MutationObserver(sync);
 ob.observe(map,{attributes:true,attributeFilter:['class']});
 for(const id of ['navOverlay','navTurnText','navDestination','navRemaining','navEta','navVoice','navGpsQuality','navProgress']){
  const e=get(id);if(e)ob.observe(e,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-valuenow']});
 }
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();