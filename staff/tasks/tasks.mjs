const tasks = new Map([
  ['support',['Destek talepleri','support.read']], ['parking',['İşletme otoparklarını düzenle','parking_records.edit']],
  ['announce',['Toplu duyuru yayınla','announcements.publish']], ['block',['Üye engelle','users.block']],
  ['moderators',['Moderatör yönetimi','staff.moderators.manage']]
]);
const task = new URLSearchParams(location.search).get('task');
const status = document.querySelector('#status');
const panel = document.querySelector('#panel');
let client, userId, offset = 0, source = 'contact', archive = false;
function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(parent, label, action) {
  const node = element('button',label);
  node.type='button';
  node.onclick=()=>execute(action);
  parent.append(node);
  return node;
}
function field(parent,label,tag,options={}) {
  const wrapper=element('label',label), input=element(tag);
  Object.assign(input,options);
  wrapper.append(input);
  parent.append(wrapper);
  return input;
}
function select(parent,label,choices,value) {
  const node=field(parent,label,'select');
  for (const [val,text] of choices) node.add(new Option(text,val));
  node.value=value;
  return node;
}
async function execute(action) {
  if (panel.disabled) return;
  panel.disabled=true;
  try { await action(); }
  catch (error) {
    status.textContent=error.message || 'İşlem tamamlanamadı. Sayfayı yenileyin.';
  } finally { panel.disabled=false; }
}
async function token() {
  const {data:{session},error}=await client.auth.getSession();
  if (error || !session?.access_token || session.user.id!==userId) throw Error('Oturum değişti. Yeniden giriş yapın.');
  return session.access_token;
}
async function api(url,body) {
  return fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:{
    Authorization:'Bearer '+await token(),'Content-Type':'application/json'
  },body:body?JSON.stringify(body):undefined});
}
function ensure(response) {
  if (response.ok) return;
  const messages={400:'Girilen bilgileri kontrol edin.',401:'Oturum sona erdi.',403:'Bu işlem için yetkiniz yok.',
    409:'Kayıt başka bir işlemle değişti. Sayfayı yenileyin.'};
  throw Error(messages[response.status] || 'Görev servisine ulaşılamadı. Sayfayı yenileyin.');
}
async function allowed(key) {
  const res=await api('/api/staff/capability?permission='+key);
  if (res.status===403) return false;
  ensure(res);
  return true;
}
function form(parent, label, action) {
  const node=element('form'), submit=element('button',label);
  submit.type='submit';
  node.onsubmit=event=>{
    event.preventDefault();
    if (confirm(label+' işlemini onaylıyor musunuz?')) void execute(action);
  };
  parent.append(node);
  return {node,submit};
}
async function renderList() {
  const support=task==='support';
  const url='/api/staff/tasks?'+new URLSearchParams({task,source,archive:archive?'1':'0',offset});
  const response=await api(url);
  ensure(response);
  const {items,more}=await response.json();
  const canReply=support && !archive && await allowed('support.reply');
  panel.replaceChildren();
  if (support) {
    const kind=select(panel,'Talep türü',[['contact','Genel destek'],['appeal','Engel itirazları']],source);
    const view=select(panel,'Durum',[['open','Bekleyenler'],['archive','Arşiv']],archive?'archive':'open');
    kind.onchange=view.onchange=()=>execute(async()=>{
      source=kind.value; archive=view.value==='archive'; offset=0; await renderList();
    });
  }
  for (const item of items) {
    const card=element('article');
    card.append(element('strong',support?item.title:item.name),element('p',support?item.message:item.district));
    if (item.answer) card.append(element('p','Yanıt: '+item.answer));
    if (!support || canReply) {
      const {node,submit}=form(card,support?'Yanıtla ve arşivle':'Bilgileri kaydet',async()=>{
        const change=support?{id:item.id,message:input.value}:{
          id:item.id,previousName:item.name,previousDistrict:item.district,name:input.value,district:address.value
        };
        ensure(await api(url,change));
        await renderList();
      });
      const input=field(node,support?'Yanıt':'Otopark adı',support?'textarea':'input',{
        required:true,minLength:2,maxLength:support?2000:100,value:support?'':item.name
      });
      const address=support?null:field(node,'Adres','input',{required:true,minLength:5,maxLength:300,value:item.district});
      node.append(submit);
    }
    panel.append(card);
  }
  button(panel,'Önceki',async()=>{offset=Math.max(0,offset-25);await renderList()}).disabled=offset===0;
  button(panel,'Sonraki',async()=>{offset+=25;await renderList()}).disabled=!more;
  button(panel,'Yenile',renderList);
  status.textContent=items.length?(offset+1)+'–'+(offset+items.length)+' arası gösteriliyor.':'Bu listede kayıt yok.';
}
async function renderBlockedMembers() {
  const section=document.querySelector('#blocked-members');
  if (!section) return;
  section.replaceChildren(element('p','Engelli üyeler yükleniyor…'));
  const {data,error}=await client.rpc('rotapark_staff_blocked_members');
  if (error) {
    section.replaceChildren(element('p',error.code==='42501'?'Engelli üyeleri görüntüleme yetkiniz yok.':'Engelli üyeler alınamadı. Staging SQL migrasyonunu kontrol edin.'));
    return;
  }
  section.replaceChildren(element('h2','Engelli üyeler'));
  if (!Array.isArray(data) || !data.length) {
    section.append(element('p','Engelli üye bulunmuyor.'));
    return;
  }
  for (const member of data) {
    const card=element('article');
    card.append(element('strong',member.email),element('p','Engel nedeni: '+member.reason));
    const {node,submit}=form(card,'Engeli kaldır',async()=>{
      const reason=explanation.value.trim();
      if (reason.length<3 || reason.length>300) {
        status.textContent='Engel kaldırma gerekçesi 3–300 karakter olmalı.';
        return;
      }
      await token();
      const {error}=await client.rpc('rotapark_staff_unblock_member',{p_email:member.email,p_reason:reason});
      if (error) throw Error(error.code==='42501'?'Engel kaldırma yetkiniz yok.':error.code==='22023'?'Hesap engelli değil veya işlem yapılamıyor.':'Engel kaldırılamadı. Staging yapılandırmasını kontrol edin.');
      status.textContent='Engel kaldırıldı ve işlem kaydedildi.';
      await renderBlockedMembers();
    });
    const explanation=field(node,'Engel kaldırma gerekçesi','textarea',{required:true,minLength:3,maxLength:300});
    node.append(submit);
    section.append(card);
  }
}
function renderAction() {
  const announce=task==='announce', block=task==='block';
  const label=announce?'Duyuruyu yayınla':block?'Üyeyi engelle':'Rol değişikliğini kaydet';
  const {node,submit}=form(panel,label,async()=>{
    if (announce) {
      ensure(await api('/api/staff/tasks?task=announce',{message:message.value,type:type.value,durationHours:Number(duration.value)}));
    } else {
      await token();
      const {error}=await client.rpc('rotapark_staff_member_task',{
        p_task:block?'block':operation.value,p_email:email.value.trim(),p_reason:block?reason.value.trim():''
      });
      if (error) throw Error(error.code==='42501'?'Bu işlem için yetkiniz yok.':error.code==='22023'?'Hedef hesap veya engel nedeni uygun değil.':'Üye işlemi tamamlanamadı. Staging yapılandırmasını kontrol edin.');
    }
    node.reset();status.textContent='İşlem kaydedildi.';
    if (block) await renderBlockedMembers();
  });
  let message,type,duration,email,reason,operation;
  if (announce) {
    message=field(node,'Duyuru metni','textarea',{required:true,maxLength:400});
    type=select(node,'Tür',[['info','Bilgi'],['warning','Uyarı'],['urgent','Acil']],'info');
    duration=select(node,'Yayında kalma süresi',[1,6,24,72].map(n=>[String(n),n+' saat']),'1');
  } else {
    email=field(node,'Üyenin e-posta adresi','input',{type:'email',required:true,maxLength:254});
    if (block) reason=field(node,'Engel nedeni','textarea',{required:true,maxLength:300});
    else operation=select(node,'İşlem',[['appoint','Moderatör ata'],['remove','Moderatörlüğü kaldır']],'appoint');
  }
  node.append(submit);
  if (block) {
    const blocked=element('section');
    blocked.id='blocked-members';
    panel.append(blocked);
    button(panel,'Engelli üyeleri yenile',renderBlockedMembers);
    void renderBlockedMembers();
  }
  status.textContent='';
}
await execute(async()=>{
  if (!tasks.has(task)) throw Error('Görev bulunamadı.');
  const [title,permission]=tasks.get(task);
  document.querySelector('#title').textContent=title;
  document.title=title+' • ROTAPARK';
  const res=await fetch('/api/auth-config',{cache:'no-store'});
  ensure(res);
  const cfg=await res.json();
  if (!cfg?.configured || typeof cfg.url!=='string' || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(cfg.url) ||
      typeof cfg.anonKey!=='string' || !cfg.anonKey) throw Error('Giriş yapılandırması bulunamadı.');
  const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2');
  client=createClient(cfg.url,cfg.anonKey,{auth:{flowType:'pkce',detectSessionInUrl:false}});
  const {data:{user},error}=await client.auth.getUser();
  if (error || !user?.id) throw Error('Önce ROTAPARK hesabına giriş yapın.');
  userId=user.id;
  if (!await allowed(permission)) throw Error('Bu göreve erişim yetkiniz yok.');
  if (task==='moderators') {
    const {data:role,error}=await client.rpc('rotapark_my_role');
    if (error || !['founder','admin'].includes(role)) throw Error('Bu göreve erişim yetkiniz yok.');
  }
  if (task==='parking' || task==='support') await renderList();
  else renderAction();
  panel.hidden=false;
});
