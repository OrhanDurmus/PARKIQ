/* Screenshot-inspired mobile home. Visual-only shell; reuse existing data, filters, map and actions. */
(function(){
 /* Production: enabled by default. */
 var initialize=function(){
  var $=function(s){return document.querySelector(s)};
  var header=$('header'),tools=$('.tools'),summary=$('#parkingSummary'),map=$('#mapWrap');
  if(!header||!tools||!summary||!map)return;
  var logo=$('header .header-brand img');if(logo)logo.src='/themes/rotapark-gold-r-pin.svg';
  var subtitle=$('header>small');if(subtitle)subtitle.textContent='Türkiye’nin Akıllı Otopark Rehberi';
  var account=$('#rotaparkAccountLink');if(account){account.classList.add('rp-account-round');account.title='Hesabım';}
  var bell=document.createElement('button');bell.type='button';bell.id='rpNotificationShortcut';bell.innerHTML='<svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>';bell.setAttribute('aria-label','Bildirimler');bell.title='Bildirimler';header.appendChild(bell);
  bell.addEventListener('click',function(){window.location.href='/notifications/'});
  var search=$('.tools .search'),filters=$('#parkingFilters');
  if(search&&filters){
   var filterBtn=document.createElement('button');
   filterBtn.type='button';filterBtn.id='rpFilterToggle';filterBtn.textContent='☷';
   filterBtn.setAttribute('aria-label','Otopark filtreleri');
   filterBtn.setAttribute('aria-controls',filters.id);
   filterBtn.setAttribute('aria-expanded','false');
   search.appendChild(filterBtn);
   filterBtn.addEventListener('click',function(){
    filters.hidden=!filters.hidden;
    filterBtn.setAttribute('aria-expanded',String(!filters.hidden));
   });
  }
  var quick=document.createElement('nav');quick.id='rpOperatorShortcuts';quick.setAttribute('aria-label','Otopark hızlı erişim');
  [['📍','En Yakın',''],['Ⓟ','İSPARK','İSPARK'],['◆','İZELMAN','İZELMAN'],['▰','ANPARK','ANPARK'],['⚡','EV Şarj','şarj'],['♿','Engelli','engelli']].forEach(function(a){
   var b=document.createElement('button');b.type='button';b.innerHTML='<span aria-hidden="true">'+a[0]+'</span><small>'+a[1]+'</small>';
   b.addEventListener('click',function(){if(a[1]==='EV Şarj'){if(window.rotaparkToggleEV)window.rotaparkToggleEV();return;}if(['İSPARK','ANPARK','İZELMAN'].includes(a[1])){if(window.rotaparkFilterOperator)window.rotaparkFilterOperator(a[1]);else {var notice=$('#status');if(notice)notice.textContent=a[1]+' filtresi henüz hazır değil; sayfayı yenileyin.';}return;}var q=$('#q');if(q)q.value=a[2];if(a[1]==='En Yakın'){if(window.rotaparkFocusLocation){window.rotaparkFocusLocation();return;}var loc=$('#loc');if(loc){loc.click();return;}}var searchBtn=$('#search');if(searchBtn)searchBtn.click()});
   quick.appendChild(b);
  });
  if(search)search.insertAdjacentElement('afterend',quick);
  tools.insertAdjacentElement('afterend',summary);
  summary.insertAdjacentElement('afterend',map);
  var saved=$('#savedParkingSection');if(saved){saved.classList.add('rp-saved-secondary');}
  var title=document.createElement('div');title.id='rpResultsHeading';title.innerHTML='<strong>📍 Yakındaki otoparklar</strong><span id="rpResultsCount"></span>';
  map.insertAdjacentElement('afterend',title);
  var count=$('#summaryTotal');if(count){var update=function(){var el=$('#rpResultsCount');if(el)el.textContent=(count.textContent||'').trim()+' kayıt';};update();new MutationObserver(update).observe(count,{childList:true,subtree:true,characterData:true});}
 };if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize,{once:true});else initialize();
})();