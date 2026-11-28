/* MAKTABY office extras: task details/print, client timeline, reminders, my tasks, WhatsApp sending. Classic script, loaded right after renderer.js (moved out of renderer.js to keep it small). */
/* ===== Task details + print (added Nov 27) ===== */
;(function(){
 const WITH_DETAILS=true,WITH_PRINT=true;
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const norm=s=>String(s==null?'':s).replace(/\s+/g,' ').trim();
 const lst=v=>(Array.isArray(v)?v:[v]).filter(Boolean).join('، ');
 const clientsOf=x=>lst(Array.isArray(x.clients)&&x.clients.length?x.clients:[x.client]);
 function annFor(x){if(x.source!=='الإعلانات')return null;const m=/رقم\s+(.+)$/.exec(String(x.task||''));const n=m?m[1].trim():'';return (db.announcements||[]).find(a=>a&&String(a.number||'—')===n&&(a.court||'')===(x.court||'')&&(a.client||'')===(x.client||''))||null}
 function caseFor(x){const id=x.sourceCaseId;const all=[...(db.cases||[]),...(db.caseArchive||[])];if(id)return all.find(c=>c&&String(c.caseId||c.id||'')===String(id))||null;if(x.source==='جلسة الغد')return (db.cases||[]).find(c=>c&&c.court===x.court&&c.client===x.client&&c.date===x.date)||null;return null}
 function sections(x){
  const a=annFor(x),c=caseFor(x),S=[];
  const add=(arr,l,v)=>{v=norm(Array.isArray(v)?lst(v):v);if(v)arr.push([l,v])};
  const t=[];add(t,'المهمة',x.task);add(t,'التصنيف',x.kind);add(t,'تاريخ الاستحقاق',x.date);add(t,'الأولوية',x.priority);add(t,'الحالة',x.status);add(t,'المسؤول',x.assignee);add(t,'المصدر',x.source||'يدوي');
  if(!a&&!c){add(t,'الموكل',clientsOf(x));add(t,'الفرع',x.branch);add(t,'المحكمة',x.court);add(t,'رقم القضية',x.caseNumber);add(t,'نوع القضية',x.caseType);add(t,'الموضوع',x.subject);add(t,'الدائرة',x.circuit);add(t,'المقر',x.venue);add(t,'الرول',x.roll);add(t,'تاريخ الجلسة',x.sessionDate)}
  add(t,'ملاحظات',x.notes||x.note);add(t,'تاريخ الإنجاز',x.completionDate);add(t,'ما تم',x.completionNote);
  S.push(['بيانات المهمة',t]);
  if(a){const s=[];add(s,'رقم الإعلان',a.number);add(s,'نوع الإعلان',a.kind);add(s,'الموكل',a.client);add(s,'الفرع',a.branch);add(s,'المحكمة',a.court);add(s,'المحضرون',a.bailiff);add(s,'تاريخ التسليم للمحضرين',a.deliveryDate);add(s,'تاريخ الجلسة',a.session);add(s,'تاريخ الاستلام الفعلي',a.receivedDate);add(s,'من استلم الإعلان',a.receivedBy);add(s,'ملاحظات',a.notes);S.push(['بيانات الإعلان',s])}
  if(c){const s=[];add(s,'الموكلون',Array.isArray(c.clients)&&c.clients.length?c.clients:c.client);add(s,'صفة الموكل',c.clientRole);add(s,'الخصوم',Array.isArray(c.opponents)&&c.opponents.length?c.opponents:c.opponent);add(s,'المحكمة',c.court);add(s,'رقم القضية',c.number);add(s,'نوع القضية',c.caseType);add(s,'الموضوع',c.subject);add(s,'الدائرة',c.circuit);add(s,'المقر',c.venue);add(s,'الرول',c.roll);add(s,'تاريخ الجلسة',c.date);add(s,'الإجراء المطلوب',c.action);add(s,'نتيجة / قرار الجلسة',c.result);add(s,'المسؤول',c.assignee);add(s,'الفرع',c.branch);add(s,'ملاحظات',c.notes);S.push(['بيانات القضية / الجلسة',s])}
  return S;
 }
 const gridHtml=S=>S.map(([h,r])=>`<div class="mkd-sec"><h3>${X(h)}</h3><div class="mkd-grid">${r.map(([l,v])=>`<div class="mkd-f"><span>${X(l)}</span><b>${X(v)}</b></div>`).join('')}</div></div>`).join('');
 const CSS=`.mkd-sec{margin:0 0 12px}.mkd-sec h3{margin:0 0 6px;font-size:14px;color:#8a6a1f;border-bottom:1px solid #e3d3a8;padding-bottom:3px}.mkd-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 14px}.mkd-f{display:flex;gap:6px;font-size:13px;line-height:1.7}.mkd-f span{color:#6b7a8c;min-width:105px}.mkd-f b{font-weight:600;color:#17283b;word-break:break-word}`;
 let LIST=[];
 function key(date,task,client){return [date,task,client].map(norm).join('|')}
 function decorate(){
  const folders=document.querySelectorAll('.task-folder');if(!folders.length)return;
  let list=[];try{list=tasks()||[]}catch(_){return}
  LIST=list;const used=new Set();
  folders.forEach(f=>{
   f.querySelectorAll('tbody tr').forEach(tr=>{
    const act=tr.querySelector('td.task-row-actions');if(!act)return;
    const date=tr.children[0]?.textContent,task=tr.querySelector('.tasks-task-cell b')?.textContent,client=tr.children[2]?.textContent;
    const k=key(date,task,client);let idx=-1;
    for(let i=0;i<list.length;i++){if(used.has(i))continue;const x=list[i];if(key(x.date||'—',x.task||'—',clientsOf(x)||'—')===k){idx=i;break}}
    if(idx<0)return;used.add(idx);tr.dataset.mkTask=idx;
    if(WITH_DETAILS&&!act.querySelector('.mk-det-btn')){const b=document.createElement('button');b.type='button';b.className='btn light mk-det-btn';b.textContent='تفاصيل';b.onclick=()=>window.mkTaskDetails(idx);act.prepend(b)}
   });
   if(WITH_PRINT){const box=f.querySelector('.task-folder-content');if(box&&!box.querySelector('.mk-print-bar')){const d=document.createElement('div');d.className='mk-print-bar';d.style.cssText='display:flex;justify-content:flex-start;padding:6px 0';const b=document.createElement('button');b.type='button';b.className='btn light';b.textContent='🖨 طباعة مهام هذا المكان بكل التفاصيل';b.onclick=()=>window.mkPrintTasks(f);d.append(b);box.prepend(d)}}
  });
 }
 window.mkTaskDetails=function(idx){
  const x=LIST[idx];if(!x)return;document.getElementById('mkTaskDetailsModal')?.remove();
  const o=document.createElement('div');o.id='mkTaskDetailsModal';o.style.cssText='position:fixed;inset:0;z-index:10050;background:rgba(10,20,35,.6);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto';
  o.innerHTML=`<style>${CSS}@media(max-width:640px){.mkd-grid{grid-template-columns:1fr}}</style><div dir="rtl" style="width:min(820px,100%);background:var(--bg,#fff);border-radius:14px;padding:18px;box-shadow:0 20px 60px #0005"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px"><h2 style="margin:0;font-size:18px">تفاصيل المهمة</h2><span><button class="btn light" type="button" data-p>🖨 طباعة</button> <button class="btn danger" type="button" data-c>إغلاق ×</button></span></div>${gridHtml(sections(x))}</div>`;
  document.body.append(o);o.querySelector('[data-c]').onclick=()=>o.remove();o.addEventListener('click',e=>{if(e.target===o)o.remove()});
  o.querySelector('[data-p]').onclick=()=>printDoc('تفاصيل مهمة',[{name:'',rows:[x]}],null);
 };
 function printDoc(title,groups,sub){
  const blocks=groups.map(g=>{const name=g.name,rows=g.rows;return `<section class="grp">${name?`<h1>${X(name)} <small>(${rows.length} مهمة)</small></h1>`:''}${rows.map((x,i)=>`<article class="tk"><div class="tkh"><b>${i+1}. ${X(x.task||'—')}</b><span>${X(x.date||'')} · ${X(x.status||'')}</span></div>${gridHtml(sections(x))}</article>`).join('')}</section>`}).join('');
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${X(title)}</title><style>@page{size:A4;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;color:#17283b;margin:0}.top{text-align:center;border-bottom:2px solid #c49a45;padding-bottom:6px;margin-bottom:10px}.top h2{margin:0;font-size:17px}.top div{font-size:12px;color:#556}.grp{page-break-after:always}.grp:last-child{page-break-after:auto}h1{font-size:16px;margin:6px 0 8px;color:#14283f;border-right:4px solid #c49a45;padding-right:8px}h1 small{color:#778;font-size:12px}.tk{border:1px solid #d8dde4;border-radius:8px;padding:8px 10px;margin:0 0 10px;page-break-inside:avoid}.tkh{display:flex;justify-content:space-between;gap:10px;font-size:14px;margin-bottom:6px;background:#f6f2e6;padding:4px 8px;border-radius:6px}${CSS}</style></head><body><div class="top"><h2>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</h2><div>${X(title)} · طُبع في ${X(new Date().toLocaleDateString('en-GB'))}${sub?' · '+X(sub):''}</div></div>${blocks}</body></html>`;
  const fr=document.createElement('iframe');fr.style.cssText='position:fixed;left:-9999px;width:800px;height:600px';document.body.append(fr);
  const d=fr.contentDocument;d.open();d.write(html);d.close();
  setTimeout(()=>{try{fr.contentWindow.focus();fr.contentWindow.print()}catch(e){alert('تعذر بدء الطباعة')}setTimeout(()=>fr.remove(),60000)},400);
 }
 window.mkPrintTasks=function(folder){
  decorate();
  const folders=[folder];
  const groups=folders.map(f=>({name:f.querySelector('summary b')?.textContent||'',rows:[...f.querySelectorAll('tr[data-mk-task]')].map(tr=>LIST[Number(tr.dataset.mkTask)]).filter(Boolean)})).filter(g=>g.rows.length);
  if(!groups.length)return alert('لا توجد مهام معروضة للطباعة.');
  const q=window.taskSearch?('البحث: '+window.taskSearch):'';
  printDoc(folder?'مهام '+groups[0].name:'قائمة المهام',groups,q);
 };
 const __r=render;render=function(){const r=__r.apply(this,arguments);try{decorate()}catch(e){console.warn('mk task decorate',e)}return r};
 try{decorate()}catch(_){}
})();

/* ===== Task print: choose which tasks to print (added Nov 27) ===== */
;(function(){
 const prevPrint=window.mkPrintTasks;if(typeof prevPrint!=='function')return;
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.mkPrintTasks=function(folder){
  if(!folder||!folder.querySelectorAll)return prevPrint.apply(this,arguments);
  const rows=[...folder.querySelectorAll('tr[data-mk-task]')];
  if(!rows.length)return prevPrint.apply(this,arguments);
  const name=folder.querySelector('summary b')?.textContent||'';
  const items=rows.map(tr=>({id:tr.dataset.mkTask,date:(tr.children[0]?.textContent||'').trim(),task:(tr.querySelector('.tasks-task-cell b')?.textContent||'').trim(),client:(tr.children[2]?.textContent||'').trim()}));
  document.getElementById('mkPrintSelModal')?.remove();
  const o=document.createElement('div');o.id='mkPrintSelModal';o.style.cssText='position:fixed;inset:0;z-index:10060;background:rgba(10,20,35,.6);display:flex;align-items:flex-start;justify-content:center;padding:4vh 12px;overflow:auto';
  o.innerHTML=`<div dir="rtl" style="width:min(720px,100%);background:var(--bg,#fff);border-radius:14px;padding:16px;box-shadow:0 20px 60px #0005"><div style="display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px"><h2 style="margin:0;font-size:18px">اختيار المهام للطباعة${name?' · '+X(name):''}</h2><button class="btn danger" type="button" data-c>إغلاق ×</button></div><div style="font-size:12px;color:#667;margin-bottom:8px">كل المهام مختارة. شيل العلامة عن المهمة اللي مش عايز تتطبع.</div><div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap"><button class="btn light" type="button" data-all>تحديد الكل</button><button class="btn light" type="button" data-none>إلغاء تحديد الكل</button><span data-n style="font-size:13px;color:#445"></span></div><div data-list style="max-height:58vh;overflow:auto;border:1px solid #e1e5ea;border-radius:10px"></div><div style="display:flex;gap:8px;justify-content:flex-start;margin-top:10px"><button class="btn goldbtn" type="button" data-go>🖨 طباعة المختار بكل التفاصيل</button></div></div>`;
  document.body.append(o);
  const list=o.querySelector('[data-list]');
  items.forEach(it=>{const l=document.createElement('label');l.style.cssText='display:flex;gap:10px;align-items:center;padding:7px 10px;border-bottom:1px solid #eef0f3;cursor:pointer;font-size:13px';l.innerHTML=`<input type="checkbox" checked data-id="${X(it.id)}" style="width:auto"><span style="min-width:84px;color:#556">${X(it.date)}</span><b style="flex:1">${X(it.task)}</b><span style="color:#667">${X(it.client)}</span>`;list.append(l)});
  const boxes=()=>[...list.querySelectorAll('input[type=checkbox]')];
  const upd=()=>{const n=boxes().filter(b=>b.checked).length;o.querySelector('[data-n]').textContent=n+' من '+items.length+' مهمة مختارة';o.querySelector('[data-go]').disabled=!n};
  list.addEventListener('change',upd);upd();
  o.querySelector('[data-all]').onclick=()=>{boxes().forEach(b=>b.checked=true);upd()};
  o.querySelector('[data-none]').onclick=()=>{boxes().forEach(b=>b.checked=false);upd()};
  o.querySelector('[data-c]').onclick=()=>o.remove();
  o.addEventListener('click',e=>{if(e.target===o)o.remove()});
  o.querySelector('[data-go]').onclick=()=>{
   const chosen=new Set(boxes().filter(b=>b.checked).map(b=>b.dataset.id));if(!chosen.size)return;
   const fake={querySelector:s=>folder.querySelector(s),querySelectorAll:s=>[...folder.querySelectorAll(s)].filter(tr=>!tr.dataset||tr.dataset.mkTask===undefined||chosen.has(tr.dataset.mkTask))};
   o.remove();prevPrint.call(window,fake);
  };
 };
})();

/* ===== Client timeline (internal, added Nov 27) ===== */
;(function(){
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nk=s=>(x=>x==='هاني'?'hany shehata':x)(String(s==null?'':s).replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim());
 const D=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})/.exec(String(s||''));return m?m[0]:''};
 const short=(s,n)=>{s=String(s==null?'':s).replace(/\s+/g,' ').trim();return s.length>n?s.slice(0,n)+'…':s};
 const TYPES={manual:['يدوية','✍'],case:['قضايا','⚖'],session:['جلسات','📅'],ann:['إعلانات','📨'],task:['مهام','✔'],poa:['توكيلات','📜'],doc:['مستندات','📎']};
 function matcher(name){
  const raw=String(name||'').trim(),key=nk(raw),multi=key.split(' ').length>=2;
  return function(v){
   const arr=(Array.isArray(v)?v:[v]).map(x=>String(x==null?'':x)).filter(Boolean);
   let best='';
   for(const s0 of arr){
    const s=s0.trim();if(!s)continue;
    if(s===raw)return 'exact';
    const k=nk(s);if(k===key){best='norm';continue}
    if(multi&&best!=='norm'&&(k.includes(key)||(k.split(' ').length>=2&&key.includes(k))))best='review';
   }
   return best;
  };
 }
 function build(name){
  const m=matcher(name),ev=[];
  const push=(e,mt)=>{if(mt){e.match=mt;ev.push(e)}};
  const caseInfo=c=>[c.court,c.number?'رقم '+c.number:'',c.circuit,c.opponent?'ضد '+short(Array.isArray(c.opponents)&&c.opponents.length?c.opponents.join('، '):c.opponent,60):''].filter(Boolean).join(' · ');
  const cases=[].concat((db.cases||[]).map(c=>[c,false]),(db.caseArchive||[]).map(c=>[c,true]));
  cases.forEach(([c,arch])=>{
   if(!c)return;const mt=m([c.client].concat(Array.isArray(c.clients)?c.clients:[]));if(!mt)return;
   const info=caseInfo(c);
   (c.history||[]).forEach(h=>{const d=D(h.date);if(!d)return;push({date:d,type:'session',title:'جلسة'+(h.reason?' · '+short(h.reason,60):''),detail:[h.decision?'القرار: '+short(h.decision,120):'',info].filter(Boolean).join(' — ')},mt)});
   if(!arch&&D(c.date))push({date:D(c.date),type:'session',title:'الجلسة الحالية/القادمة'+(c.action?' · '+short(c.action,60):''),detail:[c.result?'النتيجة: '+short(c.result,120):'',info].filter(Boolean).join(' — ')},mt);
   if(!arch&&D(c.decisionReceivedAt))push({date:D(c.decisionReceivedAt),type:'case',title:'استلام قرار الجلسة',detail:info},mt);
   if(arch)push({date:D(c.archiveDate)||D(c.judgmentSessionDate)||D(c.date),type:'case',title:'أرشفة القضية'+(c.result?' · '+short(c.result,60):''),detail:[c.judgmentText?'الحكم: '+short(c.judgmentText,160):'',info].filter(Boolean).join(' — ')},mt);
  });
  [].concat((db.announcements||[]).map(a=>[a,false]),(db.announcementArchive||[]).map(a=>[a,true])).forEach(([a,arch])=>{
   if(!a)return;const mt=m(a.client);if(!mt)return;
   const t=(a.kind||'إعلان')+(a.number?' رقم '+a.number:''),info=[a.court,a.bailiff?'المحضرون: '+a.bailiff:''].filter(Boolean).join(' · ');
   const n0=ev.length;
   if(D(a.deliveryDate))push({date:D(a.deliveryDate),type:'ann',title:'تسليم '+t+' للمحضرين',detail:info},mt);
   if(D(a.receivedDate))push({date:D(a.receivedDate),type:'ann',title:'استلام '+t,detail:[info,a.receivedBy?'استلمه: '+a.receivedBy:''].filter(Boolean).join(' · ')},mt);
   if(D(a.session))push({date:D(a.session),type:'session',title:'جلسة مرتبطة بـ '+t,detail:info},mt);
   if(ev.length===n0)push({date:D(a.archiveDate),type:'ann',title:t+(a.status?' · '+short(a.status,40):''),detail:info},mt);
  });
  [].concat(db.tasks||[],db.taskArchive||[]).forEach(t=>{
   if(!t)return;const mt=m([t.client].concat(Array.isArray(t.clients)?t.clients:[]));if(!mt)return;
   if(D(t.completionDate))push({date:D(t.completionDate),type:'task',title:'إنجاز مهمة: '+short(t.task,80),detail:t.completionNote?'ما تم: '+short(t.completionNote,140):''},mt);
   else push({date:D(t.date),type:'task',title:'مهمة: '+short(t.task,80),detail:[t.status,t.assignee?'المسؤول: '+t.assignee:''].filter(Boolean).join(' · ')},mt);
  });
  const cl=(db.clients||[]).find(c=>c&&c.name===name),cid=cl&&cl.clientId;
  (db.powerOfAttorneys||[]).forEach(p=>{if(!p)return;const mt=(cid&&p.clientId===cid)?'exact':m(p.name);if(!mt)return;push({date:p.year?String(p.year)+'-01-01':'',dateLabel:p.year?String(p.year):'',type:'poa',title:'توكيل'+(p.poaNumber?' رقم '+p.poaNumber:'')+(p.year?' لسنة '+p.year:''),detail:[p.office,p.serial?'مسلسل '+p.serial:''].filter(Boolean).join(' · ')},mt)});
  (db.clientDocuments||[]).forEach(d=>{if(!d)return;const mt=m(d.client_name);if(!mt)return;push({date:D(d.created_at),type:'doc',title:'مستند: '+short(d.file_name,60),detail:d.category||''},mt)});
  const ck=cid||('name:'+nk(name));
  (db.clientTimeline||[]).forEach(x=>{if(!x||x.clientKey!==ck)return;ev.push({date:D(x.date),type:'manual',title:x.title||'',detail:x.details||'',match:'exact',manualId:x.id,clientVisible:!!x.clientVisible})});
  ev.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  return ev;
 }
 function keyOf(name){const cl=(db.clients||[]).find(c=>c&&c.name===name);return (cl&&cl.clientId)||('name:'+nk(name))}
 const canEdit=()=>typeof canManageOffice==='function'&&canManageOffice();
 async function persist(mutate){const before=JSON.stringify(db.clientTimeline||[]);try{db.clientTimeline=db.clientTimeline||[];mutate(db.clientTimeline);await saveCloudState();await loadCloudState()}catch(e){db.clientTimeline=JSON.parse(before);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db))}catch(_){}throw e}return true}
 function dupCount(name){const k=nk(name);return (db.clients||[]).filter(c=>c&&nk(c.name)===k).length}
 const CSS='#mkTl .tlc{display:inline-block;padding:3px 10px;margin:0 0 6px 6px;border:1px solid #cfd6df;border-radius:14px;font-size:12px;cursor:pointer;background:#fff}#mkTl .tlc.on{background:#14283f;color:#fff;border-color:#14283f}#mkTl .tle{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #eef0f3}#mkTl .tld{min-width:92px;font-size:12px;color:#6b7a8c}#mkTl .tli{width:26px;text-align:center}#mkTl .tlt{font-weight:700;font-size:13px}#mkTl .tlx{font-size:12px;color:#556;margin-top:2px}#mkTl .tlw{background:#fff4d6;border-radius:6px;padding:1px 6px;font-size:11px;color:#8a6a1f;margin-right:6px}';
 function fill(box,name){
  const ev=build(name),main=ev.filter(e=>e.match!=='review'),rev=ev.filter(e=>e.match==='review');
  const dup=dupCount(name);let filt='';
  const row=e=>`<div class="tle" ${e.manualId?'data-mid="'+X(e.manualId)+'"':''}><div class="tli">${TYPES[e.type][1]}</div><div class="tld">${X(e.dateLabel||e.date||'بدون تاريخ')}</div><div style="flex:1"><div class="tlt">${X(e.title)}${e.type==='manual'?'<span class="tlw" style="background:#e3f1e6;color:#25693a">يدوي</span>':''}${e.type==='manual'&&e.clientVisible?'<span class="tlw">ظاهر للعميل</span>':''}${e.match==='norm'?'<span class="tlw">اختلاف بسيط في كتابة الاسم</span>':''}${e.match==='review'?'<span class="tlw">اسم مشابه، راجعه</span>':''}</div>${e.detail?`<div class="tlx" style="white-space:pre-wrap">${X(e.detail)}</div>`:''}</div>${e.manualId&&canEdit()?'<div style="display:flex;gap:4px;align-items:flex-start"><button type="button" class="btn light" data-edit="'+X(e.manualId)+'">تعديل</button><button type="button" class="btn light" data-del="'+X(e.manualId)+'">حذف</button></div>':''}</div>`;
  const refreshAll=()=>fill(box,name);
  const openForm=x=>{const f=box.querySelector('[data-form]');if(!f)return;const t0=new Date(),td=t0.getFullYear()+'-'+String(t0.getMonth()+1).padStart(2,'0')+'-'+String(t0.getDate()).padStart(2,'0');
   f.innerHTML=`<div style="border:1px solid #cfd6df;border-radius:10px;padding:10px;margin-bottom:10px;background:#fafbfc"><div style="display:grid;grid-template-columns:150px 1fr;gap:8px"><div><label style="font-size:12px;color:#556">التاريخ</label><input type="date" data-d style="width:100%;padding:7px;border:1px solid #cfd6df;border-radius:8px"></div><div><label style="font-size:12px;color:#556">عنوان قصير</label><input data-t maxlength="120" placeholder="مثال: تم تقديم مذكرة" style="width:100%;padding:7px;border:1px solid #cfd6df;border-radius:8px"></div></div><label style="font-size:12px;color:#556;display:block;margin-top:6px">التفاصيل (اختياري)</label><textarea data-x rows="3" maxlength="2000" style="width:100%;padding:7px;border:1px solid #cfd6df;border-radius:8px;font:inherit"></textarea><label style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:12px"><input type="checkbox" data-v style="width:auto"> ظاهر للعميل (للمرحلة القادمة، لا يظهر للعميل حاليا)</label><div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn goldbtn" data-s>حفظ</button><button type="button" class="btn light" data-c>إلغاء</button></div></div>`;
   f.querySelector('[data-d]').value=(x&&x.date)||td;f.querySelector('[data-t]').value=(x&&x.title)||'';f.querySelector('[data-x]').value=(x&&x.details)||'';f.querySelector('[data-v]').checked=!!(x&&x.clientVisible);
   f.querySelector('[data-c]').onclick=()=>{f.innerHTML=''};
   f.querySelector('[data-s]').onclick=async()=>{const date=f.querySelector('[data-d]').value,title=f.querySelector('[data-t]').value.trim(),details=f.querySelector('[data-x]').value.trim(),vis=f.querySelector('[data-v]').checked;if(!title)return alert('اكتب عنوانا قصيرا للبند.');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return alert('اختر التاريخ.');
    const btn=f.querySelector('[data-s]');btn.disabled=true;const id=x?x.id:('tl-'+Date.now().toString(36)+Math.random().toString(36).slice(2,8));const who=(typeof currentUser!=='undefined'&&currentUser&&(currentUser.full_name||currentUser.name||currentUser.email))||'';
    try{await persist(a=>{const i=a.findIndex(z=>z.id===id);const rec={id,clientKey:keyOf(name),clientName:name,date,title,details,clientVisible:vis,updatedAt:new Date().toISOString(),updatedBy:who};if(i>=0)a[i]={...a[i],...rec};else a.unshift({...rec,createdAt:rec.updatedAt,createdBy:who})});if(!(db.clientTimeline||[]).some(z=>z.id===id))throw new Error('لم يتم حفظ البند في السحابة. لم يُعتمد.');refreshAll()}catch(e){alert('تعذر الحفظ: '+e.message);btn.disabled=false}};
  };
  const draw=()=>{
   const list=main.filter(e=>!filt||e.type===filt);
   const counts={};main.forEach(e=>counts[e.type]=(counts[e.type]||0)+1);
   box.innerHTML=`<style>${CSS}</style>${dup>1?`<div style="background:#ffe9e6;border-radius:8px;padding:6px 10px;margin-bottom:8px;font-size:12px">⚠ يوجد ${dup} موكلين بنفس الاسم تقريبا، فالخط الزمني قد يخلط بينهم. راجعه.</div>`:''}<div style="font-size:12px;color:#667;margin-bottom:8px">مبني على بيانات الجلسات والإعلانات والمهام والتوكيلات والمستندات المسجلة باسم الموكل. للعرض الداخلي فقط، ولا يشمل الأتعاب أو الملاحظات الداخلية.</div>${canEdit()?'<div style="margin-bottom:8px"><button type="button" class="btn goldbtn" data-add>＋ إضافة بند يدوي</button></div><div data-form></div>':''}<div><span class="tlc ${filt?'':'on'}" data-f="">الكل (${main.length})</span>${Object.keys(TYPES).filter(k=>counts[k]).map(k=>`<span class="tlc ${filt===k?'on':''}" data-f="${k}">${TYPES[k][0]} (${counts[k]})</span>`).join('')}</div>${list.length?list.map(row).join(''):'<div style="padding:10px;color:#778">لا توجد أحداث مسجلة لهذا الموكل.</div>'}${rev.length?`<details style="margin-top:10px"><summary style="cursor:pointer;color:#8a6a1f">مطابقات تحتاج مراجعة (${rev.length}): أحداث باسم مشابه وغير مطابق تماما</summary>${rev.map(row).join('')}</details>`:''}`;
   box.querySelectorAll('[data-f]').forEach(b=>b.onclick=()=>{filt=b.dataset.f;draw()});
   const ab=box.querySelector('[data-add]');if(ab)ab.onclick=()=>openForm(null);
   box.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openForm((db.clientTimeline||[]).find(x=>x.id===b.dataset.edit)));
   box.querySelectorAll('[data-del]').forEach(b=>b.onclick=async()=>{const id=b.dataset.del;if(!confirm('حذف هذا البند اليدوي؟'))return;b.disabled=true;try{await persist(a=>{const i=a.findIndex(x=>x.id===id);if(i>=0)a.splice(i,1)});refreshAll()}catch(e){alert('تعذر الحذف: '+e.message);b.disabled=false}});
  };
  draw();
 }
 function inject(){
  if(typeof page==='undefined'||page!=='clientProfile')return;
  const app=document.getElementById('app');if(!app||document.getElementById('mkTl'))return;
  const name=typeof selectedClientNameV54==='string'?selectedClientNameV54:'';if(!name)return;
  const tabs=app.querySelector('.mk2-tabs'),head=app.querySelector('.pagehead');
  const sec=document.createElement('details');sec.id='mkTl';sec.className='panel';sec.style.margin='10px 0';
  sec.innerHTML='<summary style="cursor:pointer;font-weight:700;font-size:15px">⏱ الخط الزمني للموكل (كل ما تم في ملفه)</summary><div data-b style="margin-top:8px"></div>';
  let done=false;sec.addEventListener('toggle',()=>{if(sec.open&&!done){done=true;try{fill(sec.querySelector('[data-b]'),name)}catch(e){sec.querySelector('[data-b]').textContent='تعذر بناء الخط الزمني.';console.warn(e)}}});
  (tabs||head).after(sec);
 }
 const __r=render;render=function(){const r=__r.apply(this,arguments);try{inject()}catch(e){console.warn('mk timeline',e)}return r};
 try{const ap=document.getElementById('app');if(ap)new MutationObserver(()=>{try{inject()}catch(e){}}).observe(ap,{childList:true})}catch(_){}
 try{const sp=sharedPayload;sharedPayload=function(){const p=sp.apply(this,arguments);p.clientTimeline=Array.isArray(db.clientTimeline)?db.clientTimeline:[];return p}}catch(e){console.warn('mk timeline payload',e)}
 window.mkClientTimeline=build;
 try{inject()}catch(_){}
})();


/* ===== Client timeline: print / PDF with office letterhead (added Nov 27) ===== */
;(function(){
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const ICON={case:'⚖',session:'📅',ann:'📨',task:'✔',poa:'📜',doc:'📎',manual:'✍'};
 const LBL={case:'قضايا',session:'جلسات',ann:'إعلانات',task:'مهام',poa:'توكيلات',doc:'مستندات',manual:'يدوية'};
 function printTimeline(name,filt){
  if(typeof window.mkClientTimeline!=='function')return alert('الخط الزمني غير متاح.');
  let ev=window.mkClientTimeline(name).filter(e=>e.match!=='review');
  if(filt)ev=ev.filter(e=>e.type===filt);
  if(!ev.length)return alert('لا توجد أحداث للطباعة.');
  const byYear={};ev.forEach(e=>{const y=(e.date||'').slice(0,4)||'بدون تاريخ';(byYear[y]=byYear[y]||[]).push(e)});
  const years=Object.keys(byYear).sort((a,b)=>b.localeCompare(a));
  const row=e=>`<div class="ev"><div class="d">${X(e.dateLabel||e.date||'بدون تاريخ')}</div><div class="i">${ICON[e.type]||''}</div><div class="b"><b>${X(e.title)}</b>${e.detail?`<div class="x">${X(e.detail)}</div>`:''}</div></div>`;
  const body=years.map(y=>`<h3>${X(y)}</h3>${byYear[y].map(row).join('')}`).join('');
  const logo=document.querySelector('img[src*="logo"]');let logoUrl='';try{if(logo)logoUrl=new URL(logo.getAttribute('src'),location.href).href}catch(_){}
  const title='الخط الزمني للموكل: '+name;
  const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${X(title)}</title><style>@page{size:A4;margin:12mm}body{font-family:Tahoma,Arial,sans-serif;color:#17283b;margin:0}.top{display:flex;align-items:center;gap:12px;border-bottom:2px solid #c49a45;padding-bottom:8px;margin-bottom:10px}.top img{height:64px}.top .t{flex:1;text-align:center}.top h2{margin:0;font-size:18px;color:#14283f}.top div{font-size:12px;color:#556}h1{font-size:16px;margin:6px 0 4px;color:#14283f;border-right:4px solid #c49a45;padding-right:8px}.meta{font-size:12px;color:#667;margin-bottom:6px}h3{margin:12px 0 4px;font-size:14px;color:#8a6a1f;border-bottom:1px solid #e6dcc3;padding-bottom:2px;page-break-after:avoid}.ev{display:flex;gap:8px;padding:5px 0;border-bottom:1px solid #eef0f3;page-break-inside:avoid;font-size:12.5px}.d{min-width:84px;color:#556}.i{width:20px;text-align:center}.b{flex:1}.x{font-size:11.5px;color:#556;margin-top:2px;white-space:pre-wrap}.foot{margin-top:14px;font-size:11px;color:#778;border-top:1px solid #e1e5ea;padding-top:6px}</style></head><body><div class="top">${logoUrl?`<img src="${X(logoUrl)}" alt="">`:''}<div class="t"><h2>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</h2><div>خطاب رسمي · طُبع في ${X(new Date().toLocaleDateString('en-GB'))}</div></div></div><h1>${X(title)}</h1><div class="meta">${ev.length} حدث${filt?' · النوع: '+X(LBL[filt]||filt):''}</div>${body}<div class="foot">مستخرج من بيانات المكتب. لا يشمل الأتعاب أو الملاحظات الداخلية.</div></body></html>`;
  const fr=document.createElement('iframe');fr.style.cssText='position:fixed;left:-9999px;width:800px;height:600px';document.body.append(fr);
  const d=fr.contentDocument;d.open();d.write(html);d.close();
  const go=()=>{try{fr.contentWindow.focus();fr.contentWindow.print()}catch(e){alert('تعذر بدء الطباعة')}setTimeout(()=>fr.remove(),60000)};
  const im=d.querySelector('img');if(im&&!im.complete){im.onload=im.onerror=()=>setTimeout(go,150);setTimeout(go,2500)}else setTimeout(go,400);
 }
 window.mkPrintClientTimeline=printTimeline;
 function addBtn(){
  const p=document.getElementById('mkTl');if(!p||p.querySelector('[data-print-tl]'))return;
  const b=p.querySelector('[data-b]');if(!b||!b.firstChild)return;
  const btn=document.createElement('button');btn.type='button';btn.className='btn light';btn.setAttribute('data-print-tl','1');btn.style.margin='0 0 8px';btn.textContent='🖨 طباعة / PDF بالورق الرسمي';
  btn.onclick=()=>{const on=p.querySelector('.tlc.on');const f=on?on.dataset.f:'';const name=typeof selectedClientNameV54==='string'?selectedClientNameV54:'';printTimeline(name,f)};
  b.insertBefore(btn,b.firstChild);
 }
 try{new MutationObserver(()=>{try{addBtn()}catch(e){}}).observe(document.body,{childList:true,subtree:true})}catch(_){}
})();

/* ===== In-app reminder: sessions tomorrow (added Nov 27) ===== */
;(function(){
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pad=n=>String(n).padStart(2,'0');
 const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
 const tomorrow=()=>{if(window.__mkTmrDay)return window.__mkTmrDay;const d=new Date();d.setDate(d.getDate()+1);return ymd(d)};
 const user=()=>{try{return currentUser}catch(e){return null}};
 const key=()=>{const u=user();return 'mk_tmr_dismiss_'+tomorrow()+'_'+((u&&(u.id||u.email))||'')};
 function sessions(){
  const day=tomorrow();let list=[];try{list=(db.cases||[]).filter(c=>c&&!c.archived&&String(c.date||'').slice(0,10)===day)}catch(e){}
  return list;
 }
 function render(){
  let b=document.getElementById('mkTmr');
  const u=user();
  if(!u){if(b)b.remove();return}
  let dismissed=false;try{dismissed=!!localStorage.getItem(key())}catch(_){}
  const list=dismissed?[]:sessions();
  if(!list.length){if(b)b.remove();return}
  const sig=tomorrow()+'|'+list.length+'|'+list.map(c=>c.number).join(',');
  if(b&&b.dataset.sig===sig)return;
  if(!b){b=document.createElement('div');b.id='mkTmr';}
  b.dataset.sig=sig;
  b.setAttribute('dir','rtl');
  b.style.cssText='margin:8px 12px;padding:10px 14px;border:1px solid #e3c878;background:#fff8e1;border-radius:12px;font-size:13px;color:#4a3a10';
  const rows=list.slice(0,30).map(c=>`<div style="padding:5px 0;border-top:1px solid #f0e2b4"><b>${X(c.client||'—')}</b> · دعوى ${X(c.number||'—')} · ${X(c.court||'—')}${c.circuit?' · '+X(c.circuit):''}${c.action?'<div style="font-size:12px;color:#6b5a2a">المطلوب: '+X(String(c.action).slice(0,120))+'</div>':''}</div>`).join('');
  b.innerHTML=`<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><b style="flex:1">⏰ تذكير: ${list.length} جلسة غدا (${X(tomorrow())})</b><button type="button" class="btn light" data-open>عرض الجلسات</button><button type="button" class="btn light" data-hide>تم، إخفاء اليوم</button></div><details style="margin-top:4px"><summary style="cursor:pointer;font-size:12px">التفاصيل</summary>${rows}${list.length>30?'<div style="font-size:12px">و'+(list.length-30)+' أخرى في صفحة الجلسات</div>':''}</details>`;
  b.querySelector('[data-hide]').onclick=()=>{try{localStorage.setItem(key(),'1')}catch(_){}b.remove()};
  b.querySelector('[data-open]').onclick=()=>{const nav=document.querySelector('#nav [data-page="cases"]');if(nav)nav.click();setTimeout(()=>{const f=document.querySelector('#v91CaseFilters [data-filter="tomorrow"]');if(f)f.click()},500)};
  if(!b.isConnected){const anchor=document.getElementById('v91SmartBar')||document.querySelector('.top');if(anchor)anchor.insertAdjacentElement('afterend',b);else return}
 }
 let t=null;const q=()=>{if(t)clearTimeout(t);t=setTimeout(()=>{t=null;try{render()}catch(e){console.warn('mk reminder',e)}},400)};
 try{new MutationObserver(q).observe(document.body,{childList:true,subtree:true})}catch(_){}
 setInterval(q,10*60*1000);
 window.mkTomorrowSessions=sessions;
 q();
})();

/* ===== My tasks corner + assignee picker (added Nov 28) ===== */
;(function(){
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nk=s=>(x=>x==='هاني'?'hany shehata':x)(String(s==null?'':s).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/^(ا\.|ا\s)\s*/,'').replace(/\./g,' ').replace(/\s+/g,' ').trim());
 const me=()=>{try{return currentUser}catch(e){return null}};
 const mgr=()=>{try{return canManageOffice()}catch(e){return false}};
 const done=s=>{try{return taskStatusIsCompletedV10(s)}catch(e){return ['تم التنفيذ','منتهي'].includes(s)}};
 let staff=null,pending=null;
 function loadStaff(){
  if(staff&&staff.length)return Promise.resolve(staff);if(!me())return Promise.resolve(null);
  if(!pending)pending=(async()=>{try{const r=await sb.from('profiles').select('id,full_name,role,active');if(!r.error&&Array.isArray(r.data)&&r.data.length)staff=r.data.filter(p=>p.active!==false&&p.full_name)}catch(e){}pending=null;return staff})();
  return pending;
 }
 function isMine(t){
  const u=me();if(!u)return false;
  if(t.assigneeId&&u.id&&t.assigneeId===u.id)return true;
  const a=nk(t.assignee);if(!a)return false;
  if(a==='الاداري')return false;
  return a===nk(u.name);
 }
 const unassigned=t=>{const a=nk(t.assignee);return !a||a==='الاداري'};
 function row(t){return `<tr><td>${X(String(t.date||'—').slice(0,10))}</td><td><b>${X(t.task||'—')}</b></td><td>${X((Array.isArray(t.clients)&&t.clients.length?t.clients.join('، '):t.client)||'—')}</td><td>${X(t.court||'—')}</td><td>${X(t.status||'—')}</td></tr>`}
 const TH='<thead><tr><th>الاستحقاق</th><th>المهمة</th><th>الموكل</th><th>المحكمة</th><th>الحالة</th></tr></thead>';
 function panel(){
  let all=[];try{all=tasks()}catch(e){all=(db.tasks||[])}
  const mine=all.filter(t=>!done(t.status)&&isMine(t));
  const un=mgr()?all.filter(t=>!done(t.status)&&unassigned(t)):[];
  const d=document.createElement('details');d.id='mkMine';d.className='panel';d.open=true;d.style.margin='10px 0';
  const late=mine.filter(t=>t.date&&String(t.date).slice(0,10)<(typeof today==='function'?today():'9999')).length;
  d.innerHTML=`<summary style="cursor:pointer;font-weight:700;font-size:15px">📌 مهامي <span style="background:#14283f;color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;margin-inline-start:6px">${mine.length}</span>${late?`<span style="background:#ffe9e6;color:#a33;border-radius:10px;padding:1px 8px;font-size:12px;margin-inline-start:6px">${late} متأخرة</span>`:''}</summary><div style="margin-top:8px;overflow:auto">${mine.length?`<table class="table">${TH}<tbody>${mine.slice().sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999'))).map(row).join('')}</tbody></table>`:'<div style="padding:8px;color:#778">لا توجد مهام مسندة لك حاليا.</div>'}${mgr()?`<details style="margin-top:10px"><summary style="cursor:pointer;color:#8a6a1f">بدون مسؤول / مهام الإداري (${un.length}) · للإدارة فقط</summary><div style="overflow:auto">${un.length?`<table class="table">${TH}<tbody>${un.slice(0,100).map(row).join('')}</tbody></table>`:'<div style="padding:8px;color:#778">لا يوجد.</div>'}</div></details>`:''}</div>`;
  return d;
 }
 function inject(){
  const u=me();if(!u||typeof page==='undefined'||page!=='tasks')return;
  const ws=document.querySelector('#app .task-workspace');if(!ws)return;
  const sig=(()=>{try{return String(tasks().length)}catch(e){return ''}})();
  const ex=document.getElementById('mkMine');
  if(ex&&ex.dataset.sig===sig&&ws.contains(ex))return;
  if(ex)ex.remove();
  const p=panel();p.dataset.sig=sig;
  const anchor=ws.querySelector('.task-kpis');if(anchor)anchor.before(p);else ws.prepend(p);
 }
 function picker(){
  const f=document.querySelector('#modal.show #form');if(!f)return;
  const inp=f.querySelector('input[name="assignee"]');if(!inp||inp.dataset.mkPick)return;
  if(!staff||!staff.length){if(f.dataset.mkTry)return;f.dataset.mkTry='1';loadStaff().then(()=>{setTimeout(picker,50)});return}
  if(!staff||!staff.length)return;
  inp.dataset.mkPick='1';
  const cur=String(inp.value||'').trim();
  const sel=document.createElement('select');sel.className=inp.className;sel.style.cssText=inp.style.cssText;sel.setAttribute('aria-label','المسؤول');
  const hid=f.querySelector('input[name="assigneeId"]')||document.createElement('input');hid.type='hidden';hid.name='assigneeId';if(!hid.parentNode)inp.after(hid);
  const names=staff.map(p=>p.full_name);
  const match=staff.find(p=>nk(p.full_name)===nk(cur));
  sel.innerHTML='<option value="">— بدون مسؤول —</option>'+staff.map(p=>`<option value="${X(p.id)}">${X(p.full_name)}</option>`).join('')+((cur&&!match)?`<option value="__old">${X(cur)} (اسم قديم)</option>`:'');
  const sync=()=>{
   if(sel.value==='__old'){inp.value=cur;hid.value=''}
   else{const p=staff.find(x=>x.id===sel.value);inp.value=p?p.full_name:'';hid.value=p?p.id:''}
  };
  sel.value=match?match.id:(cur?'__old':'');
  sel.onchange=sync;sync();
  inp.type='hidden';inp.after(sel);
 }
 const __r=render;render=function(){const r=__r.apply(this,arguments);try{inject()}catch(e){console.warn('mk mine',e)}return r};
 try{let q=null;new MutationObserver(()=>{if(q)return;q=setTimeout(()=>{q=null;try{inject()}catch(e){window.__mkErr=String(e)}try{picker()}catch(e){window.__mkErr2=String(e)}},120)}).observe(document.body,{childList:true,subtree:true})}catch(_){}
 window.mkMyTasksMatch=isMine;window.mkPickerRun=picker;window.mkStaffGet=()=>staff;
})();

/* ===== Send tasks to staff on WhatsApp (wa.me, manual tap) (added Nov 28) ===== */
;(function(){
 const X=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const nk=s=>(x=>x==='هاني'?'hany shehata':x)(String(s==null?'':s).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/^(ا\.|ا\s)\s*/,'').replace(/\./g,' ').replace(/\s+/g,' ').trim());
 const mgr=()=>{try{return canManageOffice()}catch(e){return false}};
 const me=()=>{try{return currentUser}catch(e){return null}};
 const done=s=>{try{return taskStatusIsCompletedV10(s)}catch(e){return ['تم التنفيذ','منتهي'].includes(s)}};
 const day=()=>{try{return today()}catch(e){return new Date().toISOString().slice(0,10)}};
 let staff=null,phones={},loadedFor=null,busy=false;
 function normPhone(v){
  let d=String(v||'').replace(/[٠-٩]/g,c=>'٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[^0-9]/g,'');
  if(!d)return '';
  if(d.startsWith('00'))d=d.slice(2);
  else if(/^01[0-9]{9}$/.test(d))d='20'+d.slice(1);
  return /^[0-9]{10,15}$/.test(d)?'+'+d:'';
 }
 function tasksOf(p){
  let all=[];try{all=tasks()}catch(e){all=db.tasks||[]}
  return all.filter(t=>!done(t.status)&&((t.assigneeId&&t.assigneeId===p.id)||(nk(t.assignee)&&nk(t.assignee)!=='الاداري'&&nk(t.assignee)===nk(p.full_name))))
   .sort((a,b)=>String(a.date||'9999').localeCompare(String(b.date||'9999')));
 }
 function message(p,list){
  const td=day();
  const lines=list.slice(0,25).map((t,i)=>{
   const late=t.date&&String(t.date).slice(0,10)<td;
   const cl=(Array.isArray(t.clients)&&t.clients.length?t.clients.join('، '):t.client)||'';
   return (i+1)+') '+(late?'⚠ متأخرة: ':'')+String(t.task||'').replace(/\s+/g,' ').trim().slice(0,140)+(cl?' | الموكل: '+String(cl).slice(0,60):'')+(t.date?' | الاستحقاق: '+String(t.date).slice(0,10):'');
  });
  return 'أهلا '+p.full_name+'،\nمهامك المفتوحة ('+list.length+') بتاريخ '+td+':\n\n'+lines.join('\n')+(list.length>25?'\n... و'+(list.length-25)+' مهمة أخرى في البرنامج':'')+'\n\nمكتب هاني شحاتة للمحاماة';
 }
 async function load(force){
  if(busy)return;busy=true;
  try{
   const r=await sb.from('profiles').select('id,full_name,role,active');
   if(!r.error&&Array.isArray(r.data))staff=r.data.filter(p=>p.active!==false&&p.full_name&&p.role!=='admin');
   const c=await sb.from('staff_contacts').select('profile_id,phone');
   phones={};if(!c.error&&Array.isArray(c.data))c.data.forEach(x=>phones[x.profile_id]=x.phone);
   window.__mkWaTable=c.error?String(c.error.message||c.error):'ok';
  }catch(e){}
  busy=false;loadedFor=me()&&me().id;draw();
 }
 async function savePhone(p,raw){
  const ph=normPhone(raw);
  if(!raw.trim()){const r=await sb.from('staff_contacts').delete().eq('profile_id',p.id);if(r.error)throw r.error;delete phones[p.id];return}
  if(!ph)throw new Error('رقم غير صحيح. اكتب رقم مصري مثل 01xxxxxxxxx أو بصيغة دولية.');
  const r=await sb.from('staff_contacts').upsert({profile_id:p.id,phone:ph,updated_at:new Date().toISOString()},{onConflict:'profile_id'});
  if(r.error)throw r.error;phones[p.id]=ph;
 }
 function draw(){
  const box=document.getElementById('mkWa');if(!box)return;
  const body=box.querySelector('[data-b]');if(!body)return;
  if(!staff){body.innerHTML='<div style="padding:8px;color:#778">جارٍ التحميل...</div>';return}
  if(window.__mkWaTable&&window.__mkWaTable!=='ok'){body.innerHTML='<div style="padding:8px;color:#a33">جدول أرقام الموظفين غير متاح: '+X(window.__mkWaTable)+'</div>';return}
  body.innerHTML='<div style="font-size:12px;color:#667;margin-bottom:6px">الرقم محفوظ في جدول مقيّد (الإدارة فقط). الزر يفتح واتساب بالرسالة جاهزة وتضغط إرسال بنفسك، ولا يتم إرسال أي شيء تلقائيا.</div><div style="overflow:auto"><table class="table"><thead><tr><th>الموظف</th><th>مهام مفتوحة</th><th>الموبايل</th><th></th></tr></thead><tbody>'+staff.map(p=>{
   const n=tasksOf(p).length;
   return '<tr data-id="'+X(p.id)+'"><td><b>'+X(p.full_name)+'</b></td><td>'+n+'</td><td style="white-space:nowrap"><input dir="ltr" data-ph value="'+X(phones[p.id]||'')+'" placeholder="01xxxxxxxxx" style="width:150px;padding:5px;border:1px solid #cfd6df;border-radius:8px"> <button type="button" class="btn light" data-save>حفظ الرقم</button></td><td><button type="button" class="btn goldbtn" data-send '+((phones[p.id]&&n)?'':'disabled')+'>'+(phones[p.id]?(n?'📲 إرسال المهام واتساب':'لا مهام'):'أضف الرقم أولا')+'</button></td></tr>';
  }).join('')+'</tbody></table></div>';
  body.querySelectorAll('tr[data-id]').forEach(tr=>{
   const p=staff.find(x=>x.id===tr.dataset.id);
   tr.querySelector('[data-save]').onclick=async e=>{const b=e.target;b.disabled=true;try{await savePhone(p,tr.querySelector('[data-ph]').value);draw()}catch(err){alert('تعذر حفظ الرقم: '+(err.message||err));b.disabled=false}};
   tr.querySelector('[data-send]').onclick=()=>{
    const ph=phones[p.id];const list=tasksOf(p);if(!ph||!list.length)return;
    const url='https://wa.me/'+ph.replace(/[^0-9]/g,'')+'?text='+encodeURIComponent(message(p,list));
    window.open(url,'_blank','noopener');
   };
  });
 }
 function inject(){
  const u=me();if(!u||!mgr()||typeof page==='undefined'||page!=='tasks')return;
  const ws=document.querySelector('#app .task-workspace');if(!ws)return;
  let box=document.getElementById('mkWa');
  if(box&&ws.contains(box))return;
  box=document.createElement('details');box.id='mkWa';box.className='panel';box.style.margin='10px 0';
  box.innerHTML='<summary style="cursor:pointer;font-weight:700;font-size:15px">📲 إرسال المهام للموظفين على واتساب</summary><div data-b style="margin-top:8px"></div>';
  box.addEventListener('toggle',()=>{if(box.open){if(!staff||loadedFor!==u.id)load();else draw()}});
  const a=document.getElementById('mkMine')||ws.querySelector('.task-kpis');
  if(a&&ws.contains(a))a.after(box);else ws.prepend(box);
 }
 const __r=render;render=function(){const r=__r.apply(this,arguments);try{inject()}catch(e){console.warn('mk wa',e)}return r};
 try{let q=null;new MutationObserver(()=>{if(q)return;q=setTimeout(()=>{q=null;try{inject()}catch(e){}},150)}).observe(document.body,{childList:true,subtree:true})}catch(_){}
 window.mkWaMessage=message;window.mkWaNormPhone=normPhone;
})();

/* ===== Appeal deadlines: suggested rules + weekend warning (added Nov 28) ===== */
;(function(){
 const PRE=[
  {id:'ar-preset-appeal-40',type:'استئناف',title:'استئناف حكم مدني/تجاري (مقترحة — تحتاج مراجعة المحامي)',days:40,startEvent:'عادةً من صدور الحكم، ومن الإعلان في الأحوال التي يحددها القانون — يحددها المحامي',source:'م227 فقرة 1 قانون المرافعات 13 لسنة 1968',note:'مقترحة من النظام. راجع بدء الميعاد وأي استثناءات (أحكام غيابية، وقف، انقطاع).'},
  {id:'ar-preset-appeal-15',type:'استئناف',title:'استئناف في المواد المستعجلة (مقترحة — تحتاج مراجعة المحامي)',days:15,startEvent:'عادةً من صدور الحكم — يحددها المحامي',source:'م227 فقرة 2 قانون المرافعات 13 لسنة 1968',note:'مقترحة من النظام. تأكد أن المادة مستعجلة فعلًا.'},
  {id:'ar-preset-cassation-60',type:'نقض',title:'طعن بالنقض (مقترحة — تحتاج مراجعة المحامي)',days:60,startEvent:'من تاريخ الحكم أو انقضاء ميعاد المعارضة/الحكم في المعارضة بحسب الحالة — يحددها المحامي',source:'م34 قانون 57 لسنة 1959 (راجع النص الحاكم للنقض المدني)',note:'مقترحة من النظام. يلزم إيداع الأسباب في نفس الميعاد.'},
  {id:'ar-preset-admin-60',type:'طعن إداري',title:'طعن أمام الإدارية العليا (مقترحة — تحتاج مراجعة المحامي)',days:60,startEvent:'من تاريخ صدور الحكم المطعون فيه',source:'م44 قانون مجلس الدولة 47 لسنة 1972',note:'مقترحة من النظام.'}
 ];
 const RM='mk_appeal_preset_removed';
 const removed=()=>{try{return JSON.parse(localStorage.getItem(RM)||'[]')}catch(e){return []}};
 function ensure(){try{
  if(typeof db==='undefined'||!db)return;
  if(!Array.isArray(db.appealRules))db.appealRules=[];
  const rm=removed();
  PRE.forEach(p=>{if(rm.includes(p.id)||db.appealRules.some(r=>r.id===p.id))return;db.appealRules.push({...p,distanceDays:0,extendHoliday:true,active:true,preset:true,createdAt:'',createdBy:'اقتراح النظام'})});
 }catch(e){}}
 try{const prior=render;render=function(){if(page==='cases')ensure();return prior.apply(this,arguments)}}catch(e){}
 try{const orm=window.removeAppealRuleV10;if(typeof orm==='function')window.removeAppealRuleV10=async function(id){
  const had=(db.appealRules||[]).some(r=>r.id===id);const r=await orm.apply(this,arguments);
  try{if(had&&String(id).indexOf('ar-preset-')===0&&!(db.appealRules||[]).some(x=>x.id===id)){const a=removed();a.push(id);localStorage.setItem(RM,JSON.stringify(a))}}catch(e){}
  return r}}catch(e){}
 try{const oc=window.calculateAppealDeadlineV10;if(typeof oc==='function')window.calculateAppealDeadlineV10=async function(){
  try{
   const rule=(db.appealRules||[]).find(x=>x.id===document.getElementById('v10AppealRule')?.value);
   const st=document.getElementById('v10AppealStart')?.value;
   if(rule&&/^\d{4}-\d{2}-\d{2}$/.test(st||'')){
    const p=st.split('-').map(Number);const dt=new Date(p[0],p[1]-1,p[2]+Number(rule.days||0)+Number(rule.distanceDays||0),12);const wd=dt.getDay();
    if(wd===5||wd===6){const nm=wd===5?'الجمعة':'السبت';
     if(!confirm('تنبيه: آخر يوم محسوب يقع يوم '+nm+'. قد يمتد الميعاد إلى أول يوم عمل بعده (م18 مرافعات)، لكن النظام سيحفظ التاريخ المحسوب الأبكر (الأحوط). لا تعتمد المد إلا بعد تأكيد المحامي. المتابعة؟'))return;}
   }
  }catch(e){}
  return oc.apply(this,arguments)}}catch(e){}
 window.mkAppealEnsurePresets=ensure;
})();
