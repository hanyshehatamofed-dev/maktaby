/* MAKTABY PRO 10.9.0 — Visual Case Timeline. Read-only presentation of existing records. */
(() => {
  'use strict';
  if (window.__MAKTABY_CASE_TIMELINE_109) return;
  window.__MAKTABY_CASE_TIMELINE_109 = true;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateOnly = value => {
    if (!value) return '';
    const s = String(value);
    const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
    if (iso) return iso[1];
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0,10);
  };
  const firstDate = (...values) => values.map(dateOnly).find(Boolean) || '';
  const labelDate = value => value ? new Date(value + 'T12:00:00').toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'}) : 'التاريخ غير مسجل';
  const norm = value => String(value ?? '').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');
  const caseClients = c => [...new Set((Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client]).filter(Boolean).map(x=>String(x).trim()))];
  const allCaseRows = () => [...(db.cases||[]), ...(db.caseArchive||[])];
  function directLinkedRecords(c, rows) {
    const ids = new Set([c.caseId,c.id].filter(Boolean).map(String));
    const number = String(c.number || c.caseNumber || '').trim();
    return (rows || []).filter(x => {
      const xid = [x.caseId,x.linkedCaseId,x.sourceCaseId].filter(Boolean).map(String);
      const xnumber = String(x.caseNumber || x.caseNo || x.linkedCaseNumber || '').trim();
      return xid.some(id=>ids.has(id)) || (!!number && xnumber===number);
    });
  }
  function safeLegacyLinkedRecords(c, rows, kind) {
    const names = new Set(caseClients(c).map(norm).filter(Boolean));
    const court = norm(c.court);
    const sessionDates = new Set([c.date,...(Array.isArray(c.history)?c.history.map(h=>h.date||h.sessionDate):[])].map(dateOnly).filter(Boolean));
    const casePool = allCaseRows();
    return (rows||[]).filter(row=>{
      if (directLinkedRecords(c,[row]).length) return false;
      // A present-but-mismatching stable reference is a hard stop; never fall back
      // to client/court heuristics when the record already points elsewhere.
      if ([row.caseId,row.linkedCaseId,row.sourceCaseId,row.caseNumber,row.caseNo,row.linkedCaseNumber].some(v=>v!==undefined&&v!==null&&String(v).trim()!=='')) return false;
      const rowClient = norm(row.client || row.client_name);
      if (!rowClient || !names.has(rowClient)) return false;
      const rowCourt = norm(row.court);
      if (court && rowCourt && court !== rowCourt) return false;
      const candidates = casePool.filter(other=>{
        if (!names.has(norm((Array.isArray(other.clients)&&other.clients.length?other.clients:[other.client]).find(n=>norm(n)===rowClient)))) return false;
        if (court && norm(other.court) && court !== norm(other.court)) return false;
        if (kind==='announcement' && row.session) {
          const dates = [other.date,...(Array.isArray(other.history)?other.history.map(h=>h.date||h.sessionDate):[])].map(dateOnly).filter(Boolean);
          if (!dates.includes(dateOnly(row.session))) return false;
        }
        return true;
      });
      // Legacy announcements/tasks do not carry a stable case ID. Attach only
      // when the client/court/date combination resolves to one case, never guess.
      return candidates.length===1 && candidates[0]===c;
    });
  }
  function buildEvents(c) {
    const events = [];
    const add = (date, type, title, detail, source) => {
      const d = dateOnly(date);
      if (!d) return;
      events.push({date:d,type,title,detail:String(detail || '').trim(),source});
    };
    const names = caseClients(c);
    const ids = new Set([c.caseId,c.id].filter(Boolean).map(String));
    add(firstDate(c.intakeDate,c.receivedAt,c.createdAt,c.createdDate,c.powerOfAttorneyDate,c.contractDate), 'start', 'استلام القضية / بدء الملف', c.powerOfAttorneyNo ? 'رقم التوكيل: '+c.powerOfAttorneyNo : 'تاريخ بدء الملف المسجل', 'بيانات القضية');
    (db.clients||[]).filter(client=>names.some(n=>norm(n)===norm(client.name))).forEach(client=>add(firstDate(client.powerOfAttorneyDate,client.poaDate,client.poaIssuedAt),'start','تاريخ التوكيل',client.powerOfAttorneyNo?'رقم التوكيل: '+client.powerOfAttorneyNo:'تاريخ التوكيل المسجل','ملف الموكل'));
    (Array.isArray(c.history)?c.history:[]).forEach((h,i) => add(firstDate(h.date,h.sessionDate,h.savedAt), 'session', 'جلسة سابقة '+(i+1), [h.decision ? 'القرار: '+h.decision : '',h.reason ? 'سبب التأجيل: '+h.reason : ''].filter(Boolean).join(' — '), 'سجل الجلسات'));
    add(firstDate(c.date), 'session', 'الجلسة الحالية / القادمة', [c.result ? 'القرار: '+c.result : '',c.adjournment ? 'سبب التأجيل: '+c.adjournment : ''].filter(Boolean).join(' — ') || 'موعد الجلسة المسجل', 'بيانات القضية');
    (Array.isArray(c.sessionDocuments)?c.sessionDocuments:[]).forEach((doc,i) => add(firstDate(doc.createdAt,doc.date,doc.uploadedAt), 'document', doc.kind || 'محرر / مستند جلسة '+(i+1), doc.fileName || doc.name || doc.body || 'مستند مسجل داخل ملف الجلسة', 'محررات الجلسة'));
    (Array.isArray(c.documents)?c.documents:[]).forEach((doc,i) => add(firstDate(doc.createdAt,doc.date,doc.uploadedAt), 'document', doc.name || doc.fileName || 'مستند مرفوع '+(i+1), doc.category || doc.description || 'مستند مرتبط بالقضية', 'مستندات القضية'));
    // Uploaded client documents are stored against the client, not a case.
    // Show them as client-file events with an explicit non-exclusive label.
    const clientDocs = (db.clientDocuments||[]).filter(doc=>names.some(n=>norm(n)===norm(doc.client_name)));
    const clientHasSeveralCases = allCaseRows().filter(row=>caseClients(row).some(n=>names.some(x=>norm(x)===norm(n)))).length > 1;
    clientDocs.forEach((doc,i)=>add(firstDate(doc.created_at,doc.createdAt), 'document', doc.file_name || 'مستند بملف الموكل '+(i+1), [doc.category||'مستند',clientHasSeveralCases?'مستند بملف الموكل؛ لا يوجد ربط حصري بهذه القضية':'مستند بملف الموكل'].join(' — '), 'مستندات الموكل'));
    const announcementRows = [...(db.announcements||[]),...(db.announcementArchive||[])];
    const announcements = [...directLinkedRecords(c,announcementRows),...safeLegacyLinkedRecords(c,announcementRows,'announcement')];
    [...new Set(announcements)].forEach(a => {
      add(firstDate(a.deliveryDate,a.createdAt,a.receivedDate), 'notice', a.kind || 'إعلان / إنذار', [a.number ? 'رقم الإعلان: '+a.number : '',a.status || '',a.receivedDate ? 'تاريخ الاستلام: '+a.receivedDate : '',a.receivedBy ? 'استلمه: '+a.receivedBy : ''].filter(Boolean).join(' — '), 'سجل الإعلانات (ربط مباشر أو تطابق وحيد)');
      if(a.receivedDate && a.receivedDate!==a.deliveryDate && a.receivedDate!==a.createdAt) add(a.receivedDate,'notice','استلام الإعلان',[a.number?'رقم الإعلان: '+a.number:'',a.receivedBy?'استلمه: '+a.receivedBy:''].filter(Boolean).join(' — '),'سجل الإعلانات');
    });
    const taskRows = [...(db.tasks||[]),...(db.taskArchive||[])];
    const tasks = [...directLinkedRecords(c,taskRows),...safeLegacyLinkedRecords(c,taskRows,'task')];
    [...new Set(tasks)].forEach(t => add(firstDate(t.completionDate,t.date,t.createdAt), 'task', t.task || 'إجراء متعلق بالقضية', [t.status || '',t.assignee ? 'المسؤول: '+t.assignee : '',t.completionNote || ''].filter(Boolean).join(' — '), 'المهام المرتبطة بالقضية'));
    (db.appealCalculations||[]).filter(x=>ids.has(String(x.caseId||'')) || (String(x.caseNumber||'').trim()===String(c.number||'').trim() && names.some(n=>norm(n)===norm(x.client)))).forEach(x=>add(firstDate(x.judgmentDate,x.calculatedAt),'judgment','تسجيل حكم / حساب ميعاد طعن',[x.appealType||'',x.judgmentText||'',x.status||''].filter(Boolean).join(' — '),'حاسبة الطعون المرتبطة بالقضية'));
    (db.cloudExpenses||[]).filter(x=>x.caseId && ids.has(String(x.caseId)) && /تنفيذ/.test(String(x.category||''))).forEach(x=>add(x.date,'execution','مصروف متعلق بالتنفيذ',[x.title||'',x.category||'',Number(x.amount||0).toLocaleString('en-US')+' ج.م'].filter(Boolean).join(' — '),'مصروفات القضية المرتبطة برقم القضية'));
    add(firstDate(c.judgmentSessionDate,c.judgmentDate), 'judgment', 'جلسة الحكم', c.judgmentText || 'تاريخ جلسة الحكم المسجل', 'بيانات الحكم');
    add(firstDate(c.executionDate,c.executionStartedAt,c.executionCompletedAt), 'execution', 'مرحلة التنفيذ', c.executionStatus || c.executionNote || 'بيانات التنفيذ المسجلة', 'بيانات التنفيذ');
    if (c.judgmentText && !events.some(e=>e.type==='judgment' && e.detail===String(c.judgmentText))) add(firstDate(c.archiveDate), 'judgment', 'الحكم النهائي / أرشفة القضية', c.judgmentText, 'الأرشيف');
    return events.sort((a,b)=>a.date.localeCompare(b.date) || ({start:0,notice:1,session:2,document:3,task:4,judgment:5,execution:6}[a.type]||9)-({start:0,notice:1,session:2,document:3,task:4,judgment:5,execution:6}[b.type]||9));
  }
  // Timeline styles are loaded as a versioned external stylesheet by the boot loader.

  const overlay = document.createElement('div'); overlay.id='mkCaseTimeline109'; overlay.setAttribute('role','dialog'); overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','الخط الزمني للقضية');
  overlay.innerHTML='<section class="mktl-shell"><header class="mktl-head"><div><h2>◷ الخط الزمني للقضية</h2><small id="mktl-subtitle"></small></div><button class="mktl-close" type="button" aria-label="إغلاق الخط الزمني">×</button></header><div class="mktl-summary" id="mktl-summary"></div><main class="mktl-body" id="mktl-body"></main></section>';
  document.body.appendChild(overlay);
  function open(index, archive = false) {
    const sourceRows = archive ? (db.caseArchive||[]) : (db.cases||[]);
    const c = sourceRows[Number(index)];
    if (!c) return alert('تعذر العثور على القضية المحددة. حدّث الصفحة وحاول مرة أخرى.');
    const clients = (Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client]).filter(Boolean).join('، ') || 'موكل غير محدد';
    document.getElementById('mktl-subtitle').textContent = clients+' — '+(c.number||'دون رقم')+' — '+(c.court||'');
    const chips = [c.caseType,c.court,c.number ? 'رقم '+c.number : ''].filter(Boolean);
    document.getElementById('mktl-summary').innerHTML = chips.map(x=>'<span class="mktl-chip">'+esc(x)+'</span>').join('');
    const events = buildEvents(c);
    document.getElementById('mktl-body').innerHTML = events.length ? '<div class="mktl-track">'+events.map(e=>'<article class="mktl-event" data-type="'+esc(e.type)+'"><span class="mktl-dot" aria-hidden="true"></span><div class="mktl-card"><div class="mktl-date">'+esc(labelDate(e.date))+'</div><div class="mktl-title">'+esc(e.title)+'</div>'+(e.detail?'<div class="mktl-detail">'+esc(e.detail)+'</div>':'')+'<div class="mktl-source">المصدر: '+esc(e.source)+'</div></div></article>').join('')+'</div><p class="mktl-note">يعرض الخط الزمني البيانات الموجودة بالفعل في ملف القضية والسجلات المرتبطة بها. لا ينشئ أحداثًا أو تواريخ غير مسجلة، ولا يعدّل أي بيانات.</p>' : '<div class="mktl-empty">لا توجد أحداث مؤرخة كافية لعرض خط زمني لهذه القضية حتى الآن.<br>عند تسجيل الجلسات والمستندات والإعلانات وتواريخ الحكم، ستظهر هنا تلقائيًا.</div>';
    overlay.classList.add('open'); document.body.style.overflow='hidden'; overlay.querySelector('.mktl-close').focus();
  }
  function close(){overlay.classList.remove('open');document.body.style.overflow='';}
  overlay.querySelector('.mktl-close').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&overlay.classList.contains('open'))close();});
  window.openCaseTimeline109 = open;
  window.MAKTABY_CASE_TIMELINE_109 = {open,close,buildEvents};
})();
