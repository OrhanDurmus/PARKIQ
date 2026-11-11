(function(){
 const KEY='rotapark-support-tickets',SEEN='rotapark-support-replies-seen';
 const css=document.createElement('style');css.textContent='#rpSupportNotice{position:fixed;top:calc(env(safe-area-inset-top) + 72px);right:12px;z-index:2100;max-width:min(350px,calc(100vw - 24px));padding:13px 16px;background:#153a45;color:#fff;border:1px solid #64d6c3;border-radius:14px;box-shadow:0 8px 30px #0009;font:600 14px system-ui;cursor:pointer;text-align:left}#rpSupportNotice[hidden]{display:none!important}';document.head.append(css);
 const notice=document.createElement('button');notice.id='rpSupportNotice';notice.type='button';notice.hidden=true;document.body.append(notice);
 let pending=[],checking=false;
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key)||fallback)}catch{return JSON.parse(fallback)}};
 const seen=()=>read(SEEN,'{}');
 function show(items){pending=items;if(!items.length){notice.hidden=true;return}notice.textContent='🔔 Destek talebiniz yanıtlandı'+(items.length>1?' ('+items.length+' yeni yanıt)':'')+' · Görmek için dokunun';notice.hidden=false}
 async function check(){if(checking||document.hidden)return;checking=true;try{
  const tickets=read(KEY,'[]');if(!Array.isArray(tickets)||!tickets.length){show([]);return}
  const marked=seen(),unread=[];for(const t of tickets.slice(0,15)){
   if(!t.requestId||!t.accessToken)continue;
   try{const r=await fetch('/api/support-status',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:t.requestId,accessToken:t.accessToken}),cache:'no-store'});if(!r.ok)continue;const d=await r.json();if(d.ok&&d.reply&&d.repliedAt&&Number(marked[t.requestId]||0)<Number(d.repliedAt))unread.push({...t,repliedAt:d.repliedAt})}catch{}
  }show(unread)
 }finally{checking=false}}
 notice.addEventListener('click',()=>{if(!pending.length)return;const t=pending[0];const marked=seen();marked[t.requestId]=t.repliedAt;try{localStorage.setItem(SEEN,JSON.stringify(marked))}catch{};show(pending.slice(1));if(t.type==='blocked'){if(location.pathname.startsWith('/account'))document.getElementById('appeal-history')?.scrollIntoView({behavior:'smooth'});else location.href='/account/#appeal-history';window.rotaparkLoadAppeals?.()}else{if(location.pathname==='/'){document.getElementById('sideMenuOpen')?.click();document.getElementById('support-ticket-list')?.scrollIntoView({behavior:'smooth',block:'center'});window.rotaparkLoadSupportTickets?.()}else location.href='/#support-ticket-list'}});
 window.rotaparkCheckSupportReplies=check;
 if(location.hash==='#support-ticket-list'){setTimeout(()=>{document.getElementById('sideMenuOpen')?.click();document.getElementById('support-ticket-list')?.scrollIntoView({behavior:'smooth'})},500)}
 if(location.hash==='#appeal-history')setTimeout(()=>document.getElementById('appeal-history')?.scrollIntoView({behavior:'smooth'}),500);
 check();setInterval(check,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)check()});
})();