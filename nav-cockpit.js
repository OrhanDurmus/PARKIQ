(()=>{'use strict';
const init=()=>{
 const wrap=document.getElementById('mapWrap'),legacy=document.getElementById('navOverlay');
 if(!wrap||!legacy||document.getElementById('rpCockpit'))return;
 const host=document.createElement('div');host.id='rpCockpit';host.setAttribute('aria-label','ROTAPARK sürüş paneli');wrap.append(host);
 const root=host.attachShadow({mode:'open'});
 root.innerHTML=`<style>
 :host{position:absolute;inset:0;z-index:900;pointer-events:none;display:none;font-family:system-ui,-apple-system,sans-serif;color:white}
 .top{position:absolute;top:calc(env(safe-area-inset-top) + 10px);left:12px;right:12px;background:linear-gradient(130deg,#0757bd,#073c85);border:1px solid #52b9ff;border-radius:17px;box-shadow:0 8px 22px #001a3d75;padding:12px 15px}
 .destination{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#d1ebff;letter-spacing:.1px;margin-bottom:6px}
 .turn{font-size:clamp(20px,5.5vw,28px);line-height:1.18;font-weight:850;max-height:2.6em;overflow:hidden}
 .bottom{position:absolute;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom) + 12px);display:grid;gap:9px}
 .metrics{background:#092b48f4;border:1px solid #398dd2;border-radius:16px;box-shadow:0 6px 20px #001a3977;padding:12px;display:flex;justify-content:space-around;gap:8px}
 .metric{flex:1;text-align:center;min-width:0}.metric small{display:block;color:#a9d4f5;font-size:10px;font-weight:750;letter-spacing:.7px;margin-bottom:4px}.metric strong{font-size:clamp(16px,4.5vw,21px);white-space:nowrap}
 .controls{display:flex;justify-content:center;gap:9px;pointer-events:auto}
 button{appearance:none;border:1px solid #71bfd9;border-radius:12px;min-height:46px;padding:9px 15px;background:#0c6c81;color:#fff;font-size:13px;font-weight:750;box-shadow:0 5px 12px #00192d77;touch-action:manipulation}
 button.stop{background:#a02e50;border-color:#f07d9d}
 .gps{position:absolute;right:12px;bottom:calc(env(safe-area-inset-bottom) + 165px);background:#07344dbb;padding:5px 9px;border-radius:20px;font-size:10px;color:#bde9df;max-width:40vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
 @media(max-height:570px){.top{padding:8px 11px}.turn{font-size:18px}.metrics{padding:8px}.gps{display:none}}
 </style>
 <div class="top"><div class="destination" id="dest"></div><div class="turn" id="turn"></div></div>
 <div class="gps" id="gps"></div>
 <div class="bottom"><div class="metrics"><div class="metric"><small>KALAN MESAFE</small><strong id="distance">—</strong></div><div class="metric"><small>TAHMİNİ SÜRE</small><strong id="eta">—</strong></div></div><div class="controls"><button id="voice"></button><button id="stop" class="stop">■ Rotayı bitir</button></div></div>`;
 const $=id=>root.getElementById(id);
 $('voice').onclick=()=>document.getElementById('navVoice')?.click();
 $('stop').onclick=()=>document.getElementById('navStop')?.click();
 const update=()=>{
  const active=wrap.classList.contains('navigation-fullscreen')&&wrap.classList.contains('navigation-active')&&!legacy.hidden;
  host.style.display=active?'block':'none';
  if(!active)return;
  const val=id=>document.getElementById(id)?.textContent?.trim()||'';
  $('dest').textContent=val('navDestination');
  $('turn').textContent=val('navTurnText');
  $('distance').textContent=val('navRemaining')||'—';
  $('eta').textContent=val('navEta')||'—';
  $('voice').textContent=val('navVoice')||'🔊 Ses';
  $('gps').textContent=val('navGpsQuality');
  $('gps').style.display=document.getElementById('navGpsQuality')?.hidden?'none':'block';
 };
 const observer=new MutationObserver(update);
 observer.observe(wrap,{attributes:true,attributeFilter:['class']});
 for(const id of ['navOverlay','navDestination','navTurnText','navRemaining','navEta','navVoice','navGpsQuality']){const el=document.getElementById(id);if(el)observer.observe(el,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']})}
 update();
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
