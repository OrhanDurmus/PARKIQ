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
 .turn{position:absolute;top:calc(max(env(safe-area-inset-top), 12px) + 6px);left:0;right:0;max-width:600px;margin:auto;background:#006f72;border-radius:0 0 24px 24px;box-shadow:0 6px 20px #001b2355;padding:12px 16px 13px;display:flex;align-items:center;gap:12px;min-height:84px}
 .arrow{font-size:38px;font-weight:850;line-height:1;flex:0 0 44px;text-align:center}
 .instruction{min-width:0}
 .direction{overflow-wrap:anywhere;font-size:clamp(19px,5.1vw,27px);line-height:1.18;font-weight:780;max-height:2.5em;overflow:hidden}
 .dest{font-size:13px;color:#d0f2f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}
 .tools{position:absolute;right:14px;bottom:calc(max(env(safe-area-inset-bottom), 10px) + 132px);display:grid;gap:12px;pointer-events:auto}
 .round,.close{width:54px;height:54px;border:0;border-radius:50%;background:#181a1e;color:#fff;font-size:25px;box-shadow:0 3px 12px #0007;cursor:pointer}
 .bottom{position:absolute;bottom:0;left:0;right:0;max-width:600px;margin:auto;background:#151518;color:#fff;border-radius:22px 22px 0 0;padding:14px 18px calc(max(env(safe-area-inset-bottom), 10px) + 13px);box-shadow:0 -4px 20px #0007;min-height:100px}
 .stats{display:flex;align-items:center;gap:10px}
 .numbers{flex:1;min-width:0}
 .primary{display:flex;align-items:baseline;gap:10px;font-variant-numeric:tabular-nums;font-size:19px;font-weight:650}
 #eta{color:#fff;font-size:33px;font-weight:800}
 .secondary,.gps{font-size:13px;color:#b4b6ba;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}
 .gps:empty,.secondary:empty{display:none}
 .close{flex:0 0 76px;width:76px;height:56px;border-radius:30px;box-shadow:none;background:#d52f29;color:#fff;pointer-events:auto;font-size:19px;font-weight:700}
 .progress{height:3px;background:#33373b;border-radius:10px;overflow:hidden;margin-top:7px}
 .fill{height:100%;width:0;background:#4389ff;transition:width .4s}
 @media(prefers-reduced-motion:reduce){.fill{transition:none}}
 </style>
 <div class="turn"><span class="arrow" id="arrow" aria-hidden="true">↑</span><div class="instruction"><div class="direction" id="direction" role="status">GPS bekleniyor…</div><div class="dest" id="dest"></div></div></div>
 <div class="tools"><button class="round" id="voice" aria-label="Sesi aç veya kapat">🔊</button><button class="round" id="recenter" aria-label="Konumuma dön">⌖</button></div>
 <div class="bottom"><div class="stats"><div class="numbers"><div class="primary"><span id="eta">—</span><span aria-hidden="true">·</span><span id="distance">—</span></div><div class="secondary" id="arrival"></div><div class="gps" id="gps"></div></div><button class="close" id="stop" aria-label="Rotayı bitir">Çıkış</button></div><div class="progress"><div class="fill" id="fill"></div></div></div>`;
 const $=id=>sh.getElementById(id);
 $('voice').onclick=()=>document.getElementById('navVoice')?.click();
 $('recenter').onclick=()=>document.getElementById('navRecenter')?.click();
 $('stop').onclick=()=>document.getElementById('navStop')?.click();
 const get=id=>document.getElementById(id);
 const txt=id=>get(id)?.textContent?.trim()||'';
 const setText=(id,value)=>{
  const element=$(id);
  if(element.textContent!==value)element.textContent=value;
 };
 const sync=()=>{
  const active=map.classList.contains('navigation-fullscreen')&&!old.hidden;
  host.style.display=active?'block':'none';
  map.classList.toggle('has-b-navigation',active);
  if(!active)return;
  const turn=txt('navTurnText');
  // Keep the large left-side turn icon; remove any duplicate inline turn symbol.
  let glyph='↑';
  if(/^\s*⚠/u.test(turn))glyph='⚠';
  else if(/^\s*🏁/u.test(turn))glyph='🏁';
  else if(/geri dön|u dönüş/i.test(turn))glyph='↶';
  else if(/döne[lr] kavşa|🔄/iu.test(turn))glyph='⟳';
  else if(/sola|sol\b|⬅|↰/iu.test(turn))glyph='↰';
  else if(/sağa|sağ\b|➡|↱/iu.test(turn))glyph='↱';
  const cleanTurn=turn
    .replace(/(?:⬅️?|➡️?|⬆️?|⬇️?|↖️?|↗️?|↘️?|↙️?|↰|↱|←|→|↑|↓|↪|↩|🔙|🔚|🔛|🔜|🔝|➤|➜|🔄|⚠|🏁|🚗|🚶|🧭|📍)/gu,'')
    .replace(/[\uFE0E\uFE0F\u20E3]/gu,'')
    .replace(/\s+/g,' ').trim();
  setText('direction',cleanTurn||'GPS bekleniyor…');
  setText('arrow',glyph);
  setText('dest',txt('navDestination'));
  const remaining=txt('navRemaining');
  const eta=txt('navEta');
  setText('distance',remaining.replace(/^Kalan /i,'')||'—');
  setText('eta',eta.match(/\d+\s*dk\b/)?.[0]||'—');
  setText('arrival',eta&&!/\d+\s*dk\b/.test(eta)?eta:remaining.includes('(son konum)')?'Son güvenilir konum':'');
  setText('voice',/açık/i.test(txt('navVoice'))?'🔊':'🔇');
  setText('gps',get('navGpsQuality')?.hidden?'':txt('navGpsQuality'));
  $('recenter').setAttribute('aria-pressed',get('navRecenter')?.getAttribute('aria-pressed')||'false');
  const progress=get('navProgress');const percent=Number(progress?.getAttribute('aria-valuenow'))||0;
  $('fill').style.width=Math.min(100,Math.max(0,percent))+'%';
 };
 let frame=null;
 const ob=new MutationObserver(()=>{
  if(frame!==null)return;
  frame=requestAnimationFrame(()=>{
   frame=null;
   sync();
  });
 });
 ob.observe(map,{attributes:true,attributeFilter:['class']});
 for(const id of ['navOverlay','navTurnText','navDestination','navRemaining','navEta','navVoice','navRecenter','navGpsQuality','navProgress']){
  const e=get(id);if(e)ob.observe(e,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:['hidden','aria-valuenow','aria-pressed']});
 }
 sync();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();