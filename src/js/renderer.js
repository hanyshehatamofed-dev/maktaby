/* MAKTABY PRO 10.1.0 — financial merge and custody tombstone repair.
 * Modules are kept in source order for backwards compatibility with the existing global UI.
 * Node/Electron APIs are intentionally unavailable in this file.
 */

window.MAKTABY_PRO_VERSION='10.9.1';
window.MAKTABY_BUILD_ID='MAKTABY_PRO_10_WINDOWS_PARITY_20261112_R1';

/* ===== Legacy UI segment 01 (preserved order) ===== */

const SUPABASE_URL="https://mejwytxyzjaexxtaniwf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY="sb_publishable_weKDTbM9ZxpZ0fSEFZbjew_m9ZrOvfL";
// MAKTABY request deduplication interceptor (safe read-only scope only).
// PostgREST does not provide a generic multi-query HTTP batch endpoint. This
// layer coalesces identical concurrent/recent GETs for 20ms; it never merges
// distinct queries and never intercepts writes, auth, storage, or functions.
(function installMaktabyReadDeduper(){
 const nativeFetch=window.fetch.bind(window);
 const recent=new Map();
 const windowMs=20;const T0=Date.now();const winNow=()=>Date.now()-T0<30000?3000:windowMs;
 const metrics=window.__MAKTABY_REQUEST_METRICS={eligible:0,dispatched:0,deduplicated:0,windowMs};
 function headerKey(input,init){
   const headers=new Headers(input instanceof Request?input.headers:undefined);
   new Headers(init&&init.headers||undefined).forEach((v,k)=>headers.set(k,v));
   return Array.from(headers.entries()).sort((a,b)=>a[0].localeCompare(b[0])).map(([k,v])=>k+':'+v).join('|');
 }
 function interceptedFetch(input,init){
   let url,method;
   try{url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url,location.href);method=String((init&&init.method)||(input instanceof Request?input.method:'GET')).toUpperCase();}
   catch(_){return nativeFetch(input,init);}
   if(!['GET','HEAD'].includes(method)||(init&&init.signal)||url.origin!==SUPABASE_URL||!url.pathname.startsWith('/rest/v1/')){if(url.origin===SUPABASE_URL&&!['GET','HEAD'].includes(method))recent.clear();return nativeFetch(input,init);}
   metrics.eligible++;
   const key=method+' '+url.href+' '+headerKey(input,init)+' '+String((init&&init.credentials)||'same-origin')+' '+String((init&&init.cache)||'default');
   const now=Date.now();
   const prior=recent.get(key);
   if(prior&&now-prior.startedAt<=winNow()){metrics.deduplicated++;return prior.promise.then(response=>response.clone());}
   const entry={startedAt:now,promise:null};
   metrics.dispatched++;
   entry.promise=nativeFetch(input,init).then(response=>response).catch(error=>{if(recent.get(key)===entry)recent.delete(key);throw error;});
   recent.set(key,entry);
   entry.promise.then(()=>setTimeout(()=>{if(recent.get(key)===entry)recent.delete(key);},winNow()),()=>{});
   return entry.promise.then(response=>response.clone());
 }
 window.__maktabyFetch=interceptedFetch;
})();
window.sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},global:{fetch:window.__maktabyFetch}});
const $=s=>document.querySelector(s), today=()=>new Date().toISOString().slice(0,10), plus=n=>{let d=new Date();d.setDate(d.getDate()+n);return d.toISOString().slice(0,10)};
// Coalesce rapid search keystrokes into one render; keeps the active input responsive.
function scheduleSearchRender(){clearTimeout(window.__maktabySearchRenderTimer);const targetPage=page;window.__maktabySearchRenderTimer=setTimeout(()=>{if(page===targetPage)render();},180);}

/* MAKTABY compute worker: isolated, pure calculations only. All DOM, auth, and writes stay on Main Thread. */
(function(){
 const pending=new Map();let worker=null,seq=0,disabled=false;
 function normalizeArabicSearch(value){return String(value??'').trim().toLocaleLowerCase('ar');}
 function fallbackFeeLedger(agreements,payments,query,today){
   const paidById=new Map();for(const p of payments){const k=p.agreementId;paidById.set(k,(paidById.get(k)||0)+(Number(p.amount)||0));}
   const amountPaid=id=>paidById.get(id)||0;
   const matched=[];agreements.forEach((a,i)=>{if(!query||[a.client,a.description,a.caseNumber].some(v=>String(v||'').toLocaleLowerCase('ar').includes(query)))matched.push(i);});
   const total=agreements.reduce((n,a)=>n+(Number(a.total)||0),0),paid=agreements.reduce((n,a)=>n+amountPaid(a.id),0);
   const due=agreements.reduce((n,a)=>n+(a.dueDate&&a.dueDate<today&&(Number(a.total)||0)-amountPaid(a.id)>0?1:0),0);
   return {matched,total,paid,remain:total-paid,due,paidEntries:Array.from(paidById.entries())};
 }
 function stopWorker(reason){if(worker){try{worker.terminate();}catch(_){}worker=null;}for(const [id,p] of pending){clearTimeout(p.timer);p.reject(new Error(reason||'Worker unavailable'));}pending.clear();disabled=true;}
 function getWorker(){if(disabled||typeof Worker==='undefined')return null;if(worker)return worker;try{worker=new Worker(new URL('js/maktaby-compute-worker.js',location.href),{name:'maktaby-compute'});worker.onmessage=e=>{const m=e.data||{},p=pending.get(m.id);if(!p)return;pending.delete(m.id);clearTimeout(p.timer);m.error?p.reject(new Error(m.error)):p.resolve(m.result);};worker.onerror=()=>stopWorker('تعذر تشغيل عامل المعالجة');return worker;}catch(e){disabled=true;return null;}}
 function run(op,payload,fallback){const w=getWorker();if(!w)return Promise.resolve().then(fallback);const id=++seq;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);try{w.terminate();}catch(_){}worker=null;disabled=true;resolve(fallback());},2500);pending.set(id,{resolve,reject,timer});try{w.postMessage({id,op,payload});}catch(e){clearTimeout(timer);pending.delete(id);resolve(fallback());}}).catch(()=>fallback());}
 window.MAKTABY_COMPUTE={
   search:(values,query)=>run('search',{values,query:normalizeArabicSearch(query)},()=>{const q=normalizeArabicSearch(query);return values.map((v,i)=>({v,i})).filter(x=>!q||String(x.v??'').toLocaleLowerCase('ar').includes(q)).map(x=>x.i);}),
   feeLedger:(agreements,payments,query,today)=>run('feeLedger',{agreements:agreements.map(a=>({id:a.id,client:a.client,description:a.description,caseNumber:a.caseNumber,total:a.total,dueDate:a.dueDate})),payments:payments.map(p=>({agreementId:p.agreementId,amount:p.amount})),query:normalizeArabicSearch(query),today},()=>fallbackFeeLedger(agreements,payments,normalizeArabicSearch(query),today))
 };
})();

const PRELOADED_OFFICE_DATA={};
const STORAGE_KEY='hanyLawDemoPreloaded20261030';
function normalizeOfficeData(d){return {clients:(d.clients||[]).map(x=>({...x,name:x.name,fees:x.fees||''})),cases:(d.cases||[]).map((x,i)=>({...x,caseId:x.caseId||x.id||('case-legacy-'+i+'-'+String(x.number||'').replace(/\W/g,'').slice(-12)),date:x.date||'',client:x.client||'',number:x.number||'',court:x.court||'',action:x.action||'',result:x.result||x.decision||'',opponent:x.opponent||'',adjournment:x.adjournment||'',previousSession:x.previousSession||'',history:Array.isArray(x.history)?x.history:[]})),announcements:(d.announcements||[]).map(x=>({client:x.client||'',number:x.number||'',court:x.court||'',bailiff:x.bailiff||'',session:x.session||'',kind:x.kind||'',delivered:!!x.delivered,deliveryDate:x.deliveryDate||x.deliveredDate||'',receivedDate:x.receivedDate||'',status:x.status||(x.delivered?'تم الاستلام':'قيد الإعلان'),archived:!!x.archived,cost:x.cost||'',notes:x.notes||''})),transactions:(d.transactions||[]).map(x=>({date:x.date||'',client:x.client||'',kind:x.kind||'',title:x.title||'',amount:x.amount||0,notes:x.notes||''})),tasks:[],payroll:d.payroll||[],attendance:d.attendance||[],fixedCommitments:d.fixedCommitments||[],otherExpenses:d.otherExpenses||[],settings:d.settings||{},meta:d.meta||{}}}
let __maktabyTaskArchiveMigrationPending=false;
let db=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null');if(!db){db=normalizeOfficeData(PRELOADED_OFFICE_DATA);localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}db.cases=(db.cases||[]).map((c,i)=>({...c,caseId:c.caseId||c.id||('case-local-'+i+'-'+String(c.number||'').replace(/\W/g,'').slice(-12)),result:c.result||c.decision||'',history:Array.isArray(c.history)?c.history:[]}));db.transactions=db.transactions||[];db.taskArchive=db.taskArchive||[];db.tasks=db.tasks||[];db.tasks.forEach(ensureTaskIdentityV10);db.employees=db.employees||[];db.announcementArchive=db.announcementArchive||[];db.caseArchive=db.caseArchive||[];db.clientArchive=db.clientArchive||[];db.poaArchive=db.poaArchive||[];db.enumerations=ensureEnumerationIds(db.enumerations||[]);db.fixedCommitments=db.fixedCommitments||[];
// V9.4.7: preserve all commitment rows, including inactive deletion tombstones.
// Assign stable IDs to legacy rows without collapsing legitimate identical commitments.
function ensureFixedCommitmentIds(rows){
 const counts=new Map();
 return (Array.isArray(rows)?rows:[]).map((row,index)=>{
  const title=String(row?.title??row?.item??'التزام غير مسمى').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
  const amount=Number(row?.amount??row?.monthlyAmount)||0;
  const due=Number(row?.dueDay)||1;
  const key=JSON.stringify([title,amount,due]);
  const occurrence=counts.get(key)||0;counts.set(key,occurrence+1);
  return {...row,id:row?.id||('legacy-fixed-'+btoa(unescape(encodeURIComponent(key))).replace(/[^a-zA-Z0-9]/g,'').slice(0,24)+'-'+occurrence)};
 });
}
db.fixedCommitments=ensureFixedCommitmentIds(db.fixedCommitments);
db.walletTransactions=db.walletTransactions||[];db.clientDocuments=db.clientDocuments||[];db.cases.forEach(c=>{c.history=c.history||[];c.archived=!!c.archived});
// Public-bundle privacy hardening: no personal seed rows are embedded or auto-imported.
// Existing LocalStorage and Supabase records are left untouched.
// Normalize status without ever mistaking the Excel delivery-to-bailiff date for receipt date.
db.announcements.forEach(a=>{a.deliveryDate=a.deliveryDate||'';a.receivedDate=a.receivedDate||'';a.status=a.status||(a.receivedDate?'تم الاستلام':'قيد الإعلان');a.delivered=!!a.receivedDate||a.status==='تم الاستلام';});
localStorage.setItem(STORAGE_KEY,JSON.stringify(db));let cloudStateVersions={office_shared_state:null,employee_shared_state:null,office_financial_state:null};let page='dashboard',formType='',currentUser=null,editingCaseIndex=null,editingEnumerationIndex=null,editingTaskIndex=null,editingAnnouncementIndex=null;const isAdmin=()=>currentUser?.role==='admin';window.MAKTABY_RECOVERY_ADMIN_CHECK=isAdmin;const isOfficeManager=()=>currentUser?.role==='office_manager';const isEmployee=()=>currentUser?.role==='employee';const isLimitedStaff=()=>['mickysamer4@gmail.com','mariamharby712@gmail.com','manal.makrum@gmail.com'].includes(String(currentUser?.email||'').toLowerCase());const canRequestSessions=()=>isLimitedStaff()||isEmployee();const canManageOffice=()=>isAdmin()||isOfficeManager();const canReview=()=>canManageOffice();const canViewEnumerations=()=>canManageOffice()||isLimitedStaff();db.approvalRequests=db.approvalRequests||[];
async function save(){localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();if(!currentUser||!canManageOffice())return;try{await saveCloudState({persistLocal:false});setCloudStatus('تم الحفظ والمزامنة');}catch(e){setCloudStatus('تعذر المزامنة: '+(e.message||e));console.error(e);alert('تم الحفظ محليًا، لكن تعذرت المزامنة مع الإنترنت: '+(e.message||e));}}
function setCloudStatus(t){let el=document.getElementById('cloudStatus');if(el)el.textContent=t;}
function sharedPayload(){return {clients:db.clients||[],cases:db.cases||[],announcements:db.announcements||[],tasks:db.tasks||[],taskArchive:db.taskArchive||[],achievements:db.achievements||[],announcementArchive:db.announcementArchive||[],caseArchive:db.caseArchive||[],clientArchive:db.clientArchive||[],poaArchive:db.poaArchive||[],enumerations:db.enumerations||[],meta:db.meta||{},powerOfAttorneys:db.powerOfAttorneys||[],appealRules:db.appealRules||[],appealCalculations:db.appealCalculations||[],legalHolidays:db.legalHolidays||[]};}
function employeePayload(){return {clients:(db.clients||[]).map(c=>({name:c.name,phone:c.phone||'',phone2:c.phone2||'',powerOfAttorneyNo:c.powerOfAttorneyNo||'',subject:c.subject||'',fees:'',notes:c.notes||''})),cases:(db.cases||[]).filter(c=>!c.archived).map(c=>({...c,caseId:c.caseId||c.id,result:c.result||c.decision||'',history:Array.isArray(c.history)?c.history:[]})),announcements:(db.announcements||[]).filter(a=>!a.archived).map(a=>({client:a.client,number:a.number,court:a.court,bailiff:a.bailiff,deliveryDate:a.deliveryDate,receivedDate:'',status:a.status||'قيد الإعلان',kind:a.kind,session:a.session})),tasks:db.tasks||[],taskArchive:db.taskArchive||[],achievements:db.achievements||[],enumerations:db.enumerations||[],meta:db.meta||{},powerOfAttorneys:db.powerOfAttorneys||[],appealRules:db.appealRules||[],appealCalculations:db.appealCalculations||[],legalHolidays:db.legalHolidays||[]};}
// V9.5.0: Preserve financial rows and honor local updates/tombstones across cloud merges.
function financialRowFingerprint(row){
 if(row&&row.id!==undefined&&row.id!==null&&String(row.id)!=='')return 'id:'+String(row.id);
 const keys=Object.keys(row||{}).sort();
 return 'row:'+JSON.stringify(keys.map(k=>[k,row[k]]));
}
function mergeFinancialRows(localRows,cloudRows){
 // Cloud-only rows are retained; local rows are authoritative for matching IDs.
 // This is essential for tombstones (active=false), edits, and documents attached
 // to an existing custody transaction. Rows without IDs are merged as a multiset.
 const cloud=Array.isArray(cloudRows)?cloudRows:[];
 const local=Array.isArray(localRows)?localRows:[];
 const keyed=new Map(), order=[];
 const noIdCloud=[], noIdLocal=[];
 const hasId=row=>row&&row.id!==undefined&&row.id!==null&&String(row.id)!=='';
 for(const row of cloud){
   if(hasId(row)){const k=String(row.id);if(!keyed.has(k))order.push(k);keyed.set(k,row);}
   else noIdCloud.push(row);
 }
 for(const row of local){
   if(hasId(row)){const k=String(row.id);if(!keyed.has(k))order.push(k);keyed.set(k,row);}
   else noIdLocal.push(row);
 }
 const out=order.map(k=>keyed.get(k));
 const counts=new Map();
 for(const row of noIdCloud){const k=financialRowFingerprint(row);counts.set(k,(counts.get(k)||0)+1);out.push(row);}
 const appended=new Map();
 for(const row of noIdLocal){
   const k=financialRowFingerprint(row),n=appended.get(k)||0;
   if(n>=(counts.get(k)||0)){out.push(row);appended.set(k,n+1);}
   else appended.set(k,n+1);
 }
 return out;
}
function normalizeCloudCommitmentIds(rows){return ensureFixedCommitmentIds(rows);}
function mergeFixedCommitmentRows(localRows,cloudRows){
 const map=new Map();
 normalizeCloudCommitmentIds(cloudRows).forEach(row=>{
   map.set(String(row.id),{...row,active:row?.active!==false});
 });
 // Local state wins for the same persistent ID. An inactive row is a tombstone.
 ensureFixedCommitmentIds(localRows).forEach(row=>{
   const key=String(row.id),prior=map.get(key);
   map.set(key,{...(prior||{}),...row,active:row?.active!==false});
 });
 return Array.from(map.values());
}
function mergeFinancialState(localState,cloudState){
 const l=localState||{}, c=cloudState||{};
 const result={};
 for(const key of ['transactions','companyCustodies','companyCustodyTransactions','companyCustodyArchive','clientFeeAgreements','clientFeePayments','manualFeeExpenses','payrollSettings','payrollEntries']){
   result[key]=mergeFinancialRows(l[key],c[key]);
 }
 result.fixedCommitments=mergeFixedCommitmentRows(l.fixedCommitments,c.fixedCommitments);
 return result;
}
// V9.4.9: Some earlier releases stored financial arrays inside office_shared_state.data.
// The dedicated office_financial_state record is authoritative when IDs collide, while
// unique legacy rows are recovered non-destructively and then persisted on the next save.
function mergeFinancialSources(legacySharedData,dedicatedFinancialData){
 const legacy=legacySharedData||{}, dedicated=dedicatedFinancialData||{}, result={};
 for(const key of ['transactions','companyCustodies','companyCustodyTransactions','companyCustodyArchive','clientFeeAgreements','clientFeePayments','manualFeeExpenses','payrollSettings','payrollEntries']){
   result[key]=mergeFinancialRows(dedicated[key],legacy[key]);
 }
 // Dedicated tombstones/status win for matching IDs; unique legacy commitments are retained.
 result.fixedCommitments=mergeFixedCommitmentRows(dedicated.fixedCommitments,legacy.fixedCommitments);
 return result;
}
// Atomic state persistence: the database function validates all expected revisions under one transaction.
function stateConflictError(){return new Error('تعارض في تحديث البيانات: جهاز آخر حفظ تغييرات أحدث. لم نستبدل بياناته. أعد تحميل البيانات ثم أعد تنفيذ تعديلك.');}
async function callAtomicStateSave({shared=null,employee=null,financial=null}={}){
 if(financial!==null&&!isAdmin())throw new Error('حفظ السجل المالي متاح للمدير فقط.');
 const result=await sb.rpc('maktaby_save_state_atomic',{
   p_shared_data:shared,
   p_employee_data:employee,
   p_financial_data:financial,
   p_expected_shared_updated_at:cloudStateVersions.office_shared_state,
   p_expected_employee_updated_at:cloudStateVersions.employee_shared_state,
   p_expected_financial_updated_at:cloudStateVersions.office_financial_state
 });
 if(result.error){
   const msg=String(result.error.message||result.error.details||'');
   if(/MAKTABY_CONFLICT|40001|revision conflict/i.test(msg))throw stateConflictError();
   throw new Error('فشل الحفظ الذري في قاعدة البيانات: '+msg);
 }
 const v=result.data||{};
 if(shared!==null&&Object.prototype.hasOwnProperty.call(v,'office_shared_state_updated_at'))cloudStateVersions.office_shared_state=v.office_shared_state_updated_at;
 if(employee!==null&&Object.prototype.hasOwnProperty.call(v,'employee_shared_state_updated_at'))cloudStateVersions.employee_shared_state=v.employee_shared_state_updated_at;
 if(financial!==null&&Object.prototype.hasOwnProperty.call(v,'office_financial_state_updated_at'))cloudStateVersions.office_financial_state=v.office_financial_state_updated_at;
 return v;
}
async function persistFinancialStateAtomic(localState,errorPrefix='تعذر حفظ الحسابات'){
 if(!isAdmin())throw new Error('حفظ السجل المالي متاح للمدير فقط.');
 const current=await sb.from('office_financial_state').select('data,updated_at').eq('id','main').maybeSingle();
 if(current.error)throw new Error(errorPrefix+': تعذرت قراءة النسخة الحالية: '+current.error.message);
 const actual=current.data?.updated_at??null, expected=cloudStateVersions.office_financial_state;
 if(actual!==expected)throw stateConflictError();
 const cloud=current.data?.data||{};
 const merged=mergeFinancialState(localState||db,cloud);
 const payload={...cloud,...merged};
 await callAtomicStateSave({financial:payload});
 Object.assign(db,merged);
 localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
 return merged;
}
async function saveCloudState({persistLocal=true}={}){
 if(!canManageOffice())throw new Error('ليس لديك صلاحية تعديل بيانات المكتب');
 // Only the admin may read/merge/write the financial state. Office managers
 // save shared + employee state without sending a financial payload to the RPC.
 let merged=null, financialPayload=null;
 if(isAdmin()){
   const current=await sb.from('office_financial_state').select('data,updated_at').eq('id','main').maybeSingle();
   if(current.error)throw new Error('تعذر قراءة الحسابات السحابية قبل الحفظ؛ أوقفنا الحفظ لحماية البيانات: '+current.error.message);
   if((current.data?.updated_at??null)!==cloudStateVersions.office_financial_state)throw stateConflictError();
   const cloudFinancial=current.data?.data||{};
   merged=mergeFinancialState(db,cloudFinancial);
   financialPayload={...cloudFinancial,...merged};
 }
 await callAtomicStateSave({shared:sharedPayload(),employee:employeePayload(),financial:financialPayload});
 if(merged)Object.assign(db,merged);
 // save() already persisted the exact local snapshot before the network request.
 // Avoid a second synchronous full-database stringify/write on the common save path.
 if(persistLocal)localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
}
async function saveOperationalStateV10(){
 if(!canManageOffice())throw new Error('مزامنة المهام والجلسات متاحة للإدارة فقط.');
 // Tasks and case/session changes do not need to read or rewrite the financial ledger.
 // Keep the same atomic RPC and revision guards, but send only operational state.
 localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
 await callAtomicStateSave({shared:sharedPayload(),employee:employeePayload()});
}
function mapCloudExpense(x){return {date:x.expense_date,client:x.client_name||'',clientId:x.client_id||null,caseId:x.case_id||null,feeFileId:x.fee_file_id||null,kind:'منصرف',category:x.expense_type,title:x.description,amount:x.amount,employee:x.employee_name||'',employeeId:x.employee_id,enteredBy:x.employee_name||'',notes:x.description,approvalStatus:x.approval_status||'approved',reviewNote:x.review_note||'',cloudId:x.id};}

// V9.4.5: merge local enumeration migration rows with cloud rows.
function enumerationLegacyKey(x) {
  return ['accused','caseNumber','enrollmentNumber','court','prosecution','lastSessionDate','lastQuestionDate','victim']
    .map(k => String(x?.[k] ?? '').trim().replace(/\s+/g, ' ')).join('|');
}
function ensureEnumerationIds(rows) {
  return (Array.isArray(rows) ? rows : []).map(row => ({
    ...row,
    _maktabyId: row?._maktabyId || ('enum-' + encodeURIComponent(enumerationLegacyKey(row)).slice(0, 180))
  }));
}
function mergeEnumerationRows(cloudRows, localRows) {
  // Stable identity prevents an edited record from being re-imported as a second row.
  const rows = ensureEnumerationIds(cloudRows);
  const byId = new Map(rows.map((row, index) => [row._maktabyId, index]));
  ensureEnumerationIds(localRows).forEach(row => {
    const index = byId.get(row._maktabyId);
    if (index === undefined) { byId.set(row._maktabyId, rows.length); rows.push(row); }
    else rows[index] = row;
  });
  return rows;
}

async function loadCloudState(){
 // V9.5.1 FIX2: a session editor is an active editing surface even though it is
 // inline (not inside #modal). Gate both the start and completion of every fetch.
 const modalIsOpen=()=>!!document.querySelector('#modal.show');
 const sessionEditorIsActive=()=>{const el=document.activeElement;return !!(page==='cases'&&el&&el.matches&&el.matches('#app .session-view input, #app .session-view textarea, #app .session-view select'));};
 const editingIsActive=()=>modalIsOpen()||sessionEditorIsActive()||!!window.__maktabySessionWriteInProgress;
 if(editingIsActive()){window.__maktabyCloudRefreshPending=true;return;}
 const stateTable=currentUser.role==='employee'?'employee_shared_state':'office_shared_state';
 const {data:shared,error}=await sb.from(stateTable).select('data,updated_at').eq('id','main').maybeSingle();
 if(error)throw error;
 const loadedSharedVersion=shared?.updated_at??null;
 const loadedOfficeSharedVersion=stateTable==='office_shared_state'?loadedSharedVersion:cloudStateVersions.office_shared_state;
 const loadedEmployeeSharedVersion=stateTable==='employee_shared_state'?loadedSharedVersion:cloudStateVersions.employee_shared_state;
 let financial=null, expenses=[], walletTransactions=[], clientDocuments=[], employees=null, approvalRequests=null, initializeCloudState=false;
 if(!shared){
   if(canManageOffice()){
     initializeCloudState=!modalIsOpen()&&confirm('لا توجد بيانات سابقة على السحابة. هل تريد رفع بيانات نسخة V3 الموجودة على هذا الجهاز لأول مرة؟');
   }else{throw new Error('لم يرفع المدير بيانات المكتب بعد.');}
 }
 // Fetch independent cloud resources concurrently. The old sequence waited for
 // each Supabase round-trip before starting the next one, making every refresh
 // feel like a chain of loading pauses. No writes or merge rules are changed.
 let q=sb.from('expenses').select('id,expense_date,client_name,client_id,case_id,fee_file_id,expense_type,description,amount,employee_name,employee_id,approval_status,review_note').order('expense_date',{ascending:false});
 if(currentUser.role==='employee')q=q.eq('employee_id',currentUser.id);
 let wq=sb.from('wallet_transactions').select('employee_id,entry_type,amount').order('created_at',{ascending:false});
 if(currentUser.role==='employee')wq=wq.eq('employee_id',currentUser.id);
 const requests=[
   q,
   wq,
   sb.from('client_documents').select('id,client_name,category,file_name,storage_path,mime_type,size_bytes,is_profile_photo,uploaded_by,created_at').order('created_at',{ascending:false})
 ];
 const indexes={expenses:0,wallet:1,documents:2};
 if(canManageOffice()){
   indexes.profiles=requests.length;
   requests.push(sb.from('profiles').select('id,full_name,username,role,active').eq('active',true));
   indexes.approvals=requests.length;
   requests.push(sb.from('approval_requests').select('id,requested_by,requested_by_name,request_type,payload,status,created_at,reviewed_by,reviewed_by_name,reviewed_at,review_note').order('created_at',{ascending:false}));
   indexes.employeeVersion=requests.length;
   requests.push(sb.from('employee_shared_state').select('updated_at').eq('id','main').maybeSingle());
   if(isAdmin()){
     indexes.financial=requests.length;
     requests.push(sb.from('office_financial_state').select('data,updated_at').eq('id','main').maybeSingle());
   }
 }
 const results=await Promise.all(requests);
 const labels=['expenses','wallet transactions','client documents','profiles','approval requests','employee state version','financial state'];
 results.forEach((r,i)=>{if(r.error)throw new Error('تعذر تحميل '+(labels[i]||'بيانات السحابة')+': '+r.error.message);});
 expenses=results[indexes.expenses].data||[];
 walletTransactions=results[indexes.wallet].data||[];
 clientDocuments=results[indexes.documents].data||[];
 if(canManageOffice()){
   employees=(results[indexes.profiles].data||[]).map(p=>({id:p.id,username:p.username||'',name:p.full_name||'',role:p.role}));
   approvalRequests=results[indexes.approvals].data||[];
   var loadedEmployeeVersion=results[indexes.employeeVersion].data?.updated_at??null;
   if(isAdmin()){
     const financialRow=results[indexes.financial].data;
     financial=financialRow?.data&&typeof financialRow.data==='object'?financialRow.data:null;
     var loadedFinancialVersion=financialRow?.updated_at??null;
   }
 }
 // Critical second check: the form may have opened while Supabase was responding.
 // In that case discard this refresh result; never replace live form state.
 if(editingIsActive()){window.__maktabyCloudRefreshPending=true;return;}
 // Commit revision tokens only after the fetched payload is accepted. A discarded
 // refresh must never advance the token and authorize stale local data to overwrite it.
 cloudStateVersions.office_shared_state=loadedOfficeSharedVersion;
 cloudStateVersions.employee_shared_state=canManageOffice()?loadedEmployeeVersion:loadedEmployeeSharedVersion;
 if(isAdmin())cloudStateVersions.office_financial_state=loadedFinancialVersion;
 if(initializeCloudState)await saveCloudState();
 if(shared){
   const d=shared.data||{};
   if((!Array.isArray(d.taskArchive)&&(db.taskArchive||[]).length)||(!Array.isArray(d.achievements)&&(db.achievements||[]).length))__maktabyTaskArchiveMigrationPending=true;
   db.clients=d.clients||[];db.clients.forEach(c=>{c.fees=c.fees||''});
   db.cases=(d.cases||[]).map((c,i)=>({...c,caseId:c.caseId||c.id||('legacy-case-'+encodeURIComponent([c.client||'',c.number||'',c.court||'',c.date||''].join('|')).slice(0,140)),result:c.result||c.decision||'',history:Array.isArray(c.history)?c.history:[]}));db.announcements=d.announcements||[];db.tasks=Array.isArray(d.tasks)?d.tasks:[];db.tasks.forEach(ensureTaskIdentityV10);
   db.taskArchive=Array.isArray(d.taskArchive)?d.taskArchive:(db.taskArchive||[]);db.achievements=Array.isArray(d.achievements)?d.achievements:(db.achievements||[]);db.announcementArchive=d.announcementArchive||[];db.caseArchive=d.caseArchive||[];db.clientArchive=d.clientArchive||[];db.poaArchive=d.poaArchive||[];db.clientTimeline=Array.isArray(d.clientTimeline)?d.clientTimeline:(db.clientTimeline||[]);
   const cloudEnumerationCount=Array.isArray(d.enumerations)?d.enumerations.length:0;
   db.appealRules=Array.isArray(d.appealRules)?d.appealRules:(db.appealRules||[]);db.appealCalculations=Array.isArray(d.appealCalculations)?d.appealCalculations:(db.appealCalculations||[]);db.legalHolidays=Array.isArray(d.legalHolidays)?d.legalHolidays:(db.legalHolidays||[]);db.enumerations=mergeEnumerationRows(d.enumerations,db.enumerations);db.powerOfAttorneys=d.powerOfAttorneys||db.powerOfAttorneys||[];
   // Publish recovered local rows without replacing other shared office data.
   if(canManageOffice() && db.enumerations.length>cloudEnumerationCount){
     try {
       const repairedData={...d,enumerations:db.enumerations};
       await callAtomicStateSave({shared:repairedData});
     } catch(repairError) { console.error('Enumeration cloud repair failed:',repairError); }
   }
 }
 if(isAdmin()){
   // Recover financial arrays written by pre-split releases from office_shared_state.data.
   // The dedicated financial record takes precedence for matching IDs; unique legacy rows survive.
   const legacyFinancial=(shared&&shared.data&&typeof shared.data==='object')?shared.data:{};
   const financialSources=mergeFinancialSources(legacyFinancial,financial||{});
   // Never let an empty/missing cloud array erase locally available financial records.
   const mergedFinancial=mergeFinancialState(db,financialSources);
   Object.assign(db,mergedFinancial);
   if(financial?.clientFees){const fm=new Map(financial.clientFees.map(x=>[x.name,x.fees]));db.clients.forEach(c=>{if(!c.fees&&fm.has(c.name))c.fees=fm.get(c.name);});}
 }else{db.transactions=[];}
 db.cloudExpenses=expenses.map(mapCloudExpense);db.walletTransactions=walletTransactions;db.clientDocuments=clientDocuments;
 if(canManageOffice()){
   db.employees=employees||[];db.approvalRequests=approvalRequests||[];
   knownPendingApprovalIds=new Set(db.approvalRequests.filter(x=>x.status==='pending').map(x=>x.id));
 }else{db.employees=db.employees||[];db.approvalRequests=[];}
 const overdueTasksChanged=syncOverdueSessionDecisionTasksV10();
 localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
 if((overdueTasksChanged||__maktabyTaskArchiveMigrationPending)&&canManageOffice()){
   try{await saveOperationalStateV10();__maktabyTaskArchiveMigrationPending=false;setCloudStatus(overdueTasksChanged?'تم إنشاء مهام الجلسات المنتهية ومزامنتها':'تمت مزامنة أرشيف المهام والإنجازات');}
   catch(syncErr){setCloudStatus('بيانات المهام محفوظة محليًا — المزامنة معلقة');console.warn('[MAKTABY overdue session tasks/archive migration]',syncErr);}
 }
 render();
}
// Performance hardening: collapse overlapping full refreshes into one in-flight
// Supabase read. Financial balances and approval state are never served from TTL cache.
let __maktabyCloudRefreshInFlight=null;
const __maktabyLoadCloudStateOriginal=loadCloudState;
loadCloudState=async function(){
 if(__maktabyCloudRefreshInFlight)return __maktabyCloudRefreshInFlight;
 const task=Promise.resolve().then(()=>__maktabyLoadCloudStateOriginal());
 __maktabyCloudRefreshInFlight=task;
 try{return await task;}finally{if(__maktabyCloudRefreshInFlight===task)__maktabyCloudRefreshInFlight=null;}
};

async function refreshCloud(){try{await loadCloudState();}catch(e){console.error('refresh',e);}}

function exportBackup(){if(!isAdmin()){alert('النسخة الاحتياطية متاحة للمدير فقط.');return;}const blob=new Blob([JSON.stringify(db,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='MAKTABY_LAW_OFFICE_V9_BACKUP_'+today()+'.json';a.click();URL.revokeObjectURL(a.href)}
function importOfficeData(ev){
 if(!isAdmin()){alert('استيراد البيانات متاح للمدير فقط.');return;}
 const f=ev.target.files&&ev.target.files[0];if(!f)return;
 if(f.size>20*1024*1024){alert('حجم الملف أكبر من الحد المسموح (20 ميجابايت).');ev.target.value='';return;}
 if(!/\.json$/i.test(f.name)){alert('الاستيراد الحالي يقبل ملفات JSON الاحتياطية فقط، وليس ملفات Excel مباشرة.');ev.target.value='';return;}
 const rd=new FileReader();rd.onload=async()=>{
  const previous=JSON.parse(JSON.stringify(db));
  try{
   const d=JSON.parse(String(rd.result||''));
   if(!d||typeof d!=='object'||Array.isArray(d))throw new Error('بنية الملف غير صحيحة.');
   for(const k of ['clients','cases','announcements'])if(!Array.isArray(d[k]))throw new Error('الملف غير مكتمل: قائمة '+k+' غير موجودة أو ليست قائمة بيانات.');
   for(const k of ['clients','cases','announcements'])if(d[k].some(x=>!x||typeof x!=='object'||Array.isArray(x)))throw new Error('توجد سجلات غير صالحة داخل '+k+'.');
   const restored={...d,clients:d.clients,cases:d.cases,announcements:d.announcements,transactions:Array.isArray(d.transactions)?d.transactions:[],tasks:Array.isArray(d.tasks)?d.tasks:[],employees:Array.isArray(d.employees)?d.employees:[],announcementArchive:Array.isArray(d.announcementArchive)?d.announcementArchive:[],caseArchive:Array.isArray(d.caseArchive)?d.caseArchive:[],clientArchive:Array.isArray(d.clientArchive)?d.clientArchive:[],enumerations:Array.isArray(d.enumerations)?d.enumerations:[],achievements:Array.isArray(d.achievements)?d.achievements:[]};
   restored.cases.forEach(c=>{c.history=Array.isArray(c.history)?c.history:[];c.archived=!!c.archived;});
   db=restored;await saveCloudState();localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
   alert('تم التحقق من الملف واستيراده ومزامنته بنجاح: '+db.clients.length+' موكل، '+db.cases.length+' قضية/جلسة، '+db.announcements.length+' إعلان.');render();
  }catch(err){db=previous;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('لم يكتمل الاستيراد، وتمت إعادة بيانات هذه الجلسة إلى حالتها السابقة. السبب: '+(err.message||err));}
  ev.target.value='';
 };rd.onerror=()=>{alert('تعذرت قراءة الملف.');ev.target.value='';};rd.readAsText(f,'utf-8');
}
function esc(s=''){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function ensureTaskIdentityV10(task){if(!task||typeof task!=='object')return '';const id=String(task._id||task.id||'').trim();if(id){task._id=id;return id;}const generated='task-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12));task._id=generated;return generated;}
function taskStatusIsCompletedV10(status){return ['تم التنفيذ','منتهي','منفذ','completed','done'].includes(String(status||'').trim().toLocaleLowerCase('ar'));}
function isPendingDecisionSessionV10(c){return !!(c&&!c.archived&&String(c.date||'').slice(0,10)<today()&&!String(c.result||'').trim()&&!c.decisionReceivedAt);}
function syncOverdueSessionDecisionTasksV10(){
 let changed=false;if(!Array.isArray(db.tasks))db.tasks=[];if(!Array.isArray(db.taskArchive))db.taskArchive=[];
 (db.cases||[]).forEach(c=>{
  if(!isPendingDecisionSessionV10(c))return;
  const caseId=String(c.caseId||c.id||'');if(!caseId)return;
  const sourceKey='session-decision:'+caseId+':'+String(c.date||'');
  const archived=db.taskArchive.some(t=>t&&t.sourceKey===sourceKey);if(archived)return;
  let task=db.tasks.find(t=>t&&t.sourceKey===sourceKey);
  const details={_id:task?._id||('task-session-decision-'+caseId+'-'+String(c.date||'').replace(/[^0-9]/g,'')),sourceKey,source:'جلسات مطلوب قرارها',sourceCaseId:caseId,client:c.client||'',clients:Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client].filter(Boolean),court:c.court||'',caseNumber:c.number||'',subject:c.subject||'',circuit:c.circuit||'',venue:c.venue||'',roll:c.roll||'',caseType:c.caseType||'',sessionDate:String(c.date||''),task:'الحصول على قرار الجلسة وتحديث موعد الجلسة القادمة',kind:'قرار',date:today(),assignee:c.assignee||'الإداري',priority:'عاجلة',status:'مطلوب'};
  if(task){const before=JSON.stringify([task.client,task.court,task.caseNumber,task.subject,task.circuit,task.venue,task.roll,task.sessionDate,task.task]);Object.assign(task,details);if(before!==JSON.stringify([task.client,task.court,task.caseNumber,task.subject,task.circuit,task.venue,task.roll,task.sessionDate,task.task]))changed=true;}
  else{db.tasks.push({...details,history:[],createdAt:new Date().toISOString()});changed=true;}
 });
 return changed;
}
function tasks(){let generated=[];db.cases.filter(c=>!c.archived).forEach(c=>{if(!c.date||!c.court)return;if(c.date===plus(1)&&(/العبور/.test(c.court)||/إنذار|انذار|إعلان|اعلان/.test(c.action||'')))generated.push({date:c.date,court:c.court,client:c.client,task:'استلام الإنذارات / الإعلانات',status:'مطلوب',source:'جلسة الغد',assignee:'الإداري'});});db.announcements.filter(a=>!a.archived&&!a.delivered&&!a.receivedDate&&a.status!=='تم الاستلام').forEach(a=>generated.push({date:a.deliveryDate||a.session||today(),court:a.court,client:a.client,task:'متابعة واستلام الإعلان رقم '+(a.number||'—'),status:(a.deliveryDate||a.session)&&((a.deliveryDate||a.session)<today())?'متأخر':'مطلوب',source:'الإعلانات',assignee:'الإداري'}));return [...db.tasks,...generated].sort((a,b)=>String(a.court||'').localeCompare(String(b.court||''),'ar')||String(a.date||'').localeCompare(String(b.date||'')))}
async function submitApprovalRequest(requestType,payload){try{const {data:{user}}=await sb.auth.getUser();if(!user?.id)throw new Error('انتهت جلسة الدخول؛ سجل الدخول مرة أخرى.');const row={requested_by:user.id,requested_by_name:currentUser.name,request_type:requestType,payload,status:'pending'};const {error}=await sb.from('approval_requests').insert(row);if(error)throw error;alert('تم إرسال الطلب للمدير/مديرة المكتب لاعتماده قبل تعديل السجل.');return true;}catch(e){alert('تعذر إرسال طلب الاعتماد: '+e.message);return false;}}
async function reviewApproval(id,approve){if(!canReview())return;const req=(db.approvalRequests||[]).find(x=>x.id===id);if(!req||req.status!=='pending')return;const note=prompt(approve?'ملاحظة الاعتماد (اختياري)':'سبب الرفض (اختياري)','');if(note===null)return;try{if(approve){const p=req.payload||{};if(req.request_type==='session_create'){const rec={...(p.record||{}),caseId:p.record?.caseId||p.record?.id||('case-'+(globalThis.crypto?.randomUUID?.()||Date.now())),history:Array.isArray(p.record?.history)?p.record.history:[],archived:false,result:p.record?.result||p.record?.decision||''};if(!rec.client||!rec.number||!rec.court||!rec.date)throw new Error('بيانات الجلسة غير مكتملة.');db.cases.push(rec);syncSessionRequiredTaskV10(rec);}else if(req.request_type==='session_record_update'){const updated=p.updated||{};let idx=-1;if(p.caseId||p.original?.caseId||p.original?.id){const key=String(p.caseId||p.original?.caseId||p.original?.id);idx=db.cases.findIndex(x=>String(x.caseId||x.id||'')===key);}if(idx<0&&p.original){idx=db.cases.findIndex(x=>String(x.number||'')===String(p.original.number||'')&&String(x.client||'')===String(p.original.client||'')&&String(x.date||'')===String(p.original.date||'')&&String(x.court||'')===String(p.original.court||''));}if(idx<0)throw new Error('لم نعثر على القضية الأصلية بصورة آمنة؛ لم يتم تطبيق التعديل.');const c=db.cases[idx];db.cases[idx]={...c,...updated,caseId:c.caseId||c.id||p.caseId||('case-'+Date.now()),result:updated.result??updated.decision??c.result??'',history:Array.isArray(c.history)?c.history:[]};syncSessionRequiredTaskV10(db.cases[idx]);}else if(req.request_type==='announcement_create'){const rec={...(p.record||{}),delivered:false,archived:false,receivedDate:'',receivedBy:'',status:'قيد الإعلان'};if(!rec.client||!rec.court)throw new Error('بيانات الإعلان غير مكتملة.');db.announcements.push(rec);}else if(req.request_type==='session_update'){let c=(p.caseId?db.cases.find(x=>String(x.caseId||x.id||'')===String(p.caseId)):null)||db.cases.find(x=>String(x.number||'')===String(p.caseNumber||'')&&String(x.client||'')===String(p.client||'')&&String(x.date||'')===String(p.currentDate||''));if(!c)throw new Error('القضية غير موجودة أو تغير تاريخها قبل الاعتماد.');c.history=Array.isArray(c.history)?c.history:[];if(isPendingDecisionSessionV10(c)&&p.decision&&!p.nextDate)throw new Error('بعد تسجيل قرار الجلسة المنتهية، حدد تاريخ الجلسة القادمة؛ وللحكم النهائي استخدم الأرشفة.');if(p.nextDate){if(p.nextDate<=c.date)throw new Error('تاريخ الجلسة الجديدة يجب أن يكون بعد الحالية.');if(isPendingDecisionSessionV10(c)&&!String(p.decision||'').trim())throw new Error('يجب تسجيل قرار الجلسة المنتهية قبل ترحيلها.');const oldDate=c.date;c.history.push({date:oldDate,roll:String(c.roll||'').trim(),subject:c.subject||'',circuit:c.circuit||'',venue:c.venue||'',decision:p.decision||c.result||'',reason:p.reason||c.adjournment||'',savedAt:today()});c.previousSession=oldDate;c.date=p.nextDate;c.roll='';c.lastDecisionDate=today();c.decisionReceivedAt=new Date().toISOString();c.lastSessionDecision=p.decision||c.result||'';c.result='';}else if(p.decision){c.result=p.decision;c.decisionReceivedAt=new Date().toISOString();}if(p.decision)completeSessionDecisionTaskV10({...c,previousSession:p.nextDate?p.currentDate:c.date},p.decision);if(p.reason)c.adjournment=p.reason;if(!p.nextDate&&p.roll!==undefined)c.roll=String(p.roll||'').trim();}else if(req.request_type==='announcement_received'){const a=db.announcements.find(x=>String(x.number||'')===String(p.number||'')&&String(x.client||'')===String(p.client||''));if(!a)throw new Error('الإعلان غير موجود.');const i=db.announcements.indexOf(a);a.receivedDate=p.receivedDate||today();a.receivedBy=p.receivedBy||req.requested_by_name||'';a.delivered=true;a.archived=true;a.status='تم الاستلام';db.announcementArchive.push({...a,archiveDate:today()});db.announcements.splice(i,1);}else if(req.request_type==='announcement_update'){const a=db.announcements.find(x=>String(x.number||'')===String(p.original?.number||'')&&String(x.client||'')===String(p.original?.client||'')&&String(x.court||'')===String(p.original?.court||''));if(!a)throw new Error('الإعلان المطلوب تعديله لم يعد موجودًا.');Object.assign(a,p.updated||{});if(a.receivedDate){const i=db.announcements.indexOf(a);a.delivered=true;a.archived=true;a.status='تم الاستلام';db.announcementArchive.push({...a,archiveDate:today()});db.announcements.splice(i,1);}}else if(req.request_type==='task_create'){const created={...(p.updated||{}),priority:p.updated?.priority||'عادية',history:Array.isArray(p.updated?.history)?p.updated.history:[]};recordTaskHistoryV106(created,'إنشاء معتمد',{task:created.task,assignee:created.assignee,date:created.date,priority:created.priority,status:created.status},req.requested_by_name||'الموظف');db.tasks.push(created);if(taskStatusIsCompletedV10(created.status)){created.status='تم التنفيذ';created.completionDate=created.completionDate||today();created.completionNote=String(created.completionNote||created.notes||'').trim();created.completedBy=created.completedBy||created.assignee||req.requested_by_name||'غير محدد';archiveCompletedTaskV109(created,db.tasks.length-1,currentUser?.name||'الإدارة');}}else if(req.request_type==='task_update'){const key=p.original?._id;const matchTask=x=>(key&&String(x?._id||'')===String(key))||(!key&&x?.task===p.original?.task&&x?.date===p.original?.date&&x?.assignee===p.original?.assignee);const idx=db.tasks.findIndex(matchTask);if(idx<0){const alreadyArchived=(db.taskArchive||[]).find(matchTask);if(!(p.completionRequest&&alreadyArchived&&taskStatusIsCompletedV10(alreadyArchived.status)))throw new Error('المهمة المطلوب تعديلها لم تعد موجودة.');}else{const before={...db.tasks[idx]};const updated={...db.tasks[idx],...(p.updated||{})};recordTaskHistoryV106(updated,p.completionRequest?'طلب إنهاء معتمد':'تعديل معتمد',taskChangeSummaryV106(before,updated),req.requested_by_name||'الموظف');
 if(p.completionRequest||taskStatusIsCompletedV10(updated.status)){updated.status='تم التنفيذ';updated.approvedCompletionAt=new Date().toISOString();updated.approvedCompletionBy=currentUser?.name||'الإدارة';archiveCompletedTaskV109(updated,idx,currentUser?.name||'الإدارة');
 }else db.tasks[idx]=updated;}}else if(req.request_type==='enumeration_create'){db.enumerations.push(p.record||{});}if(['task_create','task_update','session_create','session_record_update','session_update'].includes(req.request_type))await saveOperationalStateV10();else await saveCloudState();}const {error}=await sb.from('approval_requests').update({status:approve?'approved':'rejected',reviewed_by:currentUser.id,reviewed_by_name:currentUser.name,reviewed_at:new Date().toISOString(),review_note:note}).eq('id',id).eq('status','pending');if(error)throw error;await loadCloudState();alert(approve?'تم اعتماد الطلب وتحديث السجل.':'تم رفض الطلب.');}catch(e){alert('تعذر إتمام الاعتماد: '+e.message)}}
async function saveSessionUpdate(i){
 const c=db.cases[i];if(!c)return false;
 // Capture every value before changing focus or touching the DOM.
 const nextDate=String(document.getElementById('next_'+i)?.value||'').trim();
 const reason=String(document.getElementById('reason_'+i)?.value||'').trim();
 const decision=String(document.getElementById('decision_'+i)?.value||'').trim();
 const roll=String(document.getElementById('roll_'+i)?.value||'').trim();
 const sourceId=String(document.getElementById('voice_action_'+i)?.value||'').trim();
 if(sourceId && Array.isArray(c.history) && c.history.some(h=>String(h?.sourceId||'')===sourceId))return true;
 if(!reason&&!nextDate&&!decision&&roll===String(c.roll||'').trim()){alert('اكتب رقم الرول أو قرار الجلسة أو سبب التأجيل أو تاريخ الجلسة الجديدة على الأقل.');return false;}
 if(nextDate&&nextDate<=String(c.date||'')){alert('تاريخ الجلسة الجديدة يجب أن يكون بعد تاريخ الجلسة الحالية.');return false;}
 if(isPendingDecisionSessionV10(c)&&nextDate&&!decision){alert('الجلسة انتهى تاريخها؛ اكتب القرار أولاً ثم حدد تاريخ الجلسة الجديدة حتى لا نفقد القرار.');return false;}
 if(isPendingDecisionSessionV10(c)&&decision&&!nextDate){alert('تم تسجيل قرار الجلسة؟ حدد تاريخ الجلسة القادمة حتى تعود القضية إلى ترتيب الجلسات. إذا كان الحكم نهائيًا استخدم «ترحيل إلى الأرشيف».');return false;}
 if(window.__maktabySessionWriteInProgress)return false;
 const caseKey=String(c.caseId||c.id||'');
 window.__maktabySessionWriteInProgress=true;
 try{
   if(isEmployee()){
     await submitApprovalRequest('session_update',{caseId:caseKey,caseNumber:c.number,client:c.client,currentDate:c.date,nextDate,reason,decision,roll});
     return false;
   }
   if(!canManageOffice())return false;
   // Re-resolve by stable identity immediately before mutation; index may have shifted.
   const target=caseKey?db.cases.find(x=>String(x.caseId||x.id||'')===caseKey):c;
   if(!target)throw new Error('لم نعثر على القضية المحددة؛ لم يتم تعديل أي سجل.');
   target.history=Array.isArray(target.history)?target.history:[];
   const oldDate=String(target.date||'');
   if(nextDate){
     target.history.push({date:oldDate,roll:String(target.roll||'').trim(),subject:target.subject||'',circuit:target.circuit||'',venue:target.venue||'',decision:decision||target.result||'',reason:reason||target.adjournment||'',savedAt:today(),...(sourceId?{sourceId}: {})});
     target.previousSession=oldDate;target.date=nextDate;target.roll='';target.lastDecisionDate=today();target.decisionReceivedAt=new Date().toISOString();target.result='';
   }else if(decision){target.result=decision;target.decisionReceivedAt=new Date().toISOString();}
   if(decision&&nextDate)target.lastSessionDecision=decision;
   if(reason)target.adjournment=reason;
   if(!nextDate)target.roll=roll;
   if(decision)completeSessionDecisionTaskV10({...target,previousSession:nextDate?oldDate:target.date},decision);
   target.caseId=target.caseId||target.id||('case-'+(globalThis.crypto?.randomUUID?.()||Date.now()));
   // Do not call save(): it renders immediately and used to destroy the inline editor
   // as soon as the save button took focus. Persist first, then render once.
   localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
   await saveOperationalStateV10();
   setCloudStatus('تم حفظ الجلسة ومزامنتها');
   alert(nextDate?'تم حفظ القرار وسبب التأجيل وترحيل الجلسة إلى التاريخ الجديد.':'تم حفظ القرار وسبب التأجيل بنجاح.');
   return true;
 }catch(err){
   console.error('[MAKTABY session save]',err);
   alert('تعذر تأكيد مزامنة بيانات الجلسة: '+(err?.message||err)+'\nتم الاحتفاظ بالتعديل محليًا إن أمكن. لا تكرر الإدخال قبل مراجعة حالة الاتصال.');
   return false;
 }finally{
   window.__maktabySessionWriteInProgress=false;
   window.__maktabyRenderPending=false;
   render();
   if(window.__maktabyCloudRefreshPending){window.__maktabyCloudRefreshPending=false;setTimeout(()=>{if(typeof refreshCloud==='function')refreshCloud();else loadCloudState().catch(e=>console.warn('[MAKTABY session post-save refresh]',e));},1200);}
 }
}

const fields={income:[['date','التاريخ','date',1],['category','بند الوارد','select',['أتعاب','إيراد آخر']],['client','الموكل','client'],['enrollmentNumber','رقم الحصر (إن وجد)','text'],['title','البيان','text',1],['amount','المبلغ','number',1],['notes','ملاحظات','text']],transaction:[['date','التاريخ','date',1],['kind','نوع الحركة','select',['وارد','منصرف']],['category','بند الحركة','select',['أتعاب','انتقالات','تصوير','رسوم محكمة','رسوم إعلان','خبير','تنفيذ','مصروفات أخرى','إيراد آخر']],['client','الموكل','client'],['title','البيان','text',1],['amount','المبلغ','number',1],['employee','الموظف','employee'],['notes','ملاحظات','text']],expense:[['date','التاريخ','date',1],['client','الموكل / نوع المصروف','expenseClient',1],['category','بند المصروف','select',['انتقالات','تصوير','رسوم محكمة','رسوم إعلان','خبير','تنفيذ','مصروفات أخرى']],['title','تفاصيل المصروف','text',1],['amount','المبلغ','number',1],['notes','ملاحظات','text']],client:[['name','اسم الموكل','text',1],['nationalId','الرقم القومي','text'],['phone','رقم الهاتف','text'],['phone2','رقم هاتف إضافي','text'],['powerOfAttorneyNo','رقم التوكيل','text'],['subject','موضوع الموكل / تفاصيل الموضوع','text'],['notes','ملاحظات','text']],case:[['clients','الموكلون (يمكن اختيار أكثر من موكل)','caseClients',1],['branch','الفرع','branch'],['number','رقم الدعوى','text',1],['caseType','نوع القضية','caseType',1],['subject','موضوع الدعوى','text'],['court','المحكمة','text',1],['circuit','الدائرة','text'],['venue','مكان انعقاد الجلسة','text'],['date','تاريخ الجلسة','date',1],['roll','رقم الرول','text'],['action','المطلوب','text'],['result','قرار / منطوق الجلسة','textarea'],['adjournment','سبب التأجيل','text'],['opponents','الخصوم (يمكن إضافة أكثر من خصم)','caseOpponents'],['clientRole','صفة الموكل في القضية','select',['','مدعٍ','مدعى عليه','مستأنف','مستأنف ضده','طالب','معلن إليه','متهم','مجني عليه','شاكٍ','مستشكل','مستشكل ضده','أخرى']]],enumeration:[['accused','اسم المتهم','text',1],['caseNumber','رقم القضية','text',1],['enrollmentNumber','رقم الحصر','text',1],['court','المحكمة','text',1],['prosecution','اسم النيابة','text',1],['lastSessionDate','تاريخ آخر جلسة','date'],['lastQuestionDate','تاريخ آخر سؤال','date'],['victim','اسم المجني عليه','text',1]],announcement:[['client','اسم الموكل','client',1],['branch','الفرع','branch'],['number','رقم الإعلان','text'],['court','المحكمة','text',1],['bailiff','المحضرين','text'],['deliveryDate','تاريخ التسليم للمحضرين','date'],['receivedDate','تاريخ الاستلام الفعلي','date'],['receivedBy','من الذي استلم الإعلان','text'],['session','تاريخ الجلسة','date'],['kind','نوع الإعلان','select',['','إنذار','إعلان دعوى','إعادة إعلان','أخرى']]],task:[['client','اسم الموكل','taskClient'],['branch','الفرع','branch'],['court','المحكمة','text'],['kind','تصنيف المهمة','select',['إعلان','قرار','إنهاء','أخرى']],['task','المهمة / المطلوب','text',1],['date','تاريخ الاستحقاق','date',1],['assignee','المسؤول','text'],['status','الحالة','select',['مطلوب','جارٍ التنفيذ','تم التنفيذ','منتهي']],['priority','الأولوية','select',['عادية','متوسطة','عاجلة']],['completionDate','تاريخ الإنهاء','date'],['completionNote','ما تم إنجازه / بيان الإنهاء','text'],['notes','ملاحظات','text']]};
function inputField(f){let [k,label,type,req]=f;let el='';if(type==='caseType')el=`<select name="${k}" required><option value="">اختر نوع القضية</option>${['مدني','أسرة','جنح','عمال','قضاء إداري','تجاري'].map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;else if(type==='expenseClient'){el=`<input name="client" type="text" list="maktabyExpenseClientListV10" required maxlength="200" autocomplete="off" placeholder="اكتب اسم الموكل أو اختر من القائمة"><datalist id="maktabyExpenseClientListV10">${(db.clients||[]).filter(c=>c&&String(c.name||'').trim()).map(c=>`<option value="${esc(String(c.name).trim())}"></option>`).join('')}<option value="مصروفات عامة"></option></datalist><small class="muted">اكتب للبحث بسرعة، لكن يجب أن يطابق الاسم عميلًا مسجلًا بالضبط، أو اختر «مصروفات عامة».</small>`;}else if(type==='taskClient')el=`<input name="${k}" type="text" list="maktabyTaskClientListV1091" maxlength="200" autocomplete="off" spellcheck="true" placeholder="اكتب اسم الموكل أو اختر اسمًا مسجلًا"><datalist id="maktabyTaskClientListV1091">${(db.clients||[]).filter(c=>c&&String(c.name||'').trim()).map(c=>`<option value="${esc(String(c.name).trim())}"></option>`).join('')}</datalist><small class="muted">يمكنك كتابة أي اسم مباشرة، أو اختيار موكل من الأسماء المقترحة. لا يشترط وجود الاسم في الفهرس.</small>`;else if(type==='employee')el=`<select name="${k}"><option value="">اختر الموظف</option>${db.employees.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select>`;else if(type==='branch')el=`<select name="${k}"><option value="">اختر الفرع</option>${(db.branches||[]).map(b=>`<option>${esc(b)}</option>`).join('')}</select>`;else if(type==='client')el=`<select name="${k}" ${req?'required':''}><option value="">اختر الموكل</option>${db.clients.map(c=>`<option>${esc(c.name)}</option>`).join('')}</select>`;else if(type==='caseClients')el=`<datalist id="maktabyCaseClientListV11">${(db.clients||[]).filter(c=>c&&String(c.name||'').trim()).map(c=>`<option value="${esc(String(c.name).trim())}"></option>`).join('')}</datalist><div class="case-party-list" id="caseClientRows"><div class="case-party-row"><input name="clients[]" type="text" list="maktabyCaseClientListV11" required maxlength="200" autocomplete="off" placeholder="اكتب اسم الموكل وستظهر الأسماء المطابقة"></div></div><button type="button" class="btn light" onclick="addCasePartyRowV104('client')">＋ إضافة موكل آخر</button><small class="muted">اكتب أول حرف أو جزءًا من الاسم واختر الموكل من الاقتراحات. يمكن إضافة أكثر من موكل.</small>`;else if(type==='caseOpponents')el=`<div class="case-party-list" id="caseOpponentRows"><div class="case-party-row"><input name="opponents[]" type="text" maxlength="200" placeholder="اسم الخصم الأول" autocomplete="off"></div></div><button type="button" class="btn light" onclick="addCasePartyRowV104('opponent')">＋ إضافة خصم آخر</button><small class="muted">يمكن إضافة أكثر من خصم في القضية الواحدة.</small>`;else if(type==='select')el=`<select name="${k}" ${req===1?'required':''}>${req.map(v=>`<option>${esc(v)}</option>`).join('')}</select>`;else if(type==='textarea')el=`<textarea name="${k}" rows="3" autocomplete="off" spellcheck="true" placeholder="اكتب القرار أو منطوق الجلسة هنا"></textarea>`;else el=`<input name="${k}" type="${type}" ${req===1?'required':''} autocomplete="off" spellcheck="false">`;return `<div class="field"><label>${label}</label>${el}</div>`}
function manageBranchesV67(){if(!canManageOffice()){alert('إضافة أسماء الفروع متاحة للمدير فقط.');return;}const name=prompt('اكتب اسم الفرع الجديد:');if(name===null)return;const v=name.trim();if(!v)return;db.branches=db.branches||[];if(db.branches.some(x=>x.toLocaleLowerCase('ar')===v.toLocaleLowerCase('ar'))){alert('اسم الفرع موجود بالفعل.');return;}db.branches.push(v);save().then?.(()=>{});render();alert('تمت إضافة الفرع.');}
function openForm(t){if(t==='income')window.editingIncomeIndexV951=null;const staffAllowed=isLimitedStaff()&&['case','announcement','task','enumeration'].includes(t);if(['client','case','announcement','task','enumeration'].includes(t)&&!canManageOffice()&&!staffAllowed){alert('هذه العملية غير متاحة لهذا الحساب.');return;}if(t==='income'&&!canManageOffice()){alert('تسجيل الوارد متاح للمدير فقط.');return;}formType=t;editingCaseIndex=null;editingEnumerationIndex=null;editingTaskIndex=null;editingAnnouncementIndex=null;let fs=fields[t];$('#modalTitle').textContent={client:'إضافة موكل',case:'إضافة قضية / جلسة',announcement:'تسجيل إعلان',task:'إضافة مهمة إدارية',enumeration:'إضافة رقم حصر',transaction:'إضافة حركة مالية',income:'تسجيل وارد'}[t];$('#formFields').innerHTML=fs.map(inputField).join('');$('#modal').classList.add('show')}
function addTaskForCourtV8(court){window.taskCourtPresetV8=court||'';openForm('task');const el=document.querySelector('#formFields [name="court"]');if(el)el.value=window.taskCourtPresetV8;const title=document.querySelector('#formFields [name="task"]');if(title)title.focus();}
function fillFormValues(x){
 const clients=Array.isArray(x?.clients)&&x.clients.length?x.clients:[x?.client].filter(Boolean);
 const opponents=Array.isArray(x?.opponents)&&x.opponents.length?x.opponents:[x?.opponent].filter(Boolean);
 if(formType==='case'){
  const cr=$('#caseClientRows'),or=$('#caseOpponentRows');
  if(cr){cr.innerHTML='';(clients.length?clients:['']).forEach((v,i)=>addCasePartyRowV104('client',v,i===0));}
  if(or){or.innerHTML='';(opponents.length?opponents:['']).forEach((v,i)=>addCasePartyRowV104('opponent',v,i===0));}
 }
 Object.entries(x||{}).forEach(([k,v])=>{if(['clients','opponents'].includes(k))return;const el=$(`#formFields [name="${k}"]`);if(el){if(k==='caseType'&&v&&!Array.from(el.options||[]).some(o=>o.value===String(v))){const legacy=document.createElement('option');legacy.value=String(v);legacy.textContent='قيمة قديمة: '+String(v);el.appendChild(legacy);}el.value=v??'';}});
}
window.addCasePartyRowV104=function(kind,value='',required=false){
 const isClient=kind==='client',root=document.getElementById(isClient?'caseClientRows':'caseOpponentRows');if(!root)return;
 const row=document.createElement('div');row.className='case-party-row';
 if(isClient){const input=document.createElement('input');input.name='clients[]';input.type='text';input.setAttribute('list','maktabyCaseClientListV11');input.required=!!required;input.maxLength=200;input.autocomplete='off';input.placeholder='اكتب اسم الموكل للبحث والاختيار';input.value=value||'';row.append(input);}
 else{const input=document.createElement('input');input.name='opponents[]';input.type='text';input.maxLength=200;input.autocomplete='off';input.placeholder='اسم الخصم';input.value=value||'';row.append(input);}
 const remove=document.createElement('button');remove.type='button';remove.className='btn light';remove.textContent='−';remove.title='إزالة الطرف';remove.setAttribute('aria-label','إزالة الطرف');remove.addEventListener('click',()=>{if(root.children.length>1)row.remove();else{const field=row.querySelector('select,input');if(field)field.value='';}});row.append(remove);root.append(row);
};

window.transferMisdemeanorToEnumerationV110=async function(i){
 if(!canManageOffice())return alert('ترحيل القضايا إلى أرقام الحصر متاح للإدارة فقط.');
 const c=db.cases[i];if(!c||c.archived)return;
 const clients=Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client].filter(Boolean);
 const victim=clients[0]||'';const judgment=String(document.getElementById('decision_'+i)?.value||c.result||'').trim();
 if(String(c.caseType||'').trim()!=='جنح')return alert('هذا المسار مخصص لقضايا الجنح فقط.');
 if(String(c.clientRole||'').trim()!=='مجني عليه')return alert('يجب أن تكون صفة الموكل في القضية «مجني عليه».');
 if(!/حبس/.test(judgment))return alert('لا يظهر في منطوق الحكم لفظ «حبس». احفظ منطوق الحكم أولًا ثم أعد المحاولة.');
 const accused=(Array.isArray(c.opponents)&&c.opponents.length?c.opponents:[c.opponent].filter(Boolean)).join('، ');
 const enrollmentNumber=prompt('رقم الحصر المطلوب تسجيله:','');if(enrollmentNumber===null)return;if(!enrollmentNumber.trim())return alert('رقم الحصر مطلوب.');
 const prosecution=prompt('اسم النيابة:', '');if(prosecution===null)return;if(!prosecution.trim())return alert('اسم النيابة مطلوب.');
 const norm=v=>String(v||'').trim().replace(/\s+/g,'').toLocaleLowerCase('ar');
 if((db.enumerations||[]).some(x=>norm(x.enrollmentNumber)===norm(enrollmentNumber)&&norm(x.court)===norm(c.court)))return alert('رقم الحصر مسجل بالفعل للمحكمة نفسها. لم يتم الترحيل.');
 if(!confirm('تأكيد ترحيل القضية إلى أرقام الحصر؟\nسيتم إنشاء سجل حصر جديد وحذف القضية من الجلسات المفتوحة مع الاحتفاظ ببيانات الحكم والقضية داخل سجل الحصر.'))return;
 const rec={accused,caseNumber:c.number||'',enrollmentNumber:enrollmentNumber.trim(),court:c.court||'',prosecution:prosecution.trim(),lastSessionDate:c.judgmentSessionDate||c.date||today(),lastQuestionDate:'',victim,sourceCaseId:c.caseId||c.id||'',caseType:'جنح',clientRole:'مجني عليه',judgmentText:judgment,judgmentDate:today(),transferredAt:new Date().toISOString(),transferredBy:currentUser?.name||''};
 const oldIndex=db.cases.indexOf(c);db.enumerations=db.enumerations||[];db.enumerations.push(rec);db.cases.splice(oldIndex,1);
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));await saveCloudState({persistLocal:false});setCloudStatus('تم ترحيل القضية ومزامنتها');render();alert('تم ترحيل القضية إلى أرقام الحصر بنجاح.');}catch(e){db.enumerations=db.enumerations.filter(x=>x!==rec);db.cases.splice(oldIndex,0,c);try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(_){}alert('تعذر تأكيد حفظ الترحيل: '+(e.message||e)+'\nتمت استعادة القضية محليًا. أعد تحميل البيانات قبل إعادة المحاولة لتجنب التكرار.');}
};
function editCaseV67(i){if(!canManageOffice()&&!isLimitedStaff())return;const x=db.cases[i];if(!x)return;openForm('case');editingCaseIndex=i;fillFormValues(x);}
window.deleteEnumerationV10=async function(i){if(!canManageOffice())return;const x=db.enumerations[i];if(!x)return;if(!confirm('تأكيد حذف رقم الحصر '+(x.enrollmentNumber||'')+' للمتهم '+(x.accused||'')+'؟ لا يمكن التراجع عن الحذف.'))return;const snapshot=db.enumerations[i];db.enumerations.splice(i,1);try{await save();const {error:auditError}=await sb.from('office_audit_logs').insert({actor_id:currentUser?.id,actor_name:currentUser?.name||'مدير المكتب',action:'حذف',entity_type:'رقم حصر',entity_label:String(snapshot.enrollmentNumber||snapshot.caseNumber||snapshot.accused||'سجل رقم حصر'),details:{accused:snapshot.accused||'',caseNumber:snapshot.caseNumber||'',enrollmentNumber:snapshot.enrollmentNumber||'',court:snapshot.court||''}});if(auditError)throw new Error('تم حفظ الحذف، لكن تعذر تسجيله في سجل النشاط: '+auditError.message);alert('تم حذف سجل رقم الحصر وتسجيل العملية في سجل النشاط.');}catch(e){db.enumerations.splice(i,0,snapshot);try{await save();}catch(rollbackError){console.error('Enumeration delete rollback failed',rollbackError);}alert('لم يكتمل الحذف بأمان: '+(e.message||e));}};
function editEnumeration(i){if(!canManageOffice())return;const x=db.enumerations[i];if(!x)return;openForm('enumeration');editingEnumerationIndex=i;fillFormValues(x);}
function recordTaskHistoryV106(task,action,changes={},actor=currentUser?.name||'غير محدد'){
 if(!task)return;task.history=Array.isArray(task.history)?task.history:[];
 task.history.push({at:new Date().toISOString(),date:today(),actor,action,changes:JSON.parse(JSON.stringify(changes||{}))});
 if(task.history.length>100)task.history=task.history.slice(-100);
}
function taskChangeSummaryV106(before,after){const keys=['task','assignee','date','priority','status','completionNote','notes','client','court'];const out={};keys.forEach(k=>{if(String(before?.[k]??'')!==String(after?.[k]??''))out[k]={from:before?.[k]??'',to:after?.[k]??''};});return out;}

function archiveCompletedTaskV109(task,sourceIndex,actor=currentUser?.name||'الإدارة'){
 const api=window.MAKTABY_TASK_ARCHIVE_109;
 if(!api||typeof api.archiveCompletedTask!=='function')throw new Error('وحدة أرشفة المهام غير جاهزة.');
 return api.archiveCompletedTask(task,sourceIndex,{db,today,ensureTaskIdentity:ensureTaskIdentityV10,recordTaskHistory:recordTaskHistoryV106,isCompleted:taskStatusIsCompletedV10,actor});
}

function editTask(i){if(!canManageOffice()&&!isLimitedStaff())return;const x=db.tasks[i];if(!x)return;openForm('task');editingTaskIndex=i;fillFormValues(x);}
async function completeAdminTaskV745(i){
 if(!canManageOffice())return;
 const x=db.tasks[i];if(!x)return;
 const defaultName=currentUser?.name||'الإدارة';
 const employee=prompt('من الموظف الذي أنجز هذه المهمة؟\nاكتب الاسم كما تريد ظهوره في تقرير الإنجازات:',x.completedBy||x.assignee||defaultName);
 if(employee===null)return;
 if(!employee.trim()){alert('يجب تحديد اسم الموظف الذي أنجز المهمة.');return;}
 const note=prompt('اكتب ما تم إنجازه في هذه المهمة:',x.completionNote||x.notes||'');
 if(note===null)return;
 const before={...x};x.status='تم التنفيذ';x.completionDate=today();x.completionNote=note.trim();x.completedBy=employee.trim();
 recordTaskHistoryV106(x,'إنهاء واعتماد مباشر',taskChangeSummaryV106(before,x),defaultName);
 archiveCompletedTaskV109(x,i,defaultName);
 localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();
 try{await saveOperationalStateV10();setCloudStatus('تم إنهاء المهمة وأرشفتها ومزامنتها');alert('تم إنهاء المهمة وأرشفتها وتسجيل الإنجاز باسم '+employee.trim()+'.');}
 catch(e){setCloudStatus('تم الحفظ محليًا — المزامنة معلقة');alert('تم نقل المهمة للأرشيف محليًا، لكن لم يتأكد حفظها على السحابة: '+(e.message||e)+'\nلا تكرر إنهاء المهمة. أعد المزامنة بعد استقرار الاتصال.');}
}

function editAnnouncement(i){if(!canManageOffice()&&!isLimitedStaff())return;const x=db.announcements[i];if(!x)return;openForm('announcement');editingAnnouncementIndex=i;fillFormValues(x);}
function closeModal(){
 $('#modal').classList.remove('show');
 // Apply one deferred cloud refresh only after the form has been closed/saved.
 if(window.__maktabyCloudRefreshPending){window.__maktabyCloudRefreshPending=false;setTimeout(()=>refreshCloud(),250);}
}
function editClient(i){if(!canManageOffice()){alert('ليس لديك صلاحية تعديل بيانات الموكل.');return;}const c=db.clients[i];if(!c)return;const oldName=c.name;const name=prompt('اسم الموكل',c.name||'');if(name===null)return;const phone=prompt('رقم الهاتف',c.phone||'');if(phone===null)return;const phone2=prompt('رقم هاتف إضافي',c.phone2||'');if(phone2===null)return;c.name=name.trim();c.phone=phone.trim();c.phone2=phone2.trim();db.cases.forEach(x=>{if(x.client===oldName)x.client=c.name});db.transactions.forEach(x=>{if(x.client===oldName)x.client=c.name});save()}
function archiveAnnouncement(i){const a=db.announcements[i];if(!a)return;a.delivered=true;a.status='تم الاستلام';a.receivedDate=a.receivedDate||today();a.receivedBy=a.receivedBy||currentUser?.name||'';a.archived=true;db.announcementArchive.push({...a,archiveDate:today()});db.announcements.splice(i,1);save()}
function updateAnnouncement(i,key,value){const a=db.announcements[i];if(!a)return;a[key]=value;if(key==='receivedDate'&&value){archiveAnnouncement(i);return;}if(key==='status'&&value==='تم الاستلام'){a.receivedDate=a.receivedDate||today();archiveAnnouncement(i);return;}save()}
function markAnnouncementReceived(i){if(!confirm('تأكيد أن الإعلان تم استلامه فعليًا؟'))return;archiveAnnouncement(i)}
function requestAnnouncementReceived(i){const a=db.announcements[i];if(!a)return;if(!confirm('إرسال طلب إثبات استلام هذا الإعلان للمدير/مديرة المكتب؟'))return;submitApprovalRequest('announcement_received',{client:a.client,number:a.number,receivedDate:today(),receivedBy:currentUser?.name||''})}
window.requestTaskCompletionV104=async function(i){if(!isLimitedStaff())return alert('هذا الإجراء متاح للموظف صاحب الصلاحية.');const task=db.tasks[i];if(!task)return;const note=prompt('اكتب ما تم إنجازه لإرساله للإدارة للمراجعة:',task.completionNote||'');if(note===null)return;if(!note.trim())return alert('بيان الإنجاز مطلوب.');const original={...task,_id:ensureTaskIdentityV10(task)};const ok=await submitApprovalRequest('task_update',{original,updated:{...original,status:'تم التنفيذ',completionDate:today(),completionNote:note.trim(),completedBy:currentUser?.name||''},completionRequest:true});if(ok){setCloudStatus('تم إرسال طلب إنهاء المهمة — بانتظار اعتماد الإدارة');}};
function archiveCase(i){const c=db.cases[i];if(!c)return;const judgmentDate=prompt('اكتب تاريخ جلسة الحكم (YYYY-MM-DD):',c.judgmentSessionDate||c.date||today());if(judgmentDate===null)return;const normalizedDate=String(judgmentDate).trim();const dateParts=normalizedDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);const dateCheck=dateParts?new Date(Date.UTC(Number(dateParts[1]),Number(dateParts[2])-1,Number(dateParts[3]))):null;if(!dateParts||dateCheck.getUTCFullYear()!==Number(dateParts[1])||dateCheck.getUTCMonth()!==Number(dateParts[2])-1||dateCheck.getUTCDate()!==Number(dateParts[3])){alert('من فضلك اكتب تاريخ جلسة الحكم صحيحًا بالصيغة YYYY-MM-DD.');return;}const judgmentText=prompt('اكتب منطوق الحكم بالتفصيل:',c.judgmentText||'');if(judgmentText===null)return;if(!String(judgmentText).trim()){alert('لا يمكن إنهاء الجلسة وأرشفتها دون تسجيل منطوق الحكم.');return;}if(!confirm('تأكيد إنهاء الجلسة ونقلها إلى الأرشيف؟\nسيتم حفظ جلسة الحكم ومنطوق الحكم مع بيانات القضية، ويمكن استرجاعها لاحقًا.'))return;c.judgmentSessionDate=normalizedDate;c.judgmentText=String(judgmentText).trim();c.archived=true;c.archiveDate=today();c.archivedBy=currentUser?.name||'مدير المكتب';db.caseArchive.push({...c});db.cases.splice(i,1);save();alert('تم إنهاء الجلسة وأرشفتها مع حفظ جلسة الحكم ومنطوق الحكم.');}
function restoreItem(type,i){if(type==='task'){const x=(db.taskArchive||[]).splice(i,1)[0];if(x){delete x.archivedAt;delete x.completionDate;delete x.completionNote;delete x.completedBy;delete x.approvedCompletionAt;delete x.approvedCompletionBy;x.status='مطلوب';db.tasks.push(x);}}else if(type==='announcement'){const a=db.announcementArchive.splice(i,1)[0];if(a){a.archived=false;a.delivered=false;a.status='قيد الإعلان';a.receivedDate='';delete a.archiveDate;db.announcements.push(a)}}else{const c=db.caseArchive.splice(i,1)[0];if(c){c.archived=false;delete c.archiveDate;db.cases.push(c)}}save()}
function viewHistory(i){const c=db.cases[i];if(!c)return;alert('سجل الجلسات للقضية '+(c.number||'')+'\n'+(c.history||[]).map(h=>`${h.date||'—'} | الرول: ${h.roll||'—'} | القرار: ${h.decision||'—'} | سبب التأجيل: ${h.reason||'—'}`).join('\n')+'\nالقرار الحالي: '+(c.result||'—')+'\nالجلسة الحالية: '+c.date)}
function completeSessionDecisionTaskV10(caseRow,decision){
 const caseId=String(caseRow?.caseId||caseRow?.id||'');if(!caseId)return false;
 const oldDate=String(caseRow.previousSession||caseRow.date||'');
 const task=(db.tasks||[]).find(t=>t&&t.source==='جلسات مطلوب قرارها'&&String(t.sourceCaseId||'')===caseId&&(!oldDate||String(t.sessionDate||'')===oldDate));
 if(!task)return false;
 task.status='تم التنفيذ';task.completionDate=today();task.completionNote=String(decision||'تم تحصيل قرار الجلسة وتحديث بياناتها').trim();task.completedBy=currentUser?.name||'الإدارة';
 recordTaskHistoryV106(task,'تحصيل قرار الجلسة',{decision:task.completionNote,nextSession:caseRow.date||''},currentUser?.name||'الإدارة');
 return archiveCompletedTaskV109(task,db.tasks.indexOf(task),currentUser?.name||'الإدارة');
}
function syncSessionRequiredTaskV10(caseRow){
 if(!caseRow)return;
 const text=String(caseRow.action||'').trim();
 if(!text)return; // Clearing the field never deletes an existing task.
 const caseId=String(caseRow.caseId||caseRow.id||'');
 if(!caseId)return;
 if(!Array.isArray(db.tasks))db.tasks=[];
 const sourceKey='session-required:'+caseId;
 const existing=db.tasks.find(t=>t&&t.sourceKey===sourceKey);
 const task={...(existing||{}),_id:existing?._id||('task-session-'+caseId),sourceKey,source:'الجلسات',sourceCaseId:caseId,client:caseRow.client||'',clients:Array.isArray(caseRow.clients)&&caseRow.clients.length?caseRow.clients:[caseRow.client].filter(Boolean),court:caseRow.court||'',caseNumber:caseRow.number||'',task:text,date:caseRow.date||today(),assignee:caseRow.assignee||currentUser?.name||'',status:existing?.status||'مطلوب',createdAt:existing?.createdAt||new Date().toISOString()};
 if(existing)Object.assign(existing,task);else db.tasks.push(task);
}
$('#form').onsubmit=e=>{e.preventDefault();let obj=Object.fromEntries(new FormData(e.target).entries());if(formType==='case'){const selectedClientInputs=[...e.target.querySelectorAll('[name="clients[]"]')];const selectedClients=selectedClientInputs.map(el=>String(el.value||'').trim()).filter(Boolean);const normalizeClientPick=v=>String(v||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');const unknownClient=selectedClients.find(n=>!(db.clients||[]).some(c=>normalizeClientPick(c.name)===normalizeClientPick(n)));if(unknownClient){alert('اسم الموكل «'+unknownClient+'» غير موجود في ملفات العملاء. اختر الاسم من الاقتراحات أو أضف الموكل أولاً من صفحة العملاء.');const bad=selectedClientInputs.find(el=>normalizeClientPick(el.value)===normalizeClientPick(unknownClient));bad?.focus();return;}const selectedOpponents=[...e.target.querySelectorAll('[name="opponents[]"]')].map(el=>String(el.value||'').trim()).filter(Boolean);obj.clients=[...new Set(selectedClients)];obj.client=obj.clients[0]||'';obj.opponents=[...new Set(selectedOpponents)];obj.opponent=obj.opponents[0]||'';}const limited=isLimitedStaff();if(formType==='announcement'){obj.delivered=!!obj.receivedDate;obj.archived=!!obj.receivedDate;obj.status=obj.receivedDate?'تم الاستلام':'قيد الإعلان';}if(formType==='case'){const existingCase=Number.isInteger(editingCaseIndex)?db.cases[editingCaseIndex]:null;obj.caseId=existingCase?(existingCase.caseId||existingCase.id||('case-'+(globalThis.crypto?.randomUUID?.()||Date.now()))):(obj.caseId||('case-'+(globalThis.crypto?.randomUUID?.()||Date.now())));obj.result=obj.result||'';obj.history=Array.isArray(obj.history)?obj.history:(Array.isArray(existingCase?.history)?existingCase.history:[]);if(!obj.clients?.length&&existingCase?.client)obj.clients=Array.isArray(existingCase.clients)&&existingCase.clients.length?existingCase.clients:[existingCase.client];obj.archived=false;}if(formType==='expense'){(async()=>{try{const selected=String(obj.client||'').trim();const normClientName=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');const officeGeneral=normClientName(selected)==='مصروفات عامة';const chosenClient=!officeGeneral?(db.clients||[]).find(c=>c&&normClientName(c.name)===normClientName(selected)):null;if(!officeGeneral&&!chosenClient)throw new Error('الاسم غير مسجل في العملاء. اكتب اسمًا مطابقًا لعميل موجود أو اختر «مصروفات عامة».');const {data:{user}}=await sb.auth.getUser();if(!user?.id)throw new Error('انتهت جلسة الدخول؛ سجل الدخول مرة أخرى.');const payload={client_name:officeGeneral?'مصروفات عامة':String(chosenClient.name).trim(),expense_type:obj.category,description:obj.title+(obj.notes?' | '+obj.notes:''),amount:Number(obj.amount),expense_date:obj.date||today(),employee_id:user.id,employee_name:currentUser.name,approval_status:'pending'};if(!Number.isFinite(payload.amount)||payload.amount<=0)throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر.');const {error}=await sb.from('expenses').insert(payload);if(error)throw error;closeModal();await loadCloudState();alert('تم تسجيل المصروف على السحابة بنجاح.');}catch(err){alert('تعذر تسجيل المصروف: '+err.message);}})();return;}if(formType==='income'){if(!canManageOffice()){alert('تسجيل الوارد متاح للمدير أو مديرة المكتب فقط.');return;}obj.kind='وارد';obj.enteredBy=currentUser?.name||'';const normNo=v=>String(v||'').trim().replace(/\s+/g,'').toLocaleLowerCase('ar');const n=normNo(obj.enrollmentNumber);if(n&&db.transactions.some((x,i)=>i!==window.editingIncomeIndexV951&&x.kind==='وارد'&&!x.voidedAt&&normNo(x.enrollmentNumber)===n)){alert('رقم الحصر مسجل بالفعل في الوارد. راجع السجل الموجود بدل إنشاء حركة مكررة.');return;}if(Number.isInteger(window.editingIncomeIndexV951)&&db.transactions[window.editingIncomeIndexV951]){db.transactions[window.editingIncomeIndexV951]={...db.transactions[window.editingIncomeIndexV951],...obj};window.editingIncomeIndexV951=null;}else db.transactions.push({...obj,id:obj.id||('income-'+(globalThis.crypto?.randomUUID?.()||Date.now()))});closeModal();save();return;}if(formType==='transaction'){if(!canManageOffice()){alert('إدارة الحركات المالية متاحة للمدير أو مديرة المكتب فقط.');return;}obj.enteredBy=currentUser?.name||'';}if(formType==='task'&&canManageOffice()&&taskStatusIsCompletedV10(obj.status)){obj.status='تم التنفيذ';obj.completionDate=obj.completionDate||today();obj.completionNote=obj.completionNote||obj.notes||'';obj.completedBy=obj.completedBy||obj.assignee||currentUser?.name||'غير محدد';}if(limited&&formType==='task'){const original=editingTaskIndex!==null?{...db.tasks[editingTaskIndex]}:null;obj._id=original?original._id||('task-'+editingTaskIndex+'-'+String(original.date||'')):('task-'+Date.now()+'-'+Math.random().toString(36).slice(2,7));if(original&&taskStatusIsCompletedV10(obj.status)){obj.status='تم التنفيذ';obj.completionDate=obj.completionDate||today();obj.completionNote=String(obj.completionNote||obj.notes||'').trim();obj.completedBy=currentUser?.name||'';if(!obj.completionNote){alert('اكتب بيان ما تم إنجازه قبل إرسال طلب الإنهاء.');return;}submitApprovalRequest('task_update',{original,updated:obj,completionRequest:true});closeModal();return;}if(original)obj.status=original.status||'مطلوب';submitApprovalRequest(original?'task_update':'task_create',{original,updated:obj});closeModal();return;}if(limited&&formType==='enumeration'){submitApprovalRequest('enumeration_create',{record:obj});closeModal();return;}if(limited&&formType==='announcement'){const original=editingAnnouncementIndex!==null?{...db.announcements[editingAnnouncementIndex]}:null;if(original)submitApprovalRequest('announcement_update',{original,updated:obj});else{obj.delivered=false;obj.archived=false;obj.receivedDate='';obj.receivedBy='';obj.status='بانتظار الاعتماد';submitApprovalRequest('announcement_create',{record:obj});}closeModal();return;}if(limited&&formType==='case'){if(editingCaseIndex!==null){submitApprovalRequest('session_record_update',{caseId:db.cases[editingCaseIndex].caseId||db.cases[editingCaseIndex].id||'',original:{...db.cases[editingCaseIndex]},updated:{...obj,caseId:db.cases[editingCaseIndex].caseId||db.cases[editingCaseIndex].id||('case-'+(globalThis.crypto?.randomUUID?.()||Date.now()))}});}else{obj.history=[];obj.archived=false;submitApprovalRequest('session_create',{record:obj});}closeModal();return;}if(formType==='case'&&editingCaseIndex!==null){const old=db.cases[editingCaseIndex];const history=Array.isArray(old.history)?old.history.slice():[];if(old.date&&obj.date&&old.date!==obj.date){history.push({date:old.date,roll:String(old.roll||'').trim(),subject:old.subject||'',circuit:old.circuit||'',venue:old.venue||'',decision:old.result||'تعديل بيانات الجلسة',reason:'تم تعديل تاريخ الجلسة من شاشة تعديل البيانات',savedAt:today()});if(obj.date!==old.date)obj.roll='';}db.cases[editingCaseIndex]={...old,...obj,history};editingCaseIndex=null;}else if(formType==='announcement'&&obj.receivedDate){db.announcementArchive.push({...obj,archiveDate:today()});}else if(formType==='enumeration'&&editingEnumerationIndex!==null){const oldEnumeration=db.enumerations[editingEnumerationIndex];db.enumerations[editingEnumerationIndex]={...oldEnumeration,...obj,_maktabyId:oldEnumeration._maktabyId||('enum-'+encodeURIComponent(enumerationLegacyKey(oldEnumeration)).slice(0,180)),_lastEditedAt:new Date().toISOString(),_lastEditedBy:currentUser?.name||''};editingEnumerationIndex=null;}else if(formType==='task'&&editingTaskIndex!==null){const taskIndex=editingTaskIndex,oldTask=db.tasks[taskIndex];const updatedTask={...oldTask,...obj,_id:ensureTaskIdentityV10(oldTask)};recordTaskHistoryV106(updatedTask,'تعديل',taskChangeSummaryV106(oldTask,updatedTask));if(taskStatusIsCompletedV10(updatedTask.status)){updatedTask.status='تم التنفيذ';updatedTask.completionDate=updatedTask.completionDate||today();updatedTask.completionNote=updatedTask.completionNote||updatedTask.notes||'';updatedTask.completedBy=updatedTask.completedBy||updatedTask.assignee||currentUser?.name||'غير محدد';archiveCompletedTaskV109(updatedTask,taskIndex,currentUser?.name||'الإدارة');}else db.tasks[taskIndex]=updatedTask;editingTaskIndex=null;}else if(formType==='announcement'&&editingAnnouncementIndex!==null){db.announcements[editingAnnouncementIndex]={...db.announcements[editingAnnouncementIndex],...obj};editingAnnouncementIndex=null;}else{if(formType==='task'){obj._id=ensureTaskIdentityV10(obj);obj.priority=obj.priority||'عادية';obj.history=Array.isArray(obj.history)?obj.history:[];recordTaskHistoryV106(obj,'إنشاء',{task:obj.task,assignee:obj.assignee,date:obj.date,priority:obj.priority,status:obj.status});}db[{client:'clients',case:'cases',announcement:'announcements',task:'tasks',enumeration:'enumerations',transaction:'transactions'}[formType]].push(obj);if(formType==='task'&&taskStatusIsCompletedV10(obj.status)){obj.status='تم التنفيذ';obj.completionDate=obj.completionDate||today();obj.completionNote=obj.completionNote||obj.notes||'';obj.completedBy=obj.completedBy||obj.assignee||currentUser?.name||'غير محدد';archiveCompletedTaskV109(obj,db.tasks.length-1,currentUser?.name||'الإدارة');}}if(formType==='case'){const savedCase=editingCaseIndex===null?db.cases.find(c=>String(c.caseId||'')===String(obj.caseId||'')):null;syncSessionRequiredTaskV10(savedCase||db.cases.find(c=>String(c.caseId||c.id||'')===String(obj.caseId||''))||obj);}const operationalForm=['task','case'].includes(formType);closeModal();if(operationalForm){saveOperationalStateV10().then(()=>setCloudStatus('تم حفظ البيانات التشغيلية ومزامنتها')).catch(err=>{setCloudStatus('تم الحفظ محليًا — المزامنة معلقة');alert('تم حفظ التعديل محليًا، لكن تعذرت مزامنته: '+(err.message||err)+'\nلا تكرر الإدخال؛ أعد المزامنة بعد استقرار الاتصال.');});}else save()};
window.openSessionDocumentsV104=function(i){
 const c=db.cases[i];if(!c)return;if(!canManageOffice())return alert('إنشاء وحفظ المحررات القانونية متاح للمدير أو مديرة المكتب فقط.');
 const types=['إعادة إعلان','إعلان بالحكم','طلب شهادة بعدم حدوث استئناف','إعلان دعوى','إنذار'];
 const choice=prompt('اختر نوع المحرر بكتابة الرقم:\n'+types.map((x,n)=>(n+1)+'- '+x).join('\n'),'1');if(choice===null)return;const n=Number(choice);if(!Number.isInteger(n)||n<1||n>types.length)return alert('اختيار غير صحيح.');
 const kind=types[n-1],clients=(Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client]).filter(Boolean).join('، '),opponents=(Array.isArray(c.opponents)&&c.opponents.length?c.opponents:[c.opponent]).filter(Boolean).join('، ');
 let body=`إنه في يوم ........ الموافق .. / .. / ....
بناءً على طلب السيد/ ${clients||'................'}
ومحله المختار مكتب الأستاذ/ هاني شحاتة المحامي.
أنا ........ محضر محكمة ........ قد انتقلت وأعلنت: ${opponents||'................'}

وذلك بشأن الدعوى رقم ${c.number||'........'} لسنة ........ أمام ${c.court||'........'}، والمحدد لنظرها جلسة ${c.date||'........'}.

${kind==='طلب شهادة بعدم حدوث استئناف'?'لذلك نلتمس استخراج شهادة تفيد ما إذا كان قد تم استئناف الحكم من عدمه، وذلك عن الحكم الصادر في الدعوى المشار إليها.':'وأعلنته بالآتي: '+(kind==='إعلان بالحكم'?'بمنطوق الحكم الصادر في الدعوى المشار إليها، مع التنبيه بما يترتب على ذلك قانونًا.':kind==='إعادة إعلان'?'إعادة إعلانه بصحيفة الدعوى/الإجراء السابق وفقًا للقانون.':'بمضمون الإعلان الموضح أعلاه.')}

ولأجل العلم،،،`;
 const edited=prompt('راجع النص وعدّله قبل الحفظ والطباعة:',body);if(edited===null)return;if(!edited.trim())return alert('لا يمكن حفظ محرر فارغ.');
 c.sessionDocuments=Array.isArray(c.sessionDocuments)?c.sessionDocuments:[];const doc={id:'session-doc-'+(globalThis.crypto?.randomUUID?.()||Date.now()),kind,body:edited,createdAt:new Date().toISOString(),createdBy:currentUser?.name||''};c.sessionDocuments.push(doc);save();
 // Same-page hidden print frame: avoids popup blockers and keeps the case screen open.
 const previous=document.getElementById('maktabySessionDocPrintFrame');if(previous)previous.remove();
 const frame=document.createElement('iframe');frame.id='maktabySessionDocPrintFrame';frame.title='معاينة وطباعة المحرر';frame.setAttribute('aria-hidden','true');frame.style.cssText='position:fixed;left:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';document.body.appendChild(frame);
 const printDoc=frame.contentDocument||frame.contentWindow.document;printDoc.open();printDoc.write('<!doctype html><html lang=\"ar\" dir=\"rtl\"><head><meta charset=\"utf-8\"><title>'+esc(kind)+' — مكتبي للمحاماة</title><style>@page{size:A4;margin:18mm}body{font-family:Tahoma,Arial;line-height:2.1;margin:0;color:#111}header{text-align:center;border-bottom:2px solid #b38a43;padding:0 0 12px;margin-bottom:22px}header h2{margin:0;color:#17324f}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:16px/2 Tahoma,Arial;margin:0}</style></head><body><header><h2>مكتبي للمحاماة</h2><div>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</div></header><pre>'+esc(edited)+'</pre></body></html>');printDoc.close();
 let printed=false;const printNow=()=>{if(printed||!frame.isConnected)return;printed=true;try{frame.contentWindow.focus();frame.contentWindow.print();}catch(err){alert('تم حفظ المحرر، لكن تعذرت الطباعة: '+(err.message||err));}};frame.onload=()=>setTimeout(printNow,120);setTimeout(printNow,500);frame.contentWindow?.addEventListener?.('afterprint',()=>setTimeout(()=>frame.remove(),800),{once:true});
};
function table(headers,rows){const rowHtml=typeof rows==='string'?rows:(Array.isArray(rows)?rows.join(''):'');return `<div style="overflow:auto"><table><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rowHtml||`<tr><td colspan="${headers.length}" class="empty">لا توجد بيانات مسجلة بعد</td></tr>`}</tbody></table></div>`}
let archiveSearchQuery='';
function archiveSearchNorm(v){return String(v??'').toLocaleLowerCase('ar').replace(/[\u064B-\u065F\u0670]/g,'').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').trim();}
function archiveFilterRows(list){const q=archiveSearchNorm(archiveSearchQuery);return (list||[]).map((item,index)=>({item,index})).filter(({item})=>!q||archiveSearchNorm(Object.values(item||{}).flatMap(v=>Array.isArray(v)?v.map(z=>typeof z==='object'?JSON.stringify(z):z):[typeof v==='object'&&v!==null?JSON.stringify(v):v]).join(' ')).includes(q));}
function archiveApplySearch(){const el=document.getElementById('archiveSearchInput');archiveSearchQuery=el?el.value:'';render();}
window.selectCaseCompactV10=function(i){window.caseCompactSelectedIndex=Number(i);render();};
window.setCaseCompactTabV10=function(tab,button){const host=button?.closest('.v109-detail');if(!host)return;host.querySelectorAll('.v109-tabs button').forEach(b=>b.classList.toggle('active',b===button));};
function render(){if(document.querySelector('#modal.show'))return;let t=tasks();let pending=t.filter(x=>!taskStatusIsCompletedV10(x.status));let counts=[db.clients.length,db.cases.length,db.announcements.filter(a=>!a.delivered&&!a.archived).length,pending.length];let html='';if(page==='dashboard'){const upcoming=db.cases.filter(c=>!c.archived&&c.date>=today()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,4);const recent=[...pending.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5)];const fmt=n=>Number(n||0).toLocaleString('en-US');const day=new Date().toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'});const shortcuts=[['العملاء','clients','👥'],['العملاء المحتملين','crm','🔎'],['القضايا والجلسات','cases','⚖️'],['المصروفات','accounts','🪙'],['الرواتب والبونص','employees','🎁'],['التقارير','reports','📄']].filter(x=>x[1]!=='crm'||canManageOffice());html=`<section class="welcome-hero"><div class="hero-copy"><div class="hero-kicker">MAKTABY PRO 10</div><h1>مرحباً بك في</h1><strong>مكتبي للمحاماة</strong><p>مع MAKTABY PRO 10 ... تعمل معاً لنجاح أكبر</p></div><div class="hero-emblem"><img src="assets/maktaby-approved-logo.webp" alt="شعار مكتبي للمحاماة"></div></section><div class="dashboard-date">${esc(day)} <span>·</span> إدارة ذكية لمكتب قانوني أكثر كفاءة</div><div class="stats dashboard-stats">${[['إجمالي المصروفات',fmt((db.transactions||[]).filter(x=>x.kind==='منصرف'&&!x.voidedAt).reduce((a,x)=>a+Number(x.amount||0),0)+(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='approved').reduce((a,x)=>a+Number(x.amount||0),0)),'🪙','teal'],['جلسة قادمة',upcoming.length,'🗓️','orange'],['عميل موكل',db.clients.length,'👨‍👩‍👧','purple'],...(canManageOffice()?[['عميل محتمل', (typeof crmState!=='undefined'&&crmState.loaded&&Array.isArray(crmState.rows))?crmState.rows.filter(x=>!['تم التعاقد','مؤرشف'].includes(x.lead_status)).length:'—','👥','blue']]:[]),['قضايا جديدة',db.cases.filter(c=>!c.archived).length,'📈','green']].map(x=>`<div class="card dash-stat ${x[3]}"><div class="dash-stat-icon">${x[2]}</div><div class="dash-stat-value">${x[1]}</div><div class="dash-stat-label">${x[0]}</div><small>بيانات المكتب الحالية</small></div>`).join('')}</div><div class="dashboard-lower"><section class="panel dashboard-panel"><h3>⚡ أدوات سريعة</h3><div class="quick-grid">${shortcuts.map(x=>`<button class="quick-tile" onclick="page='${x[1]}';render()"><span>${x[2]}</span><b>${x[0]}</b></button>`).join('')}</div></section><section class="panel dashboard-panel"><h3>▦ المهام القادمة</h3>${upcoming.length?upcoming.map(c=>`<div class="dash-row"><span class="row-icon">⚖️</span><div><b>${esc(c.client||'جلسة قضية رقم '+(c.number||'—'))}</b><small>${esc(c.number||'')} · ${esc(c.court||'')}</small></div><time>${esc(c.date||'')}</time></div>`).join(''):'<div class="empty">لا توجد جلسات قادمة مسجلة.</div>'}</section><section class="panel dashboard-panel recent-panel"><h3>◷ آخر الأنشطة والمتابعات</h3>${recent.length?recent.map(x=>`<div class="dash-row"><span class="row-icon">${x.status==='متأخر'?'⚠️':'🟢'}</span><div><b>${esc(x.task||'مهمة مكتبية')}</b><small>${esc(x.client||'—')} · ${esc(x.court||'')}</small></div><time>${esc(x.date||'')}</time></div>`).join(''):'<div class="empty">لا توجد أنشطة مسجلة للعرض.</div>'}</section></div>`}
if(page==='clients')html=`<div class="pagehead"><div><h1>العملاء</h1><div class="sub">بيانات التواصل والملفات المرتبطة بالموكل.</div></div>${canManageOffice()?'<button class="btn goldbtn" onclick="openForm(\'client\')">+ إضافة موكل</button>':''}</div>${table(['اسم الموكل','الهاتف','هاتف إضافي','عدد القضايا','تعديل'],db.clients.map(c=>`<tr><td>${esc(c.name)}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.phone2||'—')}</td><td>${db.cases.filter(x=>x.client===c.name).length}</td><td>${canManageOffice()?`<button class=\"btn light\" onclick=\"editClient(${db.clients.indexOf(c)})\">تعديل</button>`:'—'}</td></tr>`))}`;
if(page==='cases'){
 const q=(window.caseSearch||'').trim().toLocaleLowerCase('ar');
 const allCaseRows=db.cases.filter(c=>!c.archived&&(!q||[c.client,(c.clients||[]).join(' '),c.opponent,(c.opponents||[]).join(' '),c.number,c.subject,c.court,c.circuit,c.caseType].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q)))).slice().sort((a,b)=>{
   const ap=isPendingDecisionSessionV10(a)?0:1,bp=isPendingDecisionSessionV10(b)?0:1;
   return ap-bp||String(a.date||'').localeCompare(String(b.date||''))||String(a.client||'').localeCompare(String(b.client||''),'ar');
 });
 const pendingDecisionRows=allCaseRows.filter(isPendingDecisionSessionV10);
 const selectedIndex=allCaseRows.length?(allCaseRows.some(c=>db.cases.indexOf(c)===Number(window.caseCompactSelectedIndex))?Number(window.caseCompactSelectedIndex):db.cases.indexOf(allCaseRows[0])):-1;
 const selectedCase=selectedIndex>=0?db.cases[selectedIndex]:null;
 window.caseCompactSelectedIndex=selectedIndex;
 const caseStatus=c=>isPendingDecisionSessionV10(c)?'<span class="v109-status late">مطلوب قرار</span>':(String(c.date||'')<today()?'<span class="v109-status late">متأخرة</span>':(String(c.date||'')===today()?'<span class="v109-status today">اليوم</span>':'<span class="v109-status upcoming">قادمة</span>'));
 const compactRows=allCaseRows.map(c=>{const i=db.cases.indexOf(c);return `<tr class="${i===selectedIndex?'v109-selected':''}" onclick="selectCaseCompactV10(${i})"><td><b>${esc((Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client]).filter(Boolean).join('، ')||'—')}</b><small>${esc((Array.isArray(c.opponents)&&c.opponents.length?c.opponents:[c.opponent]).filter(Boolean).join('، ')||'')}</small></td><td>${esc(c.number||'—')}</td><td>${esc(c.subject||c.caseType||'—')}</td><td>${esc(c.court||'—')}<small>${esc(c.circuit||'')}</small></td><td><b>${esc(c.date||'—')}</b></td><td>${esc(c.roll||'—')}</td><td>${caseStatus(c)}</td><td><button class="v109-row-action" type="button" onclick="event.stopPropagation();selectCaseCompactV10(${i})">عرض</button></td></tr>`;});
 const detail=selectedCase?`<section class="v109-detail panel"><div class="v109-detail-head"><div><h3>تفاصيل القضية والجلسة</h3><div class="sub">${esc(selectedCase.client||'—')} · ${esc(selectedCase.number||'بدون رقم دعوى')} · ${esc(selectedCase.subject||selectedCase.caseType||'')}</div></div><div class="v109-detail-actions"><button class="btn light" onclick="openCaseTimeline109(${selectedIndex})">◷ الخط الزمني</button><button class="btn light" onclick="openSessionDocumentsV104(${selectedIndex})">المحررات والإعلانات (${(selectedCase.sessionDocuments||[]).length})</button><button class="btn light" onclick="sendCaseWhatsAppV10(${selectedIndex})">واتساب الموكل</button><button class="btn light" onclick="viewHistory(${selectedIndex})">سجل الجلسات</button>${canManageOffice()?`<button class="btn light" onclick="editCaseV67(${selectedIndex})">تعديل البيانات</button>`:''}</div></div><div class="v109-tabs"><button class="active" type="button" onclick="setCaseCompactTabV10('session',this)">بيانات الجلسة</button><button type="button" onclick="viewHistory(${selectedIndex})">الجلسات السابقة</button><button type="button" onclick="openCaseTimeline109(${selectedIndex})">الخط الزمني</button><button type="button" onclick="openSessionDocumentsV104(${selectedIndex})">المحررات والإعلانات</button><button type="button" onclick="sendCaseWhatsAppV10(${selectedIndex})">واتساب الموكل</button></div><div class="v109-detail-grid"><div><label>تاريخ الجلسة الحالية</label><strong>${esc(selectedCase.date||'—')}</strong><label>المحكمة والدائرة</label><strong>${esc(selectedCase.court||'—')} — ${esc(selectedCase.circuit||'—')}</strong><label>مكان الانعقاد</label><strong>${esc(selectedCase.venue||'—')}</strong><label>نوع الدعوى والخصم</label><strong>${esc(selectedCase.caseType||'—')} — ${esc((selectedCase.opponents||[selectedCase.opponent]).filter(Boolean).join('، ')||'—')}</strong></div><div class="v109-edit-fields"><label for="roll_${selectedIndex}">رول الجلسة</label><input id="roll_${selectedIndex}" type="text" maxlength="80" value="${esc(selectedCase.roll||'')}" placeholder="رقم الرول"><label for="decision_${selectedIndex}">قرار الجلسة / المنطوق</label><textarea id="decision_${selectedIndex}" rows="2" placeholder="اكتب القرار أو المنطوق">${esc(selectedCase.result||'')}</textarea><label for="reason_${selectedIndex}">سبب التأجيل</label><input id="reason_${selectedIndex}" type="text" value="${esc(selectedCase.adjournment||'')}" placeholder="سبب التأجيل"><label for="next_${selectedIndex}">تحديد الجلسة الجديدة</label><input id="next_${selectedIndex}" type="date" aria-label="تاريخ الجلسة الجديدة بعد الحالية"><div class="v109-save-row">${(canManageOffice()||isEmployee())?`<button class="btn goldbtn" onclick="saveSessionUpdate(${selectedIndex})">${isEmployee()?'إرسال للاعتماد':'حفظ القرار وترحيل الجلسة'}</button>`:''}${canManageOffice()?`<button class="btn light" onclick="archiveCase(${selectedIndex})">ترحيل إلى الأرشيف</button>`:''}</div></div></div></section>`:'<section class="panel empty">لا توجد قضايا مطابقة للبحث.</section>';
 html=`<div class="pagehead v109-pagehead"><div><h1>القضايا والجلسات</h1><div class="sub">لوحة مختصرة تعرض موقف كل جلسة، وتفتح تفاصيل القضية عند اختيارها دون ازدحام الشاشة.</div></div>${canManageOffice()||canRequestSessions()?`<button class="btn goldbtn" onclick="openForm('case')">${canManageOffice()?'+ إضافة قضية / جلسة':'طلب إضافة قضية / جلسة'}</button>`:''}</div><div class="v109-stats"><div class="v109-stat blue"><span>إجمالي القضايا</span><b>${allCaseRows.length}</b></div><div class="v109-stat red"><span>جلسات متأخرة</span><b>${allCaseRows.filter(c=>String(c.date||'')<today()).length}</b></div><div class="v109-stat green"><span>مطلوب قرارها</span><b>${pendingDecisionRows.length}</b></div><div class="v109-stat purple"><span>جلسات قادمة</span><b>${allCaseRows.filter(c=>String(c.date||'')>=today()&&!isPendingDecisionSessionV10(c)).length}</b></div></div><div class="v109-toolbar"><input class="search" type="search" placeholder="ابحث بالموكل أو رقم الدعوى أو الموضوع أو المحكمة..." value="${esc(window.caseSearch||'')}" oninput="window.caseSearch=this.value;scheduleSearchRender()"><span>الجلسات المطلوب قرارها تظهر أولاً تلقائيًا</span></div><div class="v109-case-layout"><section class="panel v109-table-panel"><div class="v109-table-title"><h3>قائمة الجلسات</h3><span>${allCaseRows.length} سجل · مرّر داخل القائمة لعرض باقي الجلسات</span></div>${table(['الموكل / الخصم','رقم الدعوى','الموضوع','المحكمة / الدائرة','تاريخ الجلسة','الرول','الحالة',''],compactRows)}</section><div class="v109-detail-slot">${detail}</div></div>`;
}
if(page==='announcements'){const q=(window.announcementSearch||'').trim().toLocaleLowerCase('ar');const rows=(db.announcements||[]).filter(a=>!a.archived&&!a.delivered&&(!q||[a.client,a.number,a.court,a.bailiff,a.kind].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q)))).slice().sort((a,b)=>String(a.court||'').localeCompare(String(b.court||''),'ar')||String(a.deliveryDate||'9999-12-31').localeCompare(String(b.deliveryDate||'9999-12-31'))||String(a.client||'').localeCompare(String(b.client||''),'ar'));html=`<div class="pagehead"><div><h1>الإعلانات</h1><div class="sub">الإعلانات مرتبة حسب المحكمة ثم تاريخ التسليم للمحضرين. الإعلان لا ينتقل للأرشيف إلا بعد إثبات الاستلام الفعلي.</div></div>${canManageOffice()||isLimitedStaff()?`<button class="btn goldbtn" onclick="openForm('announcement')">${isLimitedStaff()?'طلب إضافة إعلان':'+ إضافة إعلان'}</button>`:''}</div><div class="toolbar"><input class="search" type="search" placeholder="بحث بالموكل أو رقم الإعلان أو المحكمة أو المحضر..." value="${esc(window.announcementSearch||'')}" oninput="window.announcementSearch=this.value;scheduleSearchRender()"></div>${table(['المحكمة','تاريخ التسليم للمحضرين','الموكل','رقم الإعلان','المحضرين','نوع الإعلان','تاريخ الجلسة','الحالة','الإجراء'],rows.map(a=>{const i=db.announcements.indexOf(a);return `<tr><td>${esc(a.court||'—')}</td><td>${esc(a.deliveryDate||'—')}</td><td>${esc(a.client||'—')}</td><td>${esc(a.number||'—')}</td><td>${esc(a.bailiff||'—')}</td><td>${esc(a.kind||'—')}</td><td>${esc(a.session||'—')}</td><td><span class="pill open">${esc(a.status||'قيد الإعلان')}</span></td><td>${isLimitedStaff()?`<button class="btn light" onclick="editAnnouncement(${i})">طلب تعديل</button> <button class="btn goldbtn" onclick="requestAnnouncementReceived(${i})">طلب اعتماد الاستلام</button>`:isEmployee()?`<button class="btn goldbtn" onclick="requestAnnouncementReceived(${i})">طلب اعتماد الاستلام</button>`:canManageOffice()?`<button class="btn light" onclick="markAnnouncementReceived(${i})">تأكيد الاستلام</button>`:'—'}</td></tr>`}))}`;}
if(page==='enumerations'){const q=(window.enumerationSearch||'').trim().toLocaleLowerCase('ar');const all=(db.enumerations||[]).filter(x=>!q||[x.accused,x.caseNumber,x.enrollmentNumber,x.court,x.prosecution,x.victim].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q)));const groups={};all.forEach(x=>{const court=String(x.court||'').trim()||'محكمة غير محددة';(groups[court]=groups[court]||[]).push(x)});const courts=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'ar'));html=`<div class="pagehead"><div><h1>سجل أرقام الحصر</h1><div class="sub">تجميع أرقام الحصر حسب المحكمة، مع الحفاظ على السجلات القديمة التي لم تُحدد محكمتها.</div></div>${canManageOffice()||isLimitedStaff()?'<button class="btn goldbtn" onclick="openForm(\'enumeration\')">+ إضافة رقم حصر</button>':''}</div><div class="toolbar"><input class="search" type="search" placeholder="ابحث بالمحكمة أو المتهم أو رقم القضية أو الحصر أو النيابة أو المجني عليه..." value="${esc(window.enumerationSearch||'')}" oninput="window.enumerationSearch=this.value;scheduleSearchRender()"><span class="sub">${all.length} سجل في ${courts.length} محكمة</span></div>${courts.map((court,n)=>`<details class="panel" style="margin-bottom:12px" ${n===0?'open':''}><summary style="cursor:pointer;font-weight:800;padding:9px">${esc(court)} <span class="pill open">${groups[court].length} رقم حصر</span></summary><div style="overflow:auto;margin-top:12px">${table(['اسم المتهم','رقم القضية','رقم الحصر','النيابة','تاريخ آخر جلسة','تاريخ آخر سؤال','اسم المجني عليه','الإجراء'],groups[court].slice().sort((a,b)=>String(a.enrollmentNumber||'').localeCompare(String(b.enrollmentNumber||''),'ar')).map(x=>`<tr><td>${esc(x.accused||'—')}</td><td>${esc(x.caseNumber||'—')}</td><td><b>${esc(x.enrollmentNumber||'—')}</b></td><td>${esc(x.prosecution||'—')}</td><td>${esc(x.lastSessionDate||'—')}</td><td>${esc(x.lastQuestionDate||'—')}</td><td>${esc(x.victim||'—')}</td><td>${canManageOffice()?`<button class=\"btn light\" onclick=\"editEnumeration(${db.enumerations.indexOf(x)})\">تعديل</button> <button class=\"btn danger\" onclick=\"deleteEnumerationV10(${db.enumerations.indexOf(x)})\">حذف</button>`:'—'}</td></tr>`))}</div></details>`).join('')}`;}
if(page==='tasks'){
 const taskQuery=(window.taskSearch||'').trim().toLocaleLowerCase('ar');
 const taskRows=t.filter(x=>!taskQuery||[x.task,x.client,x.court,x.assignee,x.status,x.priority,x.source,x.notes].some(v=>String(v||'').toLocaleLowerCase('ar').includes(taskQuery)));
 const taskTotal=taskRows.length;
 const taskDone=taskRows.filter(x=>taskStatusIsCompletedV10(x.status)).length;
 const taskOpen=taskTotal-taskDone;
 const taskOverdue=taskRows.filter(x=>!taskStatusIsCompletedV10(x.status)&&x.date&&String(x.date).slice(0,10)<today()).length;
 const taskPercent=taskTotal?Math.round(taskDone/taskTotal*100):0;
 const groups={};taskRows.forEach(x=>{const k=String(x.court||'بدون محكمة').trim()||'بدون محكمة';(groups[k]=groups[k]||[]).push(x)});
 const taskFolders=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'ar'));
 html=`<section class="task-workspace" aria-label="إدارة المهام الإدارية">
 <div class="task-hero"><div class="task-hero-copy"><span class="task-eyebrow">MAKTABY WORKSPACE</span><h1>إدارة المهام</h1><p>مساحة موحدة لتنظيم أعمال المكتب ومتابعة المسؤوليات ومواعيد التنفيذ.</p></div><div class="task-hero-actions">${canManageOffice()?'<button class="btn light" onclick="manageBranchesV67()">إدارة الفروع</button>':''}${canManageOffice()||isLimitedStaff()?'<button class="btn goldbtn task-primary-action" onclick="openForm(\'task\')"><span aria-hidden="true">＋</span> إضافة مهمة جديدة</button>':''}</div></div>
 <div class="task-kpis"><article class="task-kpi task-kpi-total"><span class="task-kpi-icon">▤</span><div><small>إجمالي المهام</small><strong>${taskTotal}</strong><em>في نتائج العرض الحالية</em></div></article><article class="task-kpi task-kpi-open"><span class="task-kpi-icon">◷</span><div><small>قيد التنفيذ</small><strong>${taskOpen}</strong><em>تحتاج إلى متابعة</em></div></article><article class="task-kpi task-kpi-late"><span class="task-kpi-icon">!</span><div><small>متأخرة</small><strong>${taskOverdue}</strong><em>تجاوزت تاريخ الاستحقاق</em></div></article><article class="task-kpi task-kpi-done"><span class="task-kpi-icon">✓</span><div><small>منجزة</small><strong>${taskDone}</strong><em>مكتملة أو مؤرشفة</em></div></article></div>
 <section class="task-progress-panel"><div class="task-progress-heading"><div><b>معدل إنجاز المهام</b><small>نسبة المهام المكتملة من إجمالي النتائج</small></div><strong>${taskPercent}%</strong></div><div class="task-progress-track"><i style="width:${taskPercent}%"></i></div></section>
 <section class="task-list-panel"><div class="task-list-heading"><div><h2>المهام حسب المحكمة</h2><p>${taskFolders.length} مجلدات عمل · ${taskTotal} مهمة</p></div><label class="task-search-box"><span aria-hidden="true">⌕</span><input class="search" type="search" aria-label="البحث في المهام" placeholder="ابحث بالمهمة أو الموكل أو المحكمة أو المسؤول..." value="${esc(window.taskSearch||'')}" oninput="window.taskSearch=this.value;scheduleSearchRender()"></label></div>
 ${taskFolders.length?taskFolders.map((court,n)=>{const folderRows=groups[court].slice().sort((a,b)=>String(a.date||'9999-12-31').localeCompare(String(b.date||'9999-12-31')));const folderDone=folderRows.filter(x=>taskStatusIsCompletedV10(x.status)).length;return `<details class="task-folder" ${n===0?'open':''}><summary><span class="task-folder-mark" aria-hidden="true">▰</span><span class="task-folder-name"><b>${esc(court)}</b><small>${folderRows.length} مهمة · ${folderDone} منجزة</small></span><span class="task-folder-count">${folderRows.length}</span><span class="task-folder-chevron" aria-hidden="true">⌄</span></summary><div class="task-folder-content">${canManageOffice()||isLimitedStaff()?`<div class="task-folder-toolbar"><span>قائمة الأعمال المرتبطة بالمحكمة</span><button type="button" class="btn goldbtn" onclick="addTaskForCourtV8(decodeURIComponent('${encodeURIComponent(court)}'))">＋ إضافة مهمة لهذه المحكمة</button></div>`:''}<div class="task-table-scroll">${table(['الاستحقاق','الأولوية','الموكل','تفاصيل المهمة','المصدر','الحالة','المسؤول والإجراءات'],folderRows.map(x=>`<tr><td><span class="task-date">${esc(x.date||'—')}</span></td><td><span class="pill ${x.priority==='عاجلة'?'late':x.priority==='متوسطة'?'open':'done'}">${esc(x.priority||'عادية')}</span></td><td>${esc((Array.isArray(x.clients)&&x.clients.length?x.clients:[x.client]).filter(Boolean).join('، ')||'—')}</td><td class="tasks-task-cell"><b>${esc(x.task||'—')}</b>${x.kind?`<small class="muted">${esc(x.kind)}</small>`:''}</td><td>${esc(x.source||'يدوي')}</td><td><span class="pill ${x.status==='متأخر'?'late':(taskStatusIsCompletedV10(x.status)?'done':'open')}">${esc(x.status)}</span></td><td class="task-row-actions"><span class="task-assignee">${esc(x.assignee||'—')}</span>${db.tasks.includes(x)?`${canManageOffice()||isLimitedStaff()?`<button class="btn light" onclick="editTask(${db.tasks.indexOf(x)})">${isLimitedStaff()?'طلب تعديل':'تعديل'}</button>`:''}${!taskStatusIsCompletedV10(x.status)?(canManageOffice()?`<button class="btn goldbtn" onclick="completeAdminTaskV745(${db.tasks.indexOf(x)})">تم الانتهاء</button>`:isLimitedStaff()?`<button class="btn goldbtn" onclick="requestTaskCompletionV104(${db.tasks.indexOf(x)})">طلب إنهاء</button>`:''):''}`:''}</td></tr>${Array.isArray(x.history)&&x.history.length?`<tr class="task-history-row"><td colspan="7"><details><summary>سجل التعديلات (${x.history.length})</summary>${x.history.slice().reverse().map(h=>`<div class="muted">${esc(h.date||String(h.at||'').slice(0,10))} — ${esc(h.actor||'')} — ${esc(h.action||'')}</div>`).join('')}</details></td></tr>`:''}${x.completionDate||x.completionNote?`<tr class="task-completion-row"><td colspan="7">تاريخ الإنجاز: ${esc(x.completionDate||'—')} <span>·</span> ما تم: ${esc(x.completionNote||'—')}</td></tr>`:''}`))}</div></div></details>`}).join(''):'<div class="task-empty"><span>▤</span><b>لا توجد مهام مطابقة</b><small>جرّب تعديل كلمات البحث أو أضف مهمة جديدة.</small></div>'}
 </section></section>`;
}
if(page==='accounts'){let month=window.accountMonth||today().slice(0,7);let rows=(db.cloudExpenses||[]).filter(x=>String(x.date||'').startsWith(month)&&(currentUser?.role!=='employee'||x.employee===currentUser.name||x.enteredBy===currentUser.name));let out=rows.reduce((a,x)=>a+(+x.amount||0),0);html=`<div class="pagehead"><div><h1>مصاريف شركاء النجاح</h1><div class="sub">تفاصيل المصروفات المسجلة حسب الشهر، مع اسم شريك النجاح والموكل وبند الصرف.</div></div><div class="actions"><button class="btn goldbtn" onclick="openForm('expense')">+ تسجيل مصروف</button></div></div><div class="toolbar"><label>الشهر:</label><input type="month" value="${month}" onchange="window.accountMonth=this.value;render()"></div><div class="stats"><div class="card"><div class="statlabel">إجمالي المصروفات للشهر</div><div class="statnum">${out.toLocaleString('en-US')} ج</div></div><div class="card"><div class="statlabel">عدد المصروفات</div><div class="statnum">${rows.length}</div></div></div>${table(['التاريخ','البند','العميل','البيان','المبلغ','شريك النجاح'],rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.category||'—')}</td><td>${esc(x.client||'—')}</td><td>${esc(x.title||'—')}</td><td>${(+x.amount||0).toLocaleString('en-US')} ج</td><td>${esc(x.employee||'—')}</td></tr>`))}`}
if(page==='income'){let month=window.incomeMonth||today().slice(0,7);let rows=(db.transactions||[]).filter(x=>x.kind==='وارد'&&!x.voidedAt&&String(x.date||'').startsWith(month));let total=rows.reduce((a,x)=>a+(+x.amount||0),0);html=`<div class="pagehead"><div><h1>الوارد – خاص بالمدير</h1><div class="sub">تسجيل ومراجعة الإيرادات والوارد الشهري، مع منع تكرار رقم الحصر.</div></div><button class="btn goldbtn" onclick="openForm('income')">+ تسجيل وارد</button></div><div class="toolbar"><label>الشهر:</label><input type="month" value="${month}" onchange="window.incomeMonth=this.value;render()"></div><div class="stats"><div class="card"><div class="statlabel">إجمالي الوارد للشهر</div><div class="statnum gold">${total.toLocaleString('en-US')} ج</div></div><div class="card"><div class="statlabel">عدد حركات الوارد</div><div class="statnum">${rows.length}</div></div></div>${table(['التاريخ','البند','الموكل','رقم الحصر','البيان','المبلغ','أدخلها','الإجراءات'],rows.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.category||'—')}</td><td>${esc(x.client||'—')}</td><td><b>${esc(x.enrollmentNumber||'—')}</b></td><td>${esc(x.title||'—')}</td><td>${(+x.amount||0).toLocaleString('en-US')} ج</td><td>${esc(x.enteredBy||currentUser.name)}</td><td><button class="btn light" onclick="editIncomeV951(${db.transactions.indexOf(x)})">تعديل</button> ${isAdmin()?`<button class=\"btn danger\" onclick=\"voidIncomeV951(${db.transactions.indexOf(x)})\">حذف</button>`:''} <button class="btn light" onclick="createSessionFromIncomeV1(${db.transactions.indexOf(x)})">تحديد جلسة</button></td></tr>`))}`}
if(page==='approvals'&&canReview()){const rows=(db.approvalRequests||[]).filter(x=>x.status==='pending'&&x.request_type!=='bonus_request');html=`<div class="pagehead"><div><h1>طلبات الاعتماد</h1><div class="sub">طلبات الجلسات والإعلانات والمهام وأرقام الحصر. طلبات البونص تُراجع من شاشة الرواتب فقط حتى لا تُعتمد دون تحديد المبلغ والأيام المعتمدة.</div></div><div class="maktaby-approval-live" id="maktabyApprovalLive" role="status">يتم تحميل الطلبات من قاعدة بيانات المكتب مباشرة.</div></div>${table(['النوع','الموظف','التفاصيل','التاريخ','الإجراء'],rows.map(x=>{const p=x.payload||{};const desc=x.request_type==='session_record_update'?`تعديل بيانات جلسة: ${p.original?.client||''} | ${p.original?.number||''} | القرار المطلوب: ${p.updated?.result||'—'}`:x.request_type==='session_create'?`إضافة جلسة: ${p.record?.client||'—'} | ${p.record?.number||'—'} | ${p.record?.date||'—'} | ${p.record?.court||''}`:x.request_type==='announcement_create'?`إضافة إعلان: ${p.record?.client||'—'} | رقم ${p.record?.number||'—'} | ${p.record?.court||''}`:x.request_type==='session_update'?`القرار: ${p.decision||'—'} | سبب التأجيل: ${p.reason||'—'} | جلسة جديدة: ${p.nextDate||'—'} | ${p.client||''} | ${p.caseNumber||''}`:x.request_type==='announcement_received'?`إثبات استلام إعلان: ${p.client||''} | رقم ${p.number||'—'}`:x.request_type==='announcement_update'?`تعديل إعلان: ${p.original?.client||''} | رقم ${p.original?.number||'—'}`:x.request_type==='task_create'?`إضافة مهمة: ${p.updated?.task||'—'} (${p.updated?.kind||'غير مصنف'}) | ${p.updated?.date||''}`:x.request_type==='task_update'?`تعديل مهمة: ${p.updated?.task||'—'} (${p.updated?.kind||'غير مصنف'}) | ${p.updated?.date||''}`:x.request_type==='bonus_request'?`طلب بونص: مبلغ ${cashV951(p.amount)} | ${Number(p.days||0)} يوم | الشهر ${p.month||'—'} | السبب: ${p.reason||'—'}`:`إضافة رقم حصر: ${p.record?.accused||'—'} | حصر ${p.record?.enrollmentNumber||'—'}`;const typeLabel=({session_record_update:'تعديل بيانات جلسة',session_create:'إضافة جلسة جديدة',announcement_create:'إضافة إعلان جديد',session_update:'تعديل سبب التأجيل / الجلسة',announcement_received:'استلام إعلان',announcement_update:'تعديل إعلان',task_create:'إضافة مهمة',task_update:'تعديل مهمة',enumeration_create:'إضافة رقم حصر',bonus_request:'طلب بونص'})[x.request_type]||x.request_type;return `<tr><td>${typeLabel}</td><td>${esc(x.requested_by_name||'—')}</td><td>${esc(desc)}</td><td>${esc(String(x.created_at||'').slice(0,10))}</td><td><button class="btn goldbtn" type="button" class="btn goldbtn maktaby-review-action" data-review-id="${esc(x.id)}" data-review-approve="1">اعتماد</button> <button class="btn light" type="button" class="btn light maktaby-review-action" data-review-id="${esc(x.id)}" data-review-approve="0">رفض</button></td></tr>`}))}`}
if(page==='employees')html=`<div class="pagehead"><div><h1>حسابات الموظفين</h1><div class="sub">كل موظف له اسم مستخدم وكلمة مرور أولية، ويسجل مصروفات الموكلين باسمه.</div></div></div><div class="notice">حسابات الدخول الفعلية تُدار من Supabase Authentication. لا يتم عرض كلمات المرور داخل البرنامج. أضف المستخدمين من لوحة Supabase ثم اربط كل حساب بدوره.</div>${table(['شريك النجاح','اسم المستخدم','الدور','مصروفاته المسجلة'],db.employees.map(e=>`<tr><td>${esc(e.name)}</td><td>${esc(e.username)}</td><td>${esc(e.role==='admin'?'مدير':e.role==='office_manager'?'مديرة المكتب':'موظف')}</td><td>${(db.cloudExpenses||[]).filter(x=>x.employee===e.name).length}</td></tr>`))}`;
if(page==='archive')html=`<div class="pagehead"><div><h1>الأرشيف والاسترجاع</h1><div class="sub">يمكن استعادة السجلات أو حذفها نهائيًا. الحذف النهائي لا يمكن التراجع عنه.</div></div></div><section class="panel" style="margin-bottom:14px"><h3>بحث في الأرشيف</h3><div class="toolbar"><input id="archiveSearchInput" class="search" type="search" placeholder="ابحث باسم الموكل أو رقم الدعوى أو المحكمة أو منطوق الحكم أو الموظف..." value="${esc(archiveSearchQuery)}" onkeydown="if(event.key==='Enter')archiveApplySearch()"><button class="btn goldbtn" onclick="archiveApplySearch()">بحث</button><button class="btn light" onclick="archiveSearchQuery='';render()">مسح البحث</button><span class="sub">يبحث في جميع أقسام الأرشيف</span></div></section><section class="panel"><h3>الإعلانات المستلمة</h3>${table(['الموكل','رقم الإعلان','المحكمة','تاريخ الاستلام','من استلم','الإجراءات'],archiveFilterRows(db.announcementArchive).map(({item:a,index:i})=>`<tr><td>${esc(a.client)}</td><td>${esc(a.number||'—')}</td><td>${esc(a.court)}</td><td>${esc(a.receivedDate||'غير محدد')}</td><td>${esc(a.receivedBy||'—')}</td><td>${canManageOffice()?`<button class="btn light" onclick="restoreItem('announcement',${i})">استرجاع</button> <button class="btn danger" onclick="purgeArchiveItemV914('announcement',${i})">حذف نهائي</button>`:'—'}</td></tr>`))}</section><section class="panel"><h3>القضايا والجلسات المنتهية</h3>${table(['الموكل','رقم الدعوى','المحكمة','آخر جلسة','جلسة الحكم','منطوق الحكم','عدد الجلسات السابقة','الإجراءات'],archiveFilterRows(db.caseArchive).map(({item:c,index:i})=>`<tr><td>${esc(c.client)}</td><td>${esc(c.number)}</td><td>${esc(c.court)}</td><td>${esc(c.date)}</td><td>${esc(c.judgmentSessionDate||'—')}</td><td style="min-width:240px;white-space:normal">${esc(c.judgmentText||'—')}</td><td>${(c.history||[]).length}</td><td><button class="btn goldbtn" onclick="openCaseTimeline109(${i},true)">◷ الخط الزمني</button> ${canManageOffice()?`<button class="btn light" onclick="restoreItem('case',${i})">استرجاع</button> <button class="btn danger" onclick="purgeArchiveItemV914('case',${i})">حذف نهائي</button>`:'—'}</td></tr>`))}</section><section class="panel"><h3>المهام المنجزة والمؤرشفة</h3><div class="sub">تُحفظ تفاصيل المهمة وتاريخ الإنجاز واسم من أنهى المهمة.</div>${table(['الموكل','المحكمة','المهمة','تاريخ الاستحقاق','تاريخ الإنجاز','تم بواسطة','ما تم إنجازه','الإجراءات'],archiveFilterRows(db.taskArchive||[]).map(({item:x,index:i})=>`<tr><td>${esc(x.client||'—')}</td><td>${esc(x.court||'—')}</td><td>${esc(x.task||'—')}</td><td>${esc(x.date||'—')}</td><td>${esc(x.completionDate||'—')}</td><td>${esc(x.completedBy||'—')}</td><td>${esc(x.completionNote||'—')}</td><td>${canManageOffice()?`<button class="btn light" onclick="restoreItem('task',${i})">استرجاع</button> <button class="btn danger" onclick="purgeArchiveItemV914('task',${i})">حذف نهائي</button>`:'—'}</td></tr>`))}</section><section class="panel"><h3>العملاء المحذوفون — الأرشيف</h3>${table(['اسم العميل','الهاتف','الرقم القومي','الإجراء'],archiveFilterRows(db.clientArchive||[]).map(({item:c,index:i})=>`<tr><td>${esc(c.name||'—')}</td><td>${esc(c.phone||'—')}</td><td>${esc(c.nationalId||'—')}</td><td>${canManageOffice()?`<button class="btn light" onclick="restoreArchivedRecordV87('client',${i})">استعادة</button> <button class="btn danger" onclick="purgeArchivedRecordV87('client',${i})">حذف نهائي</button>`:'—'}</td></tr>`))}</section><section class="panel"><h3>التوكيلات المحذوفة — الأرشيف</h3>${table(['صاحب التوكيل','رقم التوكيل','التاريخ','الإجراء'],archiveFilterRows(db.poaArchive||[]).map(({item:x,index:i})=>`<tr><td>${esc(x.name||'—')}</td><td>${esc(x.poaNumber||'—')}</td><td>${esc(x.year||'—')}</td><td>${canManageOffice()?`<button class="btn light" onclick="restoreArchivedRecordV87('poa',${i})">استعادة</button> <button class="btn danger" onclick="purgeArchivedRecordV87('poa',${i})">حذف نهائي</button>`:'—'}</td></tr>`))}</section>`;
$('#app').innerHTML=html;const incomeNav=document.querySelector('[data-page="income"]');if(incomeNav)incomeNav.style.display=canManageOffice()?'block':'none';const enumNav=document.getElementById('enumerationsNav');if(enumNav)enumNav.style.display=canViewEnumerations()?'block':'none';const approvalsNav=document.getElementById('approvalsNav');if(approvalsNav)approvalsNav.style.display=canReview()?'block':'none';const approvalCount=document.getElementById('approvalCount');if(approvalCount){const n=(db.approvalRequests||[]).filter(x=>x.status==='pending').length;approvalCount.textContent=n;approvalCount.style.display=canReview()&&n?'inline-block':'none';}$('#topTitle').textContent={dashboard:'لوحة التحكم',clients:'العملاء',cases:'القضايا والجلسات',announcements:'الإعلانات',tasks:'المهام الإدارية',accounts:'المصروفات',income:'الوارد',employees:'شركاء النجاح',archive:'الأرشيف والاسترجاع',approvals:'طلبات الاعتماد',enumerations:'أرقام الحصر'}[page];document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===page));}
document.querySelectorAll('.nav button').forEach(b=>b.onclick=()=>{if(!currentUser)return;const target=b.dataset.page;if(target==='income'&&!canManageOffice()){alert('صفحة الوارد متاحة لحساب المدير فقط.');return;}if(target==='enumerations'&&!canViewEnumerations()){alert('سجل أرقام الحصر متاح للمدير ومديرة المكتب فقط.');return;}if(target==='approvals'&&!canReview()){alert('طلبات الاعتماد متاحة للمدير ومديرة المكتب فقط.');return;}if(currentUser.role==='employee'&&!['dashboard','cases','announcements','tasks','accounts',...(isLimitedStaff()?['enumerations']:[])].includes(target)){alert('هذه الصفحة متاحة للمدير أو مديرة المكتب.');return;}page=target;render()});
async function doLogin(){const email=$('#loginUser').value.trim(),password=$('#loginPass').value;$('#loginError').textContent='جارٍ التحقق من الحساب...';const {data,error}=await sb.auth.signInWithPassword({email,password});if(error){$('#loginError').textContent='تعذر الدخول: '+error.message;return;}const user=data.user;const {data:profile,error:pe}=await sb.from('profiles').select('full_name,role,active').eq('id',user.id).single();if(pe||!profile||!profile.active){await sb.auth.signOut();$('#loginError').textContent='الحساب غير مفعّل أو لم يتم إعداد ملف الموظف. راجع المدير.';return;}currentUser={id:user.id,email:user.email,name:profile.full_name||user.email,role:profile.role};if($('#topUserName'))$('#topUserName').textContent=currentUser.name;$('#loginScreen').style.display='none';$('#userBadge').innerHTML=esc(currentUser.name)+' — <a href="#" onclick="logout();return false" style="color:inherit">خروج</a>';$('#importBtn').style.display=isAdmin()?'inline-block':'none';$('#backupBtn').style.display=isAdmin()?'inline-block':'none';if($('#recoveryBackupBtn'))$('#recoveryBackupBtn').style.display=isAdmin()?'inline-block':'none';if($('#recoveryHealthBtn'))$('#recoveryHealthBtn').style.display=isAdmin()?'inline-block':'none';$('#syncBtn').style.display=canManageOffice()?'inline-block':'none';try{await loadCloudState();startRealtime();}catch(e){$('#loginScreen').style.display='flex';$('#loginError').textContent='تم تسجيل الدخول لكن تعذر تحميل بيانات المكتب: '+e.message;await sb.auth.signOut();currentUser=null;}}
async function logout(){const offline=window.MAKTABY_OFFLINE;if(!offline?.checkLogoutSafety||!offline?.clearSensitiveLocalData){alert('تعذر التحقق من سلامة التخزين المحلي. لم يتم تسجيل الخروج أو حذف أي بيانات. حدّث الصفحة وحاول مرة أخرى.');return;}const safety=await offline.checkLogoutSafety();if(!safety.ok){alert('لا يمكن تسجيل الخروج الآن لوجود عمليات لم تكتمل مزامنتها.\nمصروفات معلقة: '+safety.pendingExpenses+'\nمزامنة بيانات المكتب معلقة: '+(safety.pendingStateSync?'نعم':'لا')+'\nاتصل بالإنترنت وأكمل المزامنة قبل تسجيل الخروج؛ لم يتم حذف أي بيانات.');return;}await sb.auth.signOut();const cleanup=await offline.clearSensitiveLocalData();if(!cleanup.ok){alert('تم إنهاء الجلسة، لكن تعذر تنظيف كل البيانات المحلية: '+(cleanup.error||cleanup.reason||'سبب غير محدد')+'. أغلق التبويبات الأخرى ثم أعد فتح البرنامج.');}currentUser=null;try{if(window.__maktabyClearCrmOnLogout)window.__maktabyClearCrmOnLogout();}catch(_){}$('#importBtn').style.display='none';if($('#recoveryBackupBtn'))$('#recoveryBackupBtn').style.display='none';if($('#recoveryHealthBtn'))$('#recoveryHealthBtn').style.display='none';$('#backupBtn').style.display='none';$('#syncBtn').style.display='none';$('#loginScreen').style.display='flex';$('#loginPass').value='';} 
let realtimeChannel=null;let approvalPoller=null;let knownPendingApprovalIds=new Set();function showApprovalNotice(message){let n=document.getElementById('approvalLiveNotice');if(!n){n=document.createElement('div');n.id='approvalLiveNotice';n.style.cssText='position:fixed;top:18px;left:18px;z-index:9999;background:#17324d;color:#fff;padding:13px 18px;border-radius:10px;box-shadow:0 8px 28px #0003;font:14px Tahoma,Arial;max-width:340px';document.body.appendChild(n);}n.textContent=message;n.style.display='block';clearTimeout(window.approvalNoticeTimer);window.approvalNoticeTimer=setTimeout(()=>n.style.display='none',7000);}async function refreshApprovalRequests(showNew=false){if(!canReview())return;const {data,error}=await sb.from('approval_requests').select('id,requested_by,requested_by_name,request_type,payload,status,created_at,reviewed_by,reviewed_by_name,reviewed_at,review_note').order('created_at',{ascending:false});if(error){console.error('approval refresh',error);return;}const rows=data||[];if(showNew){const newly=rows.filter(x=>x.status==='pending'&&!knownPendingApprovalIds.has(x.id)&&x.requested_by!==currentUser.id);if(newly.length)showApprovalNotice('لديك طلب اعتماد جديد من '+(newly[0].requested_by_name||'أحد الموظفين'));}const previousApprovalRows=JSON.stringify(db.approvalRequests||[]);db.approvalRequests=rows;knownPendingApprovalIds=new Set(rows.filter(x=>x.status==='pending').map(x=>x.id));if(previousApprovalRows!==JSON.stringify(rows)&&page!=='tasks'&&!document.querySelector('#modal.show'))render();}function startRealtime(){if(realtimeChannel)sb.removeChannel(realtimeChannel);realtimeChannel=sb.channel('hany-office-live').on('postgres_changes',{event:'*',schema:'public',table:'office_shared_state'},()=>refreshCloud()).on('postgres_changes',{event:'*',schema:'public',table:'employee_shared_state'},()=>refreshCloud()).on('postgres_changes',{event:'*',schema:'public',table:'expenses'},()=>refreshCloud()).on('postgres_changes',{event:'*',schema:'public',table:'wallet_transactions'},()=>refreshCloud()).on('postgres_changes',{event:'*',schema:'public',table:'client_documents'},()=>refreshCloud()).on('postgres_changes',{event:'*',schema:'public',table:'office_financial_state'},()=>refreshCloud()).on('postgres_changes',{event:'INSERT',schema:'public',table:'approval_requests'},()=>refreshApprovalRequests(true)).on('postgres_changes',{event:'UPDATE',schema:'public',table:'approval_requests'},()=>refreshApprovalRequests(false)).subscribe();if(approvalPoller)clearInterval(approvalPoller);if(canReview())approvalPoller=setInterval(()=>refreshApprovalRequests(true),20000);} 
// Check date rollover while the app remains open; do work only when a new overdue session is found.
if(!window.__maktabyOverdueSessionTicker){window.__maktabyOverdueSessionTicker=setInterval(()=>{
 if(!currentUser||document.querySelector('#modal.show')||window.__maktabySessionWriteInProgress)return;
 const changed=syncOverdueSessionDecisionTasksV10();if(!changed)return;
 localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();
 if(canManageOffice())saveOperationalStateV10().then(()=>setCloudStatus('تم إنشاء مهمة جلسة منتهية ومزامنتها')).catch(err=>{setCloudStatus('مهمة الجلسة محفوظة محليًا — المزامنة معلقة');console.warn('[MAKTABY overdue ticker]',err);});
},60000);}
(async function boot(){const {data:{session}}=await sb.auth.getSession();if(session){const {data:profile}=await sb.from('profiles').select('full_name,role,active').eq('id',session.user.id).single();if(profile?.active){currentUser={id:session.user.id,email:session.user.email,name:profile.full_name||session.user.email,role:profile.role};if($('#topUserName'))$('#topUserName').textContent=currentUser.name;$('#loginScreen').style.display='none';$('#userBadge').innerHTML=esc(currentUser.name)+' — <a href="#" onclick="logout();return false" style="color:inherit">خروج</a>';$('#importBtn').style.display=isAdmin()?'inline-block':'none';$('#backupBtn').style.display=isAdmin()?'inline-block':'none';if($('#recoveryBackupBtn'))$('#recoveryBackupBtn').style.display=isAdmin()?'inline-block':'none';if($('#recoveryHealthBtn'))$('#recoveryHealthBtn').style.display=isAdmin()?'inline-block':'none';$('#syncBtn').style.display=canManageOffice()?'inline-block':'none';try{await loadCloudState();startRealtime();}catch(e){$('#loginScreen').style.display='flex';$('#loginError').textContent='تعذر تحميل بيانات المكتب: '+e.message;}}}render();})();

/* V7.2.1 hotfix: reliable navigation to client fees page.
   Capture the click before older sidebar handlers can overwrite/intercept it. */
document.addEventListener('click',function(e){
  const b=e.target&&e.target.closest?e.target.closest('#nav [data-page="clientfees"]'):null;
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!currentUser)return;
  if(!canManageOffice()){alert('صفحة أتعاب الموكلين والتحصيل متاحة للمدير ومديرة المكتب فقط.');return;}
  page='clientfees';
  try{render();}
  catch(err){console.error('فتح صفحة الأتعاب',err);
    const app=document.getElementById('app');
    if(app)app.innerHTML='<div class="notice">تعذر فتح صفحة الأتعاب: '+esc(String(err&&err.message||err))+'</div>';
  }
},true);



/* ===== Legacy UI segment 02 (preserved order) ===== */

/* VERSION 6.0 — office finance, employee wallets, client dossier and searchable fields */
let selectedClientNameV54 = '';
let editingClientIndexV54 = null;
const renderV53Original = render;
const inputFieldV53Original = inputField;
const formSubmitV53Original = $('#form').onsubmit;

const closeModalV53Original = closeModal;
closeModal = function(){ editingClientIndexV54=null; closeModalV53Original(); };

// Client pickers become searchable inputs with a datalist.
inputField = function(f){
  const [k,label,type,req]=f;
  if(type==='client') return `<div class="field"><label>${label}</label><input name="${k}" list="clientOptionsV54" ${req?'required':''} placeholder="اكتب اسم الموكل للبحث أو اختره"><datalist id="clientOptionsV54">${(db.clients||[]).map(c=>`<option value="${esc(c.name)}"></option>`).join('')}</datalist></div>`;
  return inputFieldV53Original(f);
};

// Keep editing support for the full client dossier.
editClient = function(i){
  if(!canManageOffice()) return;
  if(!db.clients[i]) return;
  editingClientIndexV54=i;
  openForm('client');
  fillFormValues(db.clients[i]);
  $('#modalTitle').textContent='تعديل ملف الموكل';
};
$('#form').onsubmit = function(e){
  if(formType==='client' && editingClientIndexV54!==null){
    e.preventDefault();
    const obj=Object.fromEntries(new FormData(e.target).entries());
    const old=db.clients[editingClientIndexV54];
    db.clients[editingClientIndexV54]={...old,...obj};
    editingClientIndexV54=null;closeModal();save();return;
  }
  return formSubmitV53Original.call(this,e);
};

function walletBalanceV54(employeeId){
  return (db.walletTransactions||[]).filter(x=>x.employee_id===employeeId).reduce((s,x)=>s+(x.entry_type==='credit'?1:-1)*(Number(x.amount)||0),0);
}
function moneyV54(n){return (Number(n)||0).toLocaleString('en-US',{maximumFractionDigits:2})+' ج';}
function setV54Page(title,active){
  $('#topTitle').textContent=title;
  document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===active));
  const nav=document.getElementById('officeAccountsNav');if(nav)nav.style.display=canManageOffice()?'block':'none';
  const a=document.querySelector('[data-page="accounts"]');if(a)a.textContent=isEmployee()?'مصروفاتي':'مصروفات الشغل';
}
function openClientProfile(name){selectedClientNameV54=name;page='clientProfile';render();}
function openClientProfileByIndexV54(i){const c=(db.clients||[])[i];if(c)openClientProfile(c.name);}
let clientsWorkerRenderSeq=0;
async function renderClientsV54(){
  const renderSeq=++clientsWorkerRenderSeq;
  const q=(window.clientSearchV54||'').trim().toLocaleLowerCase('ar');
  const clients=Array.isArray(db.clients)?db.clients:[];
  const cases=Array.isArray(db.cases)?db.cases:[];
  // One linear pass replaces the old per-client full cases.filter() scan.
  const caseCounts=new Map();
  for(const item of cases){
    const name=String(item?.client||'');
    if(name)caseCounts.set(name,(caseCounts.get(name)||0)+1);
  }
  const indexed=clients.map((client,index)=>({client,index}));
  const matchedIndexes=await window.MAKTABY_COMPUTE.search(indexed.map(({client:c})=>[c.name,c.phone,c.phone2,c.powerOfAttorneyNo,c.subject].map(v=>String(v||'')).join(' ')),q);
  if(renderSeq!==clientsWorkerRenderSeq||page!=='clients')return;
  const matchedSet=new Set(matchedIndexes);const rows=indexed.filter((_,i)=>matchedSet.has(i));
  $('#app').innerHTML=`<div class="pagehead"><div><h1>العملاء</h1><div class="sub">افتح اسم الموكل لعرض ملفه الكامل: القضايا والجلسات والإعلانات والمستندات والمصروفات والوارد.</div></div>${canManageOffice()?'<button class="btn goldbtn" onclick="openForm(\'client\')">+ إضافة موكل</button>':''}</div><div class="toolbar"><input class="search" type="search" placeholder="بحث باسم الموكل أو الهاتف أو رقم التوكيل..." value="${esc(window.clientSearchV54||'')}" oninput="window.clientSearchV54=this.value;scheduleSearchRender()"></div>${table(['اسم الموكل','الهاتف','رقم التوكيل','موضوع الموكل','عدد القضايا','فتح الملف','تعديل'],rows.map(({client:c,index})=>`<tr><td><button class="btn light" onclick="openClientProfileByIndexV54(${index})">${esc(c.name)}</button></td><td>${esc(c.phone||'—')}</td><td>${esc(c.powerOfAttorneyNo||'—')}</td><td>${esc(c.subject||'—')}</td><td>${caseCounts.get(String(c.name||''))||0}</td><td><button class="btn goldbtn" onclick="openClientProfileByIndexV54(${index})">عرض الملف</button></td><td>${canManageOffice()?`<button class="btn light" onclick="editClient(${index})">تعديل</button> <button class="btn danger" onclick="archiveClientV87(${index})">حذف</button>`:'—'}</td></tr>`))}`;
  setV54Page('العملاء','clients');
}

let expensesWorkerRenderSeq=0;
async function renderEmployeeExpensesV54(){
  const renderSeq=++expensesWorkerRenderSeq;
  const month=window.accountMonth||today().slice(0,7), q=(window.expenseSearchV54||'').trim().toLocaleLowerCase('ar');
  const monthRows=(db.cloudExpenses||[]).filter(x=>String(x.date||'').startsWith(month));
  const matchedIndexes=await window.MAKTABY_COMPUTE.search(monthRows.map(x=>[x.client,x.category,x.title,x.employee,x.approvalStatus].map(v=>String(v||'')).join(' ')),q);
  if(renderSeq!==expensesWorkerRenderSeq||page!=='accounts')return;
  const matchedSet=new Set(matchedIndexes);const rows=monthRows.filter((_,i)=>matchedSet.has(i));
  // Aggregate once instead of running separate filter/reduce passes during every render.
  const expenseSummary=rows.reduce((acc,item)=>{
    if(item.approvalStatus==='pending')acc.pending++;
    if(item.approvalStatus==='approved')acc.approvedTotal+=(Number(item.amount)||0);
    return acc;
  },{pending:0,approvedTotal:0});
  const bal=isEmployee()?walletBalanceV54(currentUser.id):null;
  $('#app').innerHTML=`<div class="pagehead"><div><h1>${isEmployee()?'مصروفاتي':'مصروفات الشغل'}</h1><div class="sub">كل مصروف يرسله الموظف يظل معلقًا ولا يخصم من رصيده إلا بعد اعتماد هاني أو أماني.</div></div>${isEmployee()||canManageOffice()?'<button class="btn goldbtn" onclick="openForm(\'expense\')">'+(isEmployee()?'+ تسجيل مصروف عهدة':'+ تسجيل مصروف مكتب')+'</button>':''}</div>${isEmployee()?`<div class="stats"><div class="card"><div class="statlabel">رصيدي الحالي</div><div class="statnum gold">${moneyV54(bal)}</div></div><div class="card"><div class="statlabel">طلبات معلقة</div><div class="statnum">${expenseSummary.pending}</div></div></div>`:''}<div class="toolbar"><label>الشهر:</label><input type="month" value="${month}" onchange="window.accountMonth=this.value;render()"><input class="search" type="search" placeholder="بحث في المصروفات بالموكل أو البند أو البيان أو الموظف..." value="${esc(window.expenseSearchV54||'')}" oninput="window.expenseSearchV54=this.value;scheduleSearchRender()"></div><div class="stats"><div class="card"><div class="statlabel">إجمالي المصروفات المعتمدة</div><div class="statnum">${moneyV54(expenseSummary.approvedTotal)}</div></div><div class="card"><div class="statlabel">عدد الحركات</div><div class="statnum">${rows.length}</div></div></div>${table(['التاريخ','الموكل','البند','البيان','المبلغ','الموظف','الحالة','ملاحظة الاعتماد',...(canReview()?['الإجراء']:[])],rows.map(x=>`<tr><td>${esc(x.date||'—')}</td><td>${esc(x.client||'—')}</td><td>${esc(x.category||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td>${esc(x.employee||'—')}</td><td><span class="pill ${x.approvalStatus==='approved'?'done':x.approvalStatus==='rejected'?'late':'open'}">${x.approvalStatus==='approved'?'معتمد':x.approvalStatus==='rejected'?'مرفوض':'بانتظار الاعتماد'}</span></td><td>${esc(x.reviewNote||'—')}</td>${canReview()?`<td>${x.approvalStatus==='pending'?`<button class="btn light" type="button" data-expense-edit-id="${esc(x.cloudId)}">تعديل</button>`:'—'}</td>`:''}</tr>`))}`;
  setV54Page(isEmployee()?'مصروفاتي':'مصروفات الشغل','accounts');
}
function addEmployeeFundsV54(employeeId){
  if(!canManageOffice())return;
  const emp=(db.employees||[]).find(x=>x.id===employeeId);
  if(!emp){alert('لم يتم العثور على حساب الموظف. حدّث الحسابات وتحقق من حالة الحساب في المستخدمين.');return;}
  // Use an in-page dialog instead of window.prompt: Electron/embedded Chromium
  // may suppress or fail to display native prompt dialogs.
  const old=document.getElementById('employeeFundsDialogV928');if(old)old.remove();
  const overlay=document.createElement('div');overlay.id='employeeFundsDialogV928';
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.62);display:flex;align-items:center;justify-content:center;padding:18px;direction:rtl;font-family:Tahoma,Arial,sans-serif';
  overlay.innerHTML=`<section role="dialog" aria-modal="true" aria-labelledby="employeeFundsTitleV928" style="width:min(440px,100%);background:#fff;border-radius:14px;padding:22px;box-shadow:0 18px 60px #0008;color:#172536"><h3 id="employeeFundsTitleV928" style="margin:0 0 8px;color:#14283f">إضافة عهدة للموظف</h3><div style="margin-bottom:16px;color:#536273">الموظف: <b>${String(emp.name||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</b></div><label style="display:block;margin:10px 0 6px">المبلغ بالجنيه</label><input id="employeeFundsAmountV928" type="number" min="0.01" step="0.01" inputmode="decimal" style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5df;border-radius:8px;font-size:17px"><label style="display:block;margin:12px 0 6px">بيان الحركة</label><input id="employeeFundsDescV928" type="text" value="تغذية عهدة الموظف" style="box-sizing:border-box;width:100%;padding:12px;border:1px solid #cbd5df;border-radius:8px;font-size:15px"><div id="employeeFundsErrorV928" role="alert" style="color:#b42318;margin-top:9px;min-height:20px"></div><div style="display:flex;gap:10px;justify-content:flex-start;margin-top:12px"><button type="button" id="employeeFundsSaveV928" style="background:#b58a37;color:#fff;border:0;border-radius:8px;padding:10px 20px;cursor:pointer;font-weight:bold">حفظ العهدة</button><button type="button" id="employeeFundsCancelV928" style="background:#e8edf2;color:#243447;border:0;border-radius:8px;padding:10px 18px;cursor:pointer">إلغاء</button></div></section>`;
  document.body.appendChild(overlay);
  const amountInput=overlay.querySelector('#employeeFundsAmountV928');
  const descInput=overlay.querySelector('#employeeFundsDescV928');
  const saveBtn=overlay.querySelector('#employeeFundsSaveV928');
  const close=()=>overlay.remove();
  overlay.querySelector('#employeeFundsCancelV928').addEventListener('click',close);
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  amountInput.focus();
  saveBtn.addEventListener('click',async()=>{
    const amount=Number(amountInput.value);
    if(!Number.isFinite(amount)||amount<=0){overlay.querySelector('#employeeFundsErrorV928').textContent='أدخل مبلغًا صحيحًا أكبر من صفر.';amountInput.focus();return;}
    const description=(descInput.value||'').trim()||'تغذية عهدة الموظف';
    saveBtn.disabled=true;saveBtn.textContent='جارٍ الحفظ...';
    try{
      const {error}=await sb.from('wallet_transactions').insert({employee_id:emp.id,employee_name:emp.name,entry_type:'credit',amount,description,created_by:currentUser.id});
      if(error)throw error;
      close();
      try{await loadCloudState();alert('تمت إضافة العهدة بنجاح.');}
      catch(refreshError){alert('تم تسجيل العهدة على السحابة، لكن تعذر تحديث الشاشة: '+(refreshError.message||refreshError)+'. لا تعِد الإضافة حتى لا تتكرر الحركة.');}
    }catch(err){
      saveBtn.disabled=false;saveBtn.textContent='حفظ العهدة';
      overlay.querySelector('#employeeFundsErrorV928').textContent='تعذر إضافة العهدة: '+(err.message||err);
    }
  });
}
async function editPendingEmployeeExpenseV10(expenseId){
  if(!canReview()){alert('تعديل المصروفات المعلقة متاح للمدير ومديرة المكتب فقط.');return;}
  const item=(db.cloudExpenses||[]).find(x=>String(x.cloudId)===String(expenseId));
  if(!item||item.approvalStatus!=='pending'){alert('لا يمكن تعديل هذا المصروف؛ ربما تمت مراجعته بالفعل. حدّث الشاشة وحاول مرة أخرى.');return;}
  document.getElementById('maktabyPendingExpenseEditV10')?.remove();
  const escV10Edit=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const overlay=document.createElement('div');overlay.id='maktabyPendingExpenseEditV10';
  overlay.style.cssText='position:fixed;inset:0;z-index:2147483000;background:#10203399;display:flex;align-items:center;justify-content:center;padding:16px;direction:rtl';
  const currentClientName=String(item.client||'').trim();
  const clientOptions=(db.clients||[]).filter(c=>c&&String(c.name||'').trim()).map(c=>`<option value="${escV10Edit(String(c.name).trim())}"></option>`).join('');
  const isCurrentGeneral=!item.clientId&&currentClientName==='مصروفات عامة';
  overlay.innerHTML=`<section role="dialog" aria-modal="true" style="width:min(560px,100%);max-height:90vh;overflow:auto;background:#fff;color:#172536;border-radius:16px;padding:22px;box-shadow:0 18px 60px #0005"><h3 style="margin:0 0 6px">تعديل مصروف موظف — قبل الاعتماد</h3><p style="color:#64748b;margin:0 0 16px">الموظف: <b>${escV10Edit(item.employee||'—')}</b> · الحالة: معلق</p><div class="formgrid"><label style="grid-column:1/-1">اسم الموكل / مصروف مكتب<input id="mkExpEditClientV10" type="text" list="mkExpEditClientListV10" maxlength="200" required autocomplete="off" value="${escV10Edit(isCurrentGeneral?'مصروفات عامة':currentClientName)}" placeholder="اكتب للبحث باسم العميل"><datalist id="mkExpEditClientListV10"><option value="مصروفات عامة"></option>${clientOptions}</datalist><small style="display:block;color:#64748b;margin-top:5px">يمكنك الكتابة للبحث، لكن يجب أن يطابق الاسم عميلًا مسجلًا بالضبط، أو اكتب «مصروفات عامة».</small></label><label>قيمة المصروف<input id="mkExpEditAmountV10" type="number" min="0.01" step="0.01" value="${escV10Edit(item.amount)}"></label><label>تاريخ المصروف<input id="mkExpEditDateV10" type="date" value="${escV10Edit(item.date)}"></label><label>نوع المصروف<input id="mkExpEditTypeV10" type="text" maxlength="120" value="${escV10Edit(item.category)}"></label><label style="grid-column:1/-1">البيان / الوصف<input id="mkExpEditDescriptionV10" type="text" maxlength="1000" value="${escV10Edit(item.title)}"></label></div><p style="font-size:12px;color:#64748b">عند تغيير الموكل أو تحويل المصروف إلى مصروف مكتب عام، يُلغى أي ربط سابق بقضية أو اتفاق لهذا الطلب المعلق فقط؛ وسيُختار الاتفاق الصحيح عند الاعتماد إذا كان مصروف موكل.</p><div id="mkExpEditErrorV10" role="alert" style="color:#b42318;min-height:20px"></div><div class="actions"><button type="button" class="btn goldbtn" id="mkExpEditSaveV10">حفظ التعديلات</button><button type="button" class="btn light" id="mkExpEditCancelV10">إلغاء</button></div></section>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.querySelector('#mkExpEditCancelV10').onclick=close;overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  overlay.querySelector('#mkExpEditSaveV10').onclick=async()=>{
    const selectedClient=overlay.querySelector('#mkExpEditClientV10').value.trim();
    const normClientName=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
    const officeGeneral=normClientName(selectedClient)==='مصروفات عامة';
    const selectedClientRecord=(db.clients||[]).find(c=>c&&normClientName(c.name)===normClientName(selectedClient));
    const clientName=officeGeneral?'مصروفات عامة':String(selectedClientRecord?.name||'').trim();
    const amount=Number(overlay.querySelector('#mkExpEditAmountV10').value),date=overlay.querySelector('#mkExpEditDateV10').value;
    const expenseType=overlay.querySelector('#mkExpEditTypeV10').value.trim(),description=overlay.querySelector('#mkExpEditDescriptionV10').value.trim();
    const errorBox=overlay.querySelector('#mkExpEditErrorV10'),button=overlay.querySelector('#mkExpEditSaveV10');
    if(!Number.isFinite(amount)||amount<=0){errorBox.textContent='أدخل مبلغًا أكبر من صفر.';return;}
    if((!officeGeneral&&!selectedClientRecord)||!date||!expenseType||!description){errorBox.textContent='الاسم غير مسجل في العملاء. اكتب اسمًا مطابقًا لعميل موجود أو «مصروفات عامة»، وأكمل باقي البيانات.';return;}
    button.disabled=true;button.textContent='جارٍ الحفظ...';errorBox.textContent='';
    try{
      const {error}=await sb.rpc('update_pending_employee_expense_v10_v2',{p_expense_id:expenseId,p_client_name:clientName,p_amount:amount,p_expense_type:expenseType,p_description:description,p_expense_date:date});
      if(error)throw error;
      close();await loadCloudState();render();alert('تم حفظ تعديل المصروف. أصبح جاهزًا للمراجعة والاعتماد بالقيمة والبيانات الجديدة.');
    }catch(err){button.disabled=false;button.textContent='حفظ التعديلات';errorBox.textContent='تعذر حفظ التعديل: '+(err?.message||err);}
  };
}
window.editPendingEmployeeExpenseV10=editPendingEmployeeExpenseV10;

async function reviewEmployeeExpenseV54(expenseId,approve){
  if(!canReview())return;
  const note=prompt(approve?'ملاحظة الاعتماد (اختياري)':'سبب الرفض (اختياري)','');if(note===null)return;
  let feeFileId=null;
  if(approve){
    // General office expenses are never linked to a client agreement.
    const {data:expense,error:expenseError}=await sb.from('expenses').select('id,client_id,case_id,client_name,fee_file_id').eq('id',expenseId).single();
    if(expenseError)throw expenseError;
    const norm=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
    const isGeneralExpense=norm(expense.client_name)==='مصروفات عامة';
    if(!isGeneralExpense){
      let fq=(isAdmin()?sb.from('fee_files'):sb.from('fee_files_lookup')).select(isAdmin()?'id,title,case_number,client_name,client_id,case_id,agreed_amount':'id,title,case_number,client_name,client_id,case_id').eq('status','open').order('created_at',{ascending:false});
      if(expense.client_id)fq=fq.eq('client_id',expense.client_id);
      const {data:files,error:fileError}=await fq;
      if(fileError)throw fileError;
      const eligible=(files||[]).filter(f=>{
        const sameClient=expense.client_id?String(f.client_id||'')===String(expense.client_id):!!norm(expense.client_name)&&norm(f.client_name)===norm(expense.client_name);
        const sameCase=!expense.case_id||String(f.case_id||'')===String(expense.case_id);
        return sameClient&&sameCase;
      });
      if(!eligible.length){
        // Legacy agreements are stored in the synchronized office state, not in fee_files.
        // Convert only an explicitly matched agreement into a fee_files accounting reference.
        const legacy=(Array.isArray(db.clientFeeAgreements)?db.clientFeeAgreements:[]).filter(a=>!a.deletedAt&&!a.voidedAt&&norm(a.client)===norm(expense.client_name));
        if(!legacy.length)throw new Error('لم نعثر على اتفاق أتعاب مطابق في ملفات الحسابات أو في الاتفاقات القديمة المتزامنة. راجع اسم الموكل في الاتفاق، ثم افتح «الاتفاق والحسابات» وتأكد من حفظ الاتفاق.');
        let chosenLegacy=legacy[0];
        if(legacy.length>1){const choices=legacy.map((a,i)=>`${i+1}) ${a.description||'اتفاق أتعاب'} — القضية: ${a.caseNumber||'غير محددة'} — المتفق: ${Number(a.total||0)} ج`).join('\n');const answer=prompt('وجدنا أكثر من اتفاق قديم بنفس اسم الموكل. اختر الاتفاق الصحيح قبل الاعتماد:\n'+choices,'1');if(answer===null)return;const n=Number(answer);if(!Number.isInteger(n)||n<1||n>legacy.length)throw new Error('رقم الاتفاق المختار غير صحيح.');chosenLegacy=legacy[n-1];}
        if(!(Number(chosenLegacy.total)>0))throw new Error('الاتفاق القديم لا يحتوي قيمة أتعاب صحيحة؛ راجعه قبل الاعتماد.');
        const legacyId=String(chosenLegacy.id||'');if(!legacyId)throw new Error('الاتفاق القديم لا يحتوي رقمًا تعريفيًا؛ تعذر ربطه بأمان.');
        const {data:created,error:createError}=await sb.from('fee_files').insert({client_name:String(chosenLegacy.client||expense.client_name),case_number:String(chosenLegacy.caseNumber||''),title:String(chosenLegacy.description||'اتفاق أتعاب'),agreed_amount:Number(chosenLegacy.total),legacy_agreement_id:legacyId,status:'open'}).select('id,title,case_number,client_name,agreed_amount').single();
        if(createError){const {data:existing,error:lookupError}=await sb.from('fee_files').select('id,title,case_number,client_name,agreed_amount').eq('legacy_agreement_id',legacyId).maybeSingle();if(lookupError||!existing)throw new Error('تعذر إنشاء مرجع محاسبي للاتفاق القديم: '+(createError.message||createError));eligible.push(existing);}else eligible.push(created);
      }
      let selected=eligible.find(f=>String(f.id)===String(expense.fee_file_id));
      if(!selected){
        const choices=eligible.map((f,i)=>`${i+1}) ${f.title||'اتفاق بدون عنوان'} — ${f.case_number||'بدون رقم قضية'}${isAdmin()?' — '+f.agreed_amount+' ج':''}`).join('\n');
        const answer=prompt('اختر اتفاق الأتعاب الذي سيُرحّل إليه المصروف بكتابة رقمه:\n'+choices,'1');
        if(answer===null)return;
        const n=Number(answer);if(!Number.isInteger(n)||n<1||n>eligible.length)throw new Error('رقم الاتفاق المختار غير صحيح.');
        selected=eligible[n-1];
      }
      feeFileId=selected.id;
    }
  }
  const {error}=await sb.rpc('review_employee_expense_atomic',{p_expense_id:expenseId,p_approve:!!approve,p_note:note,p_fee_file_id:feeFileId});
  if(error)throw error;
  await loadCloudState();
  alert(approve?(feeFileId?'تم اعتماد المصروف وخصمه من عهدة الموظف وترحيله إلى اتفاق الأتعاب.':'تم اعتماد المصروف العام دون ربطه باتفاق أتعاب.'):'تم رفض المصروف ولم يُخصم من عهدة الموظف.');
}
function fixedCommitmentViewV940(c,index){
  const title=String(c?.title??c?.item??'التزام غير مسمى');
  const amount=Number(c?.amount??c?.monthlyAmount)||0;
  const dueDay=Number(c?.dueDay)||1;
  const identity='fixed:'+JSON.stringify([title.trim().replace(/\s+/g,' ').toLocaleLowerCase('ar'),amount,dueDay]);
  return {...c,id:c?.id||('legacy-'+identity),title,amount,dueDay,active:c?.active!==false};
}
// Keep the source-array index attached while hiding soft-deleted rows.
// UI actions must target the original db.fixedCommitments index, never the filtered index.
function activeFixedCommitmentEntries(rows){
  return (Array.isArray(rows)?rows:[]).map((raw,index)=>({index,commitment:fixedCommitmentViewV940(raw,index)}))
    .filter(entry=>entry.commitment.active!==false);
}
function addFixedCommitmentV54(){
  if(!canManageOffice())return;
  const title=prompt('اسم الالتزام الثابت (مثل الإيجار أو الإنترنت)');if(!title)return;
  const amount=Number(prompt('القيمة الشهرية بالجنيه','0'));if(!Number.isFinite(amount)||amount<=0){alert('أدخل مبلغًا صحيحًا.');return;}
  const dueDay=Number(prompt('يوم الاستحقاق من الشهر (1 إلى 31)','1'))||1;
  db.fixedCommitments=db.fixedCommitments||[];db.fixedCommitments.push({id:'commit-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),title:title.trim(),amount,dueDay:Math.min(31,Math.max(1,dueDay)),active:true,createdAt:new Date().toISOString(),createdBy:currentUser?.id||null});save();
}
function editFixedCommitmentV54(i){
 if(!canManageOffice())return;const raw=(db.fixedCommitments||[])[i];if(!raw)return;const c=fixedCommitmentViewV940(raw,i);
 const title=prompt('تعديل اسم الالتزام',c.title);if(title===null)return;if(!title.trim()){alert('اسم الالتزام مطلوب.');return;}
 const amountRaw=prompt('تعديل القيمة الشهرية بالجنيه',String(c.amount));if(amountRaw===null)return;const amount=Number(amountRaw);if(!Number.isFinite(amount)||amount<=0){alert('أدخل مبلغًا صحيحًا أكبر من صفر.');return;}
 const dayRaw=prompt('تعديل يوم الاستحقاق (1 إلى 31)',String(c.dueDay));if(dayRaw===null)return;const dueDay=Number(dayRaw);if(!Number.isInteger(dueDay)||dueDay<1||dueDay>31){alert('يوم الاستحقاق يجب أن يكون من 1 إلى 31.');return;}
 db.fixedCommitments[i]={...raw,id:c.id,title:title.trim(),amount,dueDay,active:true};save();render();
}
function deleteFixedCommitmentV54(i){
 if(!canManageOffice())return;const raw=(db.fixedCommitments||[])[i];if(!raw)return;const c=fixedCommitmentViewV940(raw,i);
 if(!confirm('تأكيد حذف الالتزام «'+c.title+'» من القائمة؟\nلن يتم حذف أي حركات سداد سابقة أو تعديل الحسابات التاريخية.'))return;
 // Soft-delete to preserve payment history and prevent orphaning past transactions.
 db.fixedCommitments[i]={...raw,id:c.id,active:false};save();render();
}
async function payFixedCommitmentV54(i){
  if(!canManageOffice())return;
  // A local action lock prevents a rapid double-click from recording two payments.
  if(window.__maktabyFixedPaymentBusy){alert('جارٍ تسجيل عملية سداد أخرى؛ انتظر اكتمالها.');return;}
  window.__maktabyFixedPaymentBusy=true;
  try{
    const rawCommitment=(db.fixedCommitments||[])[i];if(!rawCommitment)return;
    const c=fixedCommitmentViewV940(rawCommitment,i),month=window.officeMonthV54||today().slice(0,7);
    const paid=(db.transactions||[]).filter(x=>x.commitmentId===c.id&&x.commitmentMonth===month).reduce((s,x)=>s+(Number(x.amount)||0),0);
    const remaining=Math.max(0,Number(c.amount)-paid);
    if(remaining<=0.00001){alert('تم سداد الالتزام بالكامل عن هذا الشهر.');return;}
    const raw=prompt('المبلغ المراد سداده الآن؟\nقيمة الالتزام: '+moneyV54(c.amount)+'\nالمسدد سابقًا: '+moneyV54(paid)+'\nالمتبقي: '+moneyV54(remaining),String(remaining));
    if(raw===null)return;const amount=Number(raw);
    if(!Number.isFinite(amount)||amount<=0){alert('أدخل مبلغًا صحيحًا أكبر من صفر.');return;}
    if(amount>remaining+0.00001){alert('المبلغ أكبر من المتبقي. المتبقي '+moneyV54(remaining));return;}
    db.transactions.push({id:'tx-'+(globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)),date:today(),kind:'منصرف',category:'التزامات ثابتة',client:'',title:c.title,amount,notes:'سداد '+(amount>=remaining-0.00001?'نهائي':'جزئي')+' لالتزام ثابت',enteredBy:currentUser.name,commitmentId:c.id,commitmentMonth:month,createdAt:new Date().toISOString()});
    await save();
  }finally{window.__maktabyFixedPaymentBusy=false;}
}
function renderOfficeAccountsV54(){
  if(!canManageOffice()){alert('الحسابات متاحة للمدير ومديرة المكتب فقط.');page='dashboard';render();return;}
  const month=window.officeMonthV54||today().slice(0,7);
  const inc=(db.transactions||[]).filter(x=>x.kind==='وارد'&&String(x.date||'').startsWith(month));
  const oldOut=(db.transactions||[]).filter(x=>x.kind==='منصرف'&&String(x.date||'').startsWith(month));
  const exp=(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='approved'&&String(x.date||'').startsWith(month));
  const officeExpenseQ=(window.officeExpenseSearchV54||'').trim().toLocaleLowerCase('ar');
  const oldOutShown=oldOut.filter(x=>!officeExpenseQ||[x.client,x.category,x.title,x.enteredBy].some(v=>String(v||'').toLocaleLowerCase('ar').includes(officeExpenseQ)));
  const expShown=exp.filter(x=>!officeExpenseQ||[x.client,x.category,x.title,x.employee].some(v=>String(v||'').toLocaleLowerCase('ar').includes(officeExpenseQ)));
  const incomeTotal=inc.reduce((s,x)=>s+(+x.amount||0),0);
  const manualExpenseTotal=oldOut.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const approvedEmployeeExpenseTotal=exp.reduce((s,x)=>s+(Number(x.amount)||0),0);
  const expenseTotal=manualExpenseTotal+approvedEmployeeExpenseTotal;
  const balance=incomeTotal-expenseTotal;
  const allIncome=(db.transactions||[]).filter(x=>x.kind==='وارد').reduce((s,x)=>s+(+x.amount||0),0);
  const allOldOut=(db.transactions||[]).filter(x=>x.kind==='منصرف').reduce((s,x)=>s+(+x.amount||0),0);
  const allApproved=(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='approved').reduce((s,x)=>s+(+x.amount||0),0);
  const cumulativeBalance=allIncome-allOldOut-allApproved;
  const pending=(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='pending');
  const commitments=activeFixedCommitmentEntries(db.fixedCommitments);
  const commitmentTotal=commitments.reduce((s,x)=>s+(Number(x.commitment.amount)||0),0);
  const paidIds=new Set((db.transactions||[]).filter(x=>x.commitmentMonth===month&&x.commitmentId).map(x=>x.commitmentId));
  const staff=(db.employees||[]).filter(x=>x.role==='employee'||x.role==='office_manager');
  $('#app').innerHTML=`<div class="pagehead"><div><h1>الحسابات — الإدارة</h1><div class="sub">ملخص الوارد والمصروفات والرصيد النقدي، مع أرصدة عهد الموظفين والالتزامات الثابتة.</div></div><div class="actions"><button class="btn goldbtn" onclick="openForm('transaction')">+ تسجيل حركة مالية</button><div class="toolbar"><label>الشهر:</label><input type="month" value="${month}" onchange="window.officeMonthV54=this.value;render()"></div></div></div><div class="stats"><div class="card"><div class="statlabel">إجمالي الوارد للشهر</div><div class="statnum gold">${moneyV54(incomeTotal)}</div></div><div class="card"><div class="statlabel">إجمالي المصروفات المعتمدة</div><div class="statnum">${moneyV54(expenseTotal)}</div><div class="sub">حركات منصرف المكتب: ${moneyV54(manualExpenseTotal)} + مصروفات الموظفين المعتمدة: ${moneyV54(approvedEmployeeExpenseTotal)}</div></div><div class="card"><div class="statlabel">رصيد المكتب (الوارد − المصروفات)</div><div class="statnum ${balance>=0?'gold':''}">${moneyV54(balance)}</div></div><div class="card"><div class="statlabel">الالتزامات الثابتة الشهرية</div><div class="statnum">${moneyV54(commitmentTotal)}</div></div><div class="card"><div class="statlabel">صافي الرصيد التراكمي المسجل</div><div class="statnum gold">${moneyV54(cumulativeBalance)}</div></div></div><section class="panel" style="margin-bottom:16px"><div class="pagehead"><h3>طلبات مصروفات الشغل المعلقة (${pending.length})</h3></div>${table(['الموظف','التاريخ','الموكل','البيان','المبلغ','رصيد الموظف قبل الاعتماد','الإجراء'],pending.map(x=>`<tr><td>${esc(x.employee||'—')}</td><td>${esc(x.date)}</td><td>${esc(x.client||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td>${moneyV54(walletBalanceV54(x.employeeId))}</td><td><button class="btn light" type="button" data-expense-edit-id="${esc(x.cloudId)}">تعديل</button> <button class="btn goldbtn maktaby-expense-review" type="button" data-expense-review-id="${esc(x.cloudId)}" data-expense-approve="1">اعتماد وخصم</button> <button class="btn light maktaby-expense-review" type="button" data-expense-review-id="${esc(x.cloudId)}" data-expense-approve="0">رفض</button></td></tr>`))}</section><section class="panel" style="margin-bottom:16px"><div class="pagehead"><h3>أرصدة الموظفين</h3></div>${table(['الموظف','الرصيد الحالي','إضافة رصيد'],staff.map(e=>`<tr><td>${esc(e.name)}</td><td><strong>${moneyV54(walletBalanceV54(e.id))}</strong></td><td><button class="btn goldbtn" onclick="addEmployeeFundsV54('${e.id}')">إضافة عهدة</button></td></tr>`))}</section><section class="panel" style="margin-bottom:16px"><div class="pagehead"><h3>الالتزامات الثابتة</h3><button class="btn goldbtn" onclick="addFixedCommitmentV54()">+ إضافة التزام</button></div>${table(['الالتزام','القيمة الشهرية','يوم الاستحقاق','المسدد هذا الشهر','المتبقي','حالة السداد','الإجراء'],commitments.map(({commitment:c,index:sourceIndex})=>{const paid=(db.transactions||[]).filter(x=>x.commitmentId===c.id&&x.commitmentMonth===month).reduce((s,x)=>s+(Number(x.amount)||0),0);const remaining=Math.max(0,Number(c.amount)-paid);const status=remaining<=0.00001?'تم السداد':paid>0?'سداد جزئي':'لم يسدد';return `<tr><td>${esc(c.title)}</td><td>${moneyV54(c.amount)}</td><td>${c.dueDay||'—'}</td><td>${moneyV54(paid)}</td><td>${moneyV54(remaining)}</td><td><span class="pill ${remaining<=0.00001?'done':paid>0?'open':'late'}">${status}</span></td><td>${remaining>0.00001?`<button class="btn light" onclick="payFixedCommitmentV54(${sourceIndex})">تسجيل سداد</button> `:''}<button class="btn light" onclick="editFixedCommitmentV54(${sourceIndex})">تعديل</button> <button class="btn danger" onclick="deleteFixedCommitmentV54(${sourceIndex})">حذف</button></td></tr>`}))}</section><section class="panel"><h3>تفاصيل حركة الشهر</h3><div class="toolbar"><input class="search" type="search" placeholder="بحث في المصروفات بالموكل أو البند أو البيان أو الموظف..." value="${esc(window.officeExpenseSearchV54||'')}" oninput="window.officeExpenseSearchV54=this.value;scheduleSearchRender()"></div><h4>الوارد</h4>${table(['التاريخ','الموكل','البيان','المبلغ'],inc.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.client||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td></tr>`))}<h4>المصروفات المعتمدة</h4>${table(['التاريخ','الموكل','البند','البيان','المبلغ','الموظف'],[...oldOutShown.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.client||'—')}</td><td>${esc(x.category||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td>${esc(x.enteredBy||'—')}</td></tr>`),...expShown.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.client||'—')}</td><td>${esc(x.category||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td>${esc(x.employee||'—')}</td></tr>`)])}</section>`;
  setV54Page('الحسابات','officeAccounts');
}
async function openClientDocumentV54(id){
  let doc=(db.clientDocuments||[]).find(x=>String(x.id)===String(id));
  if(!doc){alert('بيانات الملف غير موجودة في القائمة. حدّث ملف الموكل وحاول مرة أخرى.');return;}
  const win=window.open('about:blank','_blank');
  try{
    const {data,error}=await sb.storage.from('client-documents').createSignedUrl(doc.storage_path,300,{download:doc.file_name||true});
    if(error)throw error;
    if(!data?.signedUrl)throw new Error('لم يتم إنشاء رابط تحميل للملف.');
    if(win)win.location.href=data.signedUrl;else window.location.href=data.signedUrl;
  }catch(e){if(win)win.close();console.error('openClientDocumentV54',e);alert('تعذر فتح / تحميل الملف: '+(e?.message||String(e)));}
}
async function uploadClientDocumentV54(){
  if(!canManageOffice()){alert('رفع مستندات الموكل متاح للمدير ومديرة المكتب.');return;}
  const input=$('#clientDocumentFileV54');const file=input?.files?.[0];
  if(!file){alert('اختر صورة أو ملفًا أولًا.');return;}
  if(file.size>10*1024*1024){alert('الحد الأقصى لحجم الملف 10 ميجابايت.');return;}
  const button=document.querySelector('button[onclick="uploadClientDocumentV54()"]');
  if(button){button.disabled=true;button.dataset.oldText=button.textContent;button.textContent='جارٍ الرفع والحفظ...';}
  const category=$('#clientDocumentCategoryV54')?.value||'مستند';const isPhoto=category==='صورة الموكل';
  const ext=(file.name.match(/\.([A-Za-z0-9]{1,10})$/)||[])[1]?.toLowerCase()||'bin';
  // Storage keys use ASCII-only generated names; original Arabic filename stays in client_documents.file_name.
  const path=`clients/${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;
  try{
    const {error:upError}=await sb.storage.from('client-documents').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(upError){const m=upError.message||String(upError);if(/mime type .* not supported|mime type.*not supported/i.test(m))throw new Error('نوع الملف غير مسموح به في إعدادات مساحة التخزين client-documents. يلزم إضافة نوع الملف إلى Allowed MIME types في Supabase (أو جعلها غير محددة).');throw new Error('فشل رفع الملف إلى مساحة التخزين (client-documents). التفاصيل: '+m+' — راجع وجود Bucket وسياسات INSERT/SELECT.');}
    const payload={client_name:selectedClientNameV54,category,file_name:file.name,storage_path:path,mime_type:file.type||'application/octet-stream',size_bytes:file.size,is_profile_photo:isPhoto,uploaded_by:currentUser.id};
    const {data:inserted,error:dbError}=await sb.from('client_documents').insert(payload).select('id,client_name,category,file_name,storage_path,mime_type,size_bytes,is_profile_photo,uploaded_by,created_at').single();
    if(dbError){console.error('client_documents insert failed; storage object retained',dbError,path);alert('تم رفع الملف إلى التخزين، لكن تعذر تسجيله في قائمة مستندات الموكل. لم نحذف الملف حتى لا يضيع. سبب المشكلة: '+dbError.message);return;}
    const saved=inserted||{...payload,id:crypto.randomUUID(),created_at:new Date().toISOString()};
    db.clientDocuments=[saved,...(db.clientDocuments||[]).filter(x=>x.storage_path!==path)];
    localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
    if(input)input.value='';
    await renderClientProfileV54();
    alert('تم رفع الملف وحفظه، وأصبح ظاهرًا الآن في قائمة المستندات.');
  }catch(err){console.error('uploadClientDocumentV54',err);alert(err.message||'حدث خطأ غير متوقع أثناء رفع الملف.');}
  finally{if(button){button.disabled=false;button.textContent=button.dataset.oldText||'رفع وحفظ';}}
}
async function renderClientProfileV54(){
  const c=(db.clients||[]).find(x=>x.name===selectedClientNameV54);if(!c){page='clients';render();return;}
  const cases=(db.cases||[]).filter(x=>x.client===c.name&&!x.archived);
  const ads=[...(db.announcements||[]),...(db.announcementArchive||[])].filter(x=>x.client===c.name);
  // Always fetch this client's documents directly from Supabase; do not rely only on the cached office state.
  let docs=[]; let docsLoadError='';
  try{
    const {data:clientDocs,error:clientDocsError}=await sb.from('client_documents').select('id,client_name,category,file_name,storage_path,mime_type,size_bytes,is_profile_photo,uploaded_by,created_at').eq('client_name',c.name).order('created_at',{ascending:false});
    if(clientDocsError) throw clientDocsError;
    docs=clientDocs||[];
    db.clientDocuments=[...docs,...(db.clientDocuments||[]).filter(x=>x.client_name!==c.name)];
  }catch(e){
    docsLoadError=e?.message||String(e);
    console.error('client documents list failed',e);
    docs=(db.clientDocuments||[]).filter(x=>x.client_name===c.name);
  }
  const expenses=(db.cloudExpenses||[]).filter(x=>x.client===c.name&&(isEmployee()?x.employeeId===currentUser.id:true));
  const clientOfficeExpenses=canManageOffice()?(db.transactions||[]).filter(x=>x.kind==='منصرف'&&x.client===c.name):[];
  const income=canManageOffice()?(db.transactions||[]).filter(x=>x.kind==='وارد'&&x.client===c.name):[];
  $('#app').innerHTML=`<div class="pagehead"><div><h1>ملف الموكل: ${esc(c.name)}</h1><div class="sub">ملف موحد يضم البيانات الأساسية والقضايا والإعلانات والمستندات والحركة المالية.</div></div><div class="actions"><button class="btn light" onclick="page='clients';render()">العودة للموكلين</button>${canManageOffice()?`<button class="btn goldbtn" onclick="editClient(${db.clients.indexOf(c)})">تعديل بيانات الموكل</button>`:''}</div></div><section class="panel" style="margin-bottom:16px"><div class="grid"><div><h3>البيانات الأساسية</h3><p><b>رقم التوكيل:</b> ${esc(c.powerOfAttorneyNo||'—')}</p><p><b>الهاتف:</b> ${esc(c.phone||'—')} ${c.phone2?' / '+esc(c.phone2):''}</p><p><b>موضوع الموكل:</b> ${esc(c.subject||'—')}</p><p><b>ملاحظات:</b> ${esc(c.notes||'—')}</p></div><div><h3>صورة الموكل</h3><div id="clientPhotoV54" class="empty">لا توجد صورة مرفوعة</div></div></div></section><section class="panel" style="margin-bottom:16px"><div class="pagehead"><h3>المستندات والصور</h3>${canManageOffice()?`<div class="actions"><select id="clientDocumentCategoryV54"><option>مستند</option><option>بطاقة / هوية</option><option>توكيل</option><option>صورة الموكل</option><option>أخرى</option></select><input id="clientDocumentFileV54" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf"><button class="btn goldbtn" onclick="uploadClientDocumentV54()">رفع وحفظ</button></div>`:''}</div>${docsLoadError?`<div class="empty" style="color:#9b2c2c">تعذر تحميل قائمة المستندات من قاعدة البيانات: ${esc(docsLoadError)}</div>`:''}${docs.length?table(['اسم الملف','التصنيف','تاريخ الرفع','الحجم','الفتح / التحميل'],docs.map(d=>`<tr><td>${esc(d.file_name||'ملف بدون اسم')}</td><td>${esc(d.category||'مستند')}</td><td>${esc(String(d.created_at||'').slice(0,10))}</td><td>${((Number(d.size_bytes)||0)/1024/1024).toFixed(2)} MB</td><td><button class="btn light" onclick="openClientDocumentV54('${d.id}')">عرض / تحميل</button></td></tr>`)): `<div class="empty">لا توجد مستندات مسجلة لهذا الموكل حتى الآن.</div>`}</section><section class="panel" style="margin-bottom:16px"><h3>القضايا والجلسات</h3>${table(['رقم الدعوى','المحكمة','تاريخ الجلسة الحالية','القرار / المطلوب'],cases.map(x=>`<tr><td>${esc(x.number||'—')}</td><td>${esc(x.court||'—')}</td><td>${esc(x.date||'—')}</td><td>${esc(x.result||x.adjournment||x.action||'—')}</td></tr>`))}</section><section class="panel" style="margin-bottom:16px"><h3>الإعلانات</h3>${table(['رقم الإعلان','المحكمة','تاريخ التسليم','تاريخ الاستلام','من استلم'],ads.map(x=>`<tr><td>${esc(x.number||'—')}</td><td>${esc(x.court||'—')}</td><td>${esc(x.deliveryDate||'—')}</td><td>${esc(x.receivedDate||'—')}</td><td>${esc(x.receivedBy||'—')}</td></tr>`))}</section>${canManageOffice()||isEmployee()?`<section class="panel" style="margin-bottom:16px"><h3>مصروفات الموكل</h3>${table(['التاريخ','البند','البيان','المبلغ','الموظف','الحالة'],[...expenses.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.category||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td>${esc(x.employee||'—')}</td><td>${esc(x.approvalStatus==='approved'?'معتمد':x.approvalStatus==='rejected'?'مرفوض':'معلق')}</td></tr>`),...clientOfficeExpenses.map(x=>`<tr><td>${esc(x.date)}</td><td>${esc(x.category||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td>${esc(x.enteredBy||'—')}</td><td>معتمد</td></tr>`)])}</section>`:''}`;
  setV54Page('ملف الموكل','clients');
  if(typeof window.mountFeeAccountsV10==='function') window.mountFeeAccountsV10({type:'client',id:c.id||c.name,name:c.name,container:$('#app')});
  const photo=docs.find(x=>x.is_profile_photo);if(photo){const {data}=await sb.storage.from('client-documents').createSignedUrl(photo.storage_path,300);if(data?.signedUrl)$('#clientPhotoV54').innerHTML=`<img src="${data.signedUrl}" alt="صورة الموكل" style="max-width:180px;max-height:180px;object-fit:contain;border-radius:12px">`;}
}
function renderAnnouncementsV54(){
  const q=(window.announcementSearch||'').trim().toLocaleLowerCase('ar');
  const rows=(db.announcements||[]).map((a,index)=>({a,index})).filter(({a})=>!a.archived&&!a.delivered&&(!q||[a.client,a.number,a.court,a.bailiff,a.kind,a.status].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q)))).sort((x,y)=>{
    const courtX=String(x.a.court||'محكمة غير محددة').trim(),courtY=String(y.a.court||'محكمة غير محددة').trim();
    const courtOrder=courtX.localeCompare(courtY,'ar',{sensitivity:'base'});
    return courtOrder||String(x.a.deliveryDate||'9999-12-31').localeCompare(String(y.a.deliveryDate||'9999-12-31'));
  });
  let selected=rows.find(x=>x.index===Number(window.announcementSelectedIndex));
  if(!selected&&rows.length){selected=rows[0];window.announcementSelectedIndex=selected.index;}
  const a=selected?.a, idx=selected?.index;
  const state=a?.status||'قيد الإعلان';
  const stateClass=state==='تم الاستلام'?'received':state==='تم الإعلان'?'done':state==='بانتظار الاستلام'?'waiting':state.includes('أعيد')?'returned':'pending';
  const action=isLimitedStaff()?`<button class="btn light" onclick="event.stopPropagation();editAnnouncement(${idx})">طلب تعديل</button> <button class="btn goldbtn" onclick="event.stopPropagation();requestAnnouncementReceived(${idx})">طلب اعتماد الاستلام</button>`:isEmployee()?`<button class="btn goldbtn" onclick="event.stopPropagation();requestAnnouncementReceived(${idx})">طلب اعتماد الاستلام</button>`:canManageOffice()?`<button class="btn light" onclick="event.stopPropagation();editAnnouncement(${idx})">تعديل</button> <button class="btn goldbtn" onclick="event.stopPropagation();markAnnouncementReceived(${idx})">تأكيد الاستلام</button>`:'—';
  const statusControl=canManageOffice()&&a?`<label class="v109-ad-status-control">تحديث حالة الإعلان<select onchange="setAnnouncementLifecycleV10(${idx},this.value)">${['تم التسليم للمحضرين','قيد الإعلان','أعلن لجهة الإدارة','أعيد بدون إعلان لعدم الاستدلال','تم الإعلان','تم الاستلام'].map(st=>`<option value="${esc(st)}" ${(a.status||'قيد الإعلان')===st?'selected':''}>${esc(st)}</option>`).join('')}</select></label>`:'';
  const details=a?`<section class="panel v109-ad-detail" aria-live="polite">
    <div class="v109-ad-detail-head"><h3>بيان الإعلان المحدد</h3><span class="v109-ad-badge ${stateClass}">${esc(state)}</span></div>
    <div class="v109-ad-detail-grid">
      <div><span>الموكل</span><b>${esc(a.client||'—')}</b></div><div><span>رقم الإعلان</span><b>${esc(a.number||'—')}</b></div><div><span>المحكمة</span><b>${esc(a.court||'—')}</b></div>
      <div><span>نوع الإعلان</span><b>${esc(a.kind||'—')}</b></div><div><span>تاريخ التسليم للمحضرين</span><b>${esc(a.deliveryDate||'—')}</b></div><div><span>تاريخ الجلسة</span><b>${esc(a.session||'—')}</b></div>
      <div><span>المحضر</span><b>${esc(a.bailiff||'—')}</b></div><div><span>تاريخ الاستلام</span><b>${esc(a.receivedDate||'—')}</b></div><div><span>من استلم</span><b>${esc(a.receivedBy||'—')}</b></div>
      <div class="wide"><span>ملاحظات الإعلان</span><b>${esc(a.notes||'—')}</b></div>
    </div>
    <div class="v109-ad-detail-actions">${statusControl}<div class="v109-ad-buttons">${action}</div></div>
  </section>`:`<section class="panel v109-ad-detail v109-ad-empty"><h3>بيان الإعلان</h3><p>لا توجد إعلانات مطابقة للبحث حاليًا.</p></section>`;
  $('#app').innerHTML=`<div class="pagehead"><div><h1>الإعلانات</h1><div class="sub">متابعة الإعلان وتاريخ التسليم والاستلام واسم مستلم الإعلان.</div></div>${canManageOffice()||isLimitedStaff()?`<button class="btn goldbtn" onclick="openForm('announcement')">${isLimitedStaff()?'طلب إضافة إعلان':'+ إضافة إعلان'}</button>`:''}</div>
  <div class="toolbar v109-ad-toolbar"><input class="search" type="search" placeholder="بحث بالموكل أو رقم الإعلان أو المحكمة أو المحضر..." value="${esc(window.announcementSearch||'')}" oninput="window.announcementSearch=this.value;scheduleSearchRender()"></div>
  <section class="panel v109-ad-list-panel"><div class="v109-ad-list-title"><h3>قائمة الإعلانات</h3><span>${rows.length} إعلان</span></div><div class="v109-ad-table-scroll"><table class="v109-ad-table"><thead><tr><th>#</th><th>الموكل</th><th>رقم الدعوى</th><th>المحكمة</th><th>نوع الإعلان</th><th>تاريخ الإعلان</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>${(()=>{let lastCourt=null;return rows.map(({a:r,index},n)=>{const court=String(r.court||'محكمة غير محددة').trim()||'محكمة غير محددة';const heading=court!==lastCourt?`<tr class="v109-ad-court-group"><td colspan="8"><span>⚖ ${esc(court)}</span><small>${rows.filter(x=>(String(x.a.court||'محكمة غير محددة').trim()||'محكمة غير محددة')===court).length} إعلان</small></td></tr>`:'';lastCourt=court;return heading+`<tr class="${index===idx?'selected':''}" onclick="window.announcementSelectedIndex=${index};renderAnnouncementsV54()"><td>${n+1}</td><td>${esc(r.client||'—')}</td><td>${esc(r.number||'—')}</td><td class="v109-ad-court-cell">${esc(r.court||'—')}</td><td>${esc(r.kind||'—')}</td><td>${esc(r.deliveryDate||'—')}</td><td><span class="v109-ad-badge ${((r.status||'قيد الإعلان')==='تم الاستلام'?'received':(r.status||'').includes('تم الإعلان')?'done':(r.status||'').includes('بانتظار')?'waiting':(r.status||'').includes('أعيد')?'returned':'pending')}">${esc(r.status||'قيد الإعلان')}</span></td><td><button class="v109-ad-more" type="button" onclick="event.stopPropagation();window.announcementSelectedIndex=${index};renderAnnouncementsV54()">•••</button></td></tr>`;}).join('')})()||`<tr><td colspan="8" class="empty">لا توجد إعلانات قيد المتابعة.</td></tr>`}</tbody></table></div></section>${details}`;
  setV54Page('الإعلانات','announcements');
}
render = function(){
  if(page==='officeAccounts'){renderOfficeAccountsV54();return;}
  if(page==='clientProfile'){renderClientProfileV54();return;}
  if(page==='clients'){renderClientsV54();return;}
  if(page==='accounts'){renderEmployeeExpensesV54();return;}
  if(page==='announcements'){renderAnnouncementsV54();return;}
  renderV53Original();
  if(page==='approvals'&&canReview()){const pendingExpenses=(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='pending');$('#app').insertAdjacentHTML('beforeend',`<section class="panel" style="margin-top:18px"><h3>طلبات اعتماد مصروفات الشغل (${pendingExpenses.length})</h3>${table(['الموظف','التاريخ','الموكل','البيان','المبلغ','الإجراء'],pendingExpenses.map(x=>`<tr><td>${esc(x.employee||'—')}</td><td>${esc(x.date||'—')}</td><td>${esc(x.client||'—')}</td><td>${esc(x.title||'—')}</td><td>${moneyV54(x.amount)}</td><td><button class="btn light" type="button" data-expense-edit-id="${esc(x.cloudId)}">تعديل</button> <button class="btn goldbtn maktaby-expense-review" type="button" data-expense-review-id="${esc(x.cloudId)}" data-expense-approve="1">اعتماد وخصم</button> <button class="btn light maktaby-expense-review" type="button" data-expense-review-id="${esc(x.cloudId)}" data-expense-approve="0">رفض</button></td></tr>`))}</section>`);}
  const nav=document.getElementById('officeAccountsNav');if(nav)nav.style.display=canManageOffice()?'block':'none';
  const a=document.querySelector('[data-page="accounts"]');if(a)a.textContent=isEmployee()?'مصروفاتي':'مصروفات الشغل';
};

// Expenses submitted by employees remain pending; manager-entered office expenses are immediately approved.
const expenseSubmitV54Original = $('#form').onsubmit;
$('#form').onsubmit = function(e){
  if(formType==='client' && editingClientIndexV54!==null){
    e.preventDefault();const obj=Object.fromEntries(new FormData(e.target).entries());const old=db.clients[editingClientIndexV54];db.clients[editingClientIndexV54]={...old,...obj};editingClientIndexV54=null;closeModal();save();return;
  }
  if(formType==='announcement' && editingAnnouncementIndex!==null && canManageOffice()){
    e.preventDefault();const obj=Object.fromEntries(new FormData(e.target).entries());obj.delivered=!!obj.receivedDate;obj.archived=!!obj.receivedDate;obj.status=obj.receivedDate?'تم الاستلام':'قيد الإعلان';if(obj.receivedDate&&!obj.receivedBy)obj.receivedBy=currentUser.name;const idx=editingAnnouncementIndex;editingAnnouncementIndex=null;if(obj.receivedDate){db.announcements.splice(idx,1);db.announcementArchive.push({...obj,archiveDate:today()});}else db.announcements[idx]={...db.announcements[idx],...obj};closeModal();save();return;
  }
  if(formType==='expense'){
    e.preventDefault();if(!isEmployee()&&!canManageOffice()){alert('ليس لديك صلاحية تسجيل المصروفات.');return;}
    const form=e.target;if(form.dataset.expenseSubmitting==='1')return;
    const obj=Object.fromEntries(new FormData(form).entries());
    (async()=>{
      const submitButtons=[...form.querySelectorAll('button[type=submit],input[type=submit]')];
      const oldLabels=submitButtons.map(b=>b.textContent||b.value||'');
      form.dataset.expenseSubmitting='1';submitButtons.forEach(b=>{b.disabled=true;if(b.tagName==='INPUT')b.value='جارٍ الحفظ...';else b.textContent='جارٍ الحفظ...';});
      let storageKey='';
      try{
        if(!navigator.onLine){
          const {data:{session},error:sessionError}=await sb.auth.getSession();
          if(sessionError||!session?.user?.id)throw sessionError||new Error('لا توجد جلسة دخول محفوظة؛ لا يمكن حفظ المصروف دون اتصال.');
          const generalName=String(obj.client||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
          if(isAdmin() && generalName==='مصروفات عامة')throw new Error('مصروفات المكتب العامة تحتاج اتصالًا مباشرًا لاعتمادها؛ لم نسجلها محليًا. اترك النافذة مفتوحة وأعد المحاولة عند عودة الاتصال.');
          const amount=Number(obj.amount);if(!Number.isFinite(amount)||amount<=0)throw new Error('أدخل مبلغًا صحيحًا أكبر من صفر.');
          const user=session.user;
          const fingerprint=JSON.stringify([user.id,obj.client||'',obj.category||'',obj.title||'',obj.notes||'',amount,obj.date||today()]);
          let hash=2166136261;for(let i=0;i<fingerprint.length;i++){hash^=fingerprint.charCodeAt(i);hash=Math.imul(hash,16777619);}
          storageKey='maktaby:expense-submit:'+user.id+':'+(hash>>>0).toString(16);
          let submissionKey=localStorage.getItem(storageKey);
          if(!submissionKey){submissionKey=globalThis.crypto?.randomUUID?.();if(!submissionKey)throw new Error('المتصفح لا يدعم إنشاء معرف آمن لطلب المصروف.');localStorage.setItem(storageKey,submissionKey);}
          const offlinePayload={client_name:obj.client,expense_type:obj.category,description:obj.title+(obj.notes?' | '+obj.notes:''),amount,expense_date:obj.date||today(),employee_id:user.id,employee_name:currentUser.name,approval_status:'pending',submission_key:submissionKey};
          if(!window.MAKTABY_OFFLINE?.enqueueExpense)throw new Error('التخزين المحلي الآمن غير متاح؛ لم يتم حفظ المصروف.');
          await window.MAKTABY_OFFLINE.enqueueExpense(offlinePayload,user.id,storageKey);
          closeModal();alert('تم حفظ المصروف على هذا الجهاز في قائمة انتظار آمنة، ولم يُرسل بعد. سيُرسل تلقائيًا عند عودة الإنترنت مع بقاء البرنامج مفتوحًا وتسجيل الدخول بالحساب نفسه.');return;
        }
        const {data:{user},error:userError}=await sb.auth.getUser();if(userError||!user?.id)throw userError||new Error('تعذر تحديد حساب المستخدم.');
        const fingerprint=JSON.stringify([user.id,obj.client||'',obj.category||'',obj.title||'',obj.notes||'',Number(obj.amount),obj.date||today()]);
        let hash=2166136261;for(let i=0;i<fingerprint.length;i++){hash^=fingerprint.charCodeAt(i);hash=Math.imul(hash,16777619);}
        storageKey='maktaby:expense-submit:'+user.id+':'+(hash>>>0).toString(16);
        let submissionKey=localStorage.getItem(storageKey);
        if(!submissionKey){submissionKey=globalThis.crypto?.randomUUID?.();if(!submissionKey)throw new Error('المتصفح لا يدعم إنشاء معرف آمن لطلب المصروف.');localStorage.setItem(storageKey,submissionKey);}
        const payload={client_name:obj.client,expense_type:obj.category,description:obj.title+(obj.notes?' | '+obj.notes:''),amount:Number(obj.amount),expense_date:obj.date||today(),employee_id:user.id,employee_name:currentUser.name,approval_status:'pending',submission_key:submissionKey};
        if(isAdmin() && (String(currentUser?.name||'').toLocaleLowerCase('ar').includes('هاني') || /hany.*shehata|shehata.*hany/i.test(String(currentUser?.name||'')))){
          const generalName=String(obj.client||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
          if(generalName==='مصروفات عامة'){
            const {error:directError}=await sb.rpc('create_manager_expense_direct_v10',{p_client_name:'مصروفات عامة',p_expense_type:obj.category,p_description:obj.title+(obj.notes?' | '+obj.notes:''),p_amount:Number(obj.amount),p_expense_date:obj.date||today(),p_employee_name:currentUser.name});
            if(directError)throw directError;localStorage.removeItem(storageKey);closeModal();await loadCloudState();alert('تم تسجيل مصروف المكتب مباشرة واعتماده دون الخصم من عهدة الموظف أو انتظار اعتماد.');return;
          }
          // Hany's client-specific expenses follow the normal pending workflow so the manager can
          // select the correct fee agreement at review; never route them through the office-only RPC.
        }
        const {error:insertError}=await sb.from('expenses').insert(payload);
        if(insertError){
          // A retry after a lost response reuses the same key. Treat the unique hit as success only if its row exists.
          if(insertError.code==='23505'){
            const existing=await sb.from('expenses').select('id').eq('submission_key',submissionKey).maybeSingle();
            if(existing.error||!existing.data?.id)throw insertError;
          }else throw insertError;
        }
        localStorage.removeItem(storageKey);closeModal();await loadCloudState();alert('تم تسجيل المصروف وإرساله للاعتماد. مصروفات الموكل تُراجع وتُرحّل إلى اتفاقها، أما «مصروفات عامة» فلا تحتاج إلى اتفاق أتعاب.');
      }catch(err){
        // A dropped connection may occur after the browser reported itself online.
        // Reuse the same idempotency key so a server-side success is never duplicated.
        if((!navigator.onLine || err instanceof TypeError || /fetch|network|connection|اتصال/i.test(String(err?.message||''))) && window.MAKTABY_OFFLINE?.enqueueExpense){
          try{
            const {data:{session}}=await sb.auth.getSession();
            const generalName=String(obj.client||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
            if(session?.user?.id && !(isAdmin() && generalName==='مصروفات عامة')){
              const amount=Number(obj.amount);if(!Number.isFinite(amount)||amount<=0)throw new Error('قيمة المصروف غير صحيحة.');
              const user=session.user;
              const fingerprint=JSON.stringify([user.id,obj.client||'',obj.category||'',obj.title||'',obj.notes||'',amount,obj.date||today()]);
              let hash=2166136261;for(let i=0;i<fingerprint.length;i++){hash^=fingerprint.charCodeAt(i);hash=Math.imul(hash,16777619);}
              storageKey='maktaby:expense-submit:'+user.id+':'+(hash>>>0).toString(16);
              let submissionKey=localStorage.getItem(storageKey);if(!submissionKey){submissionKey=globalThis.crypto?.randomUUID?.();if(!submissionKey)throw new Error('معرف المحاولة الآمن غير متاح.');localStorage.setItem(storageKey,submissionKey);}
              const retryPayload={client_name:obj.client,expense_type:obj.category,description:obj.title+(obj.notes?' | '+obj.notes:''),amount,expense_date:obj.date||today(),employee_id:user.id,employee_name:currentUser.name,approval_status:'pending',submission_key:submissionKey};
              await window.MAKTABY_OFFLINE.enqueueExpense(retryPayload,user.id,storageKey);closeModal();
              alert('انقطع الاتصال أثناء الإرسال؛ احتفظنا بالمصروف في قائمة الانتظار بنفس معرف العملية لمنع التكرار. سيعاد إرساله عند عودة الاتصال مع بقاء البرنامج مفتوحًا.');return;
            }
          }catch(queueError){console.warn('MAKTABY could not queue interrupted expense:',queueError);}
        }
        alert('تعذر تأكيد تسجيل المصروف: '+err.message+'\nاحتفظنا بمعرف المحاولة لإعادة المحاولة بأمان؛ لا تنشئ طلبًا جديدًا قبل مراجعة الحالة.');
      }finally{
        if(form.isConnected){delete form.dataset.expenseSubmitting;submitButtons.forEach((b,i)=>{b.disabled=false;if(b.tagName==='INPUT')b.value=oldLabels[i];else b.textContent=oldLabels[i];});}
      }
    })();return;
  }
  return expenseSubmitV54Original.call(this,e);
};

/* V7.2.1 hotfix: reliable navigation to client fees page.
   Capture the click before older sidebar handlers can overwrite/intercept it. */
document.addEventListener('click',function(e){
  const b=e.target&&e.target.closest?e.target.closest('#nav [data-page="clientfees"]'):null;
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!currentUser)return;
  if(!canManageOffice()){alert('صفحة أتعاب الموكلين والتحصيل متاحة للمدير ومديرة المكتب فقط.');return;}
  page='clientfees';
  try{render();}
  catch(err){console.error('فتح صفحة الأتعاب',err);
    const app=document.getElementById('app');
    if(app)app.innerHTML='<div class="notice">تعذر فتح صفحة الأتعاب: '+esc(String(err&&err.message||err))+'</div>';
  }
},true);



/* ===== Legacy UI segment 03 (preserved order) ===== */

/* CRM PRO is isolated in maktaby-crm.js and loaded on first navigation. */

/* V6.9 — ASCII-safe storage keys for Arabic filenames + company custody ledger */
(function(){
 const priorRender=render;
 const fmt=n=>moneyV54(Number(n)||0);
 const escx=s=>esc(String(s??''));
 function custodyTotals(id){const rows=(db.companyCustodyTransactions||[]).filter(x=>x.companyId===id);return {in:rows.filter(x=>x.type==='credit').reduce((a,x)=>a+(+x.amount||0),0),out:rows.filter(x=>x.type==='debit').reduce((a,x)=>a+(+x.amount||0),0),rows};}
 async function saveCustodies(){
   await persistFinancialStateAtomic(db,'تعذر حفظ العهد');
 }
 window.addCompanyCustodyV673=async()=>{
   if(!canManageOffice())return;const name=prompt('اسم الشركة صاحبة العهدة:');if(!name||!name.trim())return;
   const amount=Number(prompt('قيمة العهدة الافتتاحية بالجنيه (اكتب 0 إذا لم يتم تسليم مبلغ الآن):','0'));
   if(!Number.isFinite(amount)||amount<0){alert('أدخل مبلغًا صحيحًا.');return;}
   db.companyCustodies=db.companyCustodies||[];db.companyCustodyTransactions=db.companyCustodyTransactions||[];
   const c={id:'co-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),name:name.trim(),createdAt:new Date().toISOString(),active:true};db.companyCustodies.push(c);
   if(amount>0)db.companyCustodyTransactions.push({id:'ct-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),companyId:c.id,companyName:c.name,type:'credit',amount,date:today(),description:'عهدة افتتاحية',createdBy:currentUser.name});
   try{await saveCustodies();renderOfficeAccountsV54();alert('تم إنشاء عهدة الشركة.');}catch(e){alert('تعذر حفظ عهدة الشركة: '+e.message);}
 };
 window.addCompanyCustodyFundsV673=async(id)=>{
   if(!canManageOffice())return;const c=(db.companyCustodies||[]).find(x=>x.id===id);if(!c)return;
   const amount=Number(prompt('قيمة المبلغ المضاف لعهدة '+c.name+':','0'));if(!Number.isFinite(amount)||amount<=0){alert('أدخل مبلغًا أكبر من صفر.');return;}
   const description=prompt('بيان تغذية العهدة:','إضافة عهدة')||'إضافة عهدة';
   db.companyCustodyTransactions.push({id:'ct-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),companyId:id,companyName:c.name,type:'credit',amount,date:today(),description,createdBy:currentUser.name});
   try{await saveCustodies();renderOfficeAccountsV54();}catch(e){alert('تعذر الحفظ: '+e.message);}
 };
 window.addCompanyCustodyExpenseV673=async(id)=>{
   if(!canManageOffice())return;const c=(db.companyCustodies||[]).find(x=>x.id===id);if(!c)return;
   const bal=custodyTotals(id),remaining=bal.in-bal.out;
   const amount=Number(prompt('المبلغ المصروف من عهدة '+c.name+' (الرصيد الحالي '+fmt(remaining)+'):','0'));
   if(!Number.isFinite(amount)||amount<=0){alert('أدخل مبلغًا أكبر من صفر.');return;}if(amount>remaining){alert('المبلغ أكبر من الرصيد المتاح في العهدة.');return;}
   const category=prompt('بند المصروف (انتقالات، رسوم، طباعة، مشتريات...):','مصروفات متنوعة');if(category===null)return;
   const description=prompt('تفاصيل المصروف:','');if(description===null)return;
   const date=prompt('تاريخ المصروف YYYY-MM-DD:',today())||today();
   db.companyCustodyTransactions.push({id:'ct-'+(globalThis.crypto?.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),companyId:id,companyName:c.name,type:'debit',amount,date,category,description,createdBy:currentUser.name,documents:[]});
   try{await saveCustodies();renderOfficeAccountsV54();alert('تم تسجيل المصروف وخصمه من عهدة الشركة.');}catch(e){alert('تعذر الحفظ: '+e.message);}
 };
 window.uploadCompanyCustodyDocV673=async(id,transactionId,input)=>{
   if(!canManageOffice())return;const file=input?.files?.[0];if(!file)return;if(file.size>10*1024*1024){alert('الحد الأقصى 10 ميجابايت.');return;}
   const c=(db.companyCustodies||[]).find(x=>x.id===id);if(!c)return;
   const ext=(file.name.match(/\.([A-Za-z0-9]{1,10})$/)||[])[1]?.toLowerCase()||'bin';const path=`company-custodies/${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;
   try{
     const {error}=await sb.storage.from('client-documents').upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});
     if(error){if(/mime type .* not supported|mime type.*not supported/i.test(error.message||''))throw new Error('نوع الملف غير مسموح به في إعدادات Bucket client-documents. أضف MIME type للملف في Supabase Storage.');throw new Error(error.message+' (Bucket: client-documents)');}
     const doc={id:'doc-'+Date.now(),file_name:file.name,storage_path:path,mime_type:file.type||'application/octet-stream',size_bytes:file.size,uploaded_at:new Date().toISOString(),uploaded_by:currentUser.name};
     if(transactionId){const t=(db.companyCustodyTransactions||[]).find(x=>x.id===transactionId);if(t)t.documents=[...(t.documents||[]),doc];}
     else c.documents=[...(c.documents||[]),doc];
     await saveCustodies();renderOfficeAccountsV54();alert('تم رفع المستند وربطه بالعهدة.');
   }catch(e){alert('فشل رفع مستند العهدة: '+e.message+' — أرسل لي نص الخطأ أو صورة منه حتى أحدد هل المشكلة من الـ Bucket أم صلاحيات التخزين.');}
   finally{if(input)input.value='';}
 };
 window.openCompanyCustodyDocV673=async(path,name)=>{try{const {data,error}=await sb.storage.from('client-documents').createSignedUrl(path,300,{download:name||true});if(error)throw error;window.open(data.signedUrl,'_blank','noopener');}catch(e){alert('تعذر فتح المستند: '+e.message);}};
 window.finishCompanyCustodyV674=async(id)=>{
   if(!canManageOffice())return;const c=(db.companyCustodies||[]).find(x=>x.id===id);if(!c)return;
   const t=custodyTotals(id),balance=t.in-t.out;
   if(Math.abs(balance)>0.00001&&!confirm('رصيد العهدة الحالي '+fmt(balance)+' جنيه. هل تريد إنهاءها وأرشفتها بهذا الرصيد؟'))return;
   if(Math.abs(balance)<=0.00001&&!confirm('تأكيد إنهاء عهدة '+c.name+' ونقلها إلى الأرشيف؟'))return;
   const before={...c};c.active=false;c.status='finished';c.finishedAt=new Date().toISOString();c.finishedBy=currentUser.name;c.finalBalance=balance;
   db.companyCustodyArchive=db.companyCustodyArchive||[];db.companyCustodyArchive=db.companyCustodyArchive.filter(x=>x.id!==id);db.companyCustodyArchive.unshift({...c});
   try{await saveCustodies();renderOfficeAccountsV54();alert('تم إنهاء العهدة ونقلها إلى الأرشيف مع الاحتفاظ بكل الحركات والمستندات.');}catch(e){Object.assign(c,before);db.companyCustodyArchive=db.companyCustodyArchive.filter(x=>x.id!==id);alert('تعذر حفظ إنهاء العهدة: '+e.message);}
 };
 window.deleteCompanyCustodyV674=async(id)=>{
   if(!canManageOffice())return;const c=(db.companyCustodies||[]).find(x=>x.id===id);if(!c)return;
   const hasTx=(db.companyCustodyTransactions||[]).some(x=>x.companyId===id);
   const hasDocs=(c.documents||[]).length>0||(db.companyCustodyTransactions||[]).some(x=>x.companyId===id&&(x.documents||[]).length>0);
   if(hasTx||hasDocs){alert('لا يمكن حذف عهدة لها حركات أو مستندات حتى لا تضيع السجلات المالية. استخدم «إنهاء وأرشفة» بدلًا من ذلك.');return;}
   if(!confirm('حذف العهدة الفارغة '+c.name+' نهائيًا؟'))return;
   const before={...c};c.active=false;c.deleted=true;c.deletedAt=new Date().toISOString();
   try{await saveCustodies();renderOfficeAccountsV54();alert('تم حذف العهدة الفارغة.');}catch(e){Object.assign(c,before);alert('تعذر حذف العهدة: '+e.message);}
 };
 window.restoreCompanyCustodyV674=async(id)=>{
   if(!canManageOffice())return;const c=(db.companyCustodyArchive||[]).find(x=>x.id===id);if(!c)return;
   if(!confirm('إعادة عهدة '+c.name+' إلى العهد النشطة؟'))return;
   const archivedCopy={...c};db.companyCustodyArchive=db.companyCustodyArchive.filter(x=>x.id!==id);db.companyCustodies=db.companyCustodies||[];const existing=db.companyCustodies.find(x=>x.id===id),existingBefore=existing?{...existing}:null;c.active=true;c.status='active';delete c.deleted;delete c.deletedAt;delete c.finishedAt;delete c.finishedBy;if(existing)Object.assign(existing,c);else db.companyCustodies.push(c);
   try{await saveCustodies();renderOfficeAccountsV54();}catch(e){if(existing)Object.assign(existing,existingBefore);else db.companyCustodies=db.companyCustodies.filter(x=>x.id!==id);db.companyCustodyArchive.unshift(archivedCopy);alert('تعذر استعادة العهدة: '+e.message);}
 };
 window.exportCompanyCustodyV673=id=>{
   const c=(db.companyCustodies||[]).find(x=>x.id===id)||(db.companyCustodyArchive||[]).find(x=>x.id===id);if(!c)return;const rows=(db.companyCustodyTransactions||[]).filter(x=>x.companyId===id).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
   const data=[['التاريخ','نوع الحركة','الشركة','البند','التفاصيل','إضافة','مصروف','الرصيد']];let balance=0;rows.forEach(x=>{balance+=(x.type==='credit'?1:-1)*(+x.amount||0);data.push([x.date,x.type==='credit'?'إضافة عهدة':'مصروف',c.name,x.category||'',x.description||'',x.type==='credit'?x.amount:'',x.type==='debit'?x.amount:'',balance]);});
   const csv='\ufeff'+data.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));a.download='عهدة-'+c.name+'-'+today()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 };
 function makeAccountsSectionsCollapsibleV10(){
   const app=document.getElementById('app');if(!app||app.dataset.accountsGrouped==='1')return;
   // Split the combined monthly details into independent incoming and expense panels.
   const detail=[...app.querySelectorAll(':scope > section.panel')].find(x=>/تفاصيل حركة الشهر/.test(x.textContent||''));
   if(detail){
     const hs=[...detail.querySelectorAll('h4')];
     if(hs.length>=2){
       const make=(title,heading)=>{const panel=document.createElement('section');panel.className='panel';panel.style.marginBottom='12px';const h=document.createElement('h3');h.textContent=title;panel.appendChild(h);let n=heading;while(n){const next=n.nextSibling;panel.appendChild(n);if(n.tagName==='H4'&&n!==heading)break;n=next;}return panel;};
       const income=make('الوارد',hs[0]);const expenses=make('المصروفات',hs[1]);detail.replaceWith(income,expenses);
     }
   }
   const panels=[...app.querySelectorAll(':scope > section.panel')];
   const labelFor=panel=>{const h=panel.querySelector('h3,h4');const t=(h?.textContent||'').trim();if(/طلبات مصروفات/.test(t))return 'طلبات المصروفات المعلقة';if(/أرصدة الموظفين/.test(t))return 'عهد الموظفين';if(/الالتزامات الثابتة/.test(t))return 'الالتزامات';if(/عهدة الشركات/.test(t))return 'عهد الشركات';if(/^الوارد/.test(t))return 'الوارد';if(/^المصروفات/.test(t))return 'المصروفات';return t||'تفاصيل الحسابات';};
   panels.forEach((panel,i)=>{if(panel.dataset.accountsAccordion==='1')return;const title=labelFor(panel);if(!title)return;const wrap=document.createElement('section');wrap.className='panel maktaby-account-accordion';wrap.style.cssText='margin:10px 0;padding:0;overflow:hidden';const btn=document.createElement('button');btn.type='button';btn.className='btn light';btn.style.cssText='width:100%;display:flex;justify-content:space-between;align-items:center;padding:15px 18px;border:0;border-radius:10px;font-weight:700';btn.innerHTML=`<span>${title}</span><span aria-hidden="true">＋</span>`;const body=document.createElement('div');body.hidden=true;body.style.padding='0 14px 14px';panel.parentNode.insertBefore(wrap,panel);wrap.append(btn,body);body.appendChild(panel);panel.dataset.accountsAccordion='1';btn.setAttribute('aria-expanded','false');btn.addEventListener('click',()=>{body.hidden=!body.hidden;btn.setAttribute('aria-expanded',String(!body.hidden));btn.lastElementChild.textContent=body.hidden?'＋':'−';});});
   app.dataset.accountsGrouped='1';
 }
 const oldAccountsRender=renderOfficeAccountsV54;
 renderOfficeAccountsV54=function(){
   oldAccountsRender();if(!canManageOffice())return;
   const companies=(db.companyCustodies||[]).filter(c=>c.active!==false&&!c.deleted&&c.status!=='finished'),archived=db.companyCustodyArchive||[],tx=db.companyCustodyTransactions||[];
   const html=`<section class="panel" style="margin:18px 0"><div class="pagehead"><div><h3>عهدة الشركات</h3><div class="sub">عهدة مستقلة لكل شركة، مع تسجيل التغذية والمصروفات والمستندات وتصدير كشف تفصيلي.</div></div><button class="btn goldbtn" onclick="addCompanyCustodyV673()">+ إضافة شركة / عهدة</button></div>
   ${companies.length?companies.map(c=>{const t=custodyTotals(c.id),balance=t.in-t.out;const docs=c.documents||[];return `<div class="panel" style="margin:12px 0;border:1px solid var(--line)"><div class="pagehead"><div><h4 style="margin:0">${escx(c.name)}</h4><div class="sub">إجمالي العهدة: ${fmt(t.in)} — المصروف: ${fmt(t.out)} — الرصيد: <b>${fmt(balance)}</b></div></div><div class="actions"><button class="btn light" onclick="addCompanyCustodyFundsV673('${c.id}')">+ تغذية العهدة</button><button class="btn goldbtn" onclick="addCompanyCustodyExpenseV673('${c.id}')">+ تسجيل مصروف</button><button class="btn light" onclick="exportCompanyCustodyV673('${c.id}')">تصدير كشف</button><button class="btn light" onclick="finishCompanyCustodyV674('${c.id}')">إنهاء وأرشفة</button><button class="btn danger" onclick="deleteCompanyCustodyV674('${c.id}')">حذف</button></div></div>
   <div class="toolbar"><label>مستند عام للعهدة:</label><input type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onchange="uploadCompanyCustodyDocV673('${c.id}',null,this)"></div>
   ${docs.length?'<h5>مستندات العهدة</h5>'+table(['المستند','تاريخ الرفع','فتح'],docs.map(d=>`<tr><td>${escx(d.file_name)}</td><td>${escx(String(d.uploaded_at||'').slice(0,10))}</td><td><button class="btn light" onclick="openCompanyCustodyDocV673('${escx(d.storage_path)}','${escx(d.file_name)}')">فتح</button></td></tr>`)):''}
   <h5>حركة العهدة</h5>${table(['التاريخ','الحركة','البند','التفاصيل','إضافة','مصروف','المرفقات'],t.rows.sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x=>`<tr><td>${escx(x.date)}</td><td>${x.type==='credit'?'تغذية عهدة':'مصروف'}</td><td>${escx(x.category||'—')}</td><td>${escx(x.description||'—')}</td><td>${x.type==='credit'?fmt(x.amount):'—'}</td><td>${x.type==='debit'?fmt(x.amount):'—'}</td><td>${(x.documents||[]).map(d=>`<button class="btn light" onclick="openCompanyCustodyDocV673('${escx(d.storage_path)}','${escx(d.file_name)}')">${escx(d.file_name)}</button>`).join(' ')||'—'} ${x.type==='debit'?`<input type="file" style="max-width:170px" onchange="uploadCompanyCustodyDocV673('${c.id}','${x.id}',this)">`:''}</td></tr>`))}</div>`}).join(''):'<div class="empty">لم تتم إضافة شركات حتى الآن.</div>'}<section style="margin-top:18px"><h3>أرشيف عهد الشركات</h3>${archived.length?table(['الشركة','تاريخ الإنهاء','الرصيد الختامي','كشف الحركات','الإجراء'],archived.map(c=>`<tr><td>${escx(c.name)}</td><td>${escx(String(c.finishedAt||'').slice(0,10))}</td><td>${fmt(c.finalBalance||0)}</td><td><button class="btn light" onclick="exportCompanyCustodyV673('${c.id}')">تصدير كشف</button></td><td><button class="btn light" onclick="restoreCompanyCustodyV674('${c.id}')">استعادة</button></td></tr>`)):'<div class="empty">لا توجد عهد منتهية في الأرشيف.</div>'}</section></section>`;
   $('#app').insertAdjacentHTML('beforeend',html);
   makeAccountsSectionsCollapsibleV10();
 };
 render=function(){priorRender();const c=document.querySelector('[data-page="clients"]');if(c)c.textContent='العملاء';const e=document.querySelector('[data-page="employees"]');if(e)e.textContent='شركاء النجاح';};
})();


/* مكتبي للمحاماة V6.9 — سجل التوكيلات واستيراد Excel */
let editingPoaIndex = null;
(function(){
  db.powerOfAttorneys = db.powerOfAttorneys || [];
  db.meta = db.meta || {};
  const originalSharedPayload = sharedPayload;
  sharedPayload = function(){ const p=originalSharedPayload(); p.powerOfAttorneys=db.powerOfAttorneys||[]; return p; };
  const originalEmployeePayload = employeePayload;
  employeePayload = function(){ const p=originalEmployeePayload(); p.powerOfAttorneys=db.powerOfAttorneys||[]; return p; };
  const originalLoadCloudState = loadCloudState;
  loadCloudState = async function(){
    await originalLoadCloudState();
    // V8.5.4: an outer legacy wrapper must also honor the modal lock.
    // The inner cloud loader can safely abort after a network wait, but this
    // wrapper used to continue its post-load work while a form was open.
    if(document.querySelector('#modal.show')){window.__maktabyCloudRefreshPending=true;return;}
    db.powerOfAttorneys=db.powerOfAttorneys||[];
    db.meta=db.meta||{};
    // No embedded seed import. Existing local/cloud records remain as loaded.

  };
  const nav=document.querySelector('.nav');
  if(nav && !nav.querySelector('[data-page="poa"]')){
    const b=document.createElement('button');b.type='button';b.dataset.page='poa';b.textContent='التوكيلات';nav.insertBefore(b,nav.querySelector('[data-page="tasks"]'));
    b.onclick=()=>{if(!currentUser)return;page='poa';render();};
  }
  const oldRender=render;
  render=function(){
    if(page!=='poa'){oldRender();return;}
    db.powerOfAttorneys=db.powerOfAttorneys||[];
    const q=(window.poaSearch||'').trim().toLocaleLowerCase('ar');
    const list=db.powerOfAttorneys.filter(x=>!q||[x.serial,x.name,x.poaNumber,x.year,x.office,x.notes].some(v=>String(v??'').toLocaleLowerCase('ar').includes(q)))
      .slice().sort((a,b)=>(Number(a.serial)||0)-(Number(b.serial)||0));
    const nextSerial=db.powerOfAttorneys.reduce((m,x)=>Math.max(m,Number(x.serial)||0),0)+1;
    const rows=list.map(x=>{
      const i=db.powerOfAttorneys.indexOf(x), photos=x.photos||[];
      return `<tr><td>${esc(String(x.serial??''))}</td><td><strong>${esc(x.name||'—')}</strong></td><td>${esc(x.poaNumber||'—')}</td><td>${esc(x.year||'—')}</td><td>${esc(x.office||'—')}</td><td>${esc(x.notes||'—')}</td><td>${photos.length}</td><td class="actions-cell">${canManageOffice()?`<button class="btn light" onclick="editPoaV69(${i})">تعديل</button><button class="btn danger" onclick="archivePoaV87(${i})">حذف</button><button class="btn light" onclick="document.getElementById('poaPhoto_${i}').click()">رفع صورة</button><input id="poaPhoto_${i}" type="file" accept="image/*,application/pdf" style="display:none" onchange="uploadPoaPhotoV69(${i},this)">`:''}${photos.length?`<button class="btn light" onclick="viewPoaPhotosV69(${i})">عرض المرفقات</button>`:''}</td></tr>`;
    });
    $('#app').innerHTML=`<div class="pagehead"><div><h1>سجل التوكيلات</h1><div class="sub">قاعدة بيانات التوكيلات — ${db.powerOfAttorneys.length.toLocaleString('en-US')} سجل، مع الاحتفاظ بتكرار أرقام المسلسل كسجلات مستقلة.</div></div>${canManageOffice()?`<button class="btn goldbtn" onclick="addPoaV69(${nextSerial})">+ إضافة توكيل</button>`:''}</div><div class="toolbar" style="margin-bottom:12px"><input class="search" type="search" placeholder="ابحث بالاسم أو رقم التوكيل أو السنة أو مكتب التوثيق..." value="${esc(window.poaSearch||'')}" oninput="window.poaSearch=this.value;scheduleSearchRender()"><span class="badge">نتائج البحث: ${list.length}</span><button class="btn light" onclick="exportPoaCsvV69()">تصدير كشف CSV</button></div>${table(['المسلسل','الاسم','رقم التوكيل','السنة / التاريخ','مكتب التوثيق','ملاحظات','المرفقات','الإجراءات'],rows)}`;
    $('#topTitle').textContent='التوكيلات';
    document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='poa'));
  };
  function openPoaEditorV11(index,serial){
    if(!canManageOffice())return;
    const existing=Number.isInteger(index)?db.powerOfAttorneys[index]:null;
    if(Number.isInteger(index)&&!existing)return;
    document.getElementById('maktabyPoaEditorV11')?.remove();
    const clients=(db.clients||[]).filter(c=>c&&String(c.name||'').trim());
    const client=existing?.clientId?clients.find(c=>c.clientId===existing.clientId):null;
    const overlay=document.createElement('div');overlay.id='maktabyPoaEditorV11';overlay.className='modal show';overlay.style.zIndex='10020';
    overlay.innerHTML=`<div class="dialog" style="max-width:680px;width:min(94vw,680px);max-height:90vh;overflow:auto"><div class="dialoghead"><h2>${existing?'تعديل بيانات التوكيل':'إضافة توكيل جديد'}</h2><button type="button" class="btn light" data-close>إغلاق</button></div><form id="maktabyPoaFormV11"><div class="formgrid"><div class="field"><label>رقم المسلسل</label><input name="serial" type="number" step="1" min="0" value="${esc(String(existing?.serial??serial??''))}" required><small class="muted">يمكن تغيير المسلسل يدويًا، ويسمح النظام بتكرار أرقام المسلسل كما في السجلات الحالية.</small></div><div class="field"><label>اسم صاحب التوكيل / الموكل</label><input name="name" type="text" list="maktabyPoaClientListV11" value="${esc(existing?.name||'')}" maxlength="200" autocomplete="off" required placeholder="اكتب الاسم لتظهر أسماء العملاء"><datalist id="maktabyPoaClientListV11">${clients.map(c=>`<option value="${esc(c.name)}"></option>`).join('')}</datalist><small class="muted">عند اختيار اسم عميل مسجل سيتم ربط التوكيل بملفه تلقائيًا.</small></div><div class="field"><label>رقم التوكيل</label><input name="poaNumber" value="${esc(existing?.poaNumber||'')}" maxlength="100"></div><div class="field"><label>السنة أو تاريخ التوكيل</label><input name="year" value="${esc(existing?.year||'')}" maxlength="80"></div><div class="field"><label>مكتب التوثيق</label><input name="office" value="${esc(existing?.office||'')}" maxlength="160"></div><div class="field"><label>ملاحظات</label><input name="notes" value="${esc(existing?.notes||'')}" maxlength="500"></div></div><div class="actions" style="justify-content:flex-end;margin-top:16px"><button type="button" class="btn light" data-close>إلغاء</button><button type="submit" class="btn goldbtn">${existing?'حفظ التعديلات':'حفظ التوكيل'}</button></div></form></div>`;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>overlay.remove()));
    overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove();});
    overlay.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();const fd=new FormData(e.currentTarget);const rawSerial=String(fd.get('serial')||'').trim();const n=Number(rawSerial);const name=String(fd.get('name')||'').trim();
      if(!rawSerial||!Number.isSafeInteger(n)||n<0){alert('أدخل رقم مسلسل صحيحًا.');return;}
      if(!name){alert('اكتب اسم صاحب التوكيل.');return;}
      const norm=v=>String(v||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');
      const matched=clients.find(c=>norm(c.name)===norm(name));
      const record={...(existing||{}),serial:n,name,poaNumber:String(fd.get('poaNumber')||'').trim(),year:String(fd.get('year')||'').trim(),office:String(fd.get('office')||'').trim(),notes:String(fd.get('notes')||'').trim(),photos:existing?.photos||[]};
      if(matched)record.clientId=matched.clientId;else if(existing?.clientId)delete record.clientId;
      if(existing)db.powerOfAttorneys[index]=record;else db.powerOfAttorneys.push({...record,poaId:'poa_'+(crypto.randomUUID?.()||Date.now())});
      overlay.remove();await save();render();alert(existing?'تم تعديل بيانات التوكيل ورقم المسلسل.':'تمت إضافة التوكيل بنجاح.');
    });
    overlay.querySelector('[name="name"]')?.focus();
  }
  window.addPoaV69=function(serial){openPoaEditorV11(null,serial);};
  window.editPoaV69=function(i){openPoaEditorV11(i);};
  window.uploadPoaPhotoV69=async function(i,input){
    if(!canManageOffice())return;const f=input.files&&input.files[0];if(!f)return;
    if(f.size>10*1024*1024){alert('الحد الأقصى لحجم الملف 10 ميجابايت.');input.value='';return;}
    try{
      const ext=(f.name.match(/\.([A-Za-z0-9]{1,10})$/)||[])[1]?.toLowerCase()||'jpg';
      const path=`power-of-attorneys/${crypto.randomUUID()}/${crypto.randomUUID()}.${ext}`;
      const {error}=await sb.storage.from('client-documents').upload(path,f,{contentType:f.type||'application/octet-stream',upsert:false});
      if(error)throw error;
      const x=db.powerOfAttorneys[i];x.photos=x.photos||[];x.photos.push({path,fileName:f.name,mimeType:f.type||'',uploadedAt:new Date().toISOString()});
      await saveCloudState();localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('تم رفع المرفق وحفظه بنجاح.');
    }catch(e){alert('تعذر رفع المرفق: '+(e.message||e));}finally{input.value='';}
  };
  window.viewPoaPhotosV69=async function(i){
    const x=db.powerOfAttorneys[i];if(!x||!x.photos?.length)return;
    const menu=x.photos.map((p,n)=>`${n+1}) ${p.fileName}`).join('\n');
    const choice=Number(prompt('اختر رقم المرفق لفتحه:\n'+menu,'1'))-1;if(!Number.isInteger(choice)||choice<0||choice>=x.photos.length)return;
    try{const {data,error}=await sb.storage.from('client-documents').createSignedUrl(x.photos[choice].path,300,{download:x.photos[choice].fileName||true});if(error)throw error;window.open(data.signedUrl,'_blank','noopener');}
    catch(e){alert('تعذر فتح المرفق: '+(e.message||e));}
  };
  window.exportPoaCsvV69=function(){
    const headers=['المسلسل','الاسم','رقم التوكيل','السنة/التاريخ','مكتب التوثيق','ملاحظات'];
    const lines=[headers,...db.powerOfAttorneys.map(x=>[x.serial,x.name,x.poaNumber,x.year,x.office,x.notes])].map(row=>row.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(','));
    const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8;'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='سجل_التوكيلات.csv';a.click();URL.revokeObjectURL(a.href);
  };
})();

/* MAKTABY PRO 10 — exact reference dashboard renderer.
   Keep the established business logic and data model; replace only the dashboard presentation. */
(function(){
  const previousRender=render;
  const money=n=>Number(n||0).toLocaleString('en-US');
  const safeDate=v=>{if(!v)return '—';try{return new Date(String(v).slice(0,10)+'T00:00:00').toLocaleDateString('ar-EG',{day:'2-digit',month:'2-digit'})}catch(_){return String(v)}};
  const go=(target)=>{page=target;render();};
  render=function(){
    previousRender.apply(this,arguments);
    if(page!=='dashboard'||!currentUser)return;
    const todayKey=today();
    const allCases=(db.cases||[]).filter(c=>!c.archived);
    const upcomingAll=allCases.filter(c=>String(c.date||'')>=todayKey).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||'')));
    const upcoming=upcomingAll.slice(0,4);
    const weekEnd=new Date(todayKey+'T00:00:00');weekEnd.setDate(weekEnd.getDate()+6);
    const weekEndKey=[weekEnd.getFullYear(),String(weekEnd.getMonth()+1).padStart(2,'0'),String(weekEnd.getDate()).padStart(2,'0')].join('-');
    const weekSessions=allCases.filter(c=>String(c.date||'')>=todayKey&&String(c.date||'')<=weekEndKey);
    const allTasks=(tasks()||[]);
    const isTaskDone=x=>['تم التنفيذ','منتهي','منفذ','completed','done'].includes(String(x.status||'').trim().toLowerCase());
    const openTasks=allTasks.filter(x=>!isTaskDone(x));
    const overdueTasks=openTasks.filter(x=>x.date&&String(x.date).slice(0,10)<todayKey);
    const dueTodayTasks=openTasks.filter(x=>x.date&&String(x.date).slice(0,10)===todayKey);
    const pendingTasks=openTasks.slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).slice(0,5);
    const todaySessions=allCases.filter(c=>String(c.date||'').slice(0,10)===todayKey);
    const nextSession=upcoming[0]||null;
    const urgentTasks=[...overdueTasks,...dueTodayTasks].slice(0,3);
    const approvalItems=canManageOffice()?(db.approvalRequests||[]).filter(x=>x.status==='pending').length:0;
    const completedStatus=x=>['تم التنفيذ','منتهي','منفذ','completed','done'].includes(String(x.status||'').trim().toLowerCase());
    const archivedTasks=Array.isArray(db.taskArchive)?db.taskArchive:[];
    const storedTasks=Array.isArray(db.tasks)?db.tasks:[];
    const completedTasks=archivedTasks.length+storedTasks.filter(completedStatus).length;
    const trackedOpenTasks=storedTasks.filter(x=>!completedStatus(x));
    const totalTrackedTasks=completedTasks+trackedOpenTasks.length;
    const taskCompletionRate=totalTrackedTasks?Math.round(completedTasks/totalTrackedTasks*100):0;
    const pendingAnnouncements=(db.announcements||[]).filter(a=>!a.archived&&!a.delivered&&!a.receivedDate&&a.status!=='تم الاستلام');
    const elapsedSessions=allCases.filter(c=>c.date&&String(c.date).slice(0,10)<todayKey&&!String(c.result||'').trim());
    const pendingApprovalCount=canManageOffice()?(db.approvalRequests||[]).filter(x=>x.status==='pending').length:null;
    const expensesTotal=(db.transactions||[]).filter(x=>x.kind==='منصرف'&&!x.voidedAt).reduce((n,x)=>n+(Number(x.amount)||0),0)+(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='approved').reduce((n,x)=>n+(Number(x.amount)||0),0);
    const leads=(typeof crmState!=='undefined'&&Array.isArray(crmState.rows))?crmState.rows.filter(x=>!['تم التعاقد','مؤرشف'].includes(x.lead_status)).length:0;
    const stats=[
      {label:'قضايا جديدة',value:allCases.length,icon:'↗',tone:'green'},
      {label:'عميل محتمل',value:leads,icon:'●●●',tone:'blue'},
      {label:'عميل موكل',value:(db.clients||[]).length,icon:'♟',tone:'purple'},
      {label:'جلسة قادمة',value:upcomingAll.length,icon:'▦',tone:'orange'},
      {label:'إجمالي المصروفات',value:money(expensesTotal),icon:'▤',tone:'teal'}
    ];
    const shortcuts=[
      {label:'العملاء المحتملين',icon:'♙',target:'crm'},
      {label:'العملاء',icon:'♟',target:'clients'},
      {label:'القضايا والجلسات',icon:'⚖',target:'cases'},
      {label:'المصروفات',icon:'▤',target:'accounts'},
      {label:'الرواتب والبونص',icon:'＄',target:'employees'},
      {label:'التقارير',icon:'▥',target:'reports'}
    ];
    const statHtml=stats.map(x=>`<article class="ref-stat ${x.tone}"><span class="ref-stat-icon">${x.icon}</span><strong>${x.value}</strong><b>${x.label}</b><small>بيانات المكتب الحالية</small></article>`).join('');
    const taskHtml=pendingTasks.length?pendingTasks.map(x=>`<div class="ref-row"><span class="ref-row-icon ${x.status==='متأخر'?'warn':''}">${x.status==='متأخر'?'!':'●'}</span><div class="ref-row-copy"><b>${esc(x.task||'مهمة مكتبية')}</b><small>${esc(x.client||x.court||'متابعة إدارية')}</small></div><time>${safeDate(x.date)}</time></div>`).join(''):'<div class="empty">لا توجد مهام للمتابعة حاليًا.</div>';
    const sessionHtml=upcoming.length?upcoming.map(c=>`<div class="ref-row"><span class="ref-row-icon court">⚖</span><div class="ref-row-copy"><b>${esc(c.client||'جلسة قضية رقم '+(c.number||'—'))}</b><small>${esc(c.number||'')} · ${esc(c.court||'')}</small></div><time>${safeDate(c.date)}</time></div>`).join(''):'<div class="empty">لا توجد جلسات قادمة مسجلة.</div>';
    const quickHtml=shortcuts.map(x=>`<button class="ref-quick" type="button" data-ref-go="${x.target}"><span>${x.icon}</span><b>${x.label}</b></button>`).join('');
    const attentionItems=[
      {label:'مهام متأخرة',value:overdueTasks.length,target:'tasks',tone:overdueTasks.length?'danger':'ok',detail:'تحتاج إلى متابعة'},
      {label:'مهام مستحقة اليوم',value:dueTodayTasks.length,target:'tasks',tone:dueTodayTasks.length?'warning':'ok',detail:'موعدها اليوم'},
      {label:'إعلانات قيد المتابعة',value:pendingAnnouncements.length,target:'announcements',tone:pendingAnnouncements.length?'warning':'ok',detail:'لم يتم إثبات استلامها'},
      {label:'جلسات تحتاج تسجيل القرار',value:elapsedSessions.length,target:'cases',tone:elapsedSessions.length?'danger':'ok',detail:'راجع القرار وحدد الجلسة التالية'},
      ...(pendingApprovalCount!==null?[{label:'طلبات اعتماد معلقة',value:pendingApprovalCount,target:'approvals',tone:pendingApprovalCount?'warning':'ok',detail:'بانتظار مراجعة الإدارة'}]:[])
    ];
    const attentionHtml=attentionItems.map(x=>`<button type="button" class="ref-attention-item ${x.tone}" data-ref-go="${x.target}"><span>${x.label}</span><strong>${x.value}</strong><small>${x.detail}</small></button>`).join('');
    const commandSession=nextSession?`<div class="mk-command-main"><span class="mk-command-icon">⚖</span><div><small>${todaySessions.length?'جلسات اليوم':'أقرب جلسة قادمة'}</small><b>${esc(nextSession.client||'قضية رقم '+(nextSession.number||'—'))}</b><span>${esc(nextSession.number||'')} · ${esc(nextSession.court||'')}</span></div><time>${safeDate(nextSession.date)}</time></div>`:`<div class="mk-command-empty">لا توجد جلسات قادمة مسجلة حاليًا.</div>`;
    const urgentHtml=urgentTasks.length?urgentTasks.map(x=>`<button type="button" class="mk-command-task" data-ref-go="tasks"><span class="${overdueTasks.includes(x)?'is-late':''}">${overdueTasks.includes(x)?'متأخرة':'اليوم'}</span><b>${esc(x.task||'مهمة مكتبية')}</b><small>${safeDate(x.date)}</small></button>`).join(''):'<div class="mk-command-empty">لا توجد مهام عاجلة. العمل يسير بشكل جيد.</div>';
    const weeklyOverviewHtml=window.MAKTABY_WEEKLY_OVERVIEW_109?.render({todayKey,allCases,openTasks,safeDate,sessionCount:weekSessions.length})||'';
    const networkOnline=typeof navigator==='undefined'||navigator.onLine;
    const html=`<section class="mk-command-center" aria-label="مركز القيادة والمتابعة"><div class="mk-command-heading"><div><small>MAKTABY COMMAND CENTER</small><h2>مركز القيادة والمتابعة</h2><p>ملخص عملي لما يحتاج انتباهك الآن</p></div><span class="mk-command-live ${networkOnline?'':'is-offline'}" id="mkDashboardNetwork"><i></i>${networkOnline?'اتصال الإنترنت متاح':'لا يوجد اتصال بالإنترنت'}</span></div><div class="mk-command-grid"><article class="mk-command-card mk-command-session"><h3>⚖ الجلسات</h3>${commandSession}<small class="mk-command-foot">${todaySessions.length} جلسة بتاريخ اليوم</small></article><article class="mk-command-card mk-command-urgent"><h3>◷ المهام العاجلة <em>${overdueTasks.length+dueTodayTasks.length}</em></h3><div class="mk-command-task-list">${urgentHtml}</div></article><article class="mk-command-card mk-command-actions"><h3>ϟ إجراءات سريعة</h3><div class="mk-command-action-grid"><button data-ref-go="cases">＋ تسجيل جلسة</button><button data-ref-go="tasks">＋ إنشاء مهمة</button><button data-ref-go="clients">＋ إضافة عميل</button>${canManageOffice()?'<button data-ref-go="approvals">✓ طلبات الاعتماد ('+approvalItems+')</button>':''}</div></article></div></section>
      <section class="ref-stats" aria-label="ملخص المكتب">${statHtml}</section>
      ${weeklyOverviewHtml}
      <section class="ref-attention" aria-label="ما يحتاج إلى انتباه"><div class="ref-attention-head"><b>مركز المتابعة</b><small>مؤشرات محسوبة من البيانات المحملة حالياً</small></div><div class="ref-attention-grid">${attentionHtml}</div></section>
      <section class="ref-operations" aria-label="مؤشرات التشغيل"><div class="ref-operations-head"><div><b>مؤشرات التشغيل</b><small>متابعة إنجاز المهام وحركة العمل</small></div><button type="button" class="ref-operations-link" data-ref-go="tasks">فتح إدارة المهام ←</button></div><div class="ref-operations-grid"><div class="ref-progress-card"><div class="ref-progress-top"><span>معدل إنجاز المهام المسجلة</span><strong>${taskCompletionRate}%</strong></div><div class="ref-progress-track"><i style="width:${taskCompletionRate}%"></i></div><small>${completedTasks} من ${totalTrackedTasks} مهمة محفوظة</small></div><div class="ref-operation-number"><span>مهام مكتملة / مؤرشفة</span><b>${completedTasks}</b><small>تم إنهاؤها واعتمادها</small></div><div class="ref-operation-number"><span>مهام قيد التنفيذ</span><b>${trackedOpenTasks.length}</b><small>تحتاج إلى متابعة</small></div><div class="ref-operation-number"><span>إعلانات غير مستلمة</span><b>${pendingAnnouncements.length}</b><small>تحت الإجراء</small></div></div></section>
      <section class="ref-dashboard-bottom">
        <article class="ref-panel ref-activity"><h3><span>◷</span> آخر الأنشطة</h3><div class="ref-panel-body">${taskHtml}</div></article>
        <article class="ref-panel ref-upcoming"><h3><span>▦</span> المهام القادمة</h3><div class="ref-panel-body">${sessionHtml}</div></article>
        <article class="ref-panel ref-shortcuts"><h3><span>ϟ</span> أدوات سريعة</h3><div class="ref-quick-grid">${quickHtml}</div></article>
      </section>`;
    const host=document.getElementById('app');if(host)host.innerHTML=html;
    document.querySelectorAll('[data-ref-go]').forEach(el=>el.addEventListener('click',()=>go(el.dataset.refGo)));
    const networkBadge=document.getElementById('mkDashboardNetwork');
    if(networkBadge){const updateNetwork=()=>{const online=navigator.onLine;networkBadge.classList.toggle('is-offline',!online);networkBadge.innerHTML='<i></i>'+(online?'اتصال الإنترنت متاح':'لا يوجد اتصال بالإنترنت');};window.addEventListener('online',updateNetwork);window.addEventListener('offline',updateNetwork);}
    const title=document.getElementById('topTitle');if(title)title.textContent='الرئيسية';
    document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='dashboard'));
    const pendingApprovals=(db.approvalRequests||[]).filter(x=>x.status==='pending').length;
    const alertCount=(canManageOffice()?(db.approvalRequests||[]).filter(x=>x.status==='pending').length:0)+overdueTasks.length+dueTodayTasks.length;
    const bell=document.getElementById('refNotificationCount');if(bell){bell.textContent=alertCount;bell.style.display=alertCount?'inline-flex':'none';}
  };
})();

// V7.0.1 FIX: keep search input focused after live filtering re-renders the page.
// Previously each keystroke rebuilt #app, removing the active input and forcing one-character searches.
const renderV70SearchFixOriginal = render;
render = function(){
  const active = document.activeElement;
  const isSearch = active && active.matches && active.matches('input.search[type="search"]');
  const state = isSearch ? {
    placeholder: active.getAttribute('placeholder') || '',
    value: active.value,
    start: active.selectionStart,
    end: active.selectionEnd
  } : null;
  const result = renderV70SearchFixOriginal.apply(this, arguments);
  if(state){
    const candidates = Array.from(document.querySelectorAll('input.search[type="search"]'));
    const target = candidates.find(el => (el.getAttribute('placeholder') || '') === state.placeholder);
    if(target){
      target.focus({preventScroll:true});
      try { target.setSelectionRange(state.start, state.end); } catch(e) {}
    }
  }
  return result;
};



/* V7.1 — Client fee agreements, installments and receipts. Stored inside the existing
   office_financial_state JSON record: no SQL/table migration and no employee exposure. */
(function(){
 const baseRender=render;
 const cash=n=>Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';
 const safe=s=>esc(String(s??''));
 const agreements=()=>db.clientFeeAgreements||(db.clientFeeAgreements=[]);
 const payments=()=>db.clientFeePayments||(db.clientFeePayments=[]);
 const paidFor=id=>payments().filter(x=>x.agreementId===id).reduce((a,x)=>a+(Number(x.amount)||0),0);
 async function persistFees(){
   if(!canManageOffice())throw new Error('إدارة أتعاب الموكلين متاحة للمدير ومديرة المكتب فقط.');
   await persistFinancialStateAtomic(db,'تعذر حفظ اتفاق الأتعاب');
 }
 function addNav(){const nav=document.getElementById('nav');if(nav&&!nav.querySelector('[data-page="clientfees"]')){const b=document.createElement('button');b.dataset.page='clientfees';b.textContent='أتعاب الموكلين والتحصيل';nav.appendChild(b);b.onclick=()=>{if(!canManageOffice()){alert('هذه الصفحة متاحة للمدير ومديرة المكتب فقط.');return;}page='clientfees';render();};}}
 async function renderFees(){
   if(!canManageOffice()){alert('إدارة أتعاب الموكلين متاحة للمدير ومديرة المكتب فقط.');page='dashboard';baseRender();return;}
   const q=(window.clientFeesQuery||'').trim().toLocaleLowerCase('ar');
   // Search, payment aggregation and overdue count run in a dedicated Worker when available.
   // The fallback reproduces the same calculation on the main thread without changing ledger data.
   const allAgreements=agreements(), allPayments=payments(), nowDate=today();
   const computed=await window.MAKTABY_COMPUTE.feeLedger(allAgreements,allPayments,q,nowDate);
   if(page!=='clientfees')return; // discard stale worker results after navigation
   const paidById=new Map(computed.paidEntries),amountPaid=id=>paidById.get(id)||0;
   const rows=computed.matched.map(i=>allAgreements[i]).filter(Boolean);
   const total=computed.total,paid=computed.paid,remain=computed.remain,due=computed.due;
   const body=rows.slice().sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))).map(a=>{const got=amountPaid(a.id),left=Math.max(0,(Number(a.total)||0)-got);return `<tr><td><b>${safe(a.client)}</b><div class="sub">${safe(a.caseNumber||'بدون رقم قضية')}</div></td><td>${safe(a.description||'—')}</td><td>${cash(a.total)}</td><td>${cash(got)}</td><td><b>${cash(left)}</b></td><td>${safe(a.dueDate||'—')}</td><td><span class="pill ${left<=0?'done':a.dueDate&&a.dueDate<nowDate?'late':'open'}">${left<=0?'مسدد':a.dueDate&&a.dueDate<nowDate?'متأخر':'قيد السداد'}</span></td><td><div class="actions"><button class="btn goldbtn" onclick="feeAddPaymentV71('${a.id}')">تسجيل دفعة</button><button class="btn light" onclick="feeReceiptV71('${a.id}')">كشف حساب</button></div></td></tr>`;}).join('')
   document.getElementById('app').innerHTML=`<div class="pagehead"><div><h1>إدارة أتعاب الموكلين والتحصيل</h1><div class="sub">متابعة الاتفاقات والدفعات والمتبقي والمتأخرات — بيانات مالية خاصة بالمدير.</div></div><div class="actions"><button class="btn goldbtn" onclick="feeAddAgreementV71()">+ اتفاق أتعاب جديد</button></div></div>
   <div class="notice">يتم حفظ اتفاقات الأتعاب والدفعات داخل سجل الحسابات المالي الحالي، دون إنشاء جداول جديدة أو تغيير صلاحيات الموظفين.</div>
   <div class="stats"><div class="card"><div class="statlabel">إجمالي الأتعاب المتفق عليها</div><div class="statnum gold">${cash(total)}</div></div><div class="card"><div class="statlabel">إجمالي المحصّل</div><div class="statnum">${cash(paid)}</div></div><div class="card"><div class="statlabel">إجمالي المتبقي</div><div class="statnum">${cash(remain)}</div></div><div class="card"><div class="statlabel">اتفاقات بها متأخرات</div><div class="statnum">${due}</div></div></div>
   <section class="panel"><div class="toolbar"><input class="search" type="search" placeholder="بحث باسم الموكل أو رقم القضية أو وصف الاتفاق..." value="${safe(q)}" oninput="window.clientFeesQuery=this.value;clearTimeout(window._feeSearchTimer);window._feeSearchTimer=setTimeout(()=>{if(page==='clientfees')renderFeesV712()},180)"><span class="sub">عدد الاتفاقات: ${agreements().length}</span></div><div style="overflow:auto">${table(['الموكل / القضية','وصف الاتفاق','المتفق عليه','المحصّل','المتبقي','موعد الاستحقاق','الحالة','الإجراءات'],body)}</div></section>
   <section class="panel" style="margin-top:16px"><h3>آخر الدفعات المسجلة</h3>${table(['التاريخ','الموكل','المبلغ','طريقة السداد','ملاحظات'],payments().slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).slice(0,12).map(x=>{const a=agreements().find(y=>y.id===x.agreementId);return `<tr><td>${safe(x.date)}</td><td>${safe(a?.client||x.client||'—')}</td><td>${cash(x.amount)}</td><td>${safe(x.method||'—')}</td><td>${safe(x.notes||'—')}</td></tr>`;}))}</section>`;
   document.getElementById('topTitle').textContent='أتعاب الموكلين والتحصيل';document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='clientfees'));
 }
 window.feeAddAgreementV71=async()=>{
   if(!canManageOffice())return;
   const clients=(db.clients||[]).map(c=>c.name).filter(Boolean);if(!clients.length){alert('أضف بيانات الموكلين أولًا.');return;}
   const name=prompt('اسم الموكل:\n'+clients.join(' — '),clients[0]);if(name===null)return;if(!name.trim()){alert('اسم الموكل مطلوب.');return;}
   const total=Number(prompt('إجمالي الأتعاب المتفق عليها بالجنيه:','0'));if(!Number.isFinite(total)||total<=0){alert('أدخل قيمة أكبر من صفر.');return;}
   const caseNumber=prompt('رقم القضية (اختياري):','')||'';const description=prompt('وصف الاتفاق / نطاق العمل:','أتعاب القضية')||'أتعاب القضية';const dueDate=prompt('تاريخ الاستحقاق النهائي YYYY-MM-DD (اختياري):','')||'';const notes=prompt('ملاحظات (اختياري):','')||'';
   agreements().push({id:'fee-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),client:name.trim(),total,caseNumber,description,dueDate,notes,createdAt:new Date().toISOString(),createdBy:currentUser.name});
   try{await persistFees();renderFees();alert('تم حفظ اتفاق الأتعاب.');}catch(e){alert('تعذر حفظ اتفاق الأتعاب: '+e.message);}
 };
 window.feeAddPaymentV71=async id=>{
   if(!canManageOffice())return;const a=agreements().find(x=>x.id===id);if(!a||a.deletedAt||a.voidedAt)return;const remaining=Math.max(0,(+a.total||0)-paidFor(id));if(remaining<=0){alert('تم سداد الاتفاق بالكامل.');return;}
   const raw=prompt('قيمة الدفعة بالجنيه. المتبقي: '+cash(remaining),String(remaining));if(raw===null)return;const amount=Number(raw);if(!Number.isFinite(amount)||amount<=0||amount>remaining+0.00001){alert('أدخل مبلغًا صحيحًا لا يتجاوز المتبقي.');return;}
   const date=prompt('تاريخ السداد YYYY-MM-DD:',today());if(date===null)return;const method=prompt('طريقة السداد (نقدي / تحويل / إنستا باي / أخرى):','نقدي');if(method===null)return;const notes=prompt('ملاحظات الدفعة:','')||'';
   payments().push({id:'pay-'+Date.now(),agreementId:id,client:a.client,amount,date:date||today(),method,notes,receivedBy:currentUser.name,createdAt:new Date().toISOString()});
   try{await persistFees();renderFees();alert('تم تسجيل الدفعة بنجاح.');}catch(e){alert('تعذر حفظ الدفعة: '+e.message);}
 };
 window.feeReceiptV71=id=>{const a=agreements().find(x=>x.id===id);if(!a)return;const ps=payments().filter(x=>x.agreementId===id).sort((x,y)=>String(x.date).localeCompare(String(y.date)));const got=paidFor(id),left=Math.max(0,(+a.total||0)-got);const w=window.open('','_blank');if(!w){alert('اسمح بفتح النوافذ المنبثقة لطباعة كشف الحساب.');return;}w.document.write(`<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>كشف حساب أتعاب</title><style>body{font-family:Tahoma,Arial;padding:35px;color:#172b45}h1{color:#102b4a;border-bottom:3px solid #c99b3b;padding-bottom:12px}.box{border:1px solid #ddd;padding:14px;margin:12px 0}table{width:100%;border-collapse:collapse}td,th{padding:10px;border:1px solid #ddd;text-align:right}.sum{font-size:18px;font-weight:bold}</style><h1>مكتبي للمحاماة — مكتب هاني شحاتة</h1><h2>كشف حساب أتعاب موكل</h2><div class="box">الموكل: <b>${safe(a.client)}</b><br>رقم القضية: ${safe(a.caseNumber||'—')}<br>وصف الاتفاق: ${safe(a.description||'—')}</div><div class="box sum">المتفق عليه: ${cash(a.total)} — المحصّل: ${cash(got)} — المتبقي: ${cash(left)}</div><table><tr><th>التاريخ</th><th>المبلغ</th><th>طريقة السداد</th><th>ملاحظات</th></tr>${ps.map(x=>`<tr><td>${safe(x.date)}</td><td>${cash(x.amount)}</td><td>${safe(x.method||'—')}</td><td>${safe(x.notes||'—')}</td></tr>`).join('')}</table><p>صدر بتاريخ: ${safe(today())}</p><script>window.onload=()=>window.print()<\/script>

</html>`);w.document.close();};
 window.renderFeesV712=renderFees;
 function navClickV71(e){const b=e.target.closest('[data-page="clientfees"]');if(b&&currentUser){e.preventDefault();if(!canManageOffice()){alert('هذه الصفحة متاحة للمدير ومديرة المكتب فقط.');return;}page='clientfees';render();}}
 render=function(){addNav();if(page==='clientfees'){renderFees();return;}baseRender();addNav();};
 // Ensure manager-only visibility even after the regular renderer rebuilds page content.
 const oldLoad=loadCloudState;loadCloudState=async function(){await oldLoad();if(canManageOffice()){db.clientFeeAgreements=db.clientFeeAgreements||[];db.clientFeePayments=db.clientFeePayments||[];}};
})();



/* V7.2 — Smart calendar and in-app/browser reminders. Events are derived from
   existing sessions, administrative tasks and pending announcements; no schema changes. */
(function(){
 const style=document.createElement('style');
 style.textContent=`
 .v72-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
 .v72-controls{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.v72-month{font-weight:800;color:#17324d;font-size:19px;min-width:155px;text-align:center}
 .v72-layout{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:14px}
 .v72-calendar,.v72-list{background:#fff;border:1px solid #e7eaf0;border-radius:15px;padding:14px;min-width:0;box-shadow:0 4px 15px #162b4408}
 .v72-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}
 .v72-weekday{text-align:center;color:#718096;font-size:12px;padding:7px 0;font-weight:700}
 .v72-day{border:1px solid #edf0f4;border-radius:10px;min-height:78px;padding:7px 5px;background:#fff;text-align:right;cursor:pointer;color:#26394d;min-width:0}
 .v72-day:hover,.v72-day.selected{border-color:#b99a56;background:#fbf8f0}.v72-day.muted{opacity:.38}.v72-day.today{box-shadow:inset 0 0 0 1px #b99a56}.v72-daynum{font-size:12px;font-weight:800}.v72-dots{display:flex;gap:3px;margin-top:8px;flex-wrap:wrap}.v72-dot{width:7px;height:7px;border-radius:50%;display:inline-block;background:#b28d42}.v72-dot.task{background:#3b789c}.v72-dot.ad{background:#b65a5a}.v72-count{font-size:10px;color:#66758a;margin-top:4px}
 .v72-event{padding:10px 0;border-bottom:1px solid #edf0f4;display:flex;gap:9px;align-items:flex-start}.v72-event:last-child{border-bottom:0}.v72-eventmark{width:9px;height:9px;border-radius:50%;margin-top:5px;flex:none;background:#b28d42}.v72-eventmark.task{background:#3b789c}.v72-eventmark.ad{background:#b65a5a}.v72-event strong{display:block;color:#17324d;font-size:13px}.v72-event small{display:block;color:#7b8796;margin-top:3px;font-size:11px}.v72-empty{padding:22px 8px;text-align:center;color:#8994a2;font-size:13px}
 .v72-alert{border:1px solid #eadfbe;background:#fbf8ef;color:#705a2d;border-radius:12px;padding:11px 13px;margin-bottom:13px;font-size:13px}
 @media(max-width:850px){.v72-layout{grid-template-columns:1fr}.v72-day{min-height:60px;padding:5px 3px}.v72-count{font-size:9px}}
 `;document.head.appendChild(style);
 const baseRender=render;
 const pad=n=>String(n).padStart(2,'0');
 const dateKey=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const parseDate=s=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return null;const [y,m,d]=s.split('-').map(Number);const x=new Date(y,m-1,d);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?x:null;};
 const monthState=()=>{if(!window.v72Month){const n=new Date();window.v72Month=new Date(n.getFullYear(),n.getMonth(),1);}return window.v72Month;};
 const events=()=>{
   const out=[];
   (db.cases||[]).forEach((x,i)=>{if(!x.archived&&parseDate(x.date))out.push({id:`session-${i}-${x.date}`,date:x.date,type:'session',title:'جلسة قضية',client:x.client,detail:[x.number&&'قضية '+x.number,x.court].filter(Boolean).join(' — ')});});
   (tasks()||[]).forEach((x,i)=>{if(parseDate(x.date)&&x.status!=='تم التنفيذ')out.push({id:`task-${i}-${x.date}-${x.task||''}`,date:x.date,type:'task',title:x.task||'مهمة إدارية',client:x.client,detail:[x.court,x.assignee&&'المسؤول: '+x.assignee].filter(Boolean).join(' — ')});});
   (db.announcements||[]).forEach((x,i)=>{const d=x.deliveryDate||x.session;if(!x.archived&&!x.delivered&&parseDate(d))out.push({id:`ad-${i}-${d}`,date:d,type:'ad',title:'متابعة إعلان رقم '+(x.number||'—'),client:x.client,detail:[x.court,x.bailiff&&'المحضر: '+x.bailiff].filter(Boolean).join(' — ')});});
   return out.sort((a,b)=>a.date.localeCompare(b.date)||a.type.localeCompare(b.type));
 };
 const fmt=d=>{const x=parseDate(d);return x?x.toLocaleDateString('ar-EG',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):d;};
 function renderCalendar(){
   const month=monthState(), year=month.getFullYear(), m=month.getMonth(), first=new Date(year,m,1), start=new Date(year,m,1-first.getDay());
   const all=events(), todayKey=dateKey(new Date());
   if(!window.v72SelectedDate)window.v72SelectedDate=todayKey;
   const selected=window.v72SelectedDate;
   const dayNames=['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
   let cells='';
   for(let i=0;i<42;i++){
     const d=new Date(start.getFullYear(),start.getMonth(),start.getDate()+i), key=dateKey(d), items=all.filter(e=>e.date===key);
     const dots=items.slice(0,5).map(e=>`<i class="v72-dot ${e.type==='task'?'task':e.type==='ad'?'ad':''}"></i>`).join('');
     cells+=`<button class="v72-day ${d.getMonth()!==m?'muted':''} ${key===todayKey?'today':''} ${key===selected?'selected':''}" onclick="v72SelectDate('${key}')"><span class="v72-daynum">${d.getDate()}</span><div class="v72-dots">${dots}</div>${items.length?`<div class="v72-count">${items.length} موعد</div>`:''}</button>`;
   }
   const selectedEvents=all.filter(e=>e.date===selected);
   const upcoming=all.filter(e=>e.date>=todayKey).slice(0,8);
   const todayEvents=all.filter(e=>e.date===todayKey);
   const list=selectedEvents.length?selectedEvents.map(e=>`<div class="v72-event"><i class="v72-eventmark ${e.type==='task'?'task':e.type==='ad'?'ad':''}"></i><div><strong>${esc(e.title)}${e.client?' — '+esc(e.client):''}</strong><small>${esc(e.detail||'')}</small></div></div>`).join(''):'<div class="v72-empty">لا توجد مواعيد مسجلة في هذا اليوم.</div>';
   document.getElementById('app').innerHTML=`<div class="pagehead"><div><h1>الأجندة والتقويم الذكي</h1><div class="sub">عرض موحد للجلسات والمهام ومواعيد متابعة الإعلانات المسجلة بالمكتب.</div></div><div class="actions"><button class="btn light" onclick="v72EnableNotifications()">تفعيل تنبيهات المتصفح</button></div></div>
   ${todayEvents.length?`<div class="v72-alert">🔔 لديك اليوم ${todayEvents.length} موعد/مهمة تحتاج المتابعة. راجع تفاصيل اليوم في الأجندة.</div>`:''}
   <div class="v72-layout"><section class="v72-calendar"><div class="v72-head"><div class="v72-controls"><button class="btn light" onclick="v72MoveMonth(-1)">‹</button><div class="v72-month">${month.toLocaleDateString('ar-EG',{month:'long',year:'numeric'})}</div><button class="btn light" onclick="v72MoveMonth(1)">›</button></div><button class="btn light" onclick="v72GoToday()">اليوم</button></div><div class="v72-grid">${dayNames.map(x=>`<div class="v72-weekday">${x}</div>`).join('')}${cells}</div><div class="sub" style="margin-top:12px">🟡 جلسات　🔵 مهام　🔴 إعلانات — اضغط على أي يوم لعرض تفاصيله.</div></section>
   <section class="v72-list"><h3 style="margin:2px 0 5px;color:#17324d">مواعيد ${esc(fmt(selected))}</h3>${list}<hr style="border:0;border-top:1px solid #edf0f4;margin:14px 0"><h3 style="margin:0 0 8px;color:#17324d">أقرب المواعيد القادمة</h3>${upcoming.length?upcoming.map(e=>`<div class="v72-event"><i class="v72-eventmark ${e.type==='task'?'task':e.type==='ad'?'ad':''}"></i><div><strong>${esc(e.title)}${e.client?' — '+esc(e.client):''}</strong><small>${esc(fmt(e.date))} ${e.detail?' · '+esc(e.detail):''}</small></div></div>`).join(''):'<div class="v72-empty">لا توجد مواعيد قادمة مسجلة.</div>'}</section></div>`;
   document.getElementById('topTitle').textContent='الأجندة والتقويم الذكي';document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='calendar'));
   notifyToday(todayEvents);
 }
 window.v72SelectDate=d=>{window.v72SelectedDate=d;renderCalendar();};
 window.v72MoveMonth=n=>{const m=monthState();window.v72Month=new Date(m.getFullYear(),m.getMonth()+n,1);renderCalendar();};
 window.v72GoToday=()=>{const n=new Date();window.v72Month=new Date(n.getFullYear(),n.getMonth(),1);window.v72SelectedDate=dateKey(n);renderCalendar();};
 window.v72EnableNotifications=async()=>{if(!('Notification'in window)){alert('المتصفح لا يدعم تنبيهات سطح المكتب.');return;}try{const p=await Notification.requestPermission();alert(p==='granted'?'تم تفعيل تنبيهات المتصفح. ستظهر تنبيهات مواعيد اليوم عند فتح البرنامج.': 'لم يتم منح إذن التنبيهات. يمكنك تفعيله من إعدادات الموقع في المتصفح.');}catch(e){alert('تعذر تفعيل التنبيهات في هذا المتصفح.');}};
 function notifyToday(items){
   if(!items.length||!('Notification'in window)||Notification.permission!=='granted')return;
   const key='maktaby_v72_notified_'+dateKey(new Date());if(localStorage.getItem(key))return;
   try{new Notification('مكتبي للمحاماة — مواعيد اليوم',{body:`لديك ${items.length} موعد/مهمة اليوم. افتح الأجندة لمراجعتها.`,icon:''});localStorage.setItem(key,'1');}catch(e){}
 }
 function addNav(){const nav=document.getElementById('nav');if(nav&&!nav.querySelector('[data-page="calendar"]')){const b=document.createElement('button');b.dataset.page='calendar';b.textContent='الأجندة والتقويم';nav.insertBefore(b,nav.querySelector('[data-page="cases"]')?.nextSibling||null);b.onclick=()=>{if(!currentUser)return;page='calendar';renderCalendar();};}}
 const oldRender=render;
 render=function(){addNav();if(page==='calendar'){renderCalendar();return;}oldRender();addNav();};
})();


/* V7.2.1 hotfix: reliable navigation to client fees page.
   Capture the click before older sidebar handlers can overwrite/intercept it. */
document.addEventListener('click',function(e){
  const b=e.target&&e.target.closest?e.target.closest('#nav [data-page="clientfees"]'):null;
  if(!b)return;
  e.preventDefault();e.stopImmediatePropagation();
  if(!currentUser)return;
  if(!canManageOffice()){alert('صفحة أتعاب الموكلين والتحصيل متاحة للمدير ومديرة المكتب فقط.');return;}
  page='clientfees';
  try{render();}
  catch(err){console.error('فتح صفحة الأتعاب',err);
    const app=document.getElementById('app');
    if(app)app.innerHTML='<div class="notice">تعذر فتح صفحة الأتعاب: '+esc(String(err&&err.message||err))+'</div>';
  }
},true);

/* V7.3 — unified client & power-of-attorney dossier; non-destructive linking */
(function(){
  const makeId=(prefix)=>prefix+'_'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
  function ensureStableIds(){
    let changed=false;
    db.clients=db.clients||[]; db.powerOfAttorneys=db.powerOfAttorneys||[];
    db.clients.forEach(c=>{if(!c.clientId){c.clientId=makeId('client');changed=true;}});
    db.powerOfAttorneys.forEach(p=>{if(!p.poaId){p.poaId=makeId('poa');changed=true;}});
    return changed;
  }
  ensureStableIds();
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(e){}

  const oldSharedPayload=sharedPayload;
  sharedPayload=function(){const p=oldSharedPayload();p.clients=(db.clients||[]).map(c=>({...c,clientId:c.clientId}));p.powerOfAttorneys=(db.powerOfAttorneys||[]).map(x=>({...x}));return p;};
  const oldEmployeePayload=employeePayload;
  employeePayload=function(){const p=oldEmployeePayload();p.clients=(db.clients||[]).map(c=>({...c,clientId:c.clientId}));p.powerOfAttorneys=(db.powerOfAttorneys||[]).map(x=>({...x}));return p;};

  const oldLoadCloud=loadCloudState;
  loadCloudState=async function(){
    await oldLoadCloud();
    // V8.5.4 ROOT-CAUSE GUARD: do not let this later wrapper mutate state,
    // upload IDs, or call render() if the inner load aborted because a modal
    // opened while Supabase requests were in flight.
    if(document.querySelector('#modal.show')){window.__maktabyCloudRefreshPending=true;return;}
    const changed=ensureStableIds();
    if(changed&&canManageOffice()) await saveCloudState();
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(e){}
    if(changed) render();
  };

  const norm=s=>String(s||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');
  const clientById=id=>(db.clients||[]).find(c=>c.clientId===id);
  const linkedPoas=id=>(db.powerOfAttorneys||[]).filter(p=>p.clientId===id);

  window.linkPoaToClientV73=function(poaIndex){
    if(!canManageOffice()){alert('ربط التوكيلات بالموكلين متاح للمدير أو مديرة المكتب فقط.');return;}
    const p=db.powerOfAttorneys&&db.powerOfAttorneys[poaIndex];if(!p)return;
    const q=prompt('اكتب اسم الموكل للبحث عن ملفه.\nلن يتم الربط تلقائيًا حتى لا نربط توكيلاً بموكل غير صحيح:',p.name||'');
    if(q===null)return;
    const nq=norm(q);if(!nq){alert('اكتب اسمًا للبحث.');return;}
    const matches=(db.clients||[]).map((c,i)=>({c,i,score:norm(c.name)===nq?0:norm(c.name).includes(nq)?1:2})).filter(x=>x.score<2).sort((a,b)=>a.score-b.score||String(a.c.name).localeCompare(String(b.c.name),'ar')).slice(0,40);
    if(!matches.length){alert('لم يتم العثور على موكل مطابق. يمكنك إضافة الموكل أولاً ثم إعادة الربط.');return;}
    const menu=matches.map((x,i)=>`${i+1}) ${x.c.name}${x.c.phone?' — '+x.c.phone:''}${norm(x.c.name)===norm(p.name)?' (مطابقة اسم)':''}`).join('\n');
    const choice=Number(prompt('اختر رقم ملف الموكل الصحيح:\n'+menu,'1'))-1;
    if(!Number.isInteger(choice)||choice<0||choice>=matches.length)return;
    const target=matches[choice].c;
    if(p.clientId&&p.clientId!==target.clientId){const old=clientById(p.clientId);if(!confirm(`هذا التوكيل مرتبط حاليًا بالموكل: ${old?.name||'غير معروف'}. هل تريد نقله إلى ${target.name}؟`))return;}
    p.clientId=target.clientId;
    save();
    alert('تم ربط التوكيل بملف الموكل. لم يتم حذف أو تغيير أي بيانات في سجل التوكيلات.');
  };
  window.unlinkPoaFromClientV73=function(poaIndex){
    if(!canManageOffice())return;const p=db.powerOfAttorneys&&db.powerOfAttorneys[poaIndex];if(!p||!p.clientId)return;
    const c=clientById(p.clientId);if(!confirm(`إلغاء ربط التوكيل بملف ${c?.name||'الموكل'}؟\nسيظل التوكيل محفوظًا في سجل التوكيلات.`))return;
    delete p.clientId;save();
  };
  window.openLinkedClientV73=function(id){const c=clientById(id);if(c)openClientProfile(c.name);};

  // Replace the clients list with a unified, searchable client index.
  let clientsWorkerRenderSeqV73=0;
  renderClientsV54=async function(){
    const renderSeq=++clientsWorkerRenderSeqV73;
    ensureStableIds();
    const q=norm(window.clientSearchV54||'');
    const clients=Array.isArray(db.clients)?db.clients:[];
    const cases=Array.isArray(db.cases)?db.cases:[];
    const poas=Array.isArray(db.powerOfAttorneys)?db.powerOfAttorneys:[];

    // Build both indexes in one pass each. The former implementation scanned
    // every POA and every case again for every client (O(clients × records)).
    const poasByClient=new Map();
    for(const poa of poas){
      const key=poa?.clientId;
      if(!key)continue;
      if(!poasByClient.has(key))poasByClient.set(key,[]);
      poasByClient.get(key).push(poa);
    }
    const caseCountsByClientName=new Map();
    for(const item of cases){
      const key=String(item?.client||'');
      if(key)caseCountsByClientName.set(key,(caseCountsByClientName.get(key)||0)+1);
    }

    const candidates=clients.map((client,index)=>{
      const clientPoas=poasByClient.get(client.clientId)||[];
      const searchable=[client.name,client.phone,client.phone2,client.powerOfAttorneyNo,client.subject,
        ...clientPoas.flatMap(p=>[p.serial,p.name,p.poaNumber,p.year,p.office])];
      return {client,index,poas:clientPoas,caseCount:caseCountsByClientName.get(String(client.name||''))||0,searchText:norm(searchable.join(' '))};
    });
    const matchedIndexes=await window.MAKTABY_COMPUTE.search(candidates.map(x=>x.searchText),q);
    if(renderSeq!==clientsWorkerRenderSeqV73||page!=='clients')return;
    const matchedSet=new Set(matchedIndexes);
    const rows=candidates.filter((_,i)=>matchedSet.has(i));

    const htmlRows=rows.map(({client:c,index,poas:clientPoas,caseCount})=>{
      const linkedNumbers=clientPoas.slice(0,2).map(p=>p.poaNumber||('مسلسل '+p.serial)).join('، ');
      const actions=canManageOffice()?`<button class="btn light" onclick="editClient(${index})">تعديل</button> <button class="btn danger" onclick="archiveClientV87(${index})">نقل للأرشيف</button>`:'—';
      return `<tr><td><button class="btn light" onclick="openClientProfileByIndexV54(${index})">${esc(c.name)}</button></td><td>${esc(c.phone||'—')}</td><td>${clientPoas.length}</td><td>${esc(linkedNumbers||c.powerOfAttorneyNo||'—')}</td><td>${esc(c.subject||'—')}</td><td>${caseCount}</td><td><button class="btn goldbtn" onclick="openClientProfileByIndexV54(${index})">الملف الموحد</button></td><td>${actions}</td></tr>`;
    });
    $('#app').innerHTML=`<div class="pagehead"><div><h1>ملفات الموكلين الموحدة</h1><div class="sub">كل موكل في ملف رئيسي واحد. الحذف ينقل الملف إلى الأرشيف ولا يمسح القضايا أو التوكيلات المرتبطة.</div></div><div class="actions">${canManageOffice()?'<button class="btn light" onclick="page=\'archive\';render()">أرشيف المحذوفات</button><button class="btn goldbtn" onclick="openForm(\'client\')">+ إضافة موكل</button>':''}</div></div><div class="toolbar"><input class="search" type="search" placeholder="بحث بالاسم أو الهاتف أو رقم التوكيل أو مسلسل التوكيل..." value="${esc(window.clientSearchV54||'')}" oninput="window.clientSearchV54=this.value;scheduleSearchRender()"><span class="badge">${rows.length} ملف</span></div>${table(['اسم الموكل','الهاتف','التوكيلات المرتبطة','أرقام التوكيلات','موضوع الموكل','عدد القضايا','فتح الملف','الإجراءات'],htmlRows)}`;
    setV54Page('ملفات الموكلين','clients');
  };

  // Add a linked-POA section to the existing full client dossier.
  const oldProfile=renderClientProfileV54;
  renderClientProfileV54=async function(){
    await oldProfile();
    const c=(db.clients||[]).find(x=>x.name===selectedClientNameV54);if(!c)return;
    const app=$('#app');if(!app||app.querySelector('#clientPoaPanelV73'))return;
    const ps=linkedPoas(c.clientId).slice().sort((a,b)=>(Number(a.serial)||0)-(Number(b.serial)||0));
    const poaRows=ps.map(p=>{const i=db.powerOfAttorneys.indexOf(p);return `<tr><td>${esc(p.serial??'—')}</td><td>${esc(p.name||'—')}</td><td>${esc(p.poaNumber||'—')}</td><td>${esc(p.year||'—')}</td><td>${esc(p.office||'—')}</td><td>${(p.photos||[]).length}</td><td>${canManageOffice()?`<button class="btn light" onclick="unlinkPoaFromClientV73(${i})">إلغاء الربط</button>`:'—'}</td></tr>`;});
    const unlinked=(db.powerOfAttorneys||[]).filter(p=>!p.clientId&&norm(p.name)===norm(c.name));
    const panel=document.createElement('section');panel.id='clientPoaPanelV73';panel.className='panel';panel.style.marginBottom='16px';
    panel.innerHTML=`<div class="pagehead"><div><h3>التوكيلات المرتبطة بالموكل</h3><div class="sub">التوكيلات المرتبطة بهذا الملف: ${ps.length}. كل سجل توكيل يظل مستقلًا حتى عند تكرار الرقم أو الاسم.</div></div><div class="actions">${canManageOffice()?`<button class="btn goldbtn" onclick="page='poa';render()">فتح سجل التوكيلات لربط سجل</button>`:''}</div></div>${unlinked.length?`<div class="notice">وجدنا ${unlinked.length} سجل توكيل غير مرتبط بنفس اسم الموكل. راجعها واربط الصحيح يدويًا من سجل التوكيلات؛ لم نربطها تلقائيًا.</div>`:''}${ps.length?table(['المسلسل','اسم صاحب التوكيل','رقم التوكيل','التاريخ / السنة','مكتب التوثيق','المرفقات','الإجراء'],poaRows):'<div class="empty">لا توجد توكيلات مرتبطة بهذا الموكل حتى الآن. يمكنك ربطها من سجل التوكيلات.</div>'}`;
    app.appendChild(panel);
  };

  // Enhance the existing POA register with current client link status and a safe manual link action.
  const priorRender=render;
  render=function(){
    priorRender();
    if(page!=='poa')return;
    const tableEl=$('#app table');if(!tableEl)return;
    const head=tableEl.querySelector('thead tr');if(head&&!head.querySelector('[data-v73="client"]')){const th=document.createElement('th');th.dataset.v73='client';th.textContent='ملف الموكل';head.appendChild(th);}
    const q=norm(window.poaSearch||'');
    const visible=(db.powerOfAttorneys||[]).filter(x=>!q||[x.serial,x.name,x.poaNumber,x.year,x.office,x.notes].some(v=>norm(v).includes(q))).slice().sort((a,b)=>(Number(a.serial)||0)-(Number(b.serial)||0));
    [...tableEl.querySelectorAll('tbody tr')].forEach((tr,i)=>{
      const p=visible[i];if(!p||tr.querySelector('[data-v73="client"]'))return;
      const td=document.createElement('td');td.dataset.v73='client';const client=clientById(p.clientId);
      if(client){td.innerHTML=`<button class="btn light" onclick="openLinkedClientV73('${esc(client.clientId)}')">${esc(client.name)}</button>${canManageOffice()?`<button class="btn light" style="margin-inline-start:4px" onclick="linkPoaToClientV73(${db.powerOfAttorneys.indexOf(p)})">تغيير</button>`:''}`;}
      else td.innerHTML=`<span class="pill open">غير مرتبط</span> ${canManageOffice()?`<button class="btn goldbtn" onclick="linkPoaToClientV73(${db.powerOfAttorneys.indexOf(p)})">ربط بموكل</button>`:''}`;
      tr.appendChild(td);
    });
  };

  // Ensure any newly added clients and POAs receive stable identifiers before persistence.
  const oldSave=save;
  save=async function(){ensureStableIds();return oldSave();};
  console.info('MAKTABY V7.3 unified client/POA linking loaded');
})();


/* V7.4 — management reports, date filters, CSV export and print */
(function(){
 const escHtml=s=>typeof esc==='function'?esc(String(s??'')):String(s??'');
 const todayKey=()=>typeof today==='function'?today():new Date().toISOString().slice(0,10);
 function reportData(){
   const from=document.getElementById('rFrom')?.value||'';
   const to=document.getElementById('rTo')?.value||'';
   const inRange=d=>!!d&&(!from||d>=from)&&(!to||d<=to);
   const cases=[...(db.cases||[]),...(db.caseArchive||[])];
   const hearings=cases.filter(c=>inRange(c.date));
   const announcements=[...(db.announcements||[]),...(db.announcementArchive||[])];
   const ads=announcements.filter(a=>inRange(a.deliveryDate||a.receivedDate||a.session));
   const taskRows=(typeof tasks==='function'?tasks():db.tasks||[]).filter(t=>inRange(t.date));
   return {from,to,cases,hearings,announcements,ads,taskRows};
 }
 function renderReports(){
   if(!canManageOffice()){alert('التقارير الإدارية متاحة للمدير ومديرة المكتب فقط.');page='dashboard';render();return;}
   const d=reportData();
   const activeCases=(db.cases||[]).filter(c=>!c.archived);
   const doneCases=(db.caseArchive||[]).length;
   const pendingAds=(db.announcements||[]).filter(a=>!a.delivered&&!a.archived);
   const doneAds=(db.announcementArchive||[]).length;
   const openTasks=d.taskRows.filter(t=>t.status!=='تم التنفيذ');
   const doneTasks=d.taskRows.filter(t=>t.status==='تم التنفيذ');
   const lateTasks=d.taskRows.filter(t=>t.status==='متأخر');
   const courtMap={};d.hearings.forEach(c=>{const k=c.court||'غير محدد';courtMap[k]=(courtMap[k]||0)+1;});
   const courtRows=Object.entries(courtMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
   const clientRows=(db.clients||[]).map(c=>({name:c.name,count:d.hearings.filter(x=>x.client===c.name).length})).filter(x=>x.count).sort((a,b)=>b.count-a.count).slice(0,10);
   const metric=(label,value,sub='')=>`<div class="card"><div class="statlabel">${label}</div><div class="statnum gold">${value}</div><div class="sub">${sub}</div></div>`;
   const from=d.from||'—',to=d.to||'—';
   document.getElementById('app').innerHTML=`<div class="pagehead"><div><h1>مركز التقارير والإحصائيات</h1><div class="sub">مؤشرات تشغيلية للمكتب وفق البيانات المسجلة. اختر فترة التقرير ثم اطبع أو صدّر النتائج.</div></div><div class="actions"><button class="btn light" onclick="window.print()">طباعة التقرير</button><button class="btn goldbtn" onclick="exportReportsV74()">تصدير CSV</button></div></div>
   <section class="panel" style="margin-bottom:14px"><div class="toolbar"><label>من <input id="rFrom" type="date" value="${escHtml(d.from)}"></label><label>إلى <input id="rTo" type="date" value="${escHtml(d.to)}"></label><button class="btn goldbtn" onclick="renderReportsV74()">تحديث التقرير</button><button class="btn light" onclick="document.getElementById('rFrom').value='';document.getElementById('rTo').value='';renderReportsV74()">كل الفترات</button></div><div class="sub">الفترة الحالية: ${escHtml(from)} إلى ${escHtml(to)}. مؤشرات الأرصدة الحالية مستقلة عن فلتر الفترة.</div></section>
   <div class="stats">${metric('إجمالي الموكلين',(db.clients||[]).length,'ملفات الموكلين')}${metric('القضايا النشطة',activeCases.length,'القضايا الموجودة حاليًا')}${metric('القضايا المؤرشفة',doneCases,'القضايا المنتهية / المؤرشفة')}${metric('جلسات داخل الفترة',d.hearings.length,'حسب تاريخ الجلسة المسجل')}${metric('إعلانات لم تستلم',pendingAds.length,'الرصيد الحالي')}${metric('إعلانات مؤرشفة',doneAds,'تم إثبات استلامها')}${metric('مهام مفتوحة داخل الفترة',openTasks.length,'غير مكتملة')}${metric('مهام متأخرة داخل الفترة',lateTasks.length,'تحتاج متابعة')}</div>
   <div class="grid"><section class="panel"><h3>حركة الجلسات حسب المحكمة</h3>${table(['المحكمة / الدائرة','عدد الجلسات'],courtRows.map(x=>`<tr><td>${escHtml(x[0])}</td><td>${x[1]}</td></tr>`))}</section><section class="panel"><h3>أكثر الموكلين جلسات خلال الفترة</h3>${table(['الموكل','عدد الجلسات'],clientRows.map(x=>`<tr><td>${escHtml(x.name)}</td><td>${x.count}</td></tr>`))}</section></div>
   <div class="grid" style="margin-top:14px"><section class="panel"><h3>ملخص المهام داخل الفترة</h3>${table(['المؤشر','العدد'],[['مهام مسجلة',d.taskRows.length],['مكتملة',doneTasks.length],['مفتوحة',openTasks.length],['متأخرة',lateTasks.length]].map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`))}</section><section class="panel"><h3>ملخص الإعلانات داخل الفترة</h3>${table(['المؤشر','العدد'],[['إعلانات ضمن الفترة',d.ads.length],['قيد المتابعة حاليًا',pendingAds.length],['مؤرشفة / مستلمة إجمالًا',doneAds]].map(x=>`<tr><td>${x[0]}</td><td>${x[1]}</td></tr>`))}</section></div>
   <div class="notice" style="margin-top:14px">تنبيه: التقرير يعتمد على التواريخ المسجلة حاليًا (تاريخ الجلسة / التسليم / المهمة)، ولا يستنتج تاريخ فتح القضية أو تاريخ إنشاء الموكل إذا لم يكن محفوظًا في السجل. لا يتضمن هذا الإصدار تسوية مالية أو حساب أرباح.</div>`;
   document.getElementById('topTitle').textContent='مركز التقارير والإحصائيات';document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='reports'));
 }
 window.renderReportsV74=renderReports;
 window.exportReportsV74=function(){
   const d=reportData();const rows=[['نوع التقرير','التاريخ','الموكل','رقم القضية/الإعلان','المحكمة','الحالة/القرار']];
   d.hearings.forEach(c=>rows.push(['جلسة',c.date||'',c.client||'',c.number||'',c.court||'',c.result||'']));
   d.ads.forEach(a=>rows.push(['إعلان',a.deliveryDate||a.receivedDate||a.session||'',a.client||'',a.number||'',a.court||'',a.status||(a.delivered?'تم الاستلام':'قيد الإعلان')]));
   d.taskRows.forEach(t=>rows.push(['مهمة',t.date||'',t.client||'',t.task||'',t.court||'',t.status||'']));
   const csv='\ufeff'+rows.map(r=>r.map(v=>'"'+String(v??'').replace(/"/g,'""')+'"').join(',')).join('\r\n');
   const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Maktaby_Reports_'+todayKey()+'.csv';document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
 const nav=document.getElementById('nav');
 if(nav&&!nav.querySelector('[data-page="reports"]')){const b=document.createElement('button');b.dataset.page='reports';b.textContent='التقارير والإحصائيات';const anchor=nav.querySelector('[data-page="employees"]')||nav.querySelector('[data-page="tasks"]');if(anchor)anchor.insertAdjacentElement('afterend',b);else nav.appendChild(b);b.onclick=()=>{if(!currentUser)return;if(!canManageOffice()){alert('التقارير الإدارية متاحة للمدير ومديرة المكتب فقط.');return;}page='reports';renderReports();};}
 const prev=render;render=function(){if(page==='reports'){renderReports();return;}prev();};
})();


/* V7.4.2 dashboard alert panel removed: alerts are displayed only in the permanent sidebar box. */

/* ===== Legacy UI segment 04 (preserved order) ===== */

/* V7.4.4 — alert rows are also direct navigation shortcuts */
(function(){
 if(window.__v743DashboardLinks)return;window.__v743DashboardLinks=true;
 const style=document.createElement('style');style.textContent='[data-dashboard-go]{cursor:pointer;transition:transform .15s,box-shadow .15s}[data-dashboard-go]:focus-visible{outline:3px solid #b99a58;outline-offset:3px}.v70-stat[data-dashboard-go]:hover{transform:translateY(-2px);box-shadow:0 8px 22px #162b4418}.v70-achieve[data-dashboard-go]:hover{background:#f8f6f0;border-radius:7px}.v70-panel tr[data-dashboard-go]:hover{background:#f7f4ed}';document.head.appendChild(style);
 function go(el){const target=el&&el.getAttribute('data-dashboard-go');if(!target)return;
  if(target==='income'&&!canManageOffice())return;if(target==='enumerations'&&!canViewEnumerations())return;if(target==='approvals'&&!canReview())return;
  if(currentUser?.role==='employee'&&!['dashboard','cases','announcements','tasks','accounts',...(isLimitedStaff()?['enumerations']:[])].includes(target))return;
  if(target==='poa'&&!canManageOffice())return;
  page=target;render();
 }
 document.addEventListener('click',e=>{const el=e.target.closest&&e.target.closest('[data-dashboard-go]');if(el){e.preventDefault();go(el);}});
 document.addEventListener('keydown',e=>{if(e.key!=='Enter'&&e.key!==' ')return;const el=e.target.closest&&e.target.closest('[data-dashboard-go]');if(el&&el.tagName!=='TR'){e.preventDefault();go(el);}});
})();


/* ===== Legacy UI segment 05 (preserved order) ===== */


/* V7.4.6 — تطبيق قرارات مراجعة هاني لربط التوكيلات بالعملاء
   لا يدمج سجلات العملاء ولا يحذف أو يعدل أي حركة مالية أو قضائية.
   التنفيذ يدوي من زر المدير بعد تحميل بيانات المكتب. */
(function(){
  const APPROVED_POA_LINKS_V746 = [];
  const normApprovedV746 = s => String(s||'').normalize('NFKC')
    .replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه')
    .replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');

  function applyApprovedPoaLinksV746(){
    if(typeof canManageOffice!=='function' || !canManageOffice()){
      alert('اعتماد ربط التوكيلات متاح للمدير أو مديرة المكتب فقط.'); return;
    }
    const clients=db.clients||[], poas=db.powerOfAttorneys||[];
    let linked=0, already=0, skipped=[];
    for(const item of APPROVED_POA_LINKS_V746){
      const ps=poas.filter(p=>String(p.serial)===String(item.serial) &&
        normApprovedV746(p.name)===normApprovedV746(item.poaName));
      const cs=clients.filter(c=>normApprovedV746(c.name)===normApprovedV746(item.clientName));
      if(ps.length!==1){skipped.push('التوكيل مسلسل '+item.serial+': '+(ps.length?'تكرار سجل التوكيل':'غير موجود'));continue;}
      if(cs.length!==1){skipped.push('العميل «'+item.clientName+'»: '+(cs.length?'اسم عميل مكرر':'ملف العميل غير موجود'));continue;}
      const p=ps[0], c=cs[0];
      if(p.clientId===c.clientId){already++;continue;}
      if(p.clientId){skipped.push('التوكيل مسلسل '+item.serial+': مرتبط مسبقًا بملف آخر');continue;}
      p.clientId=c.clientId;
      linked++;
    }
    if(linked){ 
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(e){}
      Promise.resolve(save()).then(()=>{
        let msg='تم اعتماد '+linked+' ربطًا جديدًا.';
        if(already)msg+='\n'+already+' توكيلات كانت مرتبطة بالفعل.';
        if(skipped.length)msg+='\n\nحالات لم تُنفذ حفاظًا على سلامة البيانات ('+skipped.length+'):\n'+skipped.join('\n');
        alert(msg);
      }).catch(e=>alert('تم تحديث البيانات محليًا، لكن تعذرت المزامنة: '+(e.message||e)));
    } else {
      alert('لم يتم إجراء تغييرات.'+(already?'\n'+already+' توكيلات مرتبطة بالفعل.':'')+
        (skipped.length?'\n\nحالات تحتاج مراجعة:\n'+skipped.join('\n'):''));
    }
  }
  window.applyApprovedPoaLinksV746=applyApprovedPoaLinksV746;
  function addApprovedButtonV746(){
    const nav=document.getElementById('nav');
    if(!nav || nav.querySelector('[data-approved-poa-v746]'))return;
    const b=document.createElement('button');
    b.type='button'; b.dataset.approvedPoaV746='1';
    b.textContent='اعتماد ربط التوكيلات';
    b.title='تطبيق قرارات المراجعة المعتمدة دون دمج ملفات العملاء';
    b.style.cssText='border:1px solid #b58b3b;color:#8a641e;font-weight:700;';
    b.addEventListener('click',applyApprovedPoaLinksV746);
    nav.appendChild(b);
  }
  setInterval(addApprovedButtonV746,5000);
})();



/* V7.5 FIX — visible client actions, POA owner import and merge */
(function(){
 'use strict';
 const norm=s=>String(s||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');
 const newId=()=> 'client_'+(window.crypto&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'_'+Math.random().toString(36).slice(2));
 const escV=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 window.importPoaOwnersAsClientsV75=async function(){
  if(!canManageOffice()){alert('هذه العملية متاحة للمدير أو مديرة المكتب فقط.');return;}
  db.clients=db.clients||[];db.powerOfAttorneys=db.powerOfAttorneys||[];
  const poas=db.powerOfAttorneys.filter(p=>String(p.name||'').trim());
  if(!poas.length){alert('لم يتم العثور على أسماء في سجل التوكيلات. افتح سجل التوكيلات وتأكد من تحميل البيانات أولًا.');return;}
  const existing=new Map();db.clients.forEach(c=>{const k=norm(c.name);if(k&&!existing.has(k))existing.set(k,c);});
  const unique=new Map();poas.forEach(p=>{const k=norm(p.name);if(k&&!unique.has(k))unique.set(k,String(p.name).trim());});
  const toAdd=[...unique.entries()].filter(([k])=>!existing.has(k));
  const unlinked=poas.filter(p=>!p.clientId).length;
  if(!confirm(`سجل التوكيلات يحتوي على ${poas.length} توكيلًا بأسماء أصحابها.\nأسماء أصحاب التوكيلات المختلفة: ${unique.size}\nعملاء جدد ستتم إضافتهم: ${toAdd.length}\nتوكيلات غير مرتبطة حاليًا: ${unlinked}\n\nسيتم إنشاء ملف لكل اسم غير موجود وربط التوكيلات بملف الاسم المطابق. الأسماء المتشابهة غير المتطابقة ستظل منفصلة. هل نبدأ؟`))return;
  let added=0,linked=0,kept=0;
  for(const [k,name] of toAdd){const c={clientId:newId(),name,phone:'',phone2:'',powerOfAttorneyNo:'',subject:'',fees:'',notes:'تم إنشاء ملف العميل من سجل التوكيلات.'};db.clients.push(c);existing.set(k,c);added++;}
  for(const p of poas){const c=existing.get(norm(p.name));if(!c)continue;if(!p.clientId){p.clientId=c.clientId;linked++;}else if(p.clientId===c.clientId)kept++;}
  try{await save();alert(`تمت الإضافة والربط بنجاح.\nعملاء جدد: ${added}\nتوكيلات تم ربطها الآن: ${linked}\nتوكيلات كانت مرتبطة بالفعل: ${kept}\n\nافتح صفحة العملاء وستجد الأسماء ضمن القائمة، ويمكنك البحث باسم صاحب التوكيل.`);page='clients';render();}
  catch(e){alert('لم تكتمل المزامنة مع السحابة. لا تعتمد التعديل قبل ظهور حالة «تم الحفظ والمزامنة». التفاصيل: '+(e.message||e));}
 };
 function chooseClient(title,excludeId){
  const list=(db.clients||[]).filter(c=>c.clientId!==excludeId).slice().sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'ar'));
  const q=prompt(title+'\nاكتب جزءًا من اسم العميل للبحث:','');if(q===null)return null;
  const matches=list.filter(c=>norm(c.name).includes(norm(q))).slice(0,40);
  if(!matches.length){alert('لا توجد أسماء مطابقة. جرّب جزءًا آخر من الاسم.');return null;}
  const menu=matches.map((c,i)=>`${i+1}) ${c.name}${c.phone?' — '+c.phone:''}`).join('\n');
  const n=Number(prompt('اختر رقم العميل من النتائج:\n'+menu,'1'));
  if(!Number.isInteger(n)||n<1||n>matches.length)return null;
  return matches[n-1];
 }
 window.mergeClientsV75=async function(){
  if(!isAdmin()){alert('لضمان نقل البيانات المالية والمستندات بشكل صحيح، تنفيذ الدمج متاح لحساب المدير الرئيسي فقط.');return;}
  db.clients=db.clients||[];if(db.clients.length<2){alert('لا يوجد عميلان للدمج.');return;}
  const src=chooseClient('الخطوة الأولى: اختر العميل المكرر الذي تريد ضمه.');if(!src)return;
  const dst=chooseClient('الخطوة الثانية: اختر العميل الأساسي الذي سيبقى في السجل.',src.clientId);if(!dst)return;
  if(!confirm(`تأكيد دمج «${src.name}» داخل «${dst.name}»؟\n\nسيتم نقل ارتباطات القضايا والجلسات والإعلانات والتوكيلات والمصروفات والحركات المالية والأتعاب إلى العميل الأساسي، مع تحديث مستنداته. سيُحذف ملف العميل المكرر فقط بعد نجاح الحفظ.`))return;
  const oldName=src.name,newName=dst.name,oldId=src.clientId,newId=dst.clientId;
  const arrays=['cases','announcements','announcementArchive','caseArchive','cloudExpenses','transactions','clientFeeAgreements','clientFeePayments','manualFeeExpenses'];
  let changed=0;
  for(const key of arrays){for(const row of (db[key]||[])){let hit=false;if(row.clientId===oldId){row.clientId=newId;hit=true;}if(row.client===oldName){row.client=newName;hit=true;}if(row.clientName===oldName){row.clientName=newName;hit=true;}if(row.client_name===oldName){row.client_name=newName;hit=true;}if(hit)changed++;}}
  for(const p of (db.powerOfAttorneys||[])){if(p.clientId===oldId){p.clientId=newId;changed++;}}
  // Preserve all profile fields that are missing on the surviving client.
  ['phone','phone2','powerOfAttorneyNo','subject','fees'].forEach(k=>{if(!dst[k]&&src[k])dst[k]=src[k];});
  if(src.notes)dst.notes=[dst.notes,src.notes].filter(Boolean).join('\n');
  try{
   // Save shared + financial office state first; keep source profile until success.
   await saveCloudState();
   // Documents are stored separately and keyed by client_name in this app.
   const {error:docError}=await sb.from('client_documents').update({client_name:newName}).eq('client_name',oldName);
   if(docError)throw new Error('تم حفظ بيانات المكتب لكن تعذر نقل أسماء المستندات: '+docError.message+' — لم نحذف ملف العميل المكرر.');
   db.clients=db.clients.filter(c=>c.clientId!==oldId);
   await saveCloudState();
   try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(e){}
   alert(`تم الدمج بنجاح.\nالعميل المدموج: ${oldName}\nالعميل الأساسي: ${newName}\nالارتباطات التي تم تحديثها: ${changed}\nتم تحديث اسم صاحب المستندات أيضًا.`);
   page='clients';render();
  }catch(e){
   try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(_e){}
   alert('توقف الدمج لحماية البيانات: '+(e.message||e)+'\nلم يتم حذف ملف العميل المكرر إذا لم يكتمل النقل. راجع حالة المزامنة قبل إعادة المحاولة.');
  }
 };
 function addClientActions(){
  if(page!=='clients'||!currentUser||!canManageOffice())return;
  const app=document.getElementById('app');if(!app)return;
  const head=app.querySelector('.pagehead');if(!head)return;
  let box=app.querySelector('[data-v75-actions]');if(box)return;
  box=document.createElement('div');box.dataset.v75Actions='1';box.style.cssText='display:flex;gap:9px;flex-wrap:wrap;margin:0 0 14px;';
  box.innerHTML='<button type="button" class="btn goldbtn" onclick="importPoaOwnersAsClientsV75()">إضافة أصحاب التوكيلات إلى العملاء</button><button type="button" class="btn light" onclick="mergeClientsV75()">دمج عميلين مكررين</button>';
  head.insertAdjacentElement('afterend',box);
 }
 // Avoid waking the legacy DOM scan every 3 seconds while the user is elsewhere.
 // The navigation click still mounts the actions immediately; focus/visibility
 // handlers cover returning to the tab without changing client data or permissions.
 setInterval(()=>{if(!document.hidden)addClientActions();},15000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)addClientActions();});
 window.addEventListener('focus',addClientActions,{passive:true});
 document.addEventListener('click',e=>{const b=e.target.closest('[data-page="clients"]');if(b)setTimeout(addClientActions,150);},true);
})();


/* ===== Legacy UI segment 06 (preserved order) ===== */

/* V8.4 modal refresh guard: remove the V8.2 active form polling/MutationObserver guard. It could race with mobile input and restore stale values. Form contents are no longer polled or forcibly rewritten. */
window.__maktabyV82Installed=false;


/* ===== Legacy UI segment 07 (preserved order) ===== */

(()=>{
 const PREFIX='maktaby_v851_draft:'; const $=q=>document.querySelector(q); let activeKey='';let baselineUntil=0;let previousValues={};let lastSavedAt=0;
 const modalOpen=()=>!!$('#modal')?.classList.contains('show');
 function key(){let type=(typeof formType!=='undefined'&&formType)||'unknown';let index='new';try{if(type==='client'&&typeof editingClientIndexV54!=='undefined'&&editingClientIndexV54!==null)index='edit-'+editingClientIndexV54;else if(type==='case'&&typeof editingCaseIndex!=='undefined'&&editingCaseIndex!==null)index='edit-'+editingCaseIndex;else if(type==='task'&&typeof editingTaskIndex!=='undefined'&&editingTaskIndex!==null)index='edit-'+editingTaskIndex;else if(type==='announcement'&&typeof editingAnnouncementIndex!=='undefined'&&editingAnnouncementIndex!==null)index='edit-'+editingAnnouncementIndex;else if(type==='enumeration'&&typeof editingEnumerationIndex!=='undefined'&&editingEnumerationIndex!==null)index='edit-'+editingEnumerationIndex;}catch{}return PREFIX+type+':'+index;}
 function values(){const out={};$('#formFields')?.querySelectorAll('[name]').forEach(el=>out[el.name]=el.value);return out;}
 function paint(msg,kind){const el=$('#maktabyV85Status');if(!el)return;const dot=el.querySelector('.maktaby-v85-dot'),label=el.querySelector('.maktaby-v85-label');if(label)label.textContent=msg;const color=kind==='ok'?'#22c55e':kind==='error'?'#ef4444':'#eab308';if(dot){dot.style.background=color;dot.style.boxShadow='0 0 0 3px '+color+'33';}el.dataset.kind=kind;}
 function draftSave(){if(!modalOpen())return;const v=values();if(!Object.values(v).some(x=>String(x||'').length))return;const data={key:activeKey||key(),values:v,savedAt:new Date().toISOString(),title:$('#modalTitle')?.textContent||''};try{localStorage.setItem(data.key,JSON.stringify(data));lastSavedAt=Date.now();paint('مسودة محفوظة على هذا الجهاز','pending');}catch(e){paint('تعذر حفظ المسودة محليًا','error');}}
 function restoreDraft(quiet=false){if(!modalOpen())return;const k=activeKey||key();let d;try{d=JSON.parse(localStorage.getItem(k)||'null')}catch{}if(!d?.values)return false;const age=Date.now()-Date.parse(d.savedAt||'');if(!Number.isFinite(age)||age>7*86400000)return false;const root=$('#formFields');if(!root)return false;const current=values();const hasValue=Object.values(current).some(x=>String(x||'').trim());if(hasValue)return false;if(!quiet&&!confirm('تم العثور على مسودة غير مكتملة لهذا النموذج بتاريخ '+new Date(d.savedAt).toLocaleString('ar-EG')+'. هل تريد استعادتها؟'))return false;root.querySelectorAll('[name]').forEach(el=>{if(Object.prototype.hasOwnProperty.call(d.values,el.name))el.value=d.values[el.name]??'';});previousValues=values();paint('تم استرداد المسودة','pending');return true;}
 function mount(){if(!$('#maktabyV85Status')){const el=document.createElement('div');el.id='maktabyV85Status';el.innerHTML='<span class="maktaby-v85-dot" aria-label="حالة المزامنة"></span><span class="maktaby-v85-label"></span>';el.style.cssText='position:fixed;right:14px;bottom:14px;z-index:999990;display:flex;align-items:center;gap:9px;direction:rtl;background:#17324d;color:#fff;border:1px solid #d5ad56;border-radius:24px;padding:9px 14px;font:13px Tahoma;box-shadow:0 3px 14px #0004;min-width:185px';document.body.appendChild(el);}paint('جارٍ التحقق من مزامنة السحابة','pending');}
 // Keep typing/navigation responsive: coalesce rapid input events, but flush
 // synchronously when a field is committed or the form is submitted/closed.
 let draftTimer=0;
 const queueDraftSave=()=>{clearTimeout(draftTimer);draftTimer=setTimeout(()=>{draftTimer=0;draftSave();},180);};
 const flushDraftSave=()=>{if(draftTimer){clearTimeout(draftTimer);draftTimer=0;draftSave();}};
 document.addEventListener('input',e=>{if(e.target?.matches?.('#formFields [name]'))queueDraftSave();},true);
 document.addEventListener('change',e=>{if(e.target?.matches?.('#formFields [name]'))queueDraftSave();},true);
 document.addEventListener('focusout',e=>{if(e.target?.matches?.('#formFields [name]'))queueDraftSave();},true);
 window.addEventListener('pagehide',flushDraftSave);
 const originalOpen=window.openForm;if(typeof originalOpen==='function')window.openForm=function(type){const result=originalOpen.apply(this,arguments);activeKey=key();baselineUntil=Date.now()+250;previousValues=values();setTimeout(()=>{activeKey=key();previousValues=values();restoreDraft(false);},120);return result;};
 const originalClose=window.closeModal;if(typeof originalClose==='function')window.closeModal=function(){flushDraftSave();return originalClose.apply(this,arguments);};
 const root=$('#modal');if(root)new MutationObserver(ms=>{if(!modalOpen())return;const changed=ms.some(m=>m.type==='childList'&&m.target?.id==='formFields');if(changed&&Date.now()>baselineUntil){const now=values();const had=Object.values(previousValues).some(x=>String(x||'').length);if(had&&!Object.values(now).some(x=>String(x||'').length)){paint('تم رصد إعادة إنشاء الحقول — جارٍ استرداد المسودة','pending');restoreDraft(true);}previousValues=now;}}).observe(root,{subtree:true,childList:true});
 // Detect programmatic value loss and recover only from the matching form's last user-entered draft.
 setInterval(()=>{if(!modalOpen()||document.hidden)return;const now=values();const lost=Object.keys(previousValues).filter(k=>String(previousValues[k]||'').length&&(!String(now[k]||'').length));if(lost.length){try{const d=JSON.parse(localStorage.getItem(activeKey||key())||'null');if(d?.values){lost.forEach(k=>{const el=$('#formFields [name="'+CSS.escape(k)+'"]');if(el&&Object.prototype.hasOwnProperty.call(d.values,k)&&String(d.values[k]||'').length)el.value=d.values[k];});paint('تم استرداد حقل بعد رصد مسحه','pending');}}catch{}}previousValues=values();},2500);
 // Remove only this form's draft when a valid form submit is actually fired.
 document.addEventListener('submit',e=>{if(e.target?.id==='form'){flushDraftSave();try{localStorage.removeItem(activeKey||key());}catch{}paint('تم إرسال النموذج — جارٍ الحفظ','pending');}},true);
 // Real cloud status: online alone is not proof of a successful Supabase read/write.
 const oldLoad=window.loadCloudState;if(typeof oldLoad==='function')window.loadCloudState=async function(){if(modalOpen()){window.__maktabyCloudRefreshPending=true;return;}paint('جارٍ تحميل بيانات السحابة','pending');try{const r=await oldLoad.apply(this,arguments);if(!modalOpen())paint('تم الاتصال بالسحابة وتحميل البيانات','ok');return r;}catch(e){paint('فشل تحميل بيانات السحابة','error');throw e;}};
 const oldSave=window.saveCloudState;if(typeof oldSave==='function')window.saveCloudState=async function(){paint('جارٍ رفع التعديلات للسحابة','pending');try{const r=await oldSave.apply(this,arguments);paint('تمت المزامنة مع السحابة','ok');return r;}catch(e){paint('فشلت المزامنة — البيانات المحلية محفوظة','error');throw e;}};
 window.addEventListener('offline',()=>paint('لا يوجد اتصال — الحفظ محلي','error'));
 window.addEventListener('online',()=>paint('الإنترنت متاح — جارٍ التحقق من السحابة','pending'));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});else mount();
 window.maktabyV851={saveDraft:draftSave,restoreDraft:()=>restoreDraft(false),clearDraft:()=>localStorage.removeItem(activeKey||key()),formKey:key};
})();


/* ===== Legacy UI segment 08 (preserved order) ===== */

/* V8.5.5: central gate for every background refresh request.
   Realtime events and other callers are queued while a modal is being edited. */
(()=>{
 'use strict';
 const modalOpen=()=>!!document.querySelector('#modal.show');
 const priorRefresh=window.refreshCloud;
 if(typeof priorRefresh==='function'){
   window.refreshCloud=async function(){
     if(modalOpen()){
       window.__maktabyCloudRefreshPending=true;
       try{window.maktabyV851?.saveDraft?.();}catch(e){}
       return;
     }
     return priorRefresh.apply(this,arguments);
   };
 }
 // Also guard direct load calls made by older modules, not only Realtime callbacks.
 const priorLoad=window.loadCloudState;
 if(typeof priorLoad==='function'){
   window.loadCloudState=async function(){
     if(modalOpen()){
       window.__maktabyCloudRefreshPending=true;
       try{window.maktabyV851?.saveDraft?.();}catch(e){}
       return;
     }
     return priorLoad.apply(this,arguments);
   };
 }
})();


/* ===== Legacy UI segment 09 (preserved order) ===== */

(()=>{'use strict';
const KEY='maktaby_v86_legal_docs_local';
const defaults={lawyers:[],poaTemplate:'أنا الموقع أدناه / {{client}}، حامل بطاقة رقم قومي {{nid}}، قد وكلت كلًا من {{lawyers}} {{capacity}} في {{powers}}.',agreements:[],messages:[]};
const read=()=>{try{const x={...defaults,...JSON.parse(localStorage.getItem(KEY)||'{}')};x.lawyers=(x.lawyers||[]).map(v=>typeof v==='string'?{name:v,nid:''}:{name:v.name||'',nid:v.nid||''});return x}catch{return {...defaults}}};
const save=d=>localStorage.setItem(KEY,JSON.stringify(d));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const val=id=>document.getElementById(id)?.value||'';
function nav(){document.querySelectorAll('#nav [data-page="legaldocs"]').forEach(b=>b.remove())}
function open(){document.getElementById('maktabyLeadDocsModal')?.remove()}
function render(){const d=read();const app=document.getElementById('app');if(!app)return;
app.innerHTML=`<div class="pagehead"><div><h1>التوكيلات وعقود الأتعاب</h1><div class="sub">إدارة أسماء الممثلين، توليد صيغة التوكيل، وتجهيز عقد اتفاق الأتعاب.</div></div><span class="badge">وحدة محلية — احفظ نسخة احتياطية</span></div>
<div class="notice"><b>تنبيه مهم:</b> هذه الوحدة تحفظ الأسماء والقوالب والمسودات على هذا الجهاز فقط حاليًا، ولا تزامنها مع Supabase أو تربطها تلقائيًا بملفات العملاء. راجع الصيغة قانونيًا قبل إرسالها أو توقيعها.</div>
<div class="toolbar"><button class="btn" onclick="window.maktabyDocsTab('lawyers')">دليل المحامين</button><button class="btn" onclick="window.maktabyDocsTab('poa')">إنشاء توكيل</button><button class="btn" onclick="window.maktabyDocsTab('contract')">عقد اتفاق أتعاب</button><button class="btn light" onclick="window.maktabyDocsExport()">تصدير بيانات الوحدة</button><label class="btn light" style="cursor:pointer">استيراد بيانات<input type="file" accept="application/json" hidden onchange="window.maktabyDocsImport(event)"></label></div><div id="docsTab"></div>`;
window.maktabyDocsTab('lawyers');document.querySelectorAll('.nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='legaldocs'));document.getElementById('topTitle').textContent='التوكيلات وعقود الأتعاب';}
window.maktabyDocsTab=tab=>{const d=read(),root=document.getElementById('docsTab');if(!root)return;
if(tab==='lawyers'){root.innerHTML=`<section class="panel"><h3>دليل المحامين والممثلين</h3><div class="toolbar"><input id="newLawyer" placeholder="اسم المحامي / الممثل" style="min-width:260px"><button class="btn goldbtn" onclick="window.maktabyDocsAddLawyer()">إضافة اسم</button></div>${d.lawyers.map((x,i)=>`<div style="display:flex;gap:10px;align-items:center;padding:10px;border-bottom:1px solid var(--line)"><span style="flex:1">${esc(x.name)} <small style="color:#718096">${x.nid?"— رقم قومي: "+esc(x.nid):""}</small></span><button class="btn light" onclick="window.maktabyDocsRename(${i})">تعديل</button><button class="btn danger" onclick="window.maktabyDocsDeleteLawyer(${i})">حذف</button></div>`).join('')||'<div class="empty">لا توجد أسماء مضافة</div>'}</section>`}
if(tab==='poa'){const scopes=[['litigation','القضايا والتقاضي','الحضور أمام جميع المحاكم على اختلاف أنواعها ودرجاتها، وتقديم الدعاوى والطلبات والمذكرات والدفوع، والحضور والتحقيقات، واستلام صور الأحكام والصيغ التنفيذية والإعلانات، واتخاذ إجراءات الطعن والتنفيذ في الحدود التي يجيزها القانون.'],['notary','الشهر العقاري والتوثيق','التعامل أمام مكاتب ومأموريات الشهر العقاري والتوثيق لاستخراج واستلام الصور الرسمية من المحررات والعقود والتوكيلات والشهادات، واستخراج الشهادات والبيانات والاستعلامات المتعلقة بها.'],['commercial','السجل التجاري والغرفة التجارية','التعامل أمام مكاتب السجل التجاري والغرف التجارية في إجراءات تأسيس وقيد وتجديد واستخراج السجلات والشهادات، وإجراء التعديلات والتأشير بالتخارج، وتقديم واستلام المستندات.'],['tax','مصلحة الضرائب','التعامل أمام مصلحة الضرائب المصرية ومأمورياتها ومراكزها، وفتح وتحديث الملفات، وتقديم الإقرارات والمستندات والطلبات، واستخراج الشهادات والبطاقات والبيانات واستلامها ومتابعة الإجراءات.'],['gafi','الهيئة العامة للاستثمار','التعامل أمام الهيئة العامة للاستثمار والمناطق الحرة وكافة فروعها ومراكز خدمات المستثمرين فيما يخص تأسيس وتعديل وتخارج الشركات والمنشآت الفردية بكافة أشكالها القانونية، وتقديم واستلام المستندات والقرارات والشهادات.'],['traffic','المرور','التعامل أمام وحدات وإدارات المرور في إجراءات الترخيص والتجديد والفحص وسداد الرسوم واستلام وتسلم الرخص، وتقديم واستلام المستندات المتعلقة بذلك.'],['trademark','العلامات التجارية','التعامل أمام جهاز تنمية التجارة الداخلية ومكاتب العلامات التجارية في إيداع وتسجيل وتجديد العلامات التجارية، ومتابعة الطلبات والتظلمات واستلام الشهادات والمستندات.']];
root.innerHTML=`<section class="panel"><h3>إنشاء صيغة توكيل رسمية</h3><div class="notice">اختر الاختصاصات المطلوبة فقط، ثم حدد الممثلين وطريقة ممارستهم للتوكيل. الصيغة النهائية تخضع لمراجعة مكتب التوثيق، وأي تصرفات ناقلة للملكية أو صلح أو تنازل أو قبض مبالغ تحتاج نصًا خاصًا وصريحًا عند اللزوم.</div><div class="formgrid"><div class="field"><label>اسم الموكل</label><input id="pClient" autocomplete="off" oninput="window.maktabyDocsUpdatePoaRequest()"></div><div class="field"><label>الرقم القومي للموكل</label><input id="pNid" maxlength="14" inputmode="numeric" autocomplete="off"></div><div class="field"><label>نوع التوكيل</label><select id="pType"><option>توكيل رسمي عام في القضايا</option><option>توكيل رسمي خاص</option><option>توكيل رسمي شامل للاختصاصات المحددة أدناه</option></select></div><div class="field"><label>طريقة ممارسة الوكالة</label><select id="pCapacity"><option>مجتمعين أو منفردين</option><option>مجتمعين فقط</option><option>منفردين فقط</option></select></div><div class="field full"><label>المحامون / الممثلون — اختر واحدًا أو أكثر</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:9px">${d.lawyers.map((x,i)=>`<label style="border:1px solid var(--line);border-radius:9px;padding:10px"><input type="checkbox" name="pLawyer" value="${i}" checked> <b>${esc(x.name)}</b><br><small>رقم قومي: ${esc(x.nid||'غير مسجل')}</small></label>`).join('')}</div></div><div class="field full"><label>الاختصاصات المطلوبة</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:9px">${scopes.map((x)=>`<label style="display:flex;gap:8px;align-items:flex-start;border:1px solid var(--line);border-radius:9px;padding:10px"><input type="checkbox" name="pScope" value="${x[0]}" data-text="${esc(x[2])}" style="margin-top:4px"><span><b>${x[1]}</b><br><small>${x[2]}</small></span></label>`).join('')}</div></div><div class="field full"><label>طلب تحرير التوكيل</label><textarea id="pRequest" rows="3" style="line-height:1.9" placeholder="السيد / اسم الموكل&#10;&#10;برجاء تحرير توكيل قضايا وشركات للسادة المحامين الموضحين أدناه، مع الشكر."></textarea><small class="sub">يُدرج اسم الموكل تلقائيًا، ويمكنك تعديل نص الطلب قبل التوليد.</small></div><div class="field full"><label style="display:flex;gap:9px;align-items:center"><input type="checkbox" id="pUseComprehensiveClause" onchange="document.getElementById('pComprehensiveClause').disabled=!this.checked" style="width:18px;height:18px"> إضافة الصيغة الشاملة للاختصاصات (اختياري)</label><div class="sub">عند التفعيل تُضاف الصيغة التالية إلى التوكيل، ويمكنك تعديلها قبل التوليد والطباعة والتصدير.</div><textarea id="pComprehensiveClause" rows="8" style="width:100%;line-height:1.9" disabled>وذلك فى جميع القضايا التى ترفع من أو على امام جميع المحاكم وفى تقديم الأوراق لقلم المحضرين    وتسلمها وفى الطعن بالتزوير وطلب تحليف اليمين الحاسمة وردها وقبولها والطعن فى تقارير الخبراء والمحكمين وردهم وإستبدالهم وفى طلب تعيين الخبراء وفى الحضور أمام جميع المحاكم بكافة أنواعها من قضايا وتصرفات وخلافه والمحاكم الحسبية للأحوال الشخصية وفى التقرير بعمل المعارضات والإلتماسات والإشكالات والإستئناف فى جميع القضايا المدنية والجنائية والأحوال الشخصية وفى التقرير بالنقض فى الاحكام وتقديم المذكرات وفى إتخاذ جميع ما تقتضيه إجراءات التقاضى مما جميعه وفى استلام صور الحكام وتنفيذها وفى الحضور أمام الجهات الاداريه أيا كانت ومصالح الحكومة ومصلحة الشهر العقارى ومكاتبها ومأمورياتها وتقديم الطلبات والتوقيع عليها وعلى الإلتماسات والمذكرات وتسلم الأوراق والمستندات والعقود العرفية والرسمية وفى الحضور أمام مصلحة الضرائب وأمورياتها ولجان الطعن والتصالح وتقديم المذكرات وتسلم صور التقريرات والتقديرات والمناقشة فيها وقبول مايرى قبوله ورفض مايرى رفضه وفى تقديم الرسوم والأمانات للمحاكم وتسويتها وقبض باقيها وفى تسلم وتسليم الأوراق والأوامر والمستندات والعقود العرفيه  والرسمية من وإلى قلم كتاب المحاكم والجهات الإدارية والتوقيع نيابة عنه بالتسليم فى كل ما ذكر وفى التقرير بفقد القسائم والتوقيع على محاضر المخالفات والحضور أمام محكمة القضاء الإدارى (مجلس الدولة) والتوقيع امام المساحه وهيئه التنميه الصناعيه والبريد المصرى والجمارك والتعامل مع السجل التجارى والغرفه التجاريه وتاسيس الشركات والمنشات الفرديه وتعديلها والتوقيع امام هيئه الاستثمار والتعامل مع الجوزات والسجل المدنى والتامينات والسجل الصناعى والتنميه الصناعيه واتحاد الصناعات والمرور فى التراخيص والتجديد واستلام الرخصه وشهاده البيانات   لكافه السيارات والدرجات البخاريه والعلامات التجاريه وسجل الموردين والمصدرين وجميع الجهات الحكوميه وغير الحكوميه والتعامل والتوقيع  وتمثيلى والتوقيع الاليكترونى والختم الاليكترونى وشركه ايجى تراست  والتعامل مع السجل المدنى فى استخراج وتسليم واستلام الوثائق وتعديل البيانات والتعامل مع مصلحه الجوازات فى استخراج شهاده التحركات  والتوقيع على العقود كمشترى والتوقيع على كافه النماذج امام الهيئه العامه للتامينات</textarea></div><div class="field full"><label>صلاحيات إضافية أو قيود خاصة (اختياري)</label><textarea id="pExtra" rows="3" placeholder="اكتب أي صلاحية خاصة أو قيد مطلوب بدقة..."></textarea></div></div><div class="actions" style="margin-top:14px"><button class="btn goldbtn" onclick="window.maktabyDocsGeneratePoa()">توليد الصيغة باللوجو</button></div><div id="poaResult" style="margin-top:15px"></div></section>`}

if(tab==='contract'){root.innerHTML=`<section class="panel"><h3>عقد اتفاق أتعاب محاماة</h3><div class="formgrid"><div class="field"><label>تاريخ العقد</label><input id="cDate" type="date" value="${new Date().toISOString().slice(0,10)}"></div><div class="field"><label>اسم الموكل</label><input id="cClient"></div><div class="field"><label>الرقم القومي</label><input id="cNid" maxlength="14"></div><div class="field"><label>العنوان</label><input id="cAddress"></div><div class="field full"><label>نطاق العمل / موضوع القضية</label><textarea id="cScope" rows="3"></textarea></div><div class="field"><label>قيمة الأتعاب (جنيه)</label><input id="cFee" type="number" min="0"></div><div class="field"><label>الأتعاب كتابةً</label><input id="cWords"></div><div class="field full"><label>جدول الدفعات ومواعيدها</label><textarea id="cPayments" rows="3" placeholder="مثال: 10000 جنيه عند التوقيع، 5000 بعد حكم أول درجة..."></textarea></div><div class="field full"><label>شروط إضافية</label><textarea id="cTerms" rows="3"></textarea></div></div><div class="actions" style="margin-top:14px"><button class="btn goldbtn" onclick="window.maktabyDocsMakeContract()">إنشاء العقد ومعاينة الطباعة</button></div></section><section class="panel" style="margin-top:14px"><h3>العقود المحفوظة على هذا الجهاز</h3>${d.agreements.map((a,i)=>`<div style="padding:9px;border-bottom:1px solid var(--line)">${esc(a.client)} — ${esc(a.date)} — ${esc(a.fee)} جنيه <button class="btn light" onclick="window.maktabyDocsPrintSaved(${i})">فتح / طباعة</button></div>`).join('')||'<div class="empty">لا توجد عقود محفوظة بعد</div>'}</section>`}}
window.maktabyDocsWhatsApp=id=>{const field=document.getElementById(id);const text=field?.value||'';if(!text.trim())return alert('لا يوجد نص لإرساله.');window.open('https://wa.me/?text='+encodeURIComponent(text),'_blank','noopener');};
window.maktabyDocsCopy=id=>{const field=document.getElementById(id);if(!field)return;field.focus();field.select();if(navigator.clipboard?.writeText){navigator.clipboard.writeText(field.value).then(()=>alert('تم النسخ')).catch(()=>alert('حدد النص وانسخه يدويًا'));}else{try{document.execCommand('copy');alert('تم النسخ');}catch{alert('حدد النص وانسخه يدويًا');}}};
window.maktabyDocsMakeContract=()=>{const a={date:val('cDate'),client:val('cClient').trim(),nid:val('cNid').trim(),address:val('cAddress').trim(),scope:val('cScope').trim(),fee:val('cFee').trim(),words:val('cWords').trim(),payments:val('cPayments').trim(),terms:val('cTerms').trim()};if(!a.client||!a.scope||!a.fee)return alert('أكمل اسم الموكل ونطاق العمل وقيمة الأتعاب.');if(a.nid&&!/^\d{14}$/.test(a.nid))return alert('الرقم القومي يجب أن يتكون من 14 رقمًا.');if(!Number.isFinite(Number(a.fee))||Number(a.fee)<=0)return alert('أدخل قيمة أتعاب صحيحة أكبر من صفر.');const d=read();d.agreements=Array.isArray(d.agreements)?d.agreements:[];a.id=Date.now();d.agreements.unshift(a);save(d);window.maktabyDocsPrintObject(a);window.maktabyDocsTab('contract');};
window.maktabyDocsPrintSaved=i=>{const a=read().agreements?.[i];if(a)window.maktabyDocsPrintObject(a);};
window.maktabyDocsPrintObject=a=>{const w=window.open('','_blank');if(!w)return alert('اسمح بالنوافذ المنبثقة للطباعة.');const e=esc;const logo=document.querySelector('.brand img')?.src||'';w.document.open();w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>عقد اتفاق أتعاب محاماة</title><style>@page{size:A4;margin:18mm}body{font-family:Tahoma,Arial,sans-serif;color:#17283b;line-height:2;margin:0}.head{text-align:center;border-bottom:3px solid #c49a45;padding-bottom:14px;margin-bottom:22px}.head img{width:76px;height:76px;object-fit:contain}.head h1{margin:5px 0;color:#14283f}.head div{font-size:13px;color:#66758a}.title{text-align:center;margin:22px 0;font-size:21px}.clause{margin:15px 0}.sign{display:flex;justify-content:space-between;margin-top:65px}.sign div{width:42%;text-align:center}.foot{margin-top:35px;border-top:1px solid #c49a45;padding-top:10px;text-align:center;font-size:11px;color:#6b7280}@media print{button{display:none}}</style></head><body><header class="head">${logo?`<img src="${e(logo)}" alt="شعار المكتب">`:''}<h1>مكتبي للمحاماة</h1><div>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</div></header><h2 class="title">عقد اتفاق أتعاب محاماة</h2><p>إنه في يوم ${e(a.date||'................')} تحرر هذا العقد بين كل من:</p><p>أولًا: الأستاذ / هاني شحاتة مفيد — (طرف أول).</p><p>ثانيًا: السيد / ${e(a.client)}، رقم قومي: ${e(a.nid||'—')}، وعنوانه: ${e(a.address||'—')} — (طرف ثانٍ).</p><div class="clause"><b>البند الأول — موضوع الاتفاق:</b><br>${e(a.scope)}</div><div class="clause"><b>البند الثاني — الأتعاب:</b><br>اتفق الطرفان على أتعاب قدرها ${e(a.fee)} جنيهًا (${e(a.words||'غير مدون كتابةً')}).</div><div class="clause"><b>البند الثالث — الدفعات:</b><br>${e(a.payments||'تسدد الأتعاب وفق ما يتفق عليه الطرفان كتابةً.')}</div><div class="clause"><b>البند الرابع — شروط إضافية:</b><br>${e(a.terms||'لا يوجد.')}</div><p>وفيما لم يرد بشأنه نص بهذا العقد، تطبق أحكام قانون المحاماة والقوانين ذات الصلة. حرر العقد من نسختين بيد كل طرف نسخة للعمل بموجبها.</p><div class="sign"><div>الطرف الأول<br>المحامي<br><br>التوقيع: ................</div><div>الطرف الثاني<br>الموكل<br><br>التوقيع: ................</div></div><footer class="foot">مكتبي للمحاماة — مكتب هاني شحاتة للمحاماة والاستشارات القانونية</footer></body></html>`);w.document.close();setTimeout(()=>{try{w.focus();w.print();}catch(err){console.warn('Print dialog could not be opened:',err);}},300);};
window.maktabyDocsAddLawyer=()=>{let d=read(),x=val('newLawyer').trim();if(!x)return alert('اكتب الاسم أولًا');if(d.lawyers.includes(x))return alert('الاسم موجود بالفعل');d.lawyers.push({name:x,nid:''});save(d);window.maktabyDocsTab('lawyers')};
window.maktabyDocsRename=i=>{let d=read(),x=prompt('تعديل الاسم',d.lawyers[i]?.name||'');if(x?.trim()){d.lawyers[i].name=x.trim();let n=prompt('تعديل الرقم القومي (14 رقمًا)',d.lawyers[i].nid||'');if(n!==null){if(n&&!/^\d{14}$/.test(n.trim()))return alert('الرقم القومي يجب أن يتكون من 14 رقمًا.');d.lawyers[i].nid=n.trim();}save(d);window.maktabyDocsTab('lawyers')}};
window.maktabyDocsDeleteLawyer=i=>{if(!confirm('تأكيد حذف الاسم من الدليل؟'))return;let d=read();d.lawyers.splice(i,1);save(d);window.maktabyDocsTab('lawyers')};
window.maktabyDocsUpdatePoaRequest=()=>{const f=document.getElementById('pRequest');if(!f)return;const name=val('pClient').trim();const current=f.value;const body='برجاء تحرير توكيل قضايا وشركات للسادة المحامين الموضحين أدناه، مع الشكر.';const lines=current.split('\n');if(!lines.length||/^السيد\s*\//.test(lines[0])||!current.trim()){f.value='السيد / '+name+'\n\n'+body;}else if(lines.length>0){lines[0]='السيد / '+name;f.value=lines.join('\n');}};
window.maktabyDocsGeneratePoa=()=>{const d=read(),client=val('pClient').trim(),nid=val('pNid').trim(),selected=[...document.querySelectorAll('[name="pLawyer"]:checked')].map(x=>d.lawyers[Number(x.value)]).filter(Boolean),scopeEls=[...document.querySelectorAll('[name="pScope"]:checked')],scopes=scopeEls.map(x=>x.parentElement.innerText.trim()),extra=val('pExtra').trim(),useComprehensive=!!document.getElementById('pUseComprehensiveClause')?.checked,comprehensiveClause=useComprehensive?val('pComprehensiveClause').trim():'',requestText=val('pRequest').trim()||('السيد / '+client+'\n\nبرجاء تحرير توكيل قضايا وشركات للسادة المحامين الموضحين أدناه، مع الشكر.');if(!client||!nid||!selected.length||!scopeEls.length)return alert('أكمل اسم الموكل والرقم القومي واختيار ممثل واحد واختصاص واحد على الأقل.');if(!/^\d{14}$/.test(nid))return alert('الرقم القومي للموكل يجب أن يتكون من 14 رقمًا.');if(selected.some(x=>x.nid&&!/^\d{14}$/.test(x.nid)))return alert('راجع الرقم القومي لأحد الممثلين في دليل المحامين.');const capacity=val('pCapacity'),type=val('pType');const reps=selected.map(x=>`${x.name} — رقم قومي ${x.nid||'غير مدون'}`).join('، ');const powers=scopeEls.map(x=>x.parentElement.querySelector('small')?.innerText||'').join('\n\n');const txt=`${requestText}\n\nصيغة بيانات توكيل\nأنا الموقع أدناه/ ${client}، حامل بطاقة رقم قومي ${nid}، قد وكلت ${reps} ${capacity}، وذلك في الاختصاصات الآتية: \n${powers}${comprehensiveClause?'\n\nالاختصاصات الشاملة الإضافية:\n'+comprehensiveClause:''}${extra?'\n\nوصلاحيات/قيود إضافية: '+extra:''}\nنوع التوكيل المطلوب: ${type}.\nيرجى إثبات الاختصاصات والسلطات المحددة أعلاه صراحةً في التوكيل الرسمي، ومراجعة الصيغة النهائية لدى مكتب التوثيق المختص.`;const logo=document.querySelector('.brand img')?.src||'';const safe=esc(txt);document.getElementById('poaResult').innerHTML=`<div class="notice" style="margin-bottom:10px">تم إعداد مسودة التوكيل. راجع بيانات الموكل والممثلين والاختصاصات قبل الطباعة أو الإرسال.</div><textarea id="poaText" rows="9" style="width:100%;line-height:1.8">${safe}</textarea><div class="actions" style="margin-top:10px"><button class="btn goldbtn" onclick="window.maktabyDocsPrintPoa()">معاينة وطباعة باللوجو</button><button class="btn light" onclick="window.maktabyDocsWhatsApp('poaText')">إرسال عبر واتساب</button><button class="btn light" onclick="window.maktabyDocsCopy('poaText')">نسخ الصيغة</button><button class="btn light" onclick="window.maktabyDocsExportPoaWord()">تصدير Word</button></div>`;window._maktabyPoaPrint={client,nid,reps,capacity,type,powers,extra,requestText,logo};d.messages.unshift({date:new Date().toISOString(),client,nid,text:txt,representatives:selected,capacity,type,scopes:scopeEls.map(x=>x.value)});save(d)};
window.maktabyDocsPrintPoa=()=>{const a=window._maktabyPoaPrint;if(!a)return;const w=window.open('','_blank');if(!w)return alert('اسمح بالنوافذ المنبثقة للمعاينة والطباعة.');const e=esc,logo=a.logo;w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>صيغة توكيل — مكتبي للمحاماة</title><style>@page{size:A4 portrait;margin:9mm}html,body{width:100%;margin:0!important;padding:0!important}body{font-family:Tahoma,Arial,sans-serif;color:#17283b;line-height:1.32;font-size:10px;margin:0}.head{text-align:center;border-bottom:2px solid #c49a45;padding:0 0 5px;margin-bottom:7px}.head img{width:42px;height:42px;object-fit:contain}.head h1{font-size:16px;color:#14283f;margin:2px 0}.head div{font-size:9px;color:#6c7480}.ribbon{border:1px solid #c49a45;border-radius:5px;padding:3px 9px;text-align:center;font-size:10px;font-weight:bold;color:#14283f;margin:7px auto;width:fit-content}.box{border:1px solid #d8dee8;border-radius:5px;padding:5px 8px;margin:6px 0;break-inside:avoid}.label{color:#9a742d;font-weight:bold;margin-bottom:2px}.rep{padding:2px 0;border-bottom:1px dashed #d7dce5}.scope{margin:4px 0}.foot{margin-top:10px;border-top:1px solid #c49a45;padding-top:4px;text-align:center;color:#737b86;font-size:8px}.sign{display:flex;justify-content:space-between;margin-top:18px;break-inside:avoid}.sign div{width:40%;text-align:center;font-size:9px}p{margin:5px 0}.box p{margin:4px 0}@media print{button{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style>
<style id="maktaby-signature-v931">
:root{--mk-ink:#14243a;--mk-navy:#071a31;--mk-blue:#123b63;--mk-gold:#d5ad62;--mk-gold2:#f0d99f;--mk-paper:#f4f6fa;--mk-line:#e2e8f0;--mk-shadow:0 14px 38px rgba(8,28,52,.085)}
html{scroll-behavior:smooth}body{font-family:"Segoe UI",Tahoma,Arial,sans-serif!important;background:radial-gradient(ellipse at 80% 0%,rgba(214,180,111,.14),transparent 32%),linear-gradient(135deg,#f7f8fb,#edf2f8)!important;color:var(--mk-ink)}
.layout{min-height:100vh;background:transparent}.side{width:272px!important;min-width:272px;background:linear-gradient(155deg,#06172c 0%,#0a2949 55%,#123e68 100%)!important;padding:22px 16px!important;box-shadow:10px 0 35px rgba(7,26,49,.13);border-left:1px solid rgba(255,255,255,.08)}
.brand{padding:14px 10px 20px!important;margin:0 2px 22px!important;border-bottom:1px solid rgba(213,173,98,.34)!important}.brand img{width:62px!important;height:62px!important;border-radius:17px!important;object-fit:cover;border:2px solid var(--mk-gold)!important;box-shadow:0 0 0 5px rgba(255,255,255,.06),0 12px 24px #0004!important}.brand div{font-weight:800;letter-spacing:.2px}.brand small{color:#dce6f1!important;font-weight:500}
.nav{display:flex;flex-direction:column;gap:5px}.nav button{position:relative;text-align:right!important;padding:14px 16px!important;margin:0!important;border-radius:12px!important;border:1px solid transparent!important;border-right:3px solid transparent!important;color:#dbe6f2!important;font-weight:650!important;letter-spacing:.1px;transition:all .2s ease}.nav button:hover{background:rgba(255,255,255,.09)!important;transform:translateX(-3px)}.nav button.active{background:linear-gradient(100deg,rgba(213,173,98,.23),rgba(255,255,255,.075))!important;border:1px solid rgba(213,173,98,.19)!important;border-right:3px solid var(--mk-gold)!important;color:#ffe4a8!important;box-shadow:inset 0 1px rgba(255,255,255,.07),0 6px 16px #0002}
.main{min-width:0}.top{min-height:78px!important;padding:14px 30px!important;background:rgba(255,255,255,.88)!important;backdrop-filter:blur(18px);border-bottom:1px solid #e2e8f0!important;box-shadow:0 5px 22px rgba(8,28,52,.045)!important}.top strong{font-size:18px!important;font-weight:800!important;color:#102a49!important}.badge{border-radius:30px!important;padding:9px 14px!important;background:#fff8e9!important;border:1px solid #ead8b2!important;color:#79591e!important;font-weight:700}
.office-banner{min-height:126px!important;padding:20px 34px!important;background:linear-gradient(110deg,#061a32,#0c3156 68%,#174b76)!important;border-bottom:4px solid var(--mk-gold)!important;box-shadow:0 12px 28px rgba(7,26,49,.12);isolation:isolate}.office-banner:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(circle at 88% 40%,rgba(213,173,98,.24),transparent 24%),linear-gradient(90deg,transparent,rgba(255,255,255,.035));pointer-events:none}.office-banner:after{border-color:rgba(213,173,98,.42)!important}.banner-mark{font-size:54px!important;color:#f0d99f!important}.office-banner strong{font-size:29px!important;letter-spacing:.3px}.office-banner span{color:#dce7f2!important;font-size:14px!important}.office-banner>b{font-size:14px!important;letter-spacing:1px;color:#f0d99f!important}
.content{max-width:1740px!important;padding:32px!important}.pagehead{align-items:center;padding:0 0 17px;margin-bottom:22px!important;border-bottom:1px solid rgba(203,214,228,.7)}.pagehead h1{font-size:27px!important;font-weight:850!important;color:#102a49!important;letter-spacing:-.4px}.sub{line-height:1.85!important;color:#748398!important}.stats{gap:17px!important;margin-bottom:24px!important}.card,.panel{background:rgba(255,255,255,.96)!important;border:1px solid #e4eaf2!important;border-radius:18px!important;box-shadow:var(--mk-shadow)!important;transition:transform .2s ease,box-shadow .2s ease}.stats .card{position:relative;overflow:hidden;min-height:118px;padding:21px!important}.stats .card:after{content:"";position:absolute;left:-25px;bottom:-42px;width:112px;height:112px;border:17px solid rgba(213,173,98,.12);border-radius:50%;pointer-events:none}.stats .card:hover,.panel:hover{box-shadow:0 18px 42px rgba(8,28,52,.11)!important;transform:translateY(-2px)}.statlabel{font-weight:650!important;color:#738197!important}.statnum{font-size:30px!important;font-weight:850!important;color:#15395d!important}.statnum.gold{color:#a77c2e!important}.panel{padding:22px!important;margin-bottom:18px}.panel h3{font-size:17px!important;font-weight:800!important;color:#173653!important;margin-bottom:17px!important}
.btn{border-radius:10px!important;padding:11px 17px!important;font-weight:700!important;transition:transform .16s ease,box-shadow .16s ease,filter .16s ease}.btn:hover{transform:translateY(-1px);box-shadow:0 7px 15px rgba(8,28,52,.13);filter:brightness(1.02)}.btn:active{transform:translateY(0)}.btn:disabled{opacity:.55;cursor:wait;transform:none;box-shadow:none}.btn.goldbtn{background:linear-gradient(135deg,#f1d99e,#c99b48)!important;color:#142a43!important;border:1px solid #c99b48!important}.btn:not(.goldbtn):not(.light):not(.danger){background:linear-gradient(135deg,#123b63,#092542)!important}.btn.light{background:#edf2f7!important;color:#28425e!important;border:1px solid #dce5ef!important}.btn.danger{background:#fff0ef!important;color:#a63731!important;border:1px solid #f1d1ce!important}
#app table{border-collapse:separate!important;border-spacing:0!important;width:100%;font-size:13px!important}#app table thead th{background:linear-gradient(180deg,#f6f8fb,#edf2f7)!important;color:#50657c!important;font-weight:800!important;border-bottom:1px solid #dfe7f0!important;padding:14px 12px!important;white-space:nowrap}#app table tbody td{padding:13px 12px!important;border-bottom:1px solid #edf1f5!important;color:#31465e!important;vertical-align:middle}#app table tbody tr{transition:background .15s ease}#app table tbody tr:hover{background:#fbf8f0!important}#app table tbody tr:last-child td{border-bottom:0}#app table td .btn{padding:8px 12px!important;font-size:12px!important;white-space:nowrap}
input,select,textarea{border:1px solid #d8e1eb!important;border-radius:10px!important;padding:11px 12px!important;transition:border-color .15s,box-shadow .15s}input:focus,select:focus,textarea:focus{outline:0!important;border-color:#c9a15a!important;box-shadow:0 0 0 3px rgba(201,161,90,.15)!important}.toolbar{gap:10px!important}.notice{border-radius:12px!important;background:#fff9ed!important;border:1px solid #efdfbd!important;color:#785b27!important;line-height:1.9!important}.pill{font-weight:750!important;border-radius:30px!important;padding:6px 11px!important}.dialog{border-radius:20px!important;box-shadow:0 24px 70px #071a3155!important;border:1px solid #e4eaf2}.modal{backdrop-filter:blur(5px)}
.maktaby-approval-live{padding:12px 15px;margin:14px 0 18px;border:1px solid #dfe8f2;border-radius:12px;background:linear-gradient(100deg,#f7fafc,#fff9ec);color:#5e7188;font-size:12px;font-weight:650}.maktaby-review-action,.maktaby-expense-review{min-width:88px}.maktaby-review-action[disabled],.maktaby-expense-review[disabled]{opacity:.55;cursor:wait}
#loginScreen{background:radial-gradient(circle at 20% 20%,#174b76 0,transparent 35%),linear-gradient(135deg,#06172d,#123c64)!important}#loginScreen>div{border-radius:22px!important;border:1px solid rgba(213,173,98,.4);box-shadow:0 30px 90px #0005!important;padding:34px!important}#loginScreen .login-brand img{border-radius:22px!important;border:3px solid var(--mk-gold)!important}
@media(max-width:1050px){.side{width:225px!important;min-width:225px}.content{padding:22px!important}.office-banner{padding:16px 22px!important}}
@media(max-width:700px){.layout{display:block}.side{width:100%!important;min-width:0;padding:12px!important}.brand{margin-bottom:10px!important}.nav{flex-direction:row;overflow:auto;padding-bottom:4px}.nav button{white-space:nowrap;flex:0 0 auto}.office-banner{min-height:86px!important;padding:12px 15px!important}.office-banner strong{font-size:20px!important}.office-banner span{font-size:11px!important}.content{padding:15px!important}.pagehead h1{font-size:22px!important}.stats{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:9px!important}.stats .card{min-height:95px;padding:14px!important}.statnum{font-size:23px!important}.panel{padding:15px!important}}
@media(prefers-reduced-motion:reduce){*,*:before,*:after{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
</style>

</head><body><header class="head">${logo?`<img src="${logo}" alt="العلامة البصرية لمكتب هاني شحاتة للمحاماة">`:''}<h1>مكتبي للمحاماة</h1><div>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</div></header><div class="ribbon">طلب تحرير توكيل</div><div class="box" style="white-space:pre-line;text-align:right">${e(a.requestText||("السيد / "+a.client+"\n\nبرجاء تحرير توكيل قضايا وشركات للسادة المحامين الموضحين أدناه، مع الشكر."))}</div><div class="ribbon">مسودة بيانات توكيل رسمي</div><p>أنا الموقع أدناه / <b>${e(a.client)}</b>، حامل بطاقة رقم قومي <b>${e(a.nid)}</b>، قد وكلت:</p><div class="box"><div class="label">المحامون / الممثلون الموكلون</div>${a.reps.split('، ').map(x=>`<div class="rep">${e(x)}</div>`).join('')}<p>وذلك بصفتهم: <b>${e(a.capacity)}</b>.</p></div><div class="box"><div class="label">نوع التوكيل</div>${e(a.type)}</div><div class="box"><div class="label">الاختصاصات والصلاحيات المحددة</div>${a.powers.split('\n\n').map(x=>`<div class="scope">• ${e(x)}</div>`).join('')}${a.extra?`<div class="scope"><b>صلاحيات إضافية أو قيود خاصة:</b><br>${e(a.extra)}</div>`:''}</div><p>يرجى إثبات الاختصاصات والسلطات المحددة أعلاه صراحةً في التوكيل الرسمي، ومراجعة الصيغة النهائية لدى مكتب التوثيق المختص قبل التوقيع.</p><div class="sign"><div>الموكل<br><br>الاسم: ....................<br><br>التوقيع: ....................</div><div>اعتماد ومراجعة المكتب<br><br>التاريخ: ....................</div></div><footer class="foot">مكتبي للمحاماة — مكتب هاني شحاتة للمحاماة والاستشارات القانونية</footer><script>window.onload=()=>window.print()<\/script>
window.onload=()=>window.print()<\/script></html>`);w.document.close()};
window.maktabyDocsPrintPoa=()=>{const a=window._maktabyPoaPrint,field=document.getElementById('poaText');if(!a||!field)return;const text=field.value.trim();if(!text)return alert('لا توجد صيغة للطباعة.');const w=window.open('','_blank');if(!w)return alert('اسمح بالنوافذ المنبثقة للمعاينة والطباعة.');const e=esc,logo=a.logo||'';w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>توكيل — مكتبي للمحاماة</title><style>@page{size:A4;margin:15mm}body{font-family:Tahoma,Arial,sans-serif;color:#17283b;line-height:1.9;font-size:14px}.head{text-align:center;border-bottom:2px solid #c49a45;padding-bottom:10px;margin-bottom:18px}.head img{max-width:180px;max-height:95px;object-fit:contain}.text{white-space:pre-wrap;text-align:justify;line-height:2}.foot{margin-top:25px;border-top:1px solid #c49a45;padding-top:8px;text-align:center;color:#737b86;font-size:11px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="head">${logo?`<img src="${logo}" alt="شعار مكتبي">`:''}<div>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</div></header><main class="text">${e(text)}</main><footer class="foot">مكتبي للمحاماة — 01090825006</footer><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()};
window.maktabyDocsExportPoaWord=()=>{const a=window._maktabyPoaPrint,field=document.getElementById('poaText');if(!a||!field)return alert('ولّد صيغة التوكيل أولًا.');const text=field.value.trim();if(!text)return alert('لا توجد صيغة للتصدير.');const logo=a.logo||'';const html=`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>توكيل - مكتبي للمحاماة</title><style>body{font-family:Tahoma,Arial,sans-serif;direction:rtl;text-align:right;color:#17283b;font-size:14pt;line-height:2}.head{text-align:center;border-bottom:2px solid #c49a45;padding-bottom:12pt;margin-bottom:18pt}.head img{max-width:180px;max-height:95px}.body{white-space:pre-wrap;text-align:justify}.foot{text-align:center;border-top:1px solid #c49a45;margin-top:24pt;padding-top:8pt;font-size:10pt}</style></head><body><div class="head">${logo?`<img src="${logo}"><br>`:''}<b>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</b></div><div class="body">${esc(text)}</div><div class="foot">مكتبي للمحاماة — 01090825006</div></body></html>`;const blob=new Blob(['\ufeff',html],{type:'application/msword'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Maktaby_Power_of_Attorney.doc';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1500)};
window.maktabyDocsExport=()=>{let b=new Blob([JSON.stringify(read(),null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='Maktaby_LegalDocs_Backup.json';a.click();URL.revokeObjectURL(a.href)};
window.maktabyDocsImport=e=>{let f=e.target.files?.[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let x=JSON.parse(r.result);if(!Array.isArray(x.lawyers)||!Array.isArray(x.agreements))throw Error();save({...defaults,...x});render()}catch{alert('ملف غير صالح')} };r.readAsText(f)};
document.querySelectorAll('#nav [data-page="legaldocs"]').forEach(b=>b.remove());
})();



/* ===== Legacy UI segment 10 (preserved order) ===== */


/* V9.1.5: permanent-delete actions for every general archive category. */
window.purgeArchiveItemV914=async(type,index)=>{
 if(!canManageOffice()){alert('الحذف النهائي متاح للمدير أو مديرة المكتب فقط.');return;}
 const map={announcement:{key:'announcementArchive',label:'الإعلان'},case:{key:'caseArchive',label:'القضية والجلسات السابقة'},task:{key:'taskArchive',label:'المهمة'}};
 const spec=map[type];if(!spec)return;const arr=db[spec.key]||[];const item=arr[index];if(!item)return alert('السجل غير موجود في الأرشيف.');
 if(!confirm('تأكيد الحذف النهائي لـ '+spec.label+'؟ لا يمكن استعادة هذا السجل بعد الحذف.'))return;
 const snapshot=arr.slice();try{arr.splice(index,1);await save();alert('تم الحذف النهائي من الأرشيف.');}
 catch(e){db[spec.key]=snapshot;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('تعذر الحذف النهائي: '+(e.message||e));}
};
/* V8.8 — archive instead of destructive removal for clients and POAs */
window.archiveClientV87=async i=>{if(!canManageOffice()){alert('أرشفة ملفات الموكلين متاحة للمدير أو مديرة المكتب فقط.');return;}const c=db.clients[i];if(!c)return alert('لم يتم العثور على ملف الموكل.');if(!confirm('نقل ملف الموكل «'+c.name+'» إلى الأرشيف؟\nلن تُحذف القضايا أو الجلسات أو التوكيلات المرتبطة. ويمكنك استعادته لاحقًا.'))return;const beforeClients=db.clients.slice(),beforeArchive=(db.clientArchive||[]).slice();try{db.clientArchive=db.clientArchive||[];db.clientArchive.unshift({...c,archivedAt:new Date().toISOString()});db.clients.splice(i,1);await saveCloudState();await loadCloudState();page='clients';render();alert('تم نقل ملف الموكل إلى الأرشيف بنجاح.');}catch(e){db.clients=beforeClients;db.clientArchive=beforeArchive;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('لم تكتمل الأرشفة ولم يتم اعتماد الحذف. السبب: '+e.message);}};
window.archivePoaV87=async i=>{if(!canManageOffice())return;const x=db.powerOfAttorneys[i];if(!x||!confirm('نقل التوكيل إلى الأرشيف؟'))return;const beforeActive=db.powerOfAttorneys.slice(),beforeArchive=(db.poaArchive||[]).slice();try{db.poaArchive=db.poaArchive||[];db.poaArchive.unshift({...x,archivedAt:new Date().toISOString()});db.powerOfAttorneys.splice(i,1);await saveCloudState();await loadCloudState();render();}catch(e){db.powerOfAttorneys=beforeActive;db.poaArchive=beforeArchive;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('تعذر حفظ الأرشفة ولم يتم اعتماد الحذف: '+e.message);}};
window.restoreArchivedRecordV87=async(type,i)=>{if(!canManageOffice())return;const arr=type==='client'?db.clientArchive:db.poaArchive;const x=arr?.[i];if(!x)return;const target=type==='client'?db.clients:db.powerOfAttorneys;const beforeTarget=target.slice(),beforeArchive=arr.slice();const duplicate=type==='client'?target.some(c=>c.name===x.name&&c.phone===x.phone):target.some(p=>p.poaId&&p.poaId===x.poaId);if(duplicate&&!confirm('يوجد سجل مشابه بالفعل. هل تريد الاستعادة رغم ذلك؟'))return;const copy={...x};delete copy.archivedAt;target.push(copy);arr.splice(i,1);try{await saveCloudState();await loadCloudState();render();}catch(e){if(type==='client')db.clients=beforeTarget;else db.powerOfAttorneys=beforeTarget;if(type==='client')db.clientArchive=beforeArchive;else db.poaArchive=beforeArchive;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('تعذرت الاستعادة ولم يتم اعتماد التغيير: '+e.message);}};
window.purgeArchivedRecordV87=async(type,i)=>{if(!canManageOffice())return;const arr=type==='client'?db.clientArchive:db.poaArchive;if(!arr?.[i]||!confirm('حذف نهائي؟ لا يمكن استعادة هذا السجل بعد الحذف.'))return;const snapshot=arr.slice();try{arr.splice(i,1);await saveCloudState();await loadCloudState();render();alert('تم الحذف النهائي من الأرشيف.');}catch(e){if(type==='client')db.clientArchive=snapshot;else db.poaArchive=snapshot;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('لم يكتمل الحذف النهائي ولم يتم اعتماد التغيير: '+e.message);}};


/* ===== Legacy UI segment 11 (preserved order) ===== */

/* V8.9 — Audit Trail + weekly backup reminder.
   Approval notifications already use Supabase Realtime and a 20-second fallback poller. */
(()=>{'use strict';
 const escA=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const AUDIT_TABLE='office_audit_logs';
 const tracked=['cases','transactions','cloudExpenses','announcements','clients','tasks','powerOfAttorneys','clientFeeAgreements','clientFeePayments','manualFeeExpenses'];
 // Prefer immutable identifiers. For legacy rows without IDs, use a content-based
 // composite key (never the array index, which changes after sorting/deletion).
 const stableKey=(x)=>String(x?.id??x?.caseId??x?.poaId??x?._id??[
   x?.number||x?.caseNumber||x?.client||x?.name||x?.employee||'',
   x?.date||x?.session||x?.expense_date||x?.deliveryDate||'',
   x?.court||x?.category||x?.expense_type||'',
   x?.description||x?.title||x?.subject||''
 ].join('|'));
 const auditView=x=>({
   sessionDate:x?.date??x?.sessionDate??null,
   previousSessionDate:x?.previousSession??null,
   nextSessionDate:x?.nextDate??null,
   amount:x?.amount??x?.fees??x?.total??null,
   status:x?.approvalStatus??x?.approval_status??x?.status??null,
   decision:x?.result??x?.decision??null,
   description:x?.description??x?.title??x?.subject??null,
   client:x?.client??x?.client_name??null,
   caseNumber:x?.number??x?.caseNumber??null,
   court:x?.court??null
 });
 const snapshot=()=>{const o={};tracked.forEach(k=>o[k]=JSON.parse(JSON.stringify(Array.isArray(db?.[k])?db[k]:[])));return o;};
 let lastSnapshot=null;
 async function writeAudit(action,entityType,entityLabel,details){
   if(!currentUser?.id)return;
   try{const {error}=await sb.from(AUDIT_TABLE).insert({actor_id:currentUser.id,actor_name:currentUser.name||currentUser.email,action,entity_type:entityType,entity_label:entityLabel||'',details:details||{}});if(error)console.warn('Audit log not saved:',error.message);}
   catch(e){console.warn('Audit log not saved:',e?.message||e);}
 }
 const oldLoad=window.loadCloudState;
 if(typeof oldLoad==='function')window.loadCloudState=async function(){const r=await oldLoad.apply(this,arguments);lastSnapshot=snapshot();return r;};
 const oldSave=window.saveCloudState;
 if(typeof oldSave==='function')window.saveCloudState=async function(){
   const before=lastSnapshot||snapshot();
   const r=await oldSave.apply(this,arguments);
   const after=snapshot();
   const changes=[];
   for(const k of tracked){
     const a=before[k]||[],b=after[k]||[];const am=new Map(a.map(x=>[stableKey(x),x]));const bm=new Map(b.map(x=>[stableKey(x),x]));
     for(const [id,x] of am){
       if(!bm.has(id))changes.push({section:k,action:'حذف',label:x.client||x.client_name||x.name||x.number||x.description||id,before:auditView(x),after:null});
       else {const y=bm.get(id);if(JSON.stringify(x)!==JSON.stringify(y))changes.push({section:k,action:'تعديل',label:x.client||x.client_name||x.name||x.number||x.description||id,before:auditView(x),after:auditView(y)});}
     }
     for(const [id,x] of bm){if(!am.has(id))changes.push({section:k,action:'إضافة',label:x.client||x.client_name||x.name||x.number||x.description||id,before:null,after:auditView(x)});}
   }
   if(changes.length){for(const c of changes.slice(0,80))await writeAudit(c.action,c.section,c.label,c);}
   lastSnapshot=after;
   return r;
 };
 // A dedicated activity page is inserted without changing the existing render pipeline.
 const nav=document.getElementById('nav');
 if(nav&&!nav.querySelector('[data-page="auditTrail"]')){const b=document.createElement('button');b.type='button';b.dataset.page='auditTrail';b.textContent='سجل النشاطات';nav.appendChild(b);}
 async function showAuditPage(){
   if(!canManageOffice()){alert('سجل النشاطات متاح للمدير ومديرة المكتب فقط.');return;}
   document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='auditTrail'));
   document.getElementById('topTitle').textContent='سجل النشاطات';
   const app=document.getElementById('app');app.innerHTML='<section class="panel"><h2>سجل النشاطات</h2><p class="sub">تحميل سجل التعديلات والحذف والإضافات مع اسم المستخدم والتوقيت. السجل لا يُعد بديلًا عن سجل النظام المحاسبي أو النسخ الاحتياطي.</p><div id="auditContent" class="empty">جارٍ تحميل السجل...</div></section>';
   const box=document.getElementById('auditContent');
   const {data,error}=await sb.from(AUDIT_TABLE).select('id,created_at,actor_id,actor_name,action,entity_type,entity_label,details').order('created_at',{ascending:false}).limit(300);
   if(error){box.innerHTML='<div class="notice">تعذر تحميل سجل النشاطات. شغّل ملف SQL الخاص بالنسخة V8.9 ثم أعد المحاولة.<br>'+escA(error.message)+'</div>';return;}
   const rows=data||[];
   if(!rows.length){box.innerHTML='<div class="empty">لا توجد نشاطات مسجلة حتى الآن.</div>';return;}
   box.innerHTML='<div style="overflow:auto"><table><thead><tr><th>التاريخ والوقت</th><th>المستخدم</th><th>الإجراء</th><th>القسم</th><th>السجل</th><th>التفاصيل</th></tr></thead><tbody>'+rows.map(x=>'<tr><td>'+escA(new Date(x.created_at).toLocaleString('ar-EG'))+'</td><td>'+escA(x.actor_name||'—')+'</td><td>'+escA(x.action||'—')+'</td><td>'+escA(x.entity_type||'—')+'</td><td>'+escA(x.entity_label||'—')+'</td><td style="white-space:normal;max-width:360px">'+escA(JSON.stringify(x.details||{}))+'</td></tr>').join('')+'</tbody></table></div>';
 }
 document.addEventListener('click',e=>{const b=e.target.closest('#nav [data-page="auditTrail"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();showAuditPage();},true);
 // Staff admin page (admin only): activate/deactivate employees and set roles.
 // New sign-ups are created inactive by the database, so someone must be able to activate them from the app.
 const nav2=document.getElementById('nav');
 if(nav2&&!nav2.querySelector('[data-page="staffAdmin"]')){const b=document.createElement('button');b.type='button';b.dataset.page='staffAdmin';b.textContent='الموظفون والصلاحيات';b.style.display='none';nav2.appendChild(b);}
 const staffNavTimer=setInterval(()=>{if(currentUser){clearInterval(staffNavTimer);const b=document.querySelector('#nav [data-page="staffAdmin"]');if(b)b.style.display=isAdmin()?'':'none';}},500);
 const STAFF_ROLES=[['admin','مدير'],['office_manager','مديرة مكتب'],['employee','موظف']];
 async function staffAudit(action,label,details){try{await sb.from('office_audit_logs').insert({actor_id:currentUser?.id,actor_name:currentUser?.name||'مدير المكتب',action,entity_type:'موظف',entity_label:String(label||''),details:details||{}});}catch(e){console.warn('staff audit failed',e);}}
 async function showStaffPage(){
   if(!isAdmin()){alert('إدارة الموظفين متاحة للمدير فقط.');return;}
   document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('active',b.dataset.page==='staffAdmin'));
   document.getElementById('topTitle').textContent='الموظفون والصلاحيات';
   const app=document.getElementById('app');
   app.innerHTML='<section class="panel"><h2>الموظفون والصلاحيات</h2><p class="sub">الحسابات الجديدة تُنشأ غير مفعّلة. فعّل الموظف من هنا بعد التأكد من هويته. التعديل يظهر في سجل النشاطات.</p><div id="staffContent" class="empty">جارٍ تحميل الموظفين...</div></section>';
   const box=document.getElementById('staffContent');
   const {data,error}=await sb.from('profiles').select('id,full_name,role,active').order('active',{ascending:true}).order('full_name',{ascending:true});
   if(error){box.innerHTML='<div class="notice">تعذر تحميل الموظفين.<br>'+escA(error.message)+'</div>';return;}
   const rows=data||[];
   if(!rows.length){box.innerHTML='<div class="empty">لا يوجد موظفون.</div>';return;}
   const roleLabel=r=>(STAFF_ROLES.find(x=>x[0]===r)||[r,r||'—'])[1];
   box.innerHTML='<div style="overflow:auto"><table><thead><tr><th>الاسم</th><th>الدور</th><th>الحالة</th><th>إجراء</th></tr></thead><tbody>'+rows.map(x=>{
     const me=x.id===currentUser?.id;
     const opts=STAFF_ROLES.map(r=>'<option value="'+escA(r[0])+'"'+(x.role===r[0]?' selected':'')+'>'+escA(r[1])+'</option>').join('');
     return '<tr data-id="'+escA(x.id)+'"><td>'+escA(x.full_name||'بدون اسم')+(me?' <small>(أنت)</small>':'')+'</td>'
       +'<td><select class="staffRole"'+(me?' disabled title="لا يمكنك تغيير دورك بنفسك"':'')+'>'+opts+'</select></td>'
       +'<td>'+(x.active?'<b style="color:#157347">مفعّل</b>':'<b style="color:#b42318">غير مفعّل</b>')+'</td>'
       +'<td>'+(me?'—':'<button type="button" class="btn '+(x.active?'light':'goldbtn')+' staffToggle">'+(x.active?'إيقاف':'تفعيل')+'</button>')+'</td></tr>';}).join('')+'</tbody></table></div>';
   const byId=new Map(rows.map(x=>[x.id,x]));
   box.querySelectorAll('.staffToggle').forEach(btn=>btn.onclick=async()=>{
     const id=btn.closest('tr').dataset.id,x=byId.get(id);if(!x||id===currentUser?.id)return;
     const next=!x.active;
     if(!confirm((next?'تفعيل ':'إيقاف ')+(x.full_name||'هذا الحساب')+'؟'))return;
     btn.disabled=true;
     const {error:e}=await sb.from('profiles').update({active:next}).eq('id',id);
     if(e){alert('تعذر التعديل: '+e.message);btn.disabled=false;return;}
     await staffAudit(next?'تفعيل':'إيقاف',x.full_name||id,{userId:id,active:next});
     showStaffPage();
   });
   box.querySelectorAll('.staffRole').forEach(sel=>sel.onchange=async()=>{
     const id=sel.closest('tr').dataset.id,x=byId.get(id);if(!x||id===currentUser?.id)return;
     const role=sel.value;
     if(!confirm('تغيير دور '+(x.full_name||'هذا الحساب')+' إلى '+roleLabel(role)+'؟')){sel.value=x.role;return;}
     sel.disabled=true;
     const {error:e}=await sb.from('profiles').update({role}).eq('id',id);
     if(e){alert('تعذر التعديل: '+e.message);sel.value=x.role;sel.disabled=false;return;}
     await staffAudit('تغيير الدور',x.full_name||id,{userId:id,from:x.role,to:role});
     showStaffPage();
   });
 }
 document.addEventListener('click',e=>{const b=e.target.closest('#nav [data-page="staffAdmin"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();showStaffPage();},true);
 // Weekly reminder is local to this browser/device. Export is still a manual download.
 const BACKUP_KEY='maktaby_v89_last_backup_at';
 const oldExport=window.exportBackup;
 if(typeof oldExport==='function')window.exportBackup=function(){oldExport.apply(this,arguments);try{localStorage.setItem(BACKUP_KEY,new Date().toISOString());}catch(e){};};
 let reminderShown=false;
 function backupReminder(){if(reminderShown||!isAdmin())return;reminderShown=true;let last=0;try{last=Date.parse(localStorage.getItem(BACKUP_KEY)||'')||0;}catch(e){};if(last&&Date.now()-last<7*86400000)return;
   const n=document.createElement('div');n.id='maktabyWeeklyBackupNotice';n.style.cssText='position:fixed;bottom:18px;left:18px;z-index:10020;background:#fff8e8;border:1px solid #d6a843;color:#26384d;padding:14px 16px;border-radius:12px;box-shadow:0 8px 28px #0002;max-width:360px;font:13px Tahoma,Arial;line-height:1.8';
   n.innerHTML='<b>تذكير النسخة الاحتياطية الأسبوعية</b><br>مرّ أسبوع أو أكثر منذ آخر نسخة احتياطية على هذا الجهاز. نزّل نسخة JSON واحفظها في مكان آمن.<div style="display:flex;gap:8px;margin-top:9px"><button type="button" class="btn goldbtn" id="maktabyBackupNow">تنزيل النسخة الآن</button><button type="button" class="btn light" id="maktabyBackupLater">لاحقًا</button></div>';document.body.appendChild(n);
   n.querySelector('#maktabyBackupNow').onclick=()=>{window.exportBackup();n.remove();};n.querySelector('#maktabyBackupLater').onclick=()=>n.remove();
 }
 const timer=setInterval(()=>{if(currentUser){clearInterval(timer);setTimeout(backupReminder,1800);}},500);
})();


/* ===== Legacy UI segment 12 (preserved order) ===== */

(()=>{'use strict';
 const $=s=>document.querySelector(s), getUser=()=>{try{return currentUser}catch(e){return window.currentUser}}, getDb=()=>{try{return db}catch(e){return window.db||{}}}, isManager=()=>{try{return canManageOffice()}catch(e){return !!window.canManageOffice?.()}}, esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels=['تاريخ الجلسة الحالية','الموكل','رقم الدعوى','نوع الدعوى','الخصم','تاريخ الجلسة القادمة','المحكمة / الدائرة','المطلوب','سبب التأجيل','الإجراءات'];
 let lastTaskPopupDay='',activeCaseFilter='all',activeAnnFilter='all';
 function pendingApprovals(){const a=Array.isArray(getDb().approvalRequests)?getDb().approvalRequests:[];return a.filter(x=>!['approved','مقبول','تم الاعتماد','rejected','مرفوض','تم الرفض','cancelled','ملغي'].includes(String(x.status||x.state||'').toLowerCase())).length;}
 function ensureBar(){if(!getUser()||!isManager())return;let b=$('#v91SmartBar');if(!b){b=document.createElement('div');b.id='v91SmartBar';const top=$('.top');if(top)top.insertAdjacentElement('afterend',b);}
 const n=pendingApprovals();b.innerHTML=`<strong>تنبيهات المكتب</strong><span class="v91-count">${n} طلب اعتماد معلق</span><span>آخر تحديث: ${new Date().toLocaleTimeString('ar-EG',{hour:'2-digit',minute:'2-digit'})}</span><button type="button" id="v91OpenApprovals">عرض الطلبات</button>`;
 const btn=$('#v91OpenApprovals');if(btn)btn.onclick=()=>{const nav=$('#nav [data-page="approvals"]');if(nav)nav.click();};
 }
 function showTodayTasks(){if(!getUser())return;const __pd=new Date().toISOString().slice(0,10);let __seen='';try{__seen=localStorage.getItem('mk_v91_task_popup_day')||'';}catch(_){}if(lastTaskPopupDay===__pd||__seen===__pd)return;lastTaskPopupDay=__pd;try{localStorage.setItem('mk_v91_task_popup_day',__pd);}catch(_){}const day=typeof window.today==='function'?today():new Date().toISOString().slice(0,10);const tasks=(getDb().tasks||[]).filter(t=>String(t.date||t.dueDate||'').slice(0,10)===day&&!['تم التنفيذ','منفذ','completed','done'].includes(String(t.status||'').toLowerCase()));const cases=(getDb().cases||[]).filter(c=>String(c.date||'').slice(0,10)===day&&!c.archived);if(!tasks.length&&!cases.length)return;
 const box=document.createElement('div');box.id='v91TodayTasks';box.innerHTML=`<div class="v91-dialog" dir="rtl"><h3>ملخص مهام اليوم</h3><p>لديك ${tasks.length} مهمة و${cases.length} جلسة بتاريخ اليوم.</p>${tasks.map(t=>`<div class="v91-task"><b>${esc(t.task||t.title||'مهمة')}</b><br>${esc(t.client||'')} ${esc(t.court||'')} — ${esc(t.status||'مفتوحة')}</div>`).join('')}${cases.map(c=>`<div class="v91-task"><b>جلسة: ${esc(c.client||'—')}</b><br>دعوى ${esc(c.number||'—')} — ${esc(c.court||'—')}</div>`).join('')}<div style="display:flex;gap:8px;margin-top:14px"><button class="btn goldbtn" id="v91GoCases">فتح الجلسات</button><button class="btn light" id="v91CloseTasks">إغلاق</button></div></div>`;document.body.appendChild(box);$('#v91CloseTasks').onclick=()=>box.remove();$('#v91GoCases').onclick=()=>{box.remove();const n=$('#nav [data-page="cases"]');if(n)n.click();};box.addEventListener('click',e=>{if(e.target===box)box.remove();});
 }
 function makeFilters(){const app=$('#app');if(!app)return;
 if(window.page==='cases'||$('#app .session-view')){const view=$('#app .session-view');if(view&&!$('#v91CaseFilters')){const f=document.createElement('div');f.id='v91CaseFilters';f.className='v91-filters';f.innerHTML=[['all','كل الجلسات'],['today','جلسات اليوم'],['tomorrow','جلسات الغد'],['civil','مدني'],['family','أسرة']].map(([k,t])=>`<button type="button" data-filter="${k}" class="${k===activeCaseFilter?'active':''}">${t}</button>`).join('');view.parentNode.insertBefore(f,view);f.addEventListener('click',e=>{const b=e.target.closest('button[data-filter]');if(!b)return;activeCaseFilter=b.dataset.filter;f.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));filterRows(view,activeCaseFilter);});}
 if(view){view.querySelectorAll('tbody tr').forEach(tr=>tr.querySelectorAll('td').forEach((td,i)=>td.setAttribute('data-v91-label',labels[i]||'تفاصيل')));filterRows(view,activeCaseFilter);}}
 if($('#app table')&&/الإعلانات/.test($('#topTitle')?.textContent||'')){const table=$('#app table');if(table&&!$('#v91AnnFilters')){const f=document.createElement('div');f.id='v91AnnFilters';f.className='v91-filters';f.innerHTML='<button data-af="all" class="active">كل الإعلانات</button><button data-af="late">الإعلانات المتأخرة</button>';table.parentNode.insertBefore(f,table);f.onclick=e=>{const b=e.target.closest('button[data-af]');if(!b)return;activeAnnFilter=b.dataset.af;f.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b));filterAnnouncementRows(table,activeAnnFilter);};}filterAnnouncementRows(table,activeAnnFilter);}}
 function filterRows(view,filter){const rows=view.querySelectorAll('tbody tr');const now=new Date();const day=now.toISOString().slice(0,10);const tomorrow=new Date(now);tomorrow.setDate(tomorrow.getDate()+1);const next=tomorrow.toISOString().slice(0,10);rows.forEach(r=>{const cells=r.querySelectorAll('td');const date=(cells[0]?.innerText||'').trim();const text=r.innerText.toLocaleLowerCase('ar');let ok=true;if(filter==='today')ok=date===day;else if(filter==='tomorrow')ok=date===next;else if(filter==='civil')ok=/مدني|تعويض|إيجار|تجاري/.test(text);else if(filter==='family')ok=/أسرة|نفقة|طلاق|خلع|رؤية|حضانة/.test(text);r.style.display=ok?'':'none';});}
 function filterAnnouncementRows(table,filter){table.querySelectorAll('tbody tr').forEach(r=>{if(filter==='all'){r.style.display='';return;}const t=r.innerText;const dateMatch=t.match(/\d{4}-\d{2}-\d{2}/);const date=dateMatch?.[0];r.style.display=date&&date<new Date().toISOString().slice(0,10)?'':'none';});}
 // Performance: coalesce DOM mutations. The former 1.2s timer repeatedly scanned
 // every case/announcement row and rebuilt the smart bar even when nothing changed.
 let refreshTimer=null;
 function refresh(){ensureBar();makeFilters();showTodayTasks();}
 function queueRefresh(){if(refreshTimer)clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{refreshTimer=null;refresh();},180);}
 const observer=new MutationObserver(()=>queueRefresh());
 const app=$('#app');if(app)observer.observe(app,{childList:true,subtree:true});
 // Initial pass plus foreground/login-related DOM updates; no perpetual UI polling.
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',queueRefresh,{once:true});
 else queueRefresh();
 window.addEventListener('focus',queueRefresh,{passive:true});
 window.MAKTABY_V91={version:'10.0.0',refresh,filterRows};
})();


/* ===== Legacy UI segment 13 (preserved order) ===== */

/* Employee achievements/reporting is isolated in maktaby-achievements.js. */

/* ===== Legacy UI segment 14 (preserved order) ===== */

/* MAKTABY PRO 10 — reliable cross-client synchronization and desktop wrapper support.
   Supabase remains the single source of truth. Realtime is primary; polling and
   reconnect/visibility refresh are safety nets. No local data is pushed blindly. */
(()=>{'use strict';
  const SYNC_VERSION='10.0.0';
  let poller=null, refreshTimer=null, refreshInFlight=false, lastSuccessfulSync=0;
  const status=(msg)=>{try{if(typeof setCloudStatus==='function')setCloudStatus(msg);const b=document.getElementById('cloudStatus');if(b)b.title='MAKTABY '+SYNC_VERSION+' | آخر اتصال ناجح: '+(lastSuccessfulSync?new Date(lastSuccessfulSync).toLocaleTimeString('ar-EG'):'لم يتم بعد');}catch{}};
  function sessionEditorIsActive(){
    const el=document.activeElement;
    return !!(page==='cases' && el && el.matches && el.matches('#app .session-view input, #app .session-view textarea, #app .session-view select'));
  }
  async function safeRefresh(reason){
    if(!currentUser||refreshInFlight||!navigator.onLine)return;
    // Never replace the cases DOM while the user is typing a session date,
    // adjournment reason, or decision. Realtime and polling refreshes are deferred.
    if(window.__maktabySessionWriteInProgress||sessionEditorIsActive()){
      window.__maktabyCloudRefreshPending=true;
      return;
    }
    if(document.querySelector('#modal.show')){window.__maktabyCloudRefreshPending=true;return;}
    refreshInFlight=true;
    try{
      status('جارٍ تحديث البيانات من السحابة…');
      await loadCloudState();
      lastSuccessfulSync=Date.now();
      status('متصل ومتزامن ✓');
    }catch(e){
      console.warn('MAKTABY sync refresh ('+reason+'):',e);
      status('تعذر التحديث — إعادة المحاولة تلقائياً');
    }finally{refreshInFlight=false;}
  }
  function queueRefresh(reason,delay=350){clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>safeRefresh(reason),delay);}
  // After the user leaves an inline session field, wait for a short quiet
  // period before applying any deferred cloud refresh.
  document.addEventListener('focusout',e=>{
    if(!e.target?.matches?.('#app .session-view input, #app .session-view textarea, #app .session-view select'))return;
    setTimeout(()=>{
      if(!sessionEditorIsActive()&&window.__maktabyCloudRefreshPending&&!window.__maktabySessionWriteInProgress){
        window.__maktabyCloudRefreshPending=false;
        queueRefresh('session-editor-blur',900);
      }
    },700);
  },true);
  // Replace the previous fire-and-forget realtime setup with status-aware subscriptions.
  window.startRealtime=function(){
    try{if(realtimeChannel)sb.removeChannel(realtimeChannel);}catch{}
    realtimeChannel=sb.channel('maktaby-pro10-live')
      .on('postgres_changes',{event:'*',schema:'public',table:'office_shared_state'},()=>queueRefresh('office_shared_state'))
      .on('postgres_changes',{event:'*',schema:'public',table:'employee_shared_state'},()=>queueRefresh('employee_shared_state'))
      .on('postgres_changes',{event:'*',schema:'public',table:'expenses'},()=>queueRefresh('expenses'))
      .on('postgres_changes',{event:'*',schema:'public',table:'wallet_transactions'},()=>queueRefresh('wallet_transactions'))
      .on('postgres_changes',{event:'*',schema:'public',table:'client_documents'},()=>queueRefresh('client_documents'))
      .on('postgres_changes',{event:'*',schema:'public',table:'office_financial_state'},()=>queueRefresh('office_financial_state'))
      .on('postgres_changes',{event:'*',schema:'public',table:'approval_requests'},()=>{queueRefresh('approval_requests');if(typeof refreshApprovalRequests==='function')refreshApprovalRequests(false).catch(()=>{});})
      .subscribe((state)=>{
        if(state==='SUBSCRIBED'){status('اتصال مباشر — المزامنة الفورية مفعّلة ✓');queueRefresh('realtime-connected',100);}
        else if(state==='CHANNEL_ERROR'||state==='TIMED_OUT'||state==='CLOSED'){status('الاتصال المباشر غير مستقر — المزامنة الاحتياطية تعمل');}
      });
    if(poller)clearInterval(poller);
    // 15-second fallback catches changes even if realtime delivery is interrupted.
    poller=setInterval(()=>safeRefresh('15-second-fallback'),15000);
    if(approvalPoller)clearInterval(approvalPoller);
    if(typeof canReview==='function'&&canReview()&&typeof refreshApprovalRequests==='function')
      approvalPoller=setInterval(()=>refreshApprovalRequests(true).catch(()=>{}),20000);
    status('تم تشغيل المزامنة — جارٍ التحقق…');
  };
  // Recheck immediately when the app returns to foreground or network is restored.
  window.addEventListener('online',()=>{status('عاد الإنترنت — جارٍ استرجاع المزامنة…');queueRefresh('online',100);});
  window.addEventListener('offline',()=>status('غير متصل — لن تُعتمد التعديلات حتى عودة الاتصال'));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)queueRefresh('app-visible',100);});
  window.addEventListener('focus',()=>queueRefresh('window-focus',100));
  // Expose a harmless diagnostic for support; it contains no client or financial data.
  window.MAKTABY_SYNC_DIAGNOSTICS=()=>({version:SYNC_VERSION,online:navigator.onLine,lastSuccessfulSync:lastSuccessfulSync?new Date(lastSuccessfulSync).toISOString():null,realtimeActive:!!realtimeChannel});
})();


/* ===== Legacy UI segment 15 (preserved order) ===== */

(()=>{
  const busy=new Set();
  const wrap=(name,keyFn)=>{
    const original=window[name];if(typeof original!=='function'||original.__maktabyGuarded)return;
    const guarded=async function(...args){
      const key=keyFn(...args);if(busy.has(key)){alert('الطلب قيد التنفيذ بالفعل. انتظر انتهاء العملية قبل المحاولة مرة أخرى.');return;}
      busy.add(key);try{return await original.apply(this,args);}finally{busy.delete(key);}
    };guarded.__maktabyGuarded=true;window[name]=guarded;
  };
  wrap('reviewApproval',(id)=>'approval:'+id);
  wrap('reviewEmployeeExpenseV54',(id)=>'expense:'+id);
  window.MAKTABY_PRO_VERSION='10.9.1';
})();


/* ===== Legacy UI segment 16 (preserved order) ===== */

(()=>{'use strict';
 const busy=new Set();
 const canManage=()=>{try{return typeof canReview==='function'&&canReview()}catch{return false}};
 const setButton=(b,on,label)=>{if(!b)return;b.disabled=on;if(on){b.dataset.oldLabel=b.textContent;b.textContent=label||'جارٍ التنفيذ...'}else if(b.dataset.oldLabel){b.textContent=b.dataset.oldLabel;delete b.dataset.oldLabel}};
 let approvalFetchInFlight=null;
 async function fetchRequests(){
   if(!canManage())throw new Error('طلبات الاعتماد متاحة للمدير ومديرة المكتب فقط.');
   if(approvalFetchInFlight)return approvalFetchInFlight;
   const fetchTask=(async()=>{
   const {data,error}=await sb.from('approval_requests').select('id,requested_by,requested_by_name,request_type,payload,status,created_at,reviewed_by,reviewed_by_name,reviewed_at,review_note').order('created_at',{ascending:false});
   if(error)throw error;
   db.approvalRequests=Array.isArray(data)?data:[];
   if(typeof knownPendingApprovalIds!=='undefined')knownPendingApprovalIds=new Set(db.approvalRequests.filter(x=>x.status==='pending').map(x=>x.id));
   return db.approvalRequests;
   })();
   approvalFetchInFlight=fetchTask;
   try{return await fetchTask;}finally{if(approvalFetchInFlight===fetchTask)approvalFetchInFlight=null;}
 }
 async function review(id,approve,button){
   const key='approval:'+id;if(busy.has(key))return;
   if(!canManage()){alert('ليس لديك صلاحية اعتماد الطلبات.');return;}
   busy.add(key);setButton(button,true,'جارٍ التحقق...');
   try{
     // Always read the live row from Supabase. Never trust a stale in-memory approval list.
     await fetchRequests();
     const req=db.approvalRequests.find(x=>String(x.id)===String(id));
     if(!req){throw new Error('لم يتم العثور على الطلب في قاعدة البيانات. حدّث الصفحة وتأكد من صلاحيات الحساب.');}
     if(String(req.status||'').toLowerCase()!=='pending'){
       alert('هذا الطلب لم يعد معلقًا. تم تحديث حالته من قاعدة البيانات.');
       render();return;
     }
     const legacy=window.reviewApproval;
     if(typeof legacy!=='function')throw new Error('تعذر تحميل وظيفة الاعتماد. أعد فتح البرنامج أو حدّث الصفحة.');
     // The legacy business rules are retained; only the data lookup and click routing are hardened.
     setButton(button,true,approve?'جارٍ الاعتماد...':'جارٍ الرفض...');
     await legacy.call(window,id,!!approve);
     await fetchRequests();
     render();
   }catch(err){console.error('[MAKTABY approval]',err);alert('تعذر تنفيذ طلب الاعتماد: '+(err?.message||err));try{await fetchRequests();render()}catch(refreshErr){console.error('[MAKTABY approval refresh]',refreshErr)}}
   finally{busy.delete(key);setButton(button,false);}
 }
 async function reviewExpense(id,approve,button){
   const key='expense:'+id;if(busy.has(key))return;
   if(!canManage()){alert('ليس لديك صلاحية اعتماد المصروفات.');return;}
   busy.add(key);setButton(button,true,approve?'جارٍ الاعتماد والخصم...':'جارٍ الرفض...');
   try{
     const fn=window.reviewEmployeeExpenseV54;
     if(typeof fn!=='function')throw new Error('وظيفة اعتماد المصروفات غير محمّلة.');
     await fn.call(window,id,!!approve);
     if(typeof loadCloudState==='function')await loadCloudState();
     render();
   }catch(err){console.error('[MAKTABY expense approval]',err);alert('تعذر اعتماد المصروف: '+(err?.message||err));}
   finally{busy.delete(key);setButton(button,false);}
 }
 document.addEventListener('click',async e=>{
   const editExpense=e.target.closest?.('[data-expense-edit-id]');
   if(editExpense){e.preventDefault();e.stopImmediatePropagation();try{await window.editPendingEmployeeExpenseV10(editExpense.getAttribute('data-expense-edit-id'));}catch(err){console.error('[MAKTABY expense edit]',err);alert('تعذر فتح تعديل المصروف: '+(err?.message||err));}return;}
   const nav=e.target.closest?.('#nav [data-page="approvals"]');
   if(nav){
     e.preventDefault();e.stopImmediatePropagation();
     if(!canManage()){alert('طلبات الاعتماد متاحة للمدير ومديرة المكتب فقط.');return;}
     page='approvals';const app=document.getElementById('app');if(app)app.innerHTML='<section class="panel"><h3>مركز الاعتمادات</h3><div class="empty">جارٍ تحميل الطلبات مباشرة من قاعدة البيانات...</div></section>';
     try{await fetchRequests();render();}catch(err){console.error(err);if(app)app.innerHTML='<section class="panel"><h3>تعذر تحميل طلبات الاعتماد</h3><div class="notice">'+String(err?.message||err).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))+'</div><button class="btn goldbtn" id="maktabyRetryApprovals">إعادة المحاولة</button></section>';document.getElementById('maktabyRetryApprovals')?.addEventListener('click',()=>nav.click());}
     return;
   }
   const b=e.target.closest?.('[data-review-id]');
   if(b){e.preventDefault();e.stopImmediatePropagation();await review(b.dataset.reviewId,b.dataset.reviewApprove==='1',b);return;}
   const x=e.target.closest?.('[data-expense-review-id]');
   if(x){e.preventDefault();e.stopImmediatePropagation();await reviewExpense(x.dataset.expenseReviewId,x.dataset.expenseApprove==='1',x);}
 },true);
 window.MAKTABY_APPROVALS_V931={refresh:async()=>{await fetchRequests();render()},review};
 window.MAKTABY_PRO_VERSION='10.9.1';
})();



/* MAKTABY 9.5.1 — FINAL INLINE SESSION EDIT GUARD.
   The earlier refresh gate only protected calls routed through safeRefresh().
   Legacy timers/listeners can call loadCloudState() or render() directly, so
   protect the central mutation points as well. */
(()=>{'use strict';
 const sessionEditorIsActive=()=>{
   const el=document.activeElement;
   return !!(typeof page!=='undefined'&&page==='cases'&&el&&el.matches&&
     el.matches('#app .session-view input, #app .session-view textarea, #app .session-view select'));
 };
 const originalRender=render;
 render=function(...args){
   if(sessionEditorIsActive()&&!window.__maktabySessionWriteInProgress){
     window.__maktabyRenderPending=true;
     return;
   }
   window.__maktabyRenderPending=false;
   return originalRender.apply(this,args);
 };
 const originalLoad=loadCloudState;
 loadCloudState=async function(...args){
   if(sessionEditorIsActive()||window.__maktabySessionWriteInProgress||document.querySelector('#modal.show')){
     window.__maktabyCloudRefreshPending=true;
     return;
   }
   return originalLoad.apply(this,args);
 };
 document.addEventListener('focusout',e=>{
   if(!e.target?.matches?.('#app .session-view input, #app .session-view textarea, #app .session-view select'))return;
   setTimeout(()=>{
     if(sessionEditorIsActive()||window.__maktabySessionWriteInProgress)return;
     if(window.__maktabyCloudRefreshPending){
       window.__maktabyCloudRefreshPending=false;
       if(typeof refreshCloud==='function')refreshCloud();
       else loadCloudState().catch(err=>console.warn('[MAKTABY deferred refresh]',err));
     }else if(window.__maktabyRenderPending){
       window.__maktabyRenderPending=false;
       render();
     }
   },120);
 },true);
 window.MAKTABY_SESSION_EDIT_GUARD={active:sessionEditorIsActive};
})();


/* MAKTABY 9.5.1 maintenance additions: court-grouped enumerations,
   admin-only agreement voiding, bonus approval workflow and payroll deductions.
   Payroll data is stored in the existing office_financial_state JSON record. */
(()=>{'use strict';
 const cashV951=n=>(Number(n)||0).toLocaleString('en-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';
 const escV951=s=>esc(String(s??''));
 const ensurePayroll=()=>{db.payrollSettings=Array.isArray(db.payrollSettings)?db.payrollSettings:[];db.payrollEntries=Array.isArray(db.payrollEntries)?db.payrollEntries:[];};
 const isActiveAgreement=a=>!a.deletedAt&&!a.voidedAt;

 // Keep the agreement ledger auditable: admin-only soft deletion, never erase receipts.
 const oldRenderFees=window.renderFeesV712;
 if(typeof oldRenderFees==='function'){
   window.feeDeleteAgreementV951=async id=>{
     if(!isAdmin()){alert('إلغاء اتفاق الأتعاب متاح للأدمن فقط.');return;}
     const a=(db.clientFeeAgreements||[]).find(x=>String(x.id)===String(id));if(!a||!isActiveAgreement(a))return;
     const previous={...a};const paid=(db.clientFeePayments||[]).filter(x=>String(x.agreementId)===String(id)).reduce((n,x)=>n+(Number(x.amount)||0),0);
     const reason=prompt('سبب إلغاء / أرشفة الاتفاق. ستظل الدفعات محفوظة ولن تُحذف:', '');if(reason===null)return;if(!reason.trim())return alert('سبب الإلغاء مطلوب للتوثيق.');
     if(!confirm('تأكيد إلغاء الاتفاق؟ سيتم استبعاده من إجماليات الاتفاقات النشطة مع الاحتفاظ بكل الدفعات وسجل الاتفاق. إجمالي الدفعات المرتبطة: '+cashV951(paid)))return;
     a.deletedAt=new Date().toISOString();a.deletedBy=currentUser?.name||'admin';a.deleteReason=reason.trim();a.status='voided';
     try{await window.MAKTABY_PERSIST_FEES_V951();window.renderFeesV712();alert('تم إلغاء الاتفاق مع الاحتفاظ بسجل الدفعات.');}catch(e){Object.keys(a).forEach(k=>delete a[k]);Object.assign(a,previous);alert('تعذر حفظ الإلغاء: '+e.message);}
   };
   // Replace the fee renderer without changing its existing receipt/payment logic.
   window.renderFeesV712=async function(){
     const all=db.clientFeeAgreements||[],active=all.filter(isActiveAgreement),archived=all.filter(a=>!isActiveAgreement(a));
     const original=window.MAKTABY_ORIGINAL_FEE_RENDER_V951;
     if(!original)return;
     const before=all.slice();
     db.clientFeeAgreements=active;
     try{await original();}finally{db.clientFeeAgreements=before;}
     if(page!=='clientfees')return;
     const app=document.getElementById('app');if(!app)return;
     if(isAdmin()){
       const body=archived.map(a=>{const paid=(db.clientFeePayments||[]).filter(p=>String(p.agreementId)===String(a.id)).reduce((n,p)=>n+(Number(p.amount)||0),0);return `<tr><td>${escV951(a.client)}</td><td>${escV951(a.caseNumber||'—')}</td><td>${cashV951(a.total)}</td><td>${cashV951(paid)}</td><td>${escV951(a.deletedAt||a.voidedAt||'—')}</td><td>${escV951(a.deletedBy||'—')}</td><td>${escV951(a.deleteReason||'—')}</td></tr>`;}).join('');
       app.insertAdjacentHTML('beforeend',`<details class="panel" style="margin-top:16px"><summary style="cursor:pointer;font-weight:800">اتفاقات ملغاة / مؤرشفة (${archived.length}) — محفوظة للمراجعة</summary>${table(['الموكل','رقم القضية','قيمة الاتفاق','الدفعات المحفوظة','تاريخ الإلغاء','بواسطة','السبب'],body)}</details>`);
       const rows=app.querySelectorAll('tbody tr');
       // Add the action only to active agreement rows, matching the visible agreement ID order.
       const activeSorted=active.filter(a=>{const q=(window.clientFeesQuery||'').trim().toLocaleLowerCase('ar');return !q||[a.client,a.description,a.caseNumber].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q));}).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
       const feeTable=app.querySelector('section.panel table');
       if(feeTable){const trs=[...feeTable.querySelectorAll('tbody tr')];trs.forEach((tr,i)=>{const a=activeSorted[i];if(!a)return;const cell=tr.querySelector('td:last-child');if(cell)cell.insertAdjacentHTML('beforeend',` <button class="btn danger" onclick="feeDeleteAgreementV951('${String(a.id).replace(/'/g,'')}')">إلغاء</button>`);});}
     }
   };
   window.MAKTABY_ORIGINAL_FEE_RENDER_V951=oldRenderFees;
   window.MAKTABY_PERSIST_FEES_V951=async()=>{
     if(!canManageOffice())throw new Error('لا توجد صلاحية لحفظ الحسابات.');
     await persistFinancialStateAtomic(db,'تعذر حفظ اتفاق الأتعاب');
   };
 }

 // Payroll persistence uses the already-existing financial JSON record; no destructive schema migration.
 window.persistPayrollV951=async()=>{
   if(!isAdmin())throw new Error('إدارة الرواتب متاحة للمدير الرئيسي فقط حتى اكتمال التحقق من صلاحيات قاعدة البيانات.');
   ensurePayroll();
   await persistFinancialStateAtomic(db,'تعذر حفظ الرواتب والخصومات');
 };
 window.setEmployeeSalaryV951=async employeeId=>{
   if(!isAdmin())return alert('تعديل الراتب الأساسي متاح للمدير الرئيسي فقط.');ensurePayroll();const e=(db.employees||[]).find(x=>String(x.id)===String(employeeId));if(!e)return;
   const old=db.payrollSettings.find(x=>String(x.employeeId)===String(employeeId));const raw=prompt('الراتب الشهري الأساسي للموظف: '+e.name,String(old?.monthlySalary??''));if(raw===null)return;const amount=Number(raw);if(!Number.isFinite(amount)||amount<0)return alert('أدخل راتبًا صحيحًا غير سالب.');
   const row={id:'salary-'+String(employeeId),employeeId:String(employeeId),employeeName:e.name,monthlySalary:amount,updatedAt:new Date().toISOString(),updatedBy:currentUser.name};const oldSnapshot=old?{...old}:null;if(old)Object.assign(old,row);else db.payrollSettings.push(row);
   try{await persistPayrollV951();render();alert('تم حفظ الراتب الأساسي.');}catch(err){if(old&&oldSnapshot)Object.assign(old,oldSnapshot);else db.payrollSettings=db.payrollSettings.filter(x=>String(x.employeeId)!==String(employeeId));alert('تعذر حفظ الراتب؛ أُعيدت البيانات المعروضة إلى حالتها السابقة: '+err.message);}
 };
 window.addPayrollDeductionV951=async()=>{
   if(!isAdmin())return alert('تسجيل خصم الراتب متاح للمدير الرئيسي فقط.');ensurePayroll();const employeeId=document.getElementById('payEmployeeV951')?.value;const e=(db.employees||[]).find(x=>String(x.id)===String(employeeId));if(!e)return alert('اختر الموظف.');
   const month=document.getElementById('payMonthV951')?.value||today().slice(0,7),type=document.getElementById('deductionTypeV951')?.value,raw=document.getElementById('deductionAmountV951')?.value,reason=document.getElementById('deductionReasonV951')?.value.trim();const val=Number(raw);if(!Number.isFinite(val)||val<=0||!reason)return alert('أدخل قيمة الخصم وسببه.');
   const setting=db.payrollSettings.find(x=>String(x.employeeId)===String(employeeId));if(!setting)return alert('حدد الراتب الشهري للموظف أولًا.');
   const amount=type==='days'?setting.monthlySalary/30*val:val;if(type==='days'&&val>30)return alert('خصم الأيام لا يمكن أن يتجاوز 30 يومًا في الشهر.');const approvedBonus=(db.approvalRequests||[]).filter(x=>x.request_type==='bonus_request'&&x.status==='approved'&&String(x.payload?.employeeId||x.requested_by)===String(employeeId)&&(x.payload?.month||String(x.created_at||'').slice(0,7))===month).reduce((n,x)=>n+(Number(x.payload?.approvedAmount)||0),0);const alreadyDeducted=db.payrollEntries.filter(x=>String(x.employeeId)===String(employeeId)&&x.month===month&&x.kind==='deduction').reduce((n,x)=>n+(Number(x.amount)||0),0);const available=Math.max(0,Number(setting.monthlySalary||0)+approvedBonus-alreadyDeducted);if(amount>available+0.00001)return alert('قيمة الخصم تتجاوز صافي المستحق المتاح لهذا الشهر: '+cashV951(available));
   const deductionRow={id:'ded-'+(globalThis.crypto?.randomUUID?.()||Date.now()),employeeId:String(employeeId),employeeName:e.name,month,kind:'deduction',deductionType:type,inputValue:val,amount,reason,createdAt:new Date().toISOString(),createdBy:currentUser.name};db.payrollEntries.push(deductionRow);
   try{await persistPayrollV951();render();alert('تم تسجيل الخصم للشهر المحدد: '+cashV951(amount));}catch(err){db.payrollEntries=db.payrollEntries.filter(x=>x.id!==deductionRow.id);alert('تعذر حفظ الخصم؛ لم يُترك في البيانات المحلية: '+err.message);}
 };
 window.submitBonusRequestV951=async()=>{
   if(!currentUser?.id||!isEmployee())return alert('إرسال طلب البونص متاح لحساب الموظف فقط.');const amount=Number(document.getElementById('bonusAmountV951')?.value||0),days=Number(document.getElementById('bonusDaysV104')?.value||0),reason=document.getElementById('bonusReasonV951')?.value.trim();if((!Number.isFinite(amount)||amount<0)||(!Number.isFinite(days)||days<0)||(!amount&&!days)||days>30||!reason)return alert('أدخل مبلغًا أو أيامًا أو الاثنين معًا، بحد أقصى 30 يومًا، مع توضيح السبب.');
   if(window.__bonusSubmitBusyV951)return;window.__bonusSubmitBusyV951=true;const btn=document.querySelector('[data-bonus-submit]');if(btn)btn.disabled=true;
   try{
     const {data:{user},error:ue}=await sb.auth.getUser();
     if(ue||!user?.id)throw ue||new Error('تعذر تحديد حساب الموظف. سجّل الخروج ثم الدخول مرة أخرى.');
     const pending=await sb.from('approval_requests').select('id').eq('requested_by',user.id).eq('request_type','bonus_request').eq('status','pending').limit(1);
     if(pending.error){const e=pending.error;throw new Error('تعذر التحقق من الطلبات السابقة. لم نرسل طلبًا جديدًا منعًا للتكرار. '+e.message+' [Code: '+(e.code||'—')+'] '+(e.details||'')+' '+(e.hint||''));}
     if(pending.data?.length)return alert('لديك بالفعل طلب بونص قيد المراجعة. انتظر قرار الإدارة قبل إرسال طلب جديد.');
     const payload={amount,days,approvedAmount:0,approvedDays:0,reason,month:today().slice(0,7),employeeId:user.id,employeeName:currentUser.name,bonusType:amount&&days?'money_and_days':days?'days':'money'};
     const {data:created,error}=await sb.from('approval_requests').insert({requested_by:user.id,requested_by_name:currentUser.name,request_type:'bonus_request',payload,status:'pending'}).select('id').single();
     if(error){const code=error.code||'';let hint='';if(code==='42501'||/row-level security|permission denied/i.test(error.message||''))hint='السبب المرجح: سياسة RLS أو صلاحية INSERT على جدول approval_requests؛ يلزم مراجعة سياسة السماح للموظف بإرسال طلبه الشخصي من النوع bonus_request.';else if(code==='23514')hint='السبب المرجح: قيد CHECK في قاعدة البيانات لا يسمح بالقيمة bonus_request أو ببنية الطلب.';else if(code==='42703'||code==='PGRST204')hint='يوجد اختلاف بين أعمدة الجدول والكود المنشور.';throw new Error((error.message||'فشل INSERT')+' [Code: '+(code||'غير متاح')+'] '+(error.details||'')+' '+(error.hint||'')+' '+hint);}
     if(!created?.id)throw new Error('لم تؤكد قاعدة البيانات إنشاء الطلب؛ لم يتم مسح بيانات النموذج.');
     const history=document.getElementById('myBonusRequestsV951');if(history)history.textContent='تم إرسال الطلب بنجاح، وهو الآن قيد مراجعة الإدارة. رقم الطلب: '+created.id+' — لن يتغير الراتب قبل الاعتماد.';
     const a=document.getElementById('bonusAmountV951'),d=document.getElementById('bonusDaysV104'),r=document.getElementById('bonusReasonV951');if(a)a.value='';if(d)d.value='';if(r)r.value='';
     alert('تم إرسال طلب البونص للمدير. رقم الطلب: '+created.id+' — لن يدخل الراتب إلا بعد الاعتماد.');
   }catch(e){console.error('MAKTABY bonus request submission failed',e);alert('تعذر إرسال طلب البونص: '+(e.message||String(e))+'\n\nلم يتم تغيير الراتب أو إنشاء حركة مالية. احتفظ بالمبلغ والسبب، وأرسل كود الخطأ للإدارة الفنية إذا استمر العطل.');}
   finally{window.__bonusSubmitBusyV951=false;if(btn)btn.disabled=false;}
 };
 window.addBonusForEmployeeV951=async()=>{
   if(!isAdmin())return alert('إضافة بونص مباشر متاحة للمدير الرئيسي فقط.');
   if(window.__bonusAdminBusyV951)return;
   const employeeId=document.getElementById('adminBonusEmployeeV951')?.value;
   const employee=(db.employees||[]).find(e=>String(e.id)===String(employeeId));
   const amount=Number(document.getElementById('adminBonusAmountV951')?.value);
   const reason=String(document.getElementById('adminBonusReasonV951')?.value||'').trim();
   const month=document.getElementById('adminBonusMonthV951')?.value||today().slice(0,7);
   if(!employee)return alert('اختر الموظف المستحق للبونص.');
   if(!Number.isFinite(amount)||amount<=0)return alert('أدخل مبلغ بونص صحيحًا أكبر من صفر.');
   if(!reason)return alert('اكتب سبب منح البونص.');
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return alert('اختر شهرًا صحيحًا.');
   if(!confirm(`تأكيد إضافة بونص ${cashV951(amount)} للموظف ${employee.name} عن شهر ${month}؟ سيضاف للمستحقات فور اعتماده.`))return;
   window.__bonusAdminBusyV951=true;const btn=document.querySelector('[data-admin-bonus-submit]');if(btn)btn.disabled=true;
   try{
     const {data:{user},error:authError}=await sb.auth.getUser();if(authError||!user?.id)throw authError||new Error('تعذر التحقق من حساب المدير.');
     // Read existing direct grants for this employee/month and block an exact repeat.
     // This is a safety preflight; the database status guard below remains the final approval guard.
     const {data:existing,error:existingError}=await sb.from('approval_requests').select('id,status,payload').eq('request_type','bonus_request').eq('payload->>employeeId',String(employee.id)).eq('payload->>month',month).eq('payload->>managerGranted','true').in('status',['pending','approved']).limit(100);
     if(existingError)throw new Error('تعذر التحقق من منح بونص سابق؛ لم يتم إنشاء طلب جديد: '+existingError.message);
     const duplicate=(existing||[]).find(x=>Number(x.payload?.amount)===amount&&String(x.payload?.reason||'').trim()===reason);
     if(duplicate)throw new Error(`يوجد بالفعل بونص مباشر مطابق لهذا الموظف والشهر (${duplicate.status==='approved'?'معتمد':'قيد المراجعة'}). لن نكرر إضافته. إذا كانت مكافأة أخرى مستقلة، سجّل سببًا يميزها بوضوح.`);
     const payload={amount,approvedAmount:amount,reason,month,employeeId:String(employee.id),employeeName:employee.name,managerGranted:true,grantedBy:currentUser.name,grantedAt:new Date().toISOString()};
     // Create a pending audit row first, then approve it using the existing guarded review flow.
     const {data:created,error:insertError}=await sb.from('approval_requests').insert({requested_by:user.id,requested_by_name:currentUser.name,request_type:'bonus_request',payload,status:'pending'}).select('id').single();
     if(insertError)throw insertError;
     const {data:approved,error:updateError}=await sb.from('approval_requests').update({status:'approved',reviewed_by:user.id,reviewed_by_name:currentUser.name,reviewed_at:new Date().toISOString(),review_note:'منح مباشر من المدير',payload}).eq('id',created.id).eq('status','pending').select('id');
     if(updateError||!approved?.length){await loadCloudState();throw new Error('تم تسجيل طلب البونص لكنه لم يعتمد تلقائيًا؛ ستجده ضمن الطلبات المعلقة ويمكن اعتماده من نفس الشاشة. '+(updateError?.message||''));}
     await loadCloudState();alert('تمت إضافة البونص واعتماده للموظف، وسيظهر ضمن مستحقات الشهر المحدد.');
   }catch(e){alert('تعذر إضافة البونص: '+e.message);}finally{window.__bonusAdminBusyV951=false;if(btn)btn.disabled=false;}
 };
 window.__bonusReviewLocksV951=window.__bonusReviewLocksV951||new Set();
 window.reviewBonusRequestV951=async(id,approve)=>{
   if(!isAdmin())return alert('اعتماد البونص متاح للمدير الرئيسي فقط.');
   const key=String(id||'');
   if(!key)return alert('رقم طلب البونص غير صالح.');
   if(window.__bonusReviewLocksV951.has(key))return;
   window.__bonusReviewLocksV951.add(key);
   try{
     // Always re-read the row from the database; never approve from a stale UI snapshot.
     const {data:req,error:readError}=await sb.from('approval_requests').select('id,requested_by,requested_by_name,request_type,payload,status,created_at').eq('id',key).maybeSingle();
     if(readError)throw new Error('تعذر إعادة قراءة الطلب من قاعدة البيانات؛ لم يتم اتخاذ أي إجراء: '+readError.message);
     if(!req||req.request_type!=='bonus_request')throw new Error('طلب البونص غير موجود أو نوعه غير صحيح.');
     if(req.status!=='pending')throw new Error('هذا الطلب لم يعد معلقًا؛ ربما تمت معالجته من مستخدم آخر.');
     const p=req.payload||{};
     const month=String(p.month||String(req.created_at||'').slice(0,7));
     if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('شهر الطلب غير صحيح؛ أوقفنا الاعتماد لحين مراجعته.');
     const requestedAmount=Number(p.amount||0),requestedDays=Number(p.days||0);
     if(!Number.isFinite(requestedAmount)||requestedAmount<0||!Number.isFinite(requestedDays)||requestedDays<0||(!requestedAmount&&!requestedDays)||requestedDays>30)throw new Error('بيانات مبلغ/أيام البونص غير صحيحة؛ لم يتم الاعتماد.');
     const managerGranted=p.managerGranted===true||p.managerGranted==='true';
     if(managerGranted&&!isAdmin())throw new Error('منح البونص المباشر لا يعتمده إلا المدير الرئيسي.');
     if(!managerGranted&&String(p.employeeId||'')!==String(req.requested_by||''))throw new Error('هوية الموظف داخل الطلب لا تطابق صاحب الطلب؛ تم إيقاف الاعتماد للمراجعة.');
     const employee=(db.employees||[]).find(e=>String(e.id)===String(p.employeeId||req.requested_by));
     if(!employee)throw new Error('الموظف المرتبط بالطلب غير موجود في سجل الموظفين.');
     let approvedAmount=0,approvedDays=0,reason='';
     if(approve){
       const raw=prompt('المبلغ المالي المعتمد بالجنيه (صفر إذا لا يوجد):',String(requestedAmount));
       if(raw===null)return;approvedAmount=Number(raw);
       const rawDays=prompt('أيام البونص المعتمدة (صفر إذا لا توجد):',String(requestedDays));
       if(rawDays===null)return;approvedDays=Number(rawDays);
       if(!Number.isFinite(approvedAmount)||approvedAmount<0||!Number.isFinite(approvedDays)||approvedDays<0||approvedDays>30||(!approvedAmount&&!approvedDays))return alert('يجب اعتماد مبلغ أو أيام صحيحة.');
       reason=prompt('ملاحظة الاعتماد (اختياري):','')||'';
     }else{
       reason=prompt('سبب رفض طلب البونص (إجباري):','');
       if(reason===null)return;
       if(!reason.trim())return alert('سبب الرفض مطلوب.');
     }
     const reviewedAt=new Date().toISOString();
     const finalPayload=approve?{...p,month,approvedAmount,approvedDays,approvedAt:reviewedAt,approvedBy:currentUser.name}:{...p,month};
     // The status predicate is the final optimistic lock: only one reviewer can win.
     const {data,error}=await sb.from('approval_requests').update({status:approve?'approved':'rejected',reviewed_by:currentUser.id,reviewed_by_name:currentUser.name,reviewed_at:reviewedAt,review_note:reason.trim(),payload:finalPayload}).eq('id',key).eq('status','pending').select('id');
     if(error)throw error;
     if(!data?.length)throw new Error('سبق أن عالج مستخدم آخر هذا الطلب؛ لم يتم تكرار الاعتماد.');
     await loadCloudState();
     alert(approve?'تم اعتماد البونص نهائيًا وسيُحتسب في مستحقات الشهر.':'تم رفض طلب البونص مع حفظ سبب الرفض.');
   }catch(e){alert('تعذر معالجة طلب البونص: '+e.message);}
   finally{window.__bonusReviewLocksV951.delete(key);}
 };

 window.createSessionFromIncomeV1=async index=>{
   if(!canManageOffice())return alert('تحديد جلسة من الوارد متاح للمدير فقط.');const tx=db.transactions[index];if(!tx||tx.kind!=='وارد')return;
   const sourceId=tx.id||('tx-'+index+'-'+tx.date+'-'+tx.amount);const already=db.cases.find(c=>String(c.caseId||c.id)===String(tx.linkedCaseId||'')||String(c.sourceTransactionId||'')===String(sourceId));if(already){tx.linkedCaseId=already.caseId||already.id;localStorage.setItem(STORAGE_KEY,JSON.stringify(db));return alert('تم ترحيل هذه الحركة بالفعل إلى الجلسات: '+(already.number||''));}
   const number=prompt('رقم الدعوى:','');if(number===null)return;if(!number.trim())return alert('رقم الدعوى مطلوب.');const court=prompt('اسم المحكمة / الدائرة:','');if(court===null)return;if(!court.trim())return alert('اسم المحكمة مطلوب.');const date=prompt('تاريخ الجلسة YYYY-MM-DD:',today());if(date===null)return;if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return alert('صيغة التاريخ غير صحيحة.');const caseType=prompt('نوع الدعوى (اختياري):','')||'';const opponent=prompt('اسم الخصم (اختياري):','')||'';
   const rec={caseId:'case-'+(globalThis.crypto?.randomUUID?.()||Date.now()),sourceTransactionId:sourceId,client:tx.client||'',number:number.trim(),court:court.trim(),date,caseType,opponent,action:tx.title||'',result:'',adjournment:'',history:[],archived:false};db.cases.push(rec);tx.linkedCaseId=rec.caseId;
   try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));await saveCloudState();render();alert('تم إنشاء جلسة وربطها بحركة الوارد.');}catch(e){localStorage.setItem(STORAGE_KEY,JSON.stringify(db));render();alert('تعذر تأكيد المزامنة الكاملة للجلسة: '+e.message+'\nاحتفظنا بالسجل محليًا ولم نحذفه. لا تكرر الترحيل قبل مراجعة الاتصال.');}
 };

 window.editIncomeV951=(index)=>{if(!canManageOffice())return;const x=db.transactions[index];if(!x||x.kind!=='وارد'||x.voidedAt)return;openForm('income');window.editingIncomeIndexV951=index;document.getElementById('modalTitle').textContent='تعديل حركة وارد';fillFormValues(x);};
 window.voidIncomeV951=async(index)=>{if(!isAdmin())return alert('حذف الوارد متاح للأدمن فقط.');const x=db.transactions[index];if(!x||x.kind!=='وارد'||x.voidedAt)return;const reason=prompt('سبب إلغاء حركة الوارد (مطلوب):','');if(reason===null)return;if(!reason.trim())return alert('سبب الإلغاء مطلوب.');if(!confirm('تأكيد إلغاء حركة الوارد؟ ستُستبعد من الإجماليات مع الاحتفاظ بسجلها للمراجعة.'))return;const old={...x};x.voidedAt=new Date().toISOString();x.voidedBy=currentUser.name;x.voidReason=reason.trim();try{await saveCloudState();render();alert('تم إلغاء حركة الوارد مع الاحتفاظ بأثرها.');}catch(e){Object.assign(x,old);alert('تعذر حفظ الإلغاء: '+e.message);}};
 window.printEmployeePayrollStatementV10=(employeeId,month)=>{
   if(!canManageOffice())return alert('طباعة مفردات المرتب متاحة للإدارة فقط.');
   ensurePayroll();
   if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(month||'')))return alert('اختر شهرًا صحيحًا.');
   const employee=(db.employees||[]).find(e=>String(e.id)===String(employeeId));
   if(!employee)return alert('الموظف غير موجود.');
   const setting=(db.payrollSettings||[]).find(x=>String(x.employeeId)===String(employeeId));
   const base=Math.max(0,Number(setting?.monthlySalary)||0);
   const bonuses=(db.approvalRequests||[]).filter(x=>x.request_type==='bonus_request'&&x.status==='approved'&&String(x.payload?.employeeId||x.requested_by)===String(employeeId)&&(x.payload?.month||String(x.created_at||'').slice(0,7))===month);
   const deductions=(db.payrollEntries||[]).filter(x=>String(x.employeeId)===String(employeeId)&&x.month===month&&x.kind==='deduction');
   const bonusTotal=bonuses.reduce((n,x)=>n+Math.max(0,Number(x.payload?.approvedAmount)||0),0);
   const deductionTotal=deductions.reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0);
   const net=base+bonusTotal-deductionTotal;
   const rows=[...bonuses.map(x=>({type:'بونص معتمد',amount:Number(x.payload?.approvedAmount)||0,reason:x.payload?.reason||x.review_note||'—',date:String(x.reviewed_at||x.created_at||'').slice(0,10),by:x.reviewed_by_name||x.payload?.approvedBy||x.payload?.grantedBy||x.requested_by_name||'—'})),...deductions.map(x=>({type:x.deductionType==='days'?'خصم أيام':'خصم مبلغ ثابت',amount:Number(x.amount)||0,reason:x.reason||'—',date:String(x.createdAt||'').slice(0,10),by:x.createdBy||'—'}))];
   const esc=v=>String(v??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const money=v=>(Number(v)||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';
   const frame=document.createElement('iframe');frame.style.cssText='position:fixed;width:0;height:0;border:0;right:0;bottom:0';document.body.appendChild(frame);
   const doc=frame.contentDocument;doc.open();doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>مفردات مرتب ${esc(employee.name)} - ${esc(month)}</title><style>body{font-family:Tahoma,Arial,sans-serif;padding:28px;color:#222}h1{text-align:center;font-size:22px;margin:0 0 8px}.meta{text-align:center;margin-bottom:24px;color:#555}.box{border:1px solid #bbb;padding:14px;margin:12px 0;border-radius:8px}.totals{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.total{padding:12px;border:1px solid #ddd}.net{font-size:20px;font-weight:bold}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #aaa;padding:9px;text-align:right}th{background:#eee}.sign{display:flex;justify-content:space-between;margin-top:55px}@media print{body{padding:10mm}}</style></head><body><h1>مكتبي للمحاماة</h1><div class="meta">مفردات مرتب شهر ${esc(month)}</div><div class="box"><b>اسم الموظف:</b> ${esc(employee.name)}<br><b>الشهر:</b> ${esc(month)}</div><div class="totals"><div class="total">الراتب الأساسي<br><b>${money(base)}</b></div><div class="total">البونص المعتمد<br><b>${money(bonusTotal)}</b></div><div class="total">إجمالي الخصومات<br><b>${money(deductionTotal)}</b></div><div class="total net">صافي المستحق<br>${money(net)}</div></div><h3>تفاصيل الحركات</h3><table><thead><tr><th>النوع</th><th>القيمة</th><th>السبب</th><th>التاريخ</th><th>المعتمد / المصدر</th></tr></thead><tbody>${rows.length?rows.map(x=>`<tr><td>${esc(x.type)}</td><td>${money(x.amount)}</td><td>${esc(x.reason)}</td><td>${esc(x.date)}</td><td>${esc(x.by)}</td></tr>`).join(''):'<tr><td colspan="5">لا توجد حركات إضافية خلال هذا الشهر.</td></tr>'}</tbody></table><div class="sign"><span>توقيع الموظف: ....................</span><span>اعتماد الإدارة: ....................</span></div><script>window.onload=()=>setTimeout(()=>window.print(),250);window.onafterprint=()=>parent.postMessage('maktaby-payroll-print-done','*');<\/script></body></html>`);doc.close();
   const cleanup=()=>{frame.remove();window.removeEventListener('message',done);};const done=e=>{if(e.data==='maktaby-payroll-print-done')cleanup();};window.addEventListener('message',done);setTimeout(cleanup,120000);
 };
 // Phase 8.7: payroll data lives in office_financial_state and its write path is admin-only.
 // Fail closed for office_manager until database-side payroll permissions are explicitly verified.
 const canAccessPayrollV10=()=>!!currentUser&&(isAdmin()||isEmployee());
 function addPayrollNav(){const nav=document.getElementById('nav');if(!nav)return;let b=nav.querySelector('[data-page="payroll"]');if(!b){b=document.createElement('button');b.dataset.page='payroll';b.textContent='الرواتب والبونص';nav.appendChild(b);}b.style.display=canAccessPayrollV10()?'block':'none';b.onclick=()=>{if(!canAccessPayrollV10()){alert('صفحة الرواتب متاحة للمدير الرئيسي والموظف فقط في الوقت الحالي.');return;}page='payroll';render();};}
 const baseRender=render;
 render=function(){
   addPayrollNav();
   if(page==='clientfees'&&typeof window.renderFeesV712==='function'){window.renderFeesV712();return;}
   if(page==='payroll'&&!canAccessPayrollV10()){
     page='dashboard';
     baseRender();
     const app=document.getElementById('app');
     if(app)app.insertAdjacentHTML('afterbegin','<div class="notice" role="alert">تم منع فتح شاشة الرواتب لأن هذا الحساب لا يملك صلاحية الوصول.</div>');
     addPayrollNav();
     return;
   }
   if(page==='payroll'){
     ensurePayroll();const month=window.payrollMonthV951||today().slice(0,7);
     if(canManageOffice()){
       const employees=(db.employees||[]).filter(e=>e.id);const requests=(db.approvalRequests||[]).filter(x=>x.request_type==='bonus_request'&&x.status==='pending');
       const summaries=employees.map(e=>{const setting=db.payrollSettings.find(x=>String(x.employeeId)===String(e.id));const entries=db.payrollEntries.filter(x=>String(x.employeeId)===String(e.id)&&x.month===month&&x.kind==='deduction');const bonusRows=(db.approvalRequests||[]).filter(x=>x.request_type==='bonus_request'&&x.status==='approved'&&String(x.payload?.employeeId||x.requested_by)===String(e.id)&&(x.payload?.month||String(x.created_at||'').slice(0,7))===month),bonus=bonusRows.reduce((n,x)=>n+(Number(x.payload?.approvedAmount)||0),0),bonusDays=bonusRows.reduce((n,x)=>n+(Number(x.payload?.approvedDays)||0),0),ded=entries.reduce((n,x)=>n+(Number(x.amount)||0),0),base=Number(setting?.monthlySalary)||0;return {e,base,bonus,bonusDays,ded,net:base+bonus-ded};});
       document.getElementById('app').innerHTML=`<div class="pagehead"><div><h1>الرواتب والبونص</h1><div class="sub">البونص لا يدخل المستحقات إلا بعد الاعتماد النهائي. خصم الأيام محسوب على أساس 30 يومًا.</div></div><div class="toolbar"><label>الشهر</label><input id="payMonthV951" type="month" value="${month}" onchange="window.payrollMonthV951=this.value;render()"></div></div><div class="notice">قيمة اليوم = الراتب الشهري ÷ 30. الخصم الثابت يُخصم كما أُدخل. لا يتم تعديل الحركات المالية القديمة.</div><section class="panel"><h3>طلبات البونص المعلقة (${requests.length})</h3>${table(['الموظف','المبلغ المطلوب','الأيام المطلوبة','السبب','الشهر','الإجراء'],requests.map(x=>`<tr><td>${escV951(x.payload?.employeeName||x.requested_by_name)}</td><td>${cashV951(x.payload?.amount)}</td><td>${Number(x.payload?.days||0)}</td><td>${escV951(x.payload?.reason)}</td><td>${escV951(x.payload?.month||'—')}</td><td><button type="button" class="btn goldbtn" onclick="reviewBonusRequestV951('${x.id}',true)">قبول / تعديل المبلغ</button> <button type="button" class="btn danger" onclick="reviewBonusRequestV951('${x.id}',false)">رفض</button></td></tr>`))}</section><section class="panel" style="margin-top:14px;display:${isAdmin()?'block':'none'}"><h3>إضافة بونص مباشر — المدير الرئيسي</h3><div class="formgrid"><label>الموظف<select id="adminBonusEmployeeV951"><option value="">اختر الموظف</option>${employees.map(e=>`<option value="${escV951(e.id)}">${escV951(e.name)}</option>`).join('')}</select></label><label>مبلغ البونص<input id="adminBonusAmountV951" type="number" min="0.01" step="0.01" placeholder="جنيه"></label><label>الشهر المستحق<input id="adminBonusMonthV951" type="month" value="${month}"></label><label>سبب منح البونص<input id="adminBonusReasonV951" type="text" maxlength="500" placeholder="سبب المكافأة"></label></div><div class="actions" style="margin-top:12px"><button type="button" class="btn goldbtn" data-admin-bonus-submit onclick="addBonusForEmployeeV951()">إضافة واعتماد البونص</button></div><div class="sub">هذه الصلاحية للمدير الرئيسي فقط، وكل عملية تُسجل باسم من منح البونص وسبب المنح والشهر المستحق.</div></section><section class="panel" style="margin-top:14px"><h3>الرواتب وصافي المستحقات</h3>${table(['الموظف','الراتب الأساسي','البونص المالي','أيام البونص المعتمدة','الخصومات','صافي المستحق','الإعداد'],summaries.map(x=>`<tr><td>${escV951(x.e.name)}</td><td>${cashV951(x.base)}</td><td>${cashV951(x.bonus)}</td><td>${Number(x.bonusDays||0)}</td><td>${cashV951(x.ded)}</td><td><b>${cashV951(x.net)}</b></td><td><button type="button" class="btn light" onclick="setEmployeeSalaryV951('${x.e.id}')">تحديد / تعديل الراتب</button> <button type="button" class="btn light" onclick="printEmployeePayrollStatementV10('${String(x.e.id).replace(/'/g, "\\'")}', '${month}')">طباعة مفردات المرتب</button></td></tr>`))}</section><section class="panel" style="margin-top:14px"><h3>تسجيل خصم على الراتب</h3><div class="formgrid"><label>الموظف<select id="payEmployeeV951"><option value="">اختر الموظف</option>${employees.map(e=>`<option value="${escV951(e.id)}">${escV951(e.name)}</option>`).join('')}</select></label><label>نوع الخصم<select id="deductionTypeV951"><option value="days">عدد أيام</option><option value="fixed">مبلغ مالي ثابت</option></select></label><label>القيمة<input id="deductionAmountV951" type="number" min="0.01" step="0.01"></label><label>سبب الخصم<input id="deductionReasonV951" type="text"></label></div><div class="actions" style="margin-top:12px"><button type="button" class="btn goldbtn" onclick="addPayrollDeductionV951()">اعتماد الخصم للشهر</button></div></section><section class="panel" style="margin-top:14px"><h3>تفاصيل حركات الشهر</h3>${table(['الموظف','النوع','القيمة المدخلة','قيمة الحركة','السبب / الملاحظة','المعتمد / المصدر','التاريخ'],[...db.payrollEntries.filter(x=>x.month===month).map(x=>`<tr><td>${escV951(x.employeeName)}</td><td>${x.deductionType==='days'?'خصم أيام':'خصم مبلغ ثابت'}</td><td>${escV951(x.inputValue??'—')}</td><td>${cashV951(x.amount)}</td><td>${escV951(x.reason||'—')}</td><td>${escV951(x.createdBy||'—')}</td><td>${escV951(String(x.createdAt||'').slice(0,10)||'—')}</td></tr>`),...(db.approvalRequests||[]).filter(x=>x.request_type==='bonus_request'&&x.status==='approved'&&(x.payload?.month||String(x.created_at||'').slice(0,7))===month).map(x=>`<tr><td>${escV951(x.payload?.employeeName||x.requested_by_name)}</td><td>بونص معتمد</td><td>${cashV951(x.payload?.amount)}</td><td>${Number(x.payload?.approvedDays||0)} يوم</td><td>${cashV951(x.payload?.approvedAmount)}</td><td>${escV951(x.payload?.reason||x.review_note||'—')}</td><td>${escV951(x.reviewed_by_name||x.payload?.approvedBy||x.payload?.grantedBy||x.requested_by_name||'—')}</td><td>${escV951(String(x.reviewed_at||'').slice(0,10)||'—')}</td></tr>`)] )}</section>`;
     }else if(isEmployee()){
       document.getElementById('app').innerHTML=`<div class="pagehead"><div><h1>طلب بونص</h1><div class="sub">اطلب بونصًا ماليًا أو أيامًا إضافية أو الاثنين معًا. لا يضاف أي استحقاق إلا بعد اعتماد الإدارة.</div></div></div><section class="panel"><div class="formgrid"><label>مبلغ البونص بالجنيه (اختياري)<input id="bonusAmountV951" type="number" min="0" step="0.01"></label><label>عدد أيام البونص (اختياري)<input id="bonusDaysV104" type="number" min="0" max="30" step="0.5"></label><label>سبب الطلب<input id="bonusReasonV951" type="text" maxlength="500"></label></div><div class="actions" style="margin-top:12px"><button type="button" data-bonus-submit class="btn goldbtn" onclick="submitBonusRequestV951()">إرسال طلب البونص</button></div></section><section class="panel" style="margin-top:14px"><h3>طلباتي السابقة</h3><div id="myBonusRequestsV951" class="sub">جارٍ تحميل الطلبات…</div></section>`;
       sb.from('approval_requests').select('id,status,payload,created_at,review_note,reviewed_at').eq('requested_by',currentUser.id).eq('request_type','bonus_request').order('created_at',{ascending:false}).then(({data,error})=>{const el=document.getElementById('myBonusRequestsV951');if(!el)return;if(error){el.textContent='تعذر تحميل الطلبات: '+error.message;return;}el.innerHTML=table(['المبلغ المطلوب','الأيام المطلوبة','المبلغ المعتمد','الأيام المعتمدة','الشهر','الحالة','ملاحظة الإدارة','التاريخ'],(data||[]).map(x=>`<tr><td>${cashV951(x.payload?.amount)}</td><td>${Number(x.payload?.days||0)}</td><td>${x.status==='approved'?cashV951(x.payload?.approvedAmount):'—'}</td><td>${x.status==='approved'?Number(x.payload?.approvedDays||0):'—'}</td><td>${escV951(x.payload?.month||'—')}</td><td>${x.status==='approved'?'معتمد':x.status==='rejected'?'مرفوض':'قيد المراجعة'}</td><td>${escV951(x.review_note||'—')}</td><td>${escV951(String(x.created_at||'').slice(0,10))}</td></tr>`));});
     }else{
       page='dashboard';
       baseRender();
       addPayrollNav();
       return;
     }
     document.getElementById('topTitle').textContent='الرواتب والبونص';document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.page==='payroll'));return;
   }
   if(page==='calendar')page='dashboard';baseRender();addPayrollNav();document.querySelectorAll('#nav [data-page="agenda"],#nav [data-page="calendar"]').forEach(x=>x.remove());
   if(page==='income'&&isAdmin()){const voided=(db.transactions||[]).filter(x=>x.kind==='وارد'&&x.voidedAt);if(voided.length){document.getElementById('app')?.insertAdjacentHTML('beforeend',`<details class="panel" style="margin-top:14px"><summary style="cursor:pointer;font-weight:800">حركات وارد ملغاة ومحفوظة (${voided.length})</summary>${table(['التاريخ','الموكل','رقم الحصر','المبلغ','تاريخ الإلغاء','بواسطة','السبب'],voided.map(x=>`<tr><td>${escV951(x.date)}</td><td>${escV951(x.client)}</td><td>${escV951(x.enrollmentNumber||'—')}</td><td>${cashV951(x.amount)}</td><td>${escV951(x.voidedAt)}</td><td>${escV951(x.voidedBy)}</td><td>${escV951(x.voidReason)}</td></tr>`))}</details>`);}}
   // Expose bonus requests in the manager approvals inbox with explicit approval amount flow.
   if(page==='approvals'&&isAdmin()){
     const rows=(db.approvalRequests||[]).filter(x=>x.status==='pending'&&x.request_type==='bonus_request');
     if(rows.length){const box=document.createElement('section');box.className='panel';box.style.marginTop='16px';box.innerHTML=`<h3>طلبات البونص (${rows.length})</h3>${table(['الموظف','المبلغ المطلوب','الأيام المطلوبة','السبب','الإجراء'],rows.map(x=>`<tr><td>${escV951(x.payload?.employeeName||x.requested_by_name)}</td><td>${cashV951(x.payload?.amount)}</td><td>${Number(x.payload?.days||0)}</td><td>${escV951(x.payload?.reason)}</td><td><button type="button" class="btn goldbtn" onclick="reviewBonusRequestV951('${x.id}',true)">قبول / تعديل</button> <button type="button" class="btn danger" onclick="reviewBonusRequestV951('${x.id}',false)">رفض</button></td></tr>`))}`;document.getElementById('app')?.appendChild(box);}
   }
 };
 // Ensure legacy fee nav continues to work and payroll remains accessible after rerenders.
 // Hide any old agenda navigation if one was injected; never delete its historical data.
 document.querySelectorAll('#nav [data-page="agenda"],#nav [data-page="calendar"]').forEach(x=>x.remove());
})();

/* MAKTABY 9.5.1 maintenance hotfix — preserve opened task folders during
   background sync/re-render. No data or database changes. */
(()=>{'use strict';
  const previousRender=render;
  const folderKey=(details)=>{
    const summary=details?.querySelector('summary');
    if(!summary)return '';
    // Ignore the changing task-count badge so a new task does not close its folder.
    return String(summary.textContent||'')
      .replace(/\s+/g,' ')
      .replace(/\s+\d+\s*مهمة\s*$/,'')
      .trim();
  };
  render=function(...args){
    if(typeof page==='undefined'||page!=='tasks')return previousRender.apply(this,args);
    const app=document.getElementById('app');
    const scrollTop=app?.scrollTop||0;
    const pageScroll=window.scrollY||0;
    const opened=[...(app?.querySelectorAll('details[open]')||[])]
      .map(folderKey).filter(Boolean);
    const result=previousRender.apply(this,args);
    const restore=()=>{
      const current=document.getElementById('app');
      if(!current||page!=='tasks')return;
      const wanted=new Set(opened);
      current.querySelectorAll('details').forEach(d=>{
        if(wanted.has(folderKey(d)))d.open=true;
      });
      current.scrollTop=scrollTop;
      if(window.scrollY!==pageScroll)window.scrollTo(0,pageScroll);
    };
    restore();
    requestAnimationFrame(restore);
    return result;
  };
  window.MAKTABY_TASK_VIEW_PERSISTENCE={enabled:true,version:'10.0.0',key:'court-name'};
})();


/* MAKTABY 9.5.1 maintenance hotfix 2 — avoid full-page redraws when a
   background cloud refresh returns identical data. This reduces flicker and
   prevents the user being bounced out of the current task/court view.
   It changes UI refresh behavior only; it does not write or delete records. */
(()=>{'use strict';
  if(window.__MAKTABY_NOOP_REFRESH_GUARD__)return;
  window.__MAKTABY_NOOP_REFRESH_GUARD__=true;
  const baseRender=render;
  const baseLoad=loadCloudState;
  let cloudLoadDepth=0;
  let renderWasRequested=false;
  const snapshot=()=>{
    try{return JSON.stringify(db)}catch(e){return null}
  };
  render=function(...args){
    if(cloudLoadDepth>0){renderWasRequested=true;return;}
    return baseRender.apply(this,args);
  };
  loadCloudState=async function(...args){
    // Nested calls retain the outer comparison boundary.
    if(cloudLoadDepth>0)return baseLoad.apply(this,args);
    const before=snapshot();
    cloudLoadDepth++;
    renderWasRequested=false;
    let completed=false;
    try{
      const result=await baseLoad.apply(this,args);
      completed=true;
      const after=snapshot();
      // Rebuild the UI only if the accepted cloud state actually changed.
      // baseRender includes the task-folder/scroll preservation wrapper.
      if(renderWasRequested && before!==after)baseRender.call(this);
      return result;
    }finally{
      cloudLoadDepth=Math.max(0,cloudLoadDepth-1);
      if(cloudLoadDepth===0)renderWasRequested=false;
      // A failed refresh must not force a redraw of stale data.
      if(!completed && cloudLoadDepth===0)renderWasRequested=false;
    }
  };
  window.MAKTABY_NOOP_REFRESH_GUARD={enabled:true,version:'10.0.0'};
})();


/* MAKTABY 9.5.1 maintenance hotfix 3 — approval polling redraw optimization.
   The approval list is still refreshed and new-request notices still work, but
   an identical response no longer triggers render(), and background approval
   updates do not replace the active task workspace. */
window.MAKTABY_APPROVAL_POLL_GUARD={enabled:true,version:'10.0.0'};


/* MAKTABY PRO 10 — embedded agreement & account workspace (safe legacy-state phase).
   Existing agreements/payments remain untouched. No production SQL or historical backfill.
   Expense posting is intentionally withheld until custody debit + fee posting are atomic. */
(function(){
  'use strict';
  const esc10=v=>typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money10=v=>(Number(v)||0).toLocaleString('ar-EG',{minimumFractionDigits:2,maximumFractionDigits:2})+' ج.م';
  const allA=()=>{if(!Array.isArray(db.clientFeeAgreements))db.clientFeeAgreements=[];return db.clientFeeAgreements;};
  const allP=()=>{if(!Array.isArray(db.clientFeePayments))db.clientFeePayments=[];return db.clientFeePayments;};
  const allManualExpenses=()=>{if(!Array.isArray(db.manualFeeExpenses))db.manualFeeExpenses=[];return db.manualFeeExpenses;};
  const validDate10=v=>{if(v==null||String(v).trim()==='')return true;const s=String(v).trim();const m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!m)return false;const y=Number(m[1]),mo=Number(m[2]),day=Number(m[3]);const d=new Date(Date.UTC(y,mo-1,day));return d.getUTCFullYear()===y&&d.getUTCMonth()===mo-1&&d.getUTCDate()===day;};
  const ownerMatches=(a,o)=>{
    if(a.ownerType&&a.ownerId)return a.ownerType===o.type&&String(a.ownerId)===String(o.id);
    // Legacy JSON agreements belong to client files only; never leak them into a same-name CRM lead.
    return o.type==='client'&&!a.ownerType&&!a.ownerId&&String(a.client||'').trim()===String(o.name||'').trim();
  };
  const paid=id=>allP().filter(p=>String(p.agreementId)===String(id)).reduce((n,p)=>n+Math.max(0,Number(p.amount)||0),0);
  // Resolve legacy agreement -> fee_files only when the client + exact agreed amount
  // produce a one-to-one match on BOTH sides. Never guess by client name alone.
  let feeFileIndexPromise=null,feeFileIndex=null;
  const normFeeAccount=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
  const centsFeeAccount=v=>Math.round((Number(v)||0)*100);
  async function loadFeeFileIndex(){
    if(feeFileIndex)return feeFileIndex;
    if(!feeFileIndexPromise)feeFileIndexPromise=(async()=>{
      const {data,error}=await sb.from('fee_files').select('id,client_name,agreed_amount,status');
      if(error)throw error;
      const files=Array.isArray(data)?data:[],agreements=allA().filter(a=>!a.deletedAt&&!a.voidedAt);
      const resolved=new Map();
      for(const a of agreements){
        if(a.feeFileId)continue;
        const client=normFeeAccount(a.client),amount=centsFeeAccount(a.total);
        if(!client||amount<=0)continue;
        const sameAgreements=agreements.filter(z=>!z.feeFileId&&normFeeAccount(z.client)===client&&centsFeeAccount(z.total)===amount);
        if(sameAgreements.length!==1)continue;
        const candidates=files.filter(f=>normFeeAccount(f.client_name)===client&&centsFeeAccount(f.agreed_amount)===amount);
        if(candidates.length===1)resolved.set(String(a.id),String(candidates[0].id));
      }
      feeFileIndex=resolved;return resolved;
    })();
    try{return await feeFileIndexPromise;}catch(e){feeFileIndexPromise=null;console.warn('MAKTABY fee account safe link resolution unavailable',e);return new Map();}
  }
  const feeFileIdFor=a=>a.feeFileId||feeFileIndex?.get(String(a.id))||null;
  const expenseRowsFor=a=>{const feeFileId=feeFileIdFor(a);return (Array.isArray(db.cloudExpenses)?db.cloudExpenses:[]).filter(x=>x.approvalStatus==='approved'&&((feeFileId&&x.feeFileId&&String(x.feeFileId)===String(feeFileId))||(x.agreementId&&String(x.agreementId)===String(a.id))));};
  const manualExpenseRowsFor=a=>allManualExpenses().filter(x=>String(x.agreementId)===String(a.id));
  const expensesFor=a=>expenseRowsFor(a).reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0)+manualExpenseRowsFor(a).reduce((n,x)=>n+Math.max(0,Number(x.amount)||0),0);
  const stats=o=>{const rows=allA().filter(a=>!a.deletedAt&&!a.voidedAt&&ownerMatches(a,o));const collected=rows.reduce((n,a)=>n+paid(a.id),0),expenses=rows.reduce((n,a)=>n+expensesFor(a),0),total=rows.reduce((n,a)=>n+Math.max(0,Number(a.total)||0),0);return {rows,total,collected,expenses,net:collected-expenses,remaining:rows.reduce((n,a)=>n+Math.max(0,(Number(a.total)||0)-paid(a.id)),0),overCollected:rows.reduce((n,a)=>n+Math.max(0,paid(a.id)-(Number(a.total)||0)),0)};};
  async function save(){if(!isAdmin())throw new Error('حفظ الاتفاقات والحسابات متاح لحساب المدير فقط حاليًا؛ لم يتم تغيير الصلاحيات.');await persistFinancialStateAtomic(db,'تعذر حفظ الاتفاق والحسابات');}
  function refreshAfterSave(o){try{window.mountFeeAccountsV10({...o,container:document.getElementById('app')});}catch(e){console.error('MAKTABY PRO 10 refresh after successful save',e);alert('تم الحفظ بنجاح على السحابة، لكن تعذر تحديث العرض. أعد فتح الملف لمراجعة البيانات، ولا تكرر العملية.');}}
  window.feeV10AddAgreement=async(type,id,name)=>{
    if(!isAdmin())return alert('إضافة الاتفاقات متاحة لحساب المدير فقط حاليًا.');
    if(!['client','lead'].includes(type)||id==null||!String(name||'').trim())return alert('تعذر تحديد ملف العميل بشكل صحيح.');
    const description=prompt('موضوع الاتفاق / نطاق العمل:','أتعاب قضية');if(description===null)return;
    const caseNumber=prompt('رقم القضية أو مرجع الموضوع (اختياري):','');if(caseNumber===null)return;
    const rawTotal=prompt('قيمة الأتعاب المتفق عليها بالجنيه:','0');if(rawTotal===null)return;
    const total=Math.round(Number(rawTotal)*100)/100;
    if(!Number.isFinite(total)||total<=0)return alert('أدخل قيمة صحيحة أكبر من صفر.');
    const dueDate=prompt('تاريخ الاستحقاق YYYY-MM-DD (اختياري):','');if(dueDate===null)return;
    if(!validDate10(dueDate.trim()))return alert('صيغة تاريخ الاستحقاق غير صحيحة. استخدم YYYY-MM-DD.');
    const rec={id:'fee10-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),ownerType:type,ownerId:String(id),client:String(name).trim(),description:description.trim()||'اتفاق أتعاب',caseNumber:caseNumber.trim(),total,dueDate:dueDate.trim(),notes:'',createdAt:new Date().toISOString(),createdBy:currentUser?.name||''};
    allA().push(rec);
    try{await save();}catch(e){const i=allA().findIndex(x=>x.id===rec.id);if(i>=0)allA().splice(i,1);return alert(e.message||'تعذر حفظ الاتفاق.');}
    refreshAfterSave({type,id,name});alert('تم حفظ الاتفاق وربطه بهذا الملف.');
  };
  const expenseLinkBusy=new Set();
  const normFeeLink=v=>String(v||'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
  window.feeV10LinkExpenseFile=async(id,type,ownerId,name)=>{
    if(!isAdmin())return alert('ربط ملفات المصروفات متاح لحساب المدير فقط.');
    const key=String(id);if(expenseLinkBusy.has(key))return;
    const a=allA().find(x=>String(x.id)===key&&!x.deletedAt&&!x.voidedAt);if(!a)return alert('الاتفاق غير موجود أو غير نشط.');
    expenseLinkBusy.add(key);
    try{
      const {data,error}=await sb.from('fee_files').select('id,title,case_number,client_name,agreed_amount,status,created_at').order('created_at',{ascending:false});
      if(error)throw error;
      const candidates=(data||[]).filter(f=>normFeeLink(f.client_name)===normFeeLink(a.client));
      if(!candidates.length)throw new Error('لم نعثر على ملف مصروفات مطابق لاسم الموكل في قاعدة البيانات. لم يتم إنشاء ربط تلقائي.');
      const ranked=candidates.slice().sort((x,y)=>{
        const exactX=normFeeLink(x.case_number)===normFeeLink(a.caseNumber)&&!!a.caseNumber?1:0;
        const exactY=normFeeLink(y.case_number)===normFeeLink(a.caseNumber)&&!!a.caseNumber?1:0;
        return exactY-exactX;
      });
      const choices=ranked.slice(0,40).map((f,i)=>`${i+1}) ${f.title||'ملف أتعاب'} — القضية: ${f.case_number||'غير محددة'} — المتفق: ${Number(f.agreed_amount||0).toLocaleString('ar-EG')} ج.م — الحالة: ${f.status==='open'?'مفتوح':'مغلق'}${String(f.id)===String(a.feeFileId)?' — مرتبط حاليًا':''}`).join('\n');
      const answer=prompt('اختر ملف المصروفات الذي يخص هذا الاتفاق بكتابة رقمه. راجع القضية والقيمة قبل الاختيار:\n'+choices,'1');
      if(answer===null)return;
      const n=Number(answer);if(!Number.isInteger(n)||n<1||n>Math.min(ranked.length,40))throw new Error('رقم الاختيار غير صحيح.');
      const selected=ranked[n-1];
      if(String(selected.id)===String(a.feeFileId))return alert('هذا الملف مرتبط بالفعل بهذا الاتفاق.');
      if(!confirm(`تأكيد ربط الاتفاق «${a.description||'اتفاق أتعاب'}» بملف المصروفات «${selected.title||'ملف أتعاب'}»؟\nالقضية: ${selected.case_number||'غير محددة'}\nالمبلغ المسجل: ${selected.agreed_amount||0} ج.م\n\nسيؤثر الربط على عرض المصروفات المعتمدة المرتبطة بهذا الملف فقط، ولن ينقل أو يغيّر أي حركة مالية.`))return;
      const previous=a.feeFileId;a.feeFileId=selected.id;
      try{await save();}catch(e){a.feeFileId=previous;throw e;}
      refreshAfterSave({type,id:ownerId,name});
      alert('تم حفظ الربط. أعد فتح حساب الاتفاق إذا لم تظهر المصروفات فورًا. لم يتم تعديل أو ترحيل أي حركة مالية.');
    }catch(e){alert('تعذر ربط ملف المصروفات: '+(e.message||e));}
    finally{expenseLinkBusy.delete(key);}
  };
  const paymentBusy=new Set();
  window.feeV10AddPayment=async(id,type,ownerId,name)=>{
    if(!isAdmin())return alert('تسجيل التحصيل متاح لحساب المدير فقط حاليًا.');
    if(paymentBusy.has(String(id)))return;
    const a=allA().find(x=>String(x.id)===String(id)&&!x.deletedAt&&!x.voidedAt);if(!a)return alert('الاتفاق غير موجود أو غير نشط.');
    const remaining=Math.max(0,Math.round(((Number(a.total)||0)-paid(id))*100)/100);
    const rawAmount=prompt('قيمة التحصيل بالجنيه. المتبقي قبل التحصيل: '+money10(remaining)+' — يمكنك إدخال مبلغ أكبر من الاتفاق.',String(remaining||0));if(rawAmount===null)return;
    const amount=Math.round(Number(rawAmount)*100)/100;if(!Number.isFinite(amount)||amount<=0)return alert('أدخل مبلغ تحصيل صحيحًا أكبر من صفر.');
    const rawDate=prompt('تاريخ التحصيل YYYY-MM-DD:',typeof today==='function'?today():new Date().toISOString().slice(0,10));if(rawDate===null)return;
    const date=rawDate.trim();if(!validDate10(date)||!date)return alert('تاريخ التحصيل غير صحيح. استخدم YYYY-MM-DD.');
    const method=prompt('طريقة التحصيل:','نقدي');if(method===null)return;if(!method.trim())return alert('أدخل طريقة التحصيل.');
    const rec={id:'pay10-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),agreementId:a.id,client:a.client,amount,date,method:method.trim(),notes:'',receivedBy:currentUser?.name||'',createdAt:new Date().toISOString()};
    paymentBusy.add(String(id));allP().push(rec);
    try{await save();}catch(e){const i=allP().findIndex(x=>x.id===rec.id);if(i>=0)allP().splice(i,1);paymentBusy.delete(String(id));return alert(e.message||'تعذر حفظ التحصيل.');}
    paymentBusy.delete(String(id));refreshAfterSave({type,id:ownerId,name});alert('تم تسجيل التحصيل.');
  };
  const manualExpenseBusy=new Set();
  window.feeV10AddExpense=async(id,type,ownerId,name)=>{
    if(!isAdmin())return alert('إضافة مصروف مباشر للاتفاق متاحة لحساب المدير فقط.');
    const key=String(id);if(manualExpenseBusy.has(key))return;
    const a=allA().find(x=>String(x.id)===key&&!x.deletedAt&&!x.voidedAt);if(!a)return alert('الاتفاق غير موجود أو غير نشط.');
    const category=prompt('بند المصروف (انتقالات / رسوم / تصوير / خبير / أخرى):','مصروفات أخرى');if(category===null)return;
    const raw=prompt('قيمة المصروف بالجنيه:','0');if(raw===null)return;
    const amount=Math.round(Number(raw)*100)/100;if(!Number.isFinite(amount)||amount<=0)return alert('أدخل مبلغًا صحيحًا أكبر من صفر.');
    const rawDate=prompt('تاريخ المصروف YYYY-MM-DD:',typeof today==='function'?today():new Date().toISOString().slice(0,10));if(rawDate===null)return;
    const date=rawDate.trim();if(!validDate10(date)||!date)return alert('تاريخ المصروف غير صحيح. استخدم YYYY-MM-DD.');
    const description=prompt('بيان المصروف:','');if(description===null)return;
    const rec={id:'mfee-exp-'+(crypto.randomUUID?.()||Date.now()+'-'+Math.random().toString(36).slice(2)),agreementId:a.id,ownerType:a.ownerType||type,ownerId:String(a.ownerId??ownerId),client:a.client,amount,date,category:category.trim()||'مصروفات أخرى',description:description.trim(),createdAt:new Date().toISOString(),createdBy:currentUser?.name||'',source:'manual_agreement_expense'};
    manualExpenseBusy.add(key);allManualExpenses().push(rec);
    try{await save();}catch(e){const i=allManualExpenses().findIndex(x=>x.id===rec.id);if(i>=0)allManualExpenses().splice(i,1);manualExpenseBusy.delete(key);return alert(e.message||'تعذر حفظ المصروف.');}
    manualExpenseBusy.delete(key);refreshAfterSave({type,id:ownerId,name});alert('تم تسجيل المصروف المباشر في حساب الاتفاق. لم يتم خصمه من عهدة موظف ولم يُنشأ طلب اعتماد مصروف موظف.');
  };
  // Read-only expense-link audit: deliberately does not write, approve, debit custody,
  // create links, or alter historical financial records.
  function renderExpenseLinkAuditV108(owner,container){
    const ownerId=String(owner.id);
    const ownerName=String(owner.name||'').trim();
    const rows=(Array.isArray(db.cloudExpenses)?db.cloudExpenses:[]).filter(x=>{
      // Prefer the stable client ID whenever the expense has one. Name fallback is
      // reserved for legacy rows without an ID, preventing same-name clients from
      // leaking into each other's diagnostic totals.
      if(owner.type==='client'&&x.clientId!=null&&String(x.clientId).trim()!=='')
        return String(x.clientId)===ownerId;
      return !!ownerName&&String(x.client||'').trim()===ownerName;
    });
    const agreements=allA().filter(a=>!a.deletedAt&&!a.voidedAt&&ownerMatches(a,owner));
    const linkedIds=new Set(agreements.map(a=>String(feeFileIdFor(a)||'')).filter(Boolean));
    const classified=rows.map(x=>{
      let status='غير محدد';
      if(x.approvalStatus==='pending')status='طلب معلق — لم يُعتمد';
      else if(x.approvalStatus==='rejected')status='مرفوض — لا يدخل الحساب';
      else if(x.approvalStatus==='approved'&&x.feeFileId)status=linkedIds.has(String(x.feeFileId))?'مرتبط باتفاق ظاهر':'مرتبط بملف أتعاب — يلزم مطابقة الاتفاق';
      else if(x.approvalStatus==='approved')status='مصروف معتمد غير مربوط';
      return {x,status};
    });
    const totals={approved:0,pending:0,unlinked:0,review:0};
    for(const {x,status} of classified){
      const amount=Math.max(0,Number(x.amount)||0);
      if(x.approvalStatus==='approved')totals.approved+=amount;
      if(x.approvalStatus==='pending')totals.pending+=amount;
      if(status==='مصروف معتمد غير مربوط')totals.unlinked+=amount;
      if(status==='مرتبط بملف أتعاب — يلزم مطابقة الاتفاق')totals.review+=amount;
    }
    const host=container.querySelector('#expenseLinkAuditV108');if(!host)return;
    host.innerHTML=`<div class="stats" style="margin:10px 0"><div class="card"><div class="statlabel">مصروفات معتمدة للموكل</div><div class="statnum">${money10(totals.approved)}</div></div><div class="card"><div class="statlabel">معتمدة غير مربوطة</div><div class="statnum">${money10(totals.unlinked)}</div></div><div class="card"><div class="statlabel">تحتاج مطابقة اتفاق</div><div class="statnum">${money10(totals.review)}</div></div><div class="card"><div class="statlabel">طلبات معلقة</div><div class="statnum">${money10(totals.pending)}</div></div></div>
      <div class="sub" style="margin:8px 0">مراجعة للقراءة فقط. لا يتم إنشاء أو تغيير أي ربط أو اعتماد أو خصم عهدة أو ترحيل مالي.</div>
      ${classified.length?`<div style="overflow:auto">${table(['التاريخ','البيان','المبلغ','حالة الاعتماد','مرجع ملف الأتعاب','نتيجة المراجعة'],classified.map(({x,status})=>`<tr><td>${esc10(x.date||'—')}</td><td>${esc10(x.title||x.category||'مصروف')}</td><td>${money10(x.amount)}</td><td>${esc10(x.approvalStatus||'غير محدد')}</td><td style="direction:ltr;text-align:left">${esc10(x.feeFileId||'—')}</td><td>${esc10(status)}</td></tr>`))}</div>`:'<div class="empty">لا توجد حركات مصروفات محملة لهذا الموكل.</div>'}`;
  }
  window.mountFeeAccountsV10=({type,id,name,container})=>{
    // persistFinancialStateAtomic is admin-only; do not show controls to office_manager users.
    if(!container||!isAdmin()||!['client','lead'].includes(type)||id==null)return;
    const o={type,id,name};const {rows,total,collected,expenses:totalExpenses,net:netOffice,remaining:totalRemaining,overCollected:totalOverCollected}=stats(o);
    const old=container.querySelector('#feeAccountsV10');if(old)old.remove();
    container.querySelectorAll('[data-open-fee-accounts-v10]').forEach(x=>x.remove());
    const box=document.createElement('section');box.id='feeAccountsV10';box.className='panel';box.style.marginTop='16px';box.style.display='none';
    box.innerHTML=`<div class="pagehead"><div><h3>الاتفاق والحسابات</h3><div class="sub">كل اتفاقاته وتحصيلاته ومصروفاته وصافي الحساب والمتبقي في مكان واحد.</div></div><button class="btn goldbtn" type="button" id="feeV10AddBtn">+ اتفاق جديد</button></div>
      <div class="stats"><div class="card"><div class="statlabel">إجمالي المتفق عليه</div><div class="statnum gold">${money10(total)}</div></div><div class="card"><div class="statlabel">إجمالي المحصل</div><div class="statnum">${money10(collected)}</div></div><div class="card"><div class="statlabel">زيادة التحصيل عن الاتفاق</div><div class="statnum">${money10(totalOverCollected)}</div></div><div class="card"><div class="statlabel">المصروفات المعتمدة واليدوية المرتبطة</div><div class="statnum">${money10(totalExpenses)}</div></div><div class="card"><div class="statlabel">صافي المحصل بعد المصروفات</div><div class="statnum">${money10(netOffice)}</div></div><div class="card"><div class="statlabel">المتبقي على الموكل من الأتعاب</div><div class="statnum">${money10(totalRemaining)}</div></div></div>
      ${rows.length?`<div style="overflow:auto">${table(['القضية / الموضوع','المتفق عليه','المحصل','زيادة التحصيل','المصروفات المرتبطة','صافي المحصل','المتبقي من الاتفاق','الاستحقاق','ربط المصروفات','الحركات'],rows.map(a=>{const got=paid(a.id),expenseRows=[...expenseRowsFor(a),...manualExpenseRowsFor(a)],spent=expensesFor(a),net=got-spent,left=Math.max(0,Math.round(((Number(a.total)||0)-got)*100)/100),over=Math.max(0,Math.round((got-(Number(a.total)||0))*100)/100);const expenseDetails=expenseRows.length?`<details class="sub" style="margin-top:5px"><summary>عرض ${expenseRows.length} حركة مصروف</summary>${expenseRows.map(x=>`<div style="padding:4px 0;border-bottom:1px solid #eee">${esc10(x.date||'—')} · ${esc10(x.description||x.title||x.category||'مصروف')} · ${money10(x.amount)}${x.source==='manual_agreement_expense'?' · مصروف مباشر':''}</div>`).join('')}</details>`:'<div class="sub">لا توجد مصروفات معتمدة مرتبطة</div>';return `<tr><td><b>${esc10(a.description||'اتفاق أتعاب')}</b><div class="sub">${esc10(a.caseNumber||'بدون رقم قضية')}</div></td><td>${money10(a.total)}</td><td>${money10(got)}</td><td>${over>0?`<b>${money10(over)}</b>`:'—'}</td><td>${money10(spent)}${expenseDetails}</td><td><b>${money10(net)}</b></td><td><b>${money10(left)}</b></td><td>${esc10(a.dueDate||'—')}</td><td><button class="btn light" type="button" data-fee-link="${esc10(a.id)}">${feeFileIdFor(a)?'مراجعة / تغيير الربط':'ربط ملف المصروفات'}</button><div class="sub">${feeFileIdFor(a)?'مرتبط بملف مطابق بصورة فريدة':'غير مربوط'}</div></td><td><button class="btn light" type="button" data-fee-payment="${esc10(a.id)}">تسجيل تحصيل</button> <button class="btn light" type="button" data-fee-expense="${esc10(a.id)}">إضافة مصروف</button></td></tr>`;}).join(''))}</div>`:`<div class="empty">لا توجد اتفاقات مرتبطة بهذا الملف حتى الآن. يمكنك إضافة أكثر من اتفاق دون التأثير على الاتفاقات الأخرى.</div>`}
      <div class="notice" style="margin-top:12px">صافي المحصل = إجمالي التحصيل ناقص المصروفات المرتبطة. المتبقي من الاتفاق = قيمة الاتفاق ناقص إجمالي التحصيل، وتظهر زيادة التحصيل بصورة مستقلة إذا تجاوزت الدفعات قيمة الاتفاق. يمكن للمدير إضافة مصروف مباشر على الاتفاق؛ يظهر منفصلًا عن المصروفات المعتمدة من دورة عهد الموظفين ولا يخصم عهدة موظف. المصروفات غير المرتبطة بمعرّف واضح لا تُنسب تلقائيًا لأي اتفاق، ولا يتم ترحيل أو خصم أي مصروف قديم تلقائيًا.</div>
      <section class="panel" style="margin-top:12px;border:1px solid #dce3ec"><div class="pagehead"><div><h4 style="margin:0">مراجعة ربط المصروفات</h4><div class="sub">كشف تشخيصي للقراءة فقط على بيانات الموكل المحملة حاليًا.</div></div><button type="button" class="btn light" id="feeV108AuditBtn">عرض المراجعة</button></div><div id="expenseLinkAuditV108" hidden></div></section>`;
    const anchor=container.querySelector('.pagehead');
    const actions=anchor?.querySelector('.actions');
    const toggle=document.createElement('button');toggle.type='button';toggle.className='btn goldbtn';toggle.setAttribute('data-open-fee-accounts-v10','');toggle.setAttribute('aria-expanded','false');toggle.textContent='▣ الاتفاق والحسابات';
    if(actions)actions.prepend(toggle);else if(anchor)anchor.appendChild(toggle);else container.insertBefore(toggle,container.firstChild);
    if(anchor&&anchor.nextSibling)container.insertBefore(box,anchor.nextSibling);else container.appendChild(box);
    toggle.addEventListener('click',()=>{const opening=box.style.display==='none';box.style.display=opening?'block':'none';toggle.setAttribute('aria-expanded',String(opening));toggle.textContent=opening?'▣ إخفاء الحسابات':'▣ الاتفاق والحسابات';if(opening)box.scrollIntoView({behavior:'smooth',block:'start'});});
    box.querySelector('#feeV10AddBtn')?.addEventListener('click',()=>window.feeV10AddAgreement(type,id,name));
    box.querySelector('#feeV108AuditBtn')?.addEventListener('click',()=>{const host=box.querySelector('#expenseLinkAuditV108');if(!host)return;host.hidden=!host.hidden;if(!host.hidden){renderExpenseLinkAuditV108(o,box);host.scrollIntoView({behavior:'smooth',block:'nearest'});}});
    box.querySelectorAll('[data-fee-payment]').forEach(b=>b.addEventListener('click',()=>window.feeV10AddPayment(b.dataset.feePayment,type,id,name)));
    box.querySelectorAll('[data-fee-expense]').forEach(b=>b.addEventListener('click',()=>window.feeV10AddExpense(b.dataset.feeExpense,type,id,name)));
    box.querySelectorAll('[data-fee-link]').forEach(b=>b.addEventListener('click',()=>window.feeV10LinkExpenseFile(b.dataset.feeLink,type,id,name)));
    if(!feeFileIndex&&!feeFileIndexPromise){
      loadFeeFileIndex().then(()=>{
        if(container.isConnected&&container.querySelector('#feeAccountsV10'))window.mountFeeAccountsV10({type,id,name,container});
      });
    }
  };
})();


/* MAKTABY PRO 10 — retire the separate legacy fees/collections screen from navigation.
   The underlying historical JSON and legacy handlers remain intact for data safety.
   All new work is accessed only through the embedded "الاتفاق والحسابات" panels. */
(function(){
  'use strict';
  function removeLegacyFeesNav(){
    document.querySelectorAll('#nav [data-page="clientfees"]').forEach(el=>el.remove());
  }
  const priorRender=render;
  render=function(){
    if(page==='clientfees')page='clients';
    const result=priorRender.apply(this,arguments);
    removeLegacyFeesNav();
    return result;
  };
  document.addEventListener('click',function(e){
    const b=e.target&&e.target.closest?e.target.closest('#nav [data-page="clientfees"]'):null;
    if(!b)return;
    e.preventDefault();e.stopImmediatePropagation();
    page='clients';
    try{render();}catch(err){console.error('MAKTABY PRO 10 legacy fees route guard',err);}
  },true);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',removeLegacyFeesNav,{once:true});
  else removeLegacyFeesNav();
  window.MAKTABY_PRO_V10_LEGACY_FEES_SCREEN_RETIRED=true;
})();
/* MAKTABY PRO 10 — Legal forms shortcut (contract only; POA features excluded by user request). */
(function(){
 const oldProfileV10=renderClientProfileV54;
 renderClientProfileV54=async function(){
  await oldProfileV10();
  const c=(db.clients||[]).find(x=>x.name===selectedClientNameV54);const app=document.getElementById('app');if(!c||!app||app.querySelector('#v10ClientContractShortcut'))return;
  const panel=document.createElement('section');panel.id='v10ClientContractShortcut';panel.className='panel';panel.style.marginBottom='16px';
  panel.innerHTML=`<div class="pagehead"><div><h3>محرر الصيغ القانونية</h3><div class="sub">إنشاء مسودة عقد اتفاق من بيانات ملف الموكل.</div></div><div class="actions"><button class="btn goldbtn" onclick="window.openClientContractV10()">إنشاء عقد اتفاق</button></div></div><div class="notice">المسودة تحتاج مراجعة المحامي قبل التوقيع أو التقديم.</div>`;
  app.appendChild(panel);
 };
 window.openClientContractV10=function(){page='legaldocs';render();setTimeout(()=>{if(typeof window.maktabyDocsTab==='function')window.maktabyDocsTab('contract');const c=(db.clients||[]).find(x=>x.name===selectedClientNameV54);if(!c)return;const a=document.getElementById('cClient'),b=document.getElementById('cNid'),d=document.getElementById('cAddress'),s=document.getElementById('cScope');if(a)a.value=c.name||'';if(b)b.value=c.nationalId||'';if(d)d.value=c.address||'';if(s)s.value=c.subject||'';},80);};
})();

/* MAKTABY PRO 10 — Phase 2B: printable daily court roll, client WhatsApp summary, announcement lifecycle. */
(function(){
 const escV10=s=>typeof esc==='function'?esc(String(s??'')):String(s??'');
 const normPhoneV10=s=>String(s||'').replace(/\D/g,'').replace(/^0/,'20');
 const announcementStatesV10=['تم التسليم للمحضرين','قيد الإعلان','أعلن لجهة الإدارة','أعيد بدون إعلان لعدم الاستدلال','تم الإعلان','تم الاستلام'];
 window.printDailyRollV10=function(date){
   if(!canManageOffice()&&!isEmployee())return alert('طباعة رول الجلسات غير متاحة لهذا الحساب.');
   date=date||prompt('تاريخ الرول (YYYY-MM-DD):',today());if(date===null||!/^\d{4}-\d{2}-\d{2}$/.test(date))return;
   const rows=(db.cases||[]).filter(c=>!c.archived&&String(c.date||'').slice(0,10)===date).slice().sort((a,b)=>String(a.court||'').localeCompare(String(b.court||''),'ar')||String(a.client||'').localeCompare(String(b.client||''),'ar')||String(a.number||'').localeCompare(String(b.number||''),'ar'));
   const groups={};rows.forEach(c=>{const k=String(c.court||'محكمة / دائرة غير محددة').trim();(groups[k]=groups[k]||[]).push(c);});
   const body=Object.keys(groups).sort((a,b)=>a.localeCompare(b,'ar')).map((court,i)=>`<section><h2>${escV10(court)}</h2><table><thead><tr><th>م</th><th>رقم الدعوى</th><th>نوع الدعوى</th><th>الموكل</th><th>الخصم</th><th>القرار / المطلوب</th><th>سبب التأجيل السابق</th></tr></thead><tbody>${groups[court].map((c,n)=>`<tr><td>${n+1}</td><td>${escV10(c.number||'—')}</td><td>${escV10(c.caseType||'—')}</td><td>${escV10(c.client||'—')}</td><td>${escV10(c.opponent||'—')}</td><td>${escV10(c.action||c.result||'—')}</td><td>${escV10(c.adjournment||'—')}</td></tr>`).join('')}</tbody></table></section>`).join('');
   const w=window.open('','_blank');if(!w)return alert('اسمح بالنوافذ المنبثقة لطباعة الرول.');
   w.document.open();w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>رول جلسات ${date}</title><style>@page{size:A4 landscape;margin:12mm}body{font-family:Tahoma,Arial;color:#17283b;line-height:1.6}header{text-align:center;border-bottom:3px solid #c49a45;padding-bottom:10px;margin-bottom:16px}h1{margin:0;color:#14283f}h2{font-size:16px;background:#edf1f5;padding:7px 10px;border-right:4px solid #c49a45}table{width:100%;border-collapse:collapse;margin-bottom:18px;font-size:11px}th,td{border:1px solid #ccd3dc;padding:6px;text-align:right;vertical-align:top}th{background:#e8edf2}footer{margin-top:20px;text-align:center;color:#777;font-size:10px}@media print{button{display:none}}</style></head><body><header><h1>مكتبي للمحاماة</h1><div>رول جلسات يوم ${date} — عدد القضايا: ${rows.length}</div></header>${body||'<p>لا توجد جلسات مسجلة في هذا التاريخ.</p>'}<footer>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</footer><script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();
 };
 window.sendCaseWhatsAppV10=function(i){const c=db.cases?.[i];if(!c)return;const names=(Array.isArray(c.clients)&&c.clients.length?c.clients:[c.client]).filter(Boolean);const normName=v=>String(v||'').normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/[\s\-ـ]+/g,' ').trim().toLocaleLowerCase('ar');const client=(db.clients||[]).find(x=>names.some(n=>normName(n)===normName(x.name))&&normPhoneV10(x.phone));const phone=normPhoneV10(client?.phone||'');if(!phone)return alert('لا يوجد رقم هاتف مسجل لأي موكل مرتبط بهذه القضية. أضف رقم الهاتف في ملف الموكل أولًا.');const clientLabel=names.join('، ')||client.name||'';const msg=`الأستاذ/ ${clientLabel}\nملخص جلسة القضية رقم ${c.number||'—'}\nالمحكمة: ${c.court||'—'}\nالدائرة: ${c.circuit||'—'}\nالموضوع: ${c.subject||c.caseType||'—'}\nالقرار / المطلوب: ${c.result||c.action||'—'}\nسبب التأجيل: ${c.adjournment||'—'}\nالجلسة القادمة: ${c.date||'—'}\nمع تحيات مكتب مكتبي للمحاماة — هاني شحاتة`;window.open('https://wa.me/'+phone+'?text='+encodeURIComponent(msg),'_blank','noopener');};
 window.setAnnouncementLifecycleV10=async function(i,status){
   if(!canManageOffice())return alert('تعديل حالة الإعلان متاح للمدير أو مديرة المكتب فقط.');
   const a=db.announcements?.[i];if(!a||!announcementStatesV10.includes(status))return;
   const old=a.status||'قيد الإعلان';if(old===status)return;
   if(status==='تم الاستلام'&&!confirm('هل تم استلام أصل الإعلان فعليًا؟ سيتم نقله إلى الأرشيف بعد التأكيد.'))return;
   const beforeAnnouncements=(db.announcements||[]).map(x=>({...x,statusHistory:Array.isArray(x.statusHistory)?x.statusHistory.slice():x.statusHistory}));const beforeArchive=(db.announcementArchive||[]).map(x=>({...x}));
   a.statusHistory=Array.isArray(a.statusHistory)?a.statusHistory:[];a.statusHistory.push({from:old,to:status,at:new Date().toISOString(),by:currentUser?.name||'مستخدم المكتب'});a.status=status;
   if(status==='تم الاستلام'){a.delivered=true;a.receivedDate=a.receivedDate||today();a.receivedBy=a.receivedBy||currentUser?.name||'';a.archived=true;db.announcementArchive=db.announcementArchive||[];db.announcementArchive.unshift({...a,archiveDate:today()});db.announcements.splice(i,1);}
   try{await saveCloudState();await loadCloudState();render();}catch(e){db.announcements=beforeAnnouncements;db.announcementArchive=beforeArchive;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}catch(_){}render();alert('تعذر حفظ حالة الإعلان، وتمت إعادة الحالة السابقة محليًا: '+e.message);}
 };
 const oldRenderV10B=render;
 render=function(){oldRenderV10B();
   if(page==='cases'){
     const head=document.querySelector('#app .pagehead');if(head&&!document.getElementById('v10DailyRollBtn')){const b=document.createElement('button');b.id='v10DailyRollBtn';b.className='btn light';b.textContent='طباعة رول الجلسات';b.onclick=()=>window.printDailyRollV10();head.querySelector('.actions')?.appendChild(b)||head.appendChild(b);}
   }

 };
 console.info('MAKTABY PRO 10 Phase 2B daily roll, WhatsApp and announcement lifecycle loaded');
})();

/* MAKTABY PRO 10 — Phase 7: judgment-linked appeal deadlines, holidays and in-app alerts. */
(function(){
 const escA=s=>typeof esc==='function'?esc(String(s??'')):String(s??'');
 db.appealRules=Array.isArray(db.appealRules)?db.appealRules:[];
 db.appealCalculations=Array.isArray(db.appealCalculations)?db.appealCalculations:[];
 db.legalHolidays=Array.isArray(db.legalHolidays)?db.legalHolidays:[];
 const pad=n=>String(n).padStart(2,'0');
 const parseDate=s=>{const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s||''));if(!m)return null;const d=new Date(+m[1],+m[2]-1,+m[3],12);return d.getFullYear()===+m[1]&&d.getMonth()===+m[2]-1&&d.getDate()===+m[3]?d:null;};
 const fmt=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const addDays=(s,n)=>{const d=parseDate(s);if(!d)return null;d.setDate(d.getDate()+n);return d;};
 const isHoliday=s=>db.legalHolidays.some(x=>String(x.date||x)===s);
 const daysLeft=x=>{const d=parseDate(x.dueDate);if(!d)return 99999;const t=new Date();t.setHours(12,0,0,0);return Math.round((d-t)/86400000);};
 function dueDate(start,rule){let d=addDays(start,Number(rule.days||0)+Number(rule.distanceDays||0));if(!d)return null;let shifted=0;if(rule.extendHoliday){while(isHoliday(fmt(d))&&shifted<30){d.setDate(d.getDate()+1);shifted++;}}return {date:fmt(d),shifted,baseDays:Number(rule.days||0),distanceDays:Number(rule.distanceDays||0)};}
 function saveLocal(){localStorage.setItem(STORAGE_KEY,JSON.stringify(db));}
 async function persist(){saveLocal();if(canManageOffice()&&typeof saveCloudState==='function'){try{await saveCloudState();setCloudStatus('تم حفظ قواعد وحسابات الطعون ومزامنتها');}catch(e){setCloudStatus('حفظ محلي — تعذرت المزامنة');console.error(e);alert('تم الحفظ محليًا، لكن تعذرت المزامنة: '+e.message);}}}
 function classify(text){const t=String(text||'');const out=[];if(/غياب[ىي]/.test(t))out.push('غيابي');if(/حضور[ىي]/.test(t))out.push('حضوري');if(/اعتبار[ىي]/.test(t))out.push('اعتباري');if(/حكمت المحكمة|فلهذه الأسباب|لهذه الأسباب/.test(t))out.push('منطوق حكم');if(/رفضت الدعوى|رفض الدعوى/.test(t))out.push('رفض');if(/قبول الدعوى|قبول الاستئناف/.test(t))out.push('قبول');if(/إحالة|احالة/.test(t))out.push('إحالة');return out.length?out.join(' • '):'لم يتم التعرف على وصف إجرائي محدد — راجع يدويًا';}
 window.analyzeJudgmentV10=function(){const t=document.getElementById('v10AppealJudgmentText')?.value||'';const box=document.getElementById('v10AppealAnalysis');if(box)box.textContent=classify(t);};
 window.addAppealRuleV10=async function(){if(!canManageOffice())return alert('إضافة وتعديل القواعد القانونية للمدير فقط.');const title=prompt('اسم القاعدة (مثال: استئناف حكم مدني كلي):');if(!title)return;const type=prompt('نوع الطعن: استئناف / معارضة / نقض / أخرى','استئناف')||'أخرى';const days=Number(prompt('مدة الطعن بالأيام وفق النص القانوني الذي راجعته:', ''));if(!Number.isInteger(days)||days<1||days>1000)return alert('أدخل مدة صحيحة بالأيام.');const distanceDays=Number(prompt('ميعاد المسافة بالأيام (اكتب 0 إذا لا ينطبق، ولا تضفه إلا بعد التحقق من انطباقه قانونًا):','0'));if(!Number.isInteger(distanceDays)||distanceDays<0||distanceDays>100)return alert('أدخل مدة مسافة صحيحة.');const startEvent=prompt('واقعة بدء الميعاد (صدور الحكم/إعلانه/واقعة أخرى):','يحددها المحامي');if(!startEvent)return;const source=prompt('السند القانوني ورقم المادة/النص:','');const note=prompt('ملاحظات واستثناءات مهمة (اختياري):','')||'';const extendHoliday=confirm('هل تمد آخر يوم إذا صادف عطلة رسمية مسجلة؟');db.appealRules.push({id:'ar-'+Date.now(),title,type,days,distanceDays,startEvent,source:source||'لم يحدد',note,extendHoliday,active:true,createdAt:new Date().toISOString(),createdBy:currentUser?.name||''});await persist();render();};
 window.addLegalHolidayV10=async function(){if(!canManageOffice())return alert('إدارة العطلات للمدير فقط.');const date=prompt('تاريخ العطلة/تعطيل العمل الرسمي بصيغة YYYY-MM-DD:');if(!parseDate(date))return alert('صيغة التاريخ غير صحيحة.');const name=prompt('اسم العطلة أو قرار التعطيل:','عطلة رسمية')||'عطلة رسمية';if(!db.legalHolidays.some(x=>String(x.date||x)===date))db.legalHolidays.push({date,name});db.legalHolidays.sort((a,b)=>String(a.date||a).localeCompare(String(b.date||b)));await persist();render();};
 window.calculateAppealDeadlineV10=async function(){const rule=db.appealRules.find(x=>x.id===document.getElementById('v10AppealRule')?.value);const start=document.getElementById('v10AppealStart')?.value;if(!rule)return alert('اختر قاعدة قانونية راجعها المحامي.');if(!parseDate(start))return alert('أدخل تاريخ بدء الميعاد الصحيح بعد تحديد واقعة بدء الميعاد قانونًا.');const result=dueDate(start,rule);if(!result)return;const client=document.getElementById('v10AppealClient')?.value||'',caseNumber=document.getElementById('v10AppealCase')?.value||'',judgmentDate=document.getElementById('v10AppealJudgment')?.value||'',judgmentText=document.getElementById('v10AppealJudgmentText')?.value||'';const linked=(db.cases||[]).find(c=>String(c.number||c.caseNumber||'').trim()===caseNumber.trim()&&(!client||String(c.client||'').trim()===client.trim()));const item={id:'ac-'+Date.now(),client,caseNumber,court:document.getElementById('v10AppealCourt')?.value||'',caseId:linked?.caseId||linked?.id||null,judgmentDate,judgmentText,judgmentClassification:classify(judgmentText),appealType:rule.type||'غير محدد',startDate:start,dueDate:result.date,baseDays:result.baseDays,distanceDays:result.distanceDays,shiftedDays:result.shifted,rule:{...rule},calculatedAt:new Date().toISOString(),calculatedBy:currentUser?.name||'مستخدم المكتب',status:'تقديري — ينتظر مراجعة واعتماد المحامي'};db.appealCalculations.unshift(item);window.MAKTABY_STORE?.emit('appeal:calculated',item);if(linked){linked.appealDeadlines=Array.isArray(linked.appealDeadlines)?linked.appealDeadlines:[];linked.appealDeadlines.unshift({...item});}await persist();render();alert(`آخر يوم تقديري للطعن: ${result.date}\nمدة الطعن: ${result.baseDays} يومًا + مسافة: ${result.distanceDays} يومًا.\n${result.shifted?`تم مد التاريخ ${result.shifted} يومًا لعطلة رسمية مسجلة.\n`:''}${linked?'تم ربط الحساب بملف القضية.':'لم يتم العثور على قضية مطابقة تلقائيًا؛ تم حفظ الحساب في سجل الحاسبة فقط.'}\nراجع منطوق الحكم وواقعة بدء الميعاد والسند القانوني قبل الاعتماد.`);};
 window.removeAppealRuleV10=async function(id){if(!canManageOffice()||!confirm('حذف القاعدة من قائمة الاختيار؟ الحسابات السابقة ستظل محفوظة بنسخة القاعدة.'))return;db.appealRules=db.appealRules.filter(x=>x.id!==id);await persist();render();};
 window.removeLegalHolidayV10=async function(date){if(!canManageOffice()||!confirm('حذف العطلة المحددة؟'))return;db.legalHolidays=db.legalHolidays.filter(x=>String(x.date||x)!==date);await persist();render();};
 function renderPanel(){const app=document.getElementById('app');if(!app||page!=='cases'||document.getElementById('v10AppealPanel'))return;const panel=document.createElement('section');panel.id='v10AppealPanel';panel.className='panel';panel.hidden=true;panel.style.cssText='position:fixed;z-index:12000;inset:auto 18px 86px 18px;max-height:78vh;overflow:auto;margin:0;padding:16px;border:1px solid #d8dee7;border-radius:14px;background:#fff;box-shadow:0 18px 60px #071a3150;';const rules=db.appealRules.filter(r=>r.active!==false);const calcs=db.appealCalculations.slice(0,10);const alerts=db.appealCalculations.filter(x=>daysLeft(x)>=0&&daysLeft(x)<=7);const overdue=db.appealCalculations.filter(x=>daysLeft(x)<0);const alertRows=db.appealCalculations.filter(x=>daysLeft(x)<=7).slice(0,8);panel.innerHTML=`<div class="pagehead"><div><h2 style="margin:0">حاسبة مواعيد الطعون والتنبيهات</h2><div class="sub">تقرأ وصف منطوق الحكم للمساعدة في التصنيف، ثم تحسب وفق قاعدة قانونية أعدّها وراجعها المحامي. لا تستنتج مدة الطعن من النص وحده.</div></div><div class="actions">${canManageOffice()?'<button class="btn goldbtn" type="button" onclick="addAppealRuleV10()">+ إضافة قاعدة قانونية</button><button class="btn light" type="button" onclick="addLegalHolidayV10()">+ تسجيل عطلة رسمية</button>':''}</div></div>${alerts.length||overdue.length?`<div class="notice" style="margin:12px 0;background:#fff4e5">⚠️ تنبيهات: ${db.appealCalculations.filter(x=>daysLeft(x)>=0&&daysLeft(x)<=7).length} خلال 7 أيام، ${db.appealCalculations.filter(x=>daysLeft(x)>=0&&daysLeft(x)<=3).length} خلال 3 أيام، ${db.appealCalculations.filter(x=>daysLeft(x)>=0&&daysLeft(x)<=1).length} خلال 24 ساعة، ${db.appealCalculations.filter(x=>daysLeft(x)===0).length} اليوم، ${overdue.length} تجاوزت التاريخ التقديري.</div>`:''}<h3 style="margin:14px 0 8px">تسجيل منطوق الحكم وحساب الميعاد</h3><div class="formgrid"><label>نوع الطعن<select id="v10AppealRule"><option value="">اختر قاعدة قانونية مراجعة</option>${rules.map(r=>`<option value="${escA(r.id)}">${escA(r.type||'طعن')} — ${escA(r.title)} (${r.days} يوم)</option>`).join('')}</select></label><label>تاريخ بدء الميعاد قانونًا<input id="v10AppealStart" type="date"></label><label>اسم الموكل<input id="v10AppealClient" type="text"></label><label>رقم الدعوى كما هو مسجل<input id="v10AppealCase" type="text"></label><label>المحكمة<input id="v10AppealCourt" type="text"></label><label>تاريخ الحكم<input id="v10AppealJudgment" type="date"></label></div><label style="display:block;margin-top:10px">منطوق الحكم / وصفه<input id="v10AppealJudgmentText" type="text" placeholder="مثال: حكمت المحكمة حضورياً بقبول..." oninput="analyzeJudgmentV10()"></label><div id="v10AppealAnalysis" class="notice" style="margin-top:6px">سيظهر هنا وصف إجرائي مبدئي من النص المدخل — لا يغني عن مراجعة المحامي.</div><div class="actions" style="margin-top:12px"><button class="btn goldbtn" type="button" onclick="calculateAppealDeadlineV10()">احسب واحفظ واربط بالقضية</button></div><div class="notice" style="margin-top:12px">ضوابط الحساب: يوم الواقعة لا يدخل في المدة وفق القاعدة العامة متى انطبقت؛ مدة المسافة لا تضاف إلا إذا قرر المحامي انطباقها وسجلها داخل القاعدة؛ ولا تُمد النهاية إلا لعطلة رسمية/تعطيل عمل مسجل. لا يفترض النظام الجمعة والسبت عطلة تلقائيًا ولا يستورد قائمة عطلات غير موثقة. التنبيه داخل التطبيق يظهر عند فتح شاشة القضايا.</div><h3 style="margin:16px 0 8px">التنبيهات القريبة والمتأخرة</h3>${alertRows.length?`<div style="overflow:auto"><table><thead><tr><th>الموكل</th><th>الدعوى</th><th>نوع الطعن</th><th>آخر يوم تقديري</th><th>المتبقي</th><th>السند</th></tr></thead><tbody>${alertRows.map(x=>`<tr><td>${escA(x.client||'—')}</td><td>${escA(x.caseNumber||'—')}</td><td>${escA(x.appealType||'—')}</td><td><strong>${escA(x.dueDate)}</strong></td><td>${daysLeft(x)<0?'متأخر '+Math.abs(daysLeft(x))+' يوم':daysLeft(x)+' يوم'}</td><td>${escA(x.rule?.source||'—')}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">لا توجد مواعيد محفوظة قريبة أو متأخرة.</p>'}<h3 style="margin:16px 0 8px">القواعد القانونية المسجلة</h3>${rules.length?`<div style="overflow:auto"><table><thead><tr><th>القاعدة</th><th>المدة</th><th>المسافة</th><th>بدء الميعاد</th><th>السند</th><th>الإجراء</th></tr></thead><tbody>${rules.map(r=>`<tr><td>${escA(r.type||'—')} — ${escA(r.title)}</td><td>${r.days} يوم</td><td>${Number(r.distanceDays||0)} يوم</td><td>${escA(r.startEvent)}</td><td>${escA(r.source||'—')}</td><td>${canManageOffice()?`<button class="btn light" onclick="removeAppealRuleV10('${escA(r.id)}')">إزالة</button>`:'—'}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">لم تسجل قواعد بعد. لن يخمن النظام مدة الاستئناف أو المعارضة أو النقض.</p>'}<h3 style="margin:16px 0 8px">العطلات الرسمية وتعطيل العمل المسجل</h3>${db.legalHolidays.length?db.legalHolidays.map(h=>`<span class="badge" style="margin:3px">${escA(h.date||h)} — ${escA(h.name||'عطلة')}${canManageOffice()?` <button onclick="removeLegalHolidayV10('${escA(h.date||h)}')" aria-label="حذف العطلة">×</button>`:''}</span>`).join(''):'<p class="muted">لا توجد عطلات مسجلة؛ يلزم تحديث القائمة بقرارات التعطيل الرسمية.</p>'}<h3 style="margin:16px 0 8px">آخر الحسابات المحفوظة</h3>${calcs.length?`<div style="overflow:auto"><table><thead><tr><th>الموكل</th><th>الدعوى</th><th>الطعن</th><th>بدء الميعاد</th><th>آخر يوم تقديري</th><th>الحالة</th></tr></thead><tbody>${calcs.map(x=>`<tr><td>${escA(x.client||'—')}</td><td>${escA(x.caseNumber||'—')}</td><td>${escA(x.appealType||'—')}</td><td>${escA(x.startDate)}</td><td><strong>${escA(x.dueDate)}</strong></td><td>${escA(x.status)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="muted">لا توجد حسابات محفوظة.</p>'}`;document.body.appendChild(panel);let toolsBtn=document.getElementById('mkSessionsToolsBtn');if(!toolsBtn){toolsBtn=document.createElement('button');toolsBtn.type='button';toolsBtn.id='mkSessionsToolsBtn';toolsBtn.className='mk-sessions-tools-fab';toolsBtn.innerHTML='<span aria-hidden="true">⚖️</span><b>أدوات الجلسات</b>';toolsBtn.setAttribute('aria-controls','v10AppealPanel');toolsBtn.setAttribute('aria-expanded','false');document.body.appendChild(toolsBtn);toolsBtn.addEventListener('click',()=>{const opening=panel.hidden;panel.hidden=!opening;toolsBtn.setAttribute('aria-expanded',String(opening));if(opening)panel.scrollTop=0;});}toolsBtn.hidden=false;}
 const priorRender=render;render=function(){priorRender();window.MAKTABY_STORE?.emit('view:rendered',{page});if(page!=='cases'){const b=document.getElementById('mkSessionsToolsBtn'),p=document.getElementById('v10AppealPanel');if(b)b.hidden=true;if(p)p.hidden=true;}else{renderPanel();const b=document.getElementById('mkSessionsToolsBtn');if(b)b.hidden=false;}};
 console.info('MAKTABY PRO 10 Phase 7 judgment-linked appeal deadlines loaded');
})();

/* MAKTABY PRO 10 — Legal document generator (sale, lease, bailiff notice).
   Additive UI only: reads existing client/case records, does not alter database schema or records. */
(function(){
 'use strict';
 const escDoc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const pick=(o,keys)=>{for(const k of keys){const v=o?.[k];if(v!==undefined&&v!==null&&String(v).trim()!=='')return String(v).trim();}return '';};
 const clients=()=>Array.isArray(db.clients)?db.clients:[];
 const cases=()=>Array.isArray(db.cases)?db.cases:[];
 const getClient=id=>clients().find((c,i)=>String(c.id??i)===String(id));
 const getCase=id=>cases().find((c,i)=>String(c.id??c.caseId??i)===String(id));
 const caseClient=c=>pick(c,['client','client_name','clientName','name']);
 const caseNo=c=>pick(c,['number','caseNumber','case_number','enrollmentNumber']);
 function mountButton(){if(page!=='legaldocs')return;const root=document.getElementById('app');if(!root||root.querySelector('#v10DocGenBtn'))return;
   const toolbar=root.querySelector('.toolbar');if(toolbar){const b=document.createElement('button');b.id='v10DocGenBtn';b.className='btn goldbtn';b.type='button';b.textContent='مولّد العقود والإنذارات';b.onclick=()=>window.maktabyLegalDocTabV10();toolbar.appendChild(b);}
   const h=root.querySelector('.pagehead h1');if(h)h.textContent='العقود والإنذارات والمحررات';
   const sub=root.querySelector('.pagehead .sub');if(sub)sub.textContent='إنشاء مسودات قابلة للمراجعة والطباعة باستخدام بيانات الموكل والقضية المسجلة.';
 }
 const oldRender=render;render=function(){oldRender();setTimeout(mountButton,0);};
 window.maktabyLegalDocTabV10=function(){const root=document.getElementById('docsTab');if(!root)return;
   const cs=clients();const options=cs.map((c,i)=>`<option value="${escDoc(c.id??i)}">${escDoc(c.name||c.client_name||('موكل '+(i+1)))}</option>`).join('');
   root.innerHTML=`<section class="panel"><div class="pagehead"><div><h2>مولّد العقود والنماذج القانونية</h2><div class="sub">اختر النموذج والموكل والقضية لسحب البيانات المتاحة. بيانات الخصم تُملأ تلقائيًا إذا كانت محفوظة بملف القضية، ويمكن استكمالها يدويًا.</div></div></div>
   <div class="formgrid"><label>نوع المحرر<select id="v10DocType"><option value="sale">عقد بيع</option><option value="lease">عقد إيجار</option><option value="bailiff">إنذار على يد محضر</option><option value="reannounce">إعادة إعلان</option><option value="judgment_announcement">إعلان بالحكم</option><option value="no_appeal_certificate">طلب شهادة بعدم حدوث استئناف</option></select></label>
   <label>الموكل<select id="v10DocClient"><option value="">اختر الموكل</option>${options}</select></label>
   <label>القضية / الملف<select id="v10DocCase"><option value="">اختر القضية (اختياري)</option></select></label>
   <label>اسم الطرف الآخر / الخصم<input id="v10DocOpponent" placeholder="يُسحب من القضية إن كان مسجلًا"></label>
   <label>رقم قومي / سجل الطرف الآخر<input id="v10DocOpponentId"></label>
   <label>عنوان الطرف الآخر<input id="v10DocOpponentAddress"></label>
   <label>عنوان الموكل<input id="v10DocClientAddress"></label>
   <label>تاريخ المحرر<input id="v10DocDate" type="date" value="${new Date().toISOString().slice(0,10)}"></label>
   <label>رقم الدعوى / رقم الملف<input id="v10DocCaseNo"></label>
   <label>المحكمة / جهة الإعلان<input id="v10DocCourt"></label>
   <label>رقم الإعلان السابق<input id="v10DocPreviousAdNo" placeholder="رقم الإعلان السابق"></label>
   <label>تاريخ الإعلان السابق<input id="v10DocPreviousAdDate" type="date"></label>
   <label>سبب إعادة الإعلان<input id="v10DocReannounceReason" placeholder="مثال: بطلان الإعلان / عدم تمام الإعلان"></label>
   <label>تاريخ جلسة الحكم<input id="v10DocJudgmentDate" type="date"></label>
   <label>منطوق الحكم<input id="v10DocJudgmentText" placeholder="اكتب منطوق الحكم بدقة"></label>
   <label>موضوع العقد / العين / محل الالتزام<input id="v10DocSubject" placeholder="وصف تفصيلي"></label>
   <label>القيمة / الأجرة بالجنيه<input id="v10DocAmount" type="number" min="0" step="0.01"></label>
   <label>مدة العقد / ميعاد التنفيذ<input id="v10DocTerm" placeholder="مثال: سنة تبدأ من..."></label>
   <label>عنوان العقار / محل التنفيذ<input id="v10DocProperty"></label>
   <label>الطلب والمهلة (للإنذار)<input id="v10DocDemand" placeholder="مثال: سداد الأجرة المتأخرة خلال... أيام"></label>
   <label>تاريخ بداية العلاقة / الاستحقاق<input id="v10DocStart" type="date"></label>
   <label>تاريخ النهاية / آخر موعد<input id="v10DocEnd" type="date"></label>
   <div class="field full"><label>بنود وشروط إضافية</label><textarea id="v10DocTerms" rows="4" placeholder="أدخل الشروط المتفق عليها، وصف المبيع أو الأجرة والتزامات الطرفين..."></textarea></div>
   <div class="field full"><label>نص المحرر — قابل للتعديل قبل الطباعة</label><textarea id="v10DocBody" rows="16" style="line-height:2"></textarea></div></div>
   <div class="actions" style="margin-top:14px"><button class="btn goldbtn" id="v10DocBuild">توليد / تحديث الصيغة</button><button class="btn" id="v10DocPrint">معاينة وطباعة A4</button></div>
   <div class="notice" style="margin-top:14px">تنبيه قانوني: الناتج مسودة تحريرية وليس محررًا موثقًا أو إنذارًا تم إعلانه. راجع الصفة والأهلية والملكية والتوقيعات والبيانات الجوهرية والاختصاص والإجراءات، واستكمل متطلبات الشهر أو التسجيل أو الإعلان بحسب الحالة. لا تُرسل أو تُعلن المسودة تلقائيًا.</div></section>`;
   const fillCase=()=>{const sel=document.getElementById('v10DocCase'),cl=document.getElementById('v10DocClient');const client=getClient(cl.value);const list=cases().map((c,i)=>({c,i})).filter(({c})=>!client||!caseClient(c)||caseClient(c)===String(client.name||client.client_name||''));sel.innerHTML='<option value="">اختر القضية (اختياري)</option>'+list.map(({c,i})=>`<option value="${escDoc(c.id??c.caseId??i)}">${escDoc(caseNo(c)||c.title||('قضية '+(i+1)))}</option>`).join('');if(client)document.getElementById('v10DocClientAddress').value=pick(client,['address','client_address']);};
   document.getElementById('v10DocClient').addEventListener('change',fillCase);fillCase();
   document.getElementById('v10DocCase').addEventListener('change',()=>{const c=getCase(document.getElementById('v10DocCase').value);if(!c)return;const opponent=pick(c,['opponent','opponent_name','opponentName','adversary','adversary_name','defendant','defendant_name','other_party','otherParty',' الخصم']);const addr=pick(c,['opponent_address','adversary_address','defendant_address','other_party_address']);document.getElementById('v10DocOpponent').value=opponent;document.getElementById('v10DocOpponentAddress').value=addr;document.getElementById('v10DocOpponentId').value=pick(c,['opponent_national_id','defendant_national_id','adversary_id']);document.getElementById('v10DocCaseNo').value=caseNo(c);document.getElementById('v10DocCourt').value=pick(c,['court','court_name']);document.getElementById('v10DocSubject').value=pick(c,['subject','legal_type','case_type','description']);});
   function valDoc(id){return document.getElementById(id)?.value?.trim()||'';}
   function make(){const type=valDoc('v10DocType'),cl=getClient(valDoc('v10DocClient')),c=getCase(valDoc('v10DocCase'));const name=pick(cl,['name','client_name'])||'................';const nid=pick(cl,['nationalId','national_id','nid']);const address=valDoc('v10DocClientAddress')||pick(cl,['address']);const opp=valDoc('v10DocOpponent')||'................';const oppid=valDoc('v10DocOpponentId'),oppaddr=valDoc('v10DocOpponentAddress');const date=valDoc('v10DocDate')||'....';const no=valDoc('v10DocCaseNo')||caseNo(c)||'غير محدد';const court=valDoc('v10DocCourt')||'................';const subject=valDoc('v10DocSubject')||'................';const amount=valDoc('v10DocAmount')||'................';const term=valDoc('v10DocTerm')||'................';const property=valDoc('v10DocProperty')||subject;const demand=valDoc('v10DocDemand')||'................';const start=valDoc('v10DocStart')||'................';const end=valDoc('v10DocEnd')||'................';const terms=valDoc('v10DocTerms')||'لا توجد شروط إضافية.';const prevNo=valDoc('v10DocPreviousAdNo')||'................';const prevDate=valDoc('v10DocPreviousAdDate')||'../../....';const reReason=valDoc('v10DocReannounceReason')||'................';const judgmentDate=valDoc('v10DocJudgmentDate')||'../../....';const judgmentText=valDoc('v10DocJudgmentText')||demand;let body='';
     if(type==='sale')body=`عقد بيع ابتدائي\nإنه في يوم ${date}، تحرر هذا العقد بين كل من:\nأولًا: السيد/ ${name}، رقم قومي ${nid||'................'}، المقيم ${address||'................'}، ويشار إليه بالطرف الأول (البائع/المشتري بحسب الاتفاق).\nثانيًا: السيد/ ${opp}، رقم قومي ${oppid||'................'}، المقيم ${oppaddr||'................'}، ويشار إليه بالطرف الثاني.\n\nتمهيد: أقر الطرفان بأهليتهما للتعاقد واتفقا على ما يأتي:\nالبند الأول — محل البيع: ${property}.\nالبند الثاني — الثمن: مبلغ وقدره ${amount} جنيه، وطريقة السداد: ${term}.\nالبند الثالث — التسليم: ${subject}، وموعد التسليم/بدء التنفيذ: ${start}.\nالبند الرابع — الضمانات والمستندات: يلتزم كل طرف بتقديم المستندات الدالة على صفته وحقوقه، وتحدد ضمانات الملكية وخلو المبيع من الحقوق والقيود وفق المستندات الفعلية.\nالبند الخامس — التسجيل والمصروفات: يتفق الطرفان على استكمال إجراءات التسجيل أو الشهر وسداد الرسوم والمصروفات وفقًا للقانون والاتفاق المكتوب بينهما.\nالبند السادس — الشروط الخاصة: ${terms}.\nتحرر العقد من نسختين بيد كل طرف نسخة للعمل بموجبها.\n\nالطرف الأول: الاسم والتوقيع ................     الطرف الثاني: الاسم والتوقيع ................     الشهود: ................`;
     else if(type==='lease')body=`عقد إيجار\nإنه في يوم ${date}، تحرر هذا العقد بين كل من:\nأولًا: السيد/ ${name}، رقم قومي ${nid||'................'}، المقيم ${address||'................'}، ويشار إليه بالطرف الأول (المؤجر/المستأجر بحسب الاتفاق).\nثانيًا: السيد/ ${opp}، رقم قومي ${oppid||'................'}، المقيم ${oppaddr||'................'}، ويشار إليه بالطرف الثاني.\n\nالبند الأول — العين المؤجرة: ${property}.\nالبند الثاني — الغرض من الاستعمال: ${subject}.\nالبند الثالث — مدة الإيجار: ${term}، من ${start} حتى ${end}.\nالبند الرابع — القيمة الإيجارية: ${amount} جنيه، ودورية السداد ووسيلته: ${demand||'تحدد كتابةً بين الطرفين'}.\nالبند الخامس — التسليم والصيانة والمرافق: يثبت الطرفان حالة العين وقراءات المرافق بمحضر استلام مستقل، وتحدد مسؤولية الصيانة والاستهلاك وفق الاتفاق والقانون.\nالبند السادس — التزامات الطرفين: يلتزم كل طرف بتنفيذ التزاماته وعدم تغيير استعمال العين أو إجراء تعديلات جوهرية إلا وفق الاتفاق والقانون.\nالبند السابع — الشروط الخاصة: ${terms}.\nتحرر العقد من نسختين بيد كل طرف نسخة.\n\nالمؤجر: الاسم والتوقيع ................     المستأجر: الاسم والتوقيع ................     الشهود: ................`;
     else if(type==='reannounce')body=`إعادة إعلان\nإنه في يوم ${date}\nبناءً على طلب السيد/ ${name}، المقيم ${address||'................'}، ومحله المختار مكتب الأستاذ/ المحامي.\nأنا محضر محكمة ${court} قد انتقلت وأعلنت السيد/ ${opp}، المقيم ${oppaddr||'................'}، مخاطبًا مع/ ................\nبشأن الدعوى رقم ${no} لسنة ........ ${subject}، وذلك لإعادة إعلانه بسبب: ${reReason}، عن الإعلان السابق رقم ${prevNo} المؤرخ ${prevDate}، وبشأن الإجراء المطلوب إتمامه: ${subject}. يجب مطابقة سبب الإعادة وبيانات الإعلان السابق مع أصل الإعلان ومحضر المحضرين قبل الطباعة.\nولأجل العلم،،،\nطالب الإعلان/ ${name}                         وكيله/ ................`;
     else if(type==='judgment_announcement')body=`إعلان بالحكم\nإنه في يوم ${date}\nبناءً على طلب السيد/ ${name}، المقيم ${address||'................'}، ومحله المختار مكتب الأستاذ/ المحامي.\nأنا محضر محكمة ${court} قد انتقلت وأعلنت السيد/ ${opp}، المقيم ${oppaddr||'................'}، مخاطبًا مع/ ................\nوأعلنته بصورة من الحكم الصادر في الدعوى رقم ${no} لسنة ........ ${subject}، بجلسة ${judgmentDate}، ومنطوقه: ${judgmentText}\nوذلك للعلم بما جاء به واتخاذ ما يلزم قانونًا، مع مراعاة بيانات الحكم وصورته التنفيذية وصفة المعلن إليه ومواعيد الطعن وفقًا للقانون.\nولأجل العلم،،،\nطالب الإعلان/ ${name}                         وكيله/ ................`;
     else if(type==='no_appeal_certificate')body=`السيد الأستاذ/ رئيس قلم كتاب محكمة ${court||'................'}\nتحية طيبة وبعد،،،\nمقدمه لسيادتكم/ ${name}، بصفته/ ................، ومحله المختار مكتب الأستاذ/ المحامي.\nالموضوع: طلب استخراج شهادة بعدم حصول استئناف\nعن الحكم الصادر في الدعوى رقم ${no} لسنة ........ ${subject}، بجلسة ../../....، بين كل من ${name} و${opp}.\nألتمس التكرم بعد الرجوع إلى السجلات المختصة إفادتي عما إذا كان قد تم التقرير بالاستئناف من عدمه حتى تاريخ استخراج الشهادة، وفي حالة عدم حصول استئناف استخراج شهادة رسمية بذلك، بعد سداد الرسوم المقررة واستيفاء المستندات المطلوبة.\nوتفضلوا بقبول فائق الاحترام،،،\nمقدمه لسيادتكم/ ${name}\nالتوقيع/ ................\nالتاريخ/ ${date}\n\nتنبيه: هذه صيغة طلب فقط، ولا تمثل شهادة صادرة من المحكمة أو إثباتًا لعدم حصول استئناف.`;
     else body=`إنذار على يد محضر\nإنه في يوم ${date}\nبناءً على طلب السيد/ ${name}، المقيم ${address||'................'}، ومحله المختار مكتب الأستاذ/ المحامي.\nأنا محضر محكمة ${court} قد انتقلت وأعلنت: السيد/ ${opp}، المقيم ${oppaddr||'................'}، مخاطبًا مع/ ................\n\nالموضوع: إنذار بشأن ${subject}.\nوحيث إن الطالب يتمسك بالآتي: ${terms}\nوحيث إن المطلوب من المعلن إليه هو: ${demand}، وذلك خلال المهلة المحددة وقدرها ${term||'المهلة القانونية أو المتفق عليها بعد مراجعتها'} من تاريخ الإعلان، مع حفظ كافة الحقوق القانونية الأخرى.\n\nبناءً عليه\nأنا المحضر سالف الذكر قد انتقلت إلى محل إقامة المعلن إليه وسلمته صورة من هذا الإنذار للعلم بما جاء به ونفاذ مفعوله قانونًا، مع حفظ كافة حقوق الطالب.\n\nولأجل العلم،،،\nطالب الإعلان/ ${name}                         وكيله/ ................`;
     document.getElementById('v10DocBody').value=body;
   }
   document.getElementById('v10DocBuild').onclick=make;make();
   document.getElementById('v10DocPrint').onclick=()=>{
     const body=valDoc('v10DocBody');if(!body)return alert('ولّد الصيغة أولًا.');
     const title={sale:'عقد بيع',lease:'عقد إيجار',bailiff:'إنذار على يد محضر',reannounce:'إعادة إعلان',judgment_announcement:'إعلان بالحكم',no_appeal_certificate:'طلب شهادة بعدم حدوث استئناف'}[valDoc('v10DocType')];
     // Print through a same-page iframe: avoids popup blockers and leaves the app open.
     const previous=document.getElementById('maktabyLegalPrintFrame');if(previous)previous.remove();
     const frame=document.createElement('iframe');frame.id='maktabyLegalPrintFrame';
     frame.setAttribute('aria-hidden','true');
     frame.style.cssText='position:fixed;left:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
     document.body.appendChild(frame);
     const doc=frame.contentDocument||frame.contentWindow.document;
     doc.open();doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${title} — مكتبي للمحاماة</title><style>@page{size:A4;margin:20mm}html,body{margin:0}body{font-family:Tahoma,Arial,sans-serif;color:#17283b;line-height:2.1;white-space:pre-wrap;font-size:15px}.head{text-align:center;border-bottom:3px solid #c49a45;padding-bottom:14px;margin-bottom:24px}.head h1{margin:0;font-size:24px}.body{white-space:pre-wrap;text-align:justify}.foot{margin-top:38px;border-top:1px solid #c49a45;padding-top:10px;text-align:center;color:#68788a;font-size:11px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><header class="head"><h1>مكتبي للمحاماة</h1><div>مكتب هاني شحاتة للمحاماة والاستشارات القانونية</div></header><main class="body">${escDoc(body)}</main><footer class="foot">مسودة للمراجعة القانونية قبل التوقيع أو الإعلان</footer></body></html>`);doc.close();
     let printStarted=false;const doPrint=()=>{if(printStarted||!frame.isConnected)return;printStarted=true;try{frame.contentWindow.focus();frame.contentWindow.print();}catch(err){alert('تعذرت الطباعة من داخل الصفحة: '+(err.message||err));}};
     frame.onload=()=>setTimeout(doPrint,150);setTimeout(doPrint,700);
     frame.contentWindow?.addEventListener?.('afterprint',()=>setTimeout(()=>frame.remove(),1000),{once:true});
   };
 };
 console.info('MAKTABY PRO 10 legal document generator loaded');
})();


/* MAKTABY PRO 10 — floating animated notification center */
(function(){
 if(window.__maktabyFloatingNotif10)return;window.__maktabyFloatingNotif10=true;
 const escN=v=>typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const todayN=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 const addN=n=>{const d=new Date();d.setDate(d.getDate()+n);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
 function collect(){
  if(typeof db==='undefined'||!db)return [];
  const t=todayN(),out=[];
  (db.cases||[]).forEach(c=>{if(!c.archived&&c.date&&c.date>=t&&c.date<=addN(3))out.push({kind:'جلسة قريبة',date:c.date,who:c.client,detail:[c.number&&'قضية '+c.number,c.court].filter(Boolean).join(' — '),level:c.date===t?'urgent':'soon',target:'cases',icon:'⚖'});});
  let taskList=[];try{taskList=typeof tasks==='function'?tasks():(db.tasks||[])}catch(_){taskList=db.tasks||[]}
  (taskList||[]).forEach(x=>{if(x.status!=='تم التنفيذ'&&x.date&&x.date<t)out.push({kind:'مهمة متأخرة',date:x.date,who:x.client,detail:[x.task,x.assignee&&'المسؤول: '+x.assignee].filter(Boolean).join(' — '),level:'urgent',target:'tasks',icon:'📌'});});
  (db.announcements||[]).forEach(a=>{const d=a.deliveryDate||a.session;if(!a.archived&&!a.delivered&&a.status!=='تم الاستلام'&&d&&d<t)out.push({kind:'إعلان متأخر عن المتابعة',date:d,who:a.client,detail:[a.number&&'إعلان '+a.number,a.court].filter(Boolean).join(' — '),level:'urgent',target:'announcements',icon:'📣'});});
  (db.approvalRequests||[]).filter(x=>x.status==='pending').forEach(x=>out.push({kind:'طلب اعتماد معلق',date:x.created_at||x.createdAt||'',who:x.employee_name||x.employeeName||x.requested_by||'',detail:x.description||x.reason||x.type||'طلب يحتاج إلى مراجعة',level:'pending',target:'approvals',icon:'📝'}));
  (db.appealCalculations||[]).forEach(x=>{if(x.dueDate&&x.dueDate>=t&&x.dueDate<=addN(7))out.push({kind:'ميعاد طعن يقترب',date:x.dueDate,who:x.client,detail:'قضية '+(x.caseNumber||'—')+' · '+(x.appealType||'ميعاد طعن'),level:'urgent',target:'cases',icon:'⏳'});});
  return out.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
 }
 function close(){const panel=document.getElementById('mkFloatingNotifPanel'),btn=document.getElementById('mkFloatingNotifBtn');panel?.classList.remove('open');btn?.setAttribute('aria-expanded','false');}
 function mount(){
  if(document.getElementById('mkFloatingNotifBtn'))return;
  const topBell=document.querySelector('.reference-topbar .notification-btn');if(topBell){topBell.setAttribute('aria-hidden','true');topBell.tabIndex=-1;}
  const btn=document.createElement('button');btn.type='button';btn.id='mkFloatingNotifBtn';btn.className='mk-floating-notif-btn';btn.setAttribute('aria-label','فتح مركز التنبيهات');btn.setAttribute('aria-controls','mkFloatingNotifPanel');btn.setAttribute('aria-expanded','false');btn.innerHTML='<span class="mk-floating-bell" aria-hidden="true">🔔</span><span class="mk-floating-label">التنبيهات</span><span id="mkFloatingNotifCount" class="mk-floating-count" style="display:none">0</span>';
  const panel=document.createElement('section');panel.id='mkFloatingNotifPanel';panel.className='mk-floating-notif-panel';panel.setAttribute('aria-label','مركز التنبيهات');panel.setAttribute('aria-hidden','true');panel.innerHTML='<header><div><strong>مركز التنبيهات</strong><small>المواعيد والمهام والطلبات التي تحتاج متابعة</small></div><button type="button" class="mk-floating-close" aria-label="إغلاق مركز التنبيهات">×</button></header><div id="mkFloatingNotifList" class="mk-floating-notif-list" aria-live="polite"></div>';
  document.body.append(btn,panel);
  btn.addEventListener('click',()=>{const open=!panel.classList.contains('open');panel.classList.toggle('open',open);panel.setAttribute('aria-hidden',String(!open));btn.setAttribute('aria-expanded',String(open));if(open){try{localStorage.setItem('mk_notif_seen_v1',JSON.stringify(collect().map(x=>[x.kind,x.who,x.date,x.detail].join('|')).slice(-500)));}catch(_){}refresh();}});
  panel.querySelector('.mk-floating-close').addEventListener('click',close);
  panel.addEventListener('click',e=>{const item=e.target.closest('[data-mk-target]');if(!item)return;const target=item.getAttribute('data-mk-target');if(target==='approvals'&&typeof canReview==='function'&&!canReview()){alert('طلبات الاعتماد متاحة للمخولين بالمراجعة فقط.');return;}if(typeof page!=='undefined')page=target;close();if(typeof render==='function')render();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')close();});
  document.addEventListener('click',e=>{if(panel.classList.contains('open')&&!panel.contains(e.target)&&!btn.contains(e.target))close();});
  refresh();
 }
 function refresh(){
  const list=collect(),count=document.getElementById('mkFloatingNotifCount'),body=document.getElementById('mkFloatingNotifList');if(!body)return;
  if(count){let __s=new Set();try{__s=new Set(JSON.parse(localStorage.getItem('mk_notif_seen_v1')||'[]'));}catch(_){}const __un=list.filter(x=>!__s.has([x.kind,x.who,x.date,x.detail].join('|'))).length;count.textContent=String(__un);count.style.display=__un?'inline-flex':'none';}
  body.innerHTML=list.length?list.map(x=>`<button type="button" class="mk-floating-notif-item ${x.level==='urgent'?'urgent':x.level==='pending'?'pending':''}" data-mk-target="${escN(x.target)}"><i>${x.icon}</i><span><b>${escN(x.kind)}</b><small>${escN(x.who||'بدون اسم')} · ${escN(x.date||'حديث')}</small><em>${escN(x.detail|| (x.level==='urgent'?'يتطلب متابعة عاجلة':x.level==='pending'?'بانتظار الاعتماد':'موعد قريب'))}</em></span><span class="mk-floating-arrow">‹</span></button>`).join(''):'<div class="mk-floating-empty">لا توجد تنبيهات حالية.<br>ستظهر هنا الجلسات والمهام والإعلانات والاعتمادات التي تحتاج متابعة.</div>';
 }
 function start(){mount();const oldRender=typeof render==='function'?render:null;if(oldRender&&!oldRender.__mkFloatingNotifWrapped){const wrapped=function(){oldRender.apply(this,arguments);mount();refresh();};wrapped.__mkFloatingNotifWrapped=true;render=wrapped;}setInterval(()=>{mount();refresh();},20000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* MAKTABY PRO 10 — persistent account controls in the right sidebar */
(function(){
 if(window.__maktabySidebarAccount10)return;window.__maktabySidebarAccount10=true;
 const style=document.createElement('style');style.textContent=`
 .mk-sidebar-account{margin-top:12px;padding:13px 12px;border:1px solid rgba(220,190,130,.32);border-radius:13px;background:rgba(255,255,255,.075);color:#fff;display:none;flex:0 0 auto}
 .mk-sidebar-account.is-active{display:block}
 .mk-sidebar-account .mk-account-label{font-size:10px;color:#d9bd83;margin-bottom:5px}
 .mk-sidebar-account .mk-account-name{font-size:13px;font-weight:800;overflow-wrap:anywhere;margin-bottom:3px}
 .mk-sidebar-account .mk-account-role{font-size:11px;color:#c5d2df;margin-bottom:10px}
 .mk-sidebar-account .mk-account-actions{display:flex;gap:7px}
 .mk-sidebar-account button{border:1px solid rgba(255,255,255,.25);border-radius:8px;padding:7px 9px;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:11px;cursor:pointer;flex:1}
 .mk-sidebar-account button:hover{background:rgba(255,255,255,.2)}
 .mk-sidebar-account button.mk-logout{background:#8d3434;border-color:#a95454}
 .side{display:flex;flex-direction:column;min-height:100vh}
 .mk-sidebar-notifications{flex:0 1 auto;min-height:90px}
 @media(max-width:700px){.side{min-height:0}.mk-sidebar-account{margin-top:8px}.mk-sidebar-account .mk-account-actions{max-width:360px}}
 `;document.head.appendChild(style);
 function roleLabel(role){return role==='admin'?'مدير النظام':role==='office_manager'?'مديرة المكتب':'موظف';}
 function mount(){const side=document.querySelector('.layout>.side');if(!side)return;let box=side.querySelector('.mk-sidebar-account');if(!box){box=document.createElement('section');box.className='mk-sidebar-account';box.id='mkSidebarAccount';box.innerHTML='<div class="mk-account-label">الحساب الحالي</div><div class="mk-account-name" id="mkSidebarAccountName"></div><div class="mk-account-role" id="mkSidebarAccountRole"></div><div class="mk-account-actions"><button type="button" id="mkSwitchAccount">تبديل المستخدم</button><button type="button" class="mk-logout" id="mkLogout">تسجيل الخروج</button></div>';side.appendChild(box);box.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(typeof logout==='function')logout();});}
  const user=typeof currentUser!=='undefined'?currentUser:null;box.classList.toggle('is-active',!!user);if(user){const n=document.getElementById('mkSidebarAccountName'),r=document.getElementById('mkSidebarAccountRole');if(n)n.textContent=user.name||user.email||'مستخدم المكتب';if(r)r.textContent=roleLabel(user.role);}
 }
 function sync(){mount();const badge=document.getElementById('userBadge');if(badge&&typeof currentUser!=='undefined'&&currentUser)badge.textContent=currentUser.name||currentUser.email||'مستخدم المكتب';}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync,{once:true});else sync();
 setInterval(sync,15000);window.addEventListener('focus',sync,{passive:true});document.addEventListener('visibilitychange',()=>{if(!document.hidden)sync();});
})();

/* MAKTABY PRO 10 — opt-in, privacy-safe performance diagnostics (R4)
 * Enable only for a troubleshooting session with ?mkperf=1.
 * Records durations/counts only; never records names, form values, IDs or payloads.
 */
(function(){
 'use strict';
 let enabled=false;
 try{enabled=new URLSearchParams(location.search).get('mkperf')==='1';}catch(_){return;}
 if(!enabled||window.__maktabyPerfDiagnostics10)return;
 window.__maktabyPerfDiagnostics10=true;
 const metrics=Object.create(null);
 function record(name,start){
  const ms=Math.max(0,performance.now()-start),m=metrics[name]||(metrics[name]={count:0,totalMs:0,maxMs:0,lastMs:0});
  m.count++;m.totalMs+=ms;m.maxMs=Math.max(m.maxMs,ms);m.lastMs=ms;
 }
 function wrapSync(name,fn){return function(){const start=performance.now();try{return fn.apply(this,arguments);}finally{record(name,start);}};}
 function wrapAsync(name,fn){return async function(){const start=performance.now();try{return await fn.apply(this,arguments);}finally{record(name,start);}};}
 if(typeof render==='function'&&!render.__mkPerfWrapped10){const original=render;const wrapped=wrapSync('render',original);wrapped.__mkPerfWrapped10=true;render=wrapped;}
 if(typeof saveCloudState==='function'&&!saveCloudState.__mkPerfWrapped10){const original=saveCloudState;const wrapped=wrapAsync('saveCloudState',original);wrapped.__mkPerfWrapped10=true;saveCloudState=wrapped;}
 if(typeof loadCloudState==='function'&&!loadCloudState.__mkPerfWrapped10){const original=loadCloudState;const wrapped=wrapAsync('loadCloudState',original);wrapped.__mkPerfWrapped10=true;loadCloudState=wrapped;}
 window.__mkPerfReport10=function(){
  const report={};Object.keys(metrics).forEach(k=>{const m=metrics[k];report[k]={count:m.count,avgMs:Math.round(m.totalMs/m.count),maxMs:Math.round(m.maxMs),lastMs:Math.round(m.lastMs)};});
  console.table(report);return report;
 };
 window.__mkPerfReset10=function(){Object.keys(metrics).forEach(k=>delete metrics[k]);console.info('MAKTABY performance counters reset');};
 console.info('MAKTABY diagnostics enabled. Run __mkPerfReport10() in DevTools Console; __mkPerfReset10() resets counters. No business data is collected.');
})();

/* MAKTABY PRO 10 — Global Search v1 (client-side, read-only, permission-aware). */
(function(){
  if(window.__maktabyGlobalSearchV1)return;
  window.__maktabyGlobalSearchV1=true;
  const norm=v=>String(v??'').toLocaleLowerCase('ar-EG').normalize('NFKC').replace(/[ً-ٰٟـ]/g,'').trim();
  const escv=v=>typeof esc==='function'?esc(String(v??'')):String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const textOf=(...v)=>v.filter(x=>x!==undefined&&x!==null&&String(x).trim()).join(' · ');
  function records(){
    const out=[];
    (db.clients||[]).forEach((x,i)=>out.push({kind:'عميل',icon:'👤',title:x.name||x.client||x.client_name||'عميل',sub:textOf(x.phone,x.caseNumber,x.notes),target:'clients',hay:[x.name,x.client,x.client_name,x.phone,x.caseNumber,x.notes]}));
    (db.cases||[]).filter(x=>!x.archived).forEach(x=>out.push({kind:'قضية / جلسة',icon:'⚖️',title:x.client||('قضية رقم '+(x.number||'—')),sub:textOf(x.number,x.court,x.date,x.subject),target:'cases',hay:[x.client,x.number,x.court,x.date,x.subject,x.details,x.topic]}));
    (typeof tasks==='function'?tasks():[]).forEach(x=>out.push({kind:'مهمة',icon:'✓',title:x.task||'مهمة مكتبية',sub:textOf(x.client,x.court,x.date,x.status),target:'tasks',hay:[x.task,x.client,x.court,x.date,x.status,x.notes]}));
    (db.announcements||[]).filter(x=>!x.archived).forEach(x=>out.push({kind:'إعلان / إجراء',icon:'📨',title:x.client||x.name||x.subject||'إجراء',sub:textOf(x.type,x.date,x.status,x.details),target:'announcements',hay:[x.client,x.name,x.subject,x.type,x.date,x.status,x.details,x.notes]}));
    if(typeof canManageOffice==='function'&&canManageOffice()&&typeof crmState!=='undefined'&&Array.isArray(crmState.rows))crmState.rows.filter(x=>!['مؤرشف'].includes(x.lead_status)).forEach(x=>out.push({kind:'عميل محتمل',icon:'◎',title:x.client_name||'عميل محتمل',sub:textOf(x.phone,x.lead_status,x.source),target:'crm',hay:[x.client_name,x.phone,x.lead_status,x.source,x.notes]}));
    return out;
  }
  function mount(){
    if(!currentUser||document.getElementById('mkGlobalSearchBtn'))return;
    const tools=document.querySelector('.top-tools');if(!tools)return;
    const btn=document.createElement('button');btn.type='button';btn.id='mkGlobalSearchBtn';btn.className='btn light mk-global-search-btn';btn.innerHTML='⌕ <span>بحث شامل</span> <kbd>Ctrl K</kbd>';btn.setAttribute('aria-label','بحث شامل في البرنامج');
    tools.insertBefore(btn,tools.firstChild);
    const layer=document.createElement('div');layer.id='mkGlobalSearchLayer';layer.className='mk-global-search-layer';layer.hidden=true;layer.innerHTML='<section class="mk-global-search-dialog" role="dialog" aria-modal="true" aria-label="البحث الشامل"><header><strong>البحث الشامل</strong><button type="button" id="mkGlobalSearchClose" aria-label="إغلاق">×</button></header><input id="mkGlobalSearchInput" type="search" autocomplete="off" placeholder="ابحث باسم موكل أو قضية أو جلسة أو مهمة أو إجراء..."/><small class="mk-global-search-hint">اكتب كلمتين أو أكثر لتضييق النتائج · Esc للإغلاق</small><div id="mkGlobalSearchResults" class="mk-global-search-results"><div class="empty">ابدأ بكتابة كلمة للبحث في بيانات المكتب.</div></div></section>';
    document.body.appendChild(layer);
    const input=layer.querySelector('#mkGlobalSearchInput'),results=layer.querySelector('#mkGlobalSearchResults');
    function close(){layer.hidden=true;btn.setAttribute('aria-expanded','false');}
    function open(){layer.hidden=false;btn.setAttribute('aria-expanded','true');setTimeout(()=>input.focus(),20);}
    function run(){const q=norm(input.value);if(q.length<2){results.innerHTML='<div class="empty">اكتب حرفين على الأقل لعرض النتائج.</div>';return;}const words=q.split(/\s+/).filter(Boolean);const found=records().filter(r=>{const hay=norm([r.title,r.sub,...r.hay].join(' '));return words.every(w=>hay.includes(w));}).slice(0,15);results.innerHTML=found.length?found.map((r,i)=>`<button type="button" class="mk-global-result" data-result-index="${i}"><span class="mk-global-result-icon">${r.icon}</span><span><b>${escv(r.title)}</b><small>${escv(r.kind)}${r.sub?' · '+escv(r.sub):''}</small></span><em>فتح القسم ←</em></button>`).join(''):'<div class="empty">لا توجد نتائج مطابقة في البيانات المتاحة لحسابك.</div>';results._rows=found;}
    btn.addEventListener('click',open);layer.querySelector('#mkGlobalSearchClose').addEventListener('click',close);layer.addEventListener('click',e=>{if(e.target===layer)close();});input.addEventListener('input',run);
    results.addEventListener('click',e=>{const b=e.target.closest('[data-result-index]');if(!b)return;const row=results._rows?.[Number(b.dataset.resultIndex)];if(!row)return;close();page=row.target;render();});
    document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();open();}else if(e.key==='Escape'&&!layer.hidden)close();});
  }
  const base=render;render=function(){base.apply(this,arguments);mount();};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else setTimeout(mount,0);
})();

/* MAKTABY PRO 10 — Batch 2: linked client/case files + fees overview (additive, read-only; no data is changed). */
(function(){
 if(window.__mkBatch2)return;window.__mkBatch2=true;
 const N=v=>String(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('ar');
 const E=s=>esc(String(s??''));
 const css=document.createElement('style');
 css.textContent='.mk2-tabs{display:flex;gap:6px;overflow-x:auto;border-bottom:1px solid #dbe5f1;margin:10px 0 14px;padding-bottom:8px}.mk2-tabs button{white-space:nowrap;border:1px solid #d7e2ef;background:#f7faff;border-radius:9px;padding:8px 14px;font-size:13px;font-weight:700;color:#344b68;cursor:pointer}.mk2-tabs button.active{background:#e6f0ff;border-color:#8fb5ed;color:#174b91}.mk2-strip{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px;margin:10px 0}.mk2-card{border:1px solid #d9e4f2;border-radius:11px;padding:9px 13px;background:linear-gradient(135deg,#f8fbff,#eaf2ff)}.mk2-card span{display:block;font-size:12px;color:#243b58;font-weight:700}.mk2-card b{font-size:19px;color:#173b68}.mk2-card.red{background:#fff2ef;border-color:#f3d2cb}.mk2-card.red b{color:#c0392b}.mk2-card.green{background:#effaf4;border-color:#ccebd8}.mk2-card.green b{color:#13834a}.mk2-case details{border:1px solid #dbe5f1;border-radius:10px;margin:8px 0;padding:8px 12px;background:#fff}.mk2-case summary{cursor:pointer;font-weight:800;color:#174b91}.mk2-muted{color:#64748b;font-size:12px}';
 document.head.appendChild(css);
 const FEE_OWNER_EMAIL='hanyshehatamofed@gmail.com';
 const canFees=()=>typeof isAdmin==='function'&&isAdmin()&&String(currentUser?.email||'').toLowerCase()===FEE_OWNER_EMAIL;
 const agreements=()=>(Array.isArray(db.clientFeeAgreements)?db.clientFeeAgreements:[]).filter(a=>a&&!a.deletedAt&&!a.voidedAt);
 const payments=()=>Array.isArray(db.clientFeePayments)?db.clientFeePayments:[];
 const paidOf=a=>payments().filter(p=>String(p.agreementId)===String(a.id)).reduce((n,p)=>n+Math.max(0,Number(p.amount)||0),0);
 const lastPay=a=>payments().filter(p=>String(p.agreementId)===String(a.id)&&p.date).map(p=>String(p.date)).sort().pop()||'';
 const totalOf=a=>Math.max(0,Number(a.total)||0);
 const remOf=a=>Math.max(0,totalOf(a)-paidOf(a));
 const ownedBy=(a,c)=>{if(a.ownerType&&a.ownerId)return a.ownerType==='client'&&String(a.ownerId)===String(c.id||c.name);return !a.ownerType&&!a.ownerId&&N(a.client)===N(c.name);};
 const sum=(rows,f)=>rows.reduce((n,a)=>n+f(a),0);
 const feeTable=rows=>rows.length?table(['الاتفاق','القضية','المتفق عليه','المدفوع','المتبقي','الاستحقاق','آخر دفعة'],rows.map(a=>`<tr><td>${E(a.description||'اتفاق أتعاب')}</td><td>${E(a.caseNumber||'—')}</td><td>${moneyV54(totalOf(a))}</td><td>${moneyV54(paidOf(a))}</td><td><b style="color:${remOf(a)>0?'#c0392b':'#13834a'}">${moneyV54(remOf(a))}</b></td><td>${E(a.dueDate||'—')}</td><td>${E(lastPay(a)||'—')}</td></tr>`)):'<div class="empty">لا توجد اتفاقات أتعاب مسجلة.</div>';
 const cards=a=>`<div class="mk2-strip">${a.map(x=>`<div class="mk2-card ${x[2]||''}"><span>${E(x[0])}</span><b>${E(x[1])}</b></div>`).join('')}</div>`;

 /* 1) Tabbed client file: only shows/hides existing sections, never moves or edits them. */
 const tabOf=el=>{
  if(el.id==='feeAccountsV10'||el.id==='mkClientFees')return 'fees';
  const h=(el.querySelector('h3')?.textContent||'');
  if(h.includes('المستندات'))return 'docs';
  if(h.includes('القضايا')||h.includes('الإعلانات'))return 'cases';
  if(h.includes('مصروفات'))return 'exp';
  return 'overview';
 };
 function applyTab(app,tab){
  [...app.children].forEach(el=>{if(el.classList.contains('pagehead')&&el===app.querySelector('.pagehead'))return;if(el.id==='mkClientTabs'||el.id==='mkClientStrip')return;if(!el.dataset.mk2tab)el.dataset.mk2tab=tabOf(el);el.style.display=el.dataset.mk2tab===tab?'':'none';});
  app.querySelectorAll('#mkClientTabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));
  app.dataset.mk2cur=tab;
 }
 function enhanceClient(){
  const app=document.getElementById('app');const c=(db.clients||[]).find(x=>x.name===selectedClientNameV54);
  if(!app||!c||page!=='clientProfile')return;
  const head=app.querySelector('.pagehead');if(!head||app.querySelector('#mkClientTabs'))return;
  const rows=agreements().filter(a=>ownedBy(a,c));
  const cs=(db.cases||[]).filter(x=>x.client===c.name&&!x.archived);
  const next=cs.map(x=>String(x.date||'')).filter(d=>d>=today()).sort()[0]||'—';
  const strip=document.createElement('div');strip.id='mkClientStrip';
  const sc=[['القضايا النشطة',cs.length],['الجلسة القادمة',next]];
  if(canFees()){const t=sum(rows,totalOf),p=sum(rows,paidOf),r=sum(rows,remOf);sc.push(['المتفق عليه',moneyV54(t)],['المدفوع',moneyV54(p),'green'],['المتبقي',moneyV54(r),r>0?'red':'green']);}
  strip.innerHTML=cards(sc);
  const tabs=document.createElement('div');tabs.id='mkClientTabs';tabs.className='mk2-tabs';
  const list=[['overview','نظرة عامة'],['cases','القضايا والجلسات'],...(canFees()?[['fees','الأتعاب والحسابات']]:[]),['exp','المصروفات'],['docs','المستندات']];
  tabs.innerHTML=list.map(t=>`<button type="button" data-tab="${t[0]}">${t[1]}</button>`).join('');
  tabs.addEventListener('click',e=>{const b=e.target.closest('button[data-tab]');if(b)applyTab(app,b.dataset.tab);});
  head.after(strip);strip.after(tabs);
  if(canFees()){const f=document.createElement('section');f.className='panel';f.id='mkClientFees';f.innerHTML='<h3>ملخص الأتعاب (عرض فقط)</h3>'+feeTable(rows);app.appendChild(f);}
    const fb0=app.querySelector('#feeAccountsV10');if(fb0)app.insertBefore(fb0,app.querySelector('#mkClientFees'));
applyTab(app,'overview');
  new MutationObserver(()=>{if(!app.isConnected||page!=='clientProfile')return;[...app.children].forEach(el=>{if(!el.dataset.mk2tab&&el.id!=='mkClientTabs'&&el.id!=='mkClientStrip'&&el!==app.querySelector('.pagehead')){el.dataset.mk2tab=tabOf(el);el.style.display=el.dataset.mk2tab===(app.dataset.mk2cur||'overview')?'':'none';}});}).observe(app,{childList:true});
 }
 const baseMountFee=window.mountFeeAccountsV10;
 if(typeof baseMountFee==='function')window.mountFeeAccountsV10=function(){const r=baseMountFee.apply(this,arguments);try{const a=document.getElementById('app');const f=a&&a.querySelector('#mkClientTabs')&&a.querySelector('#feeAccountsV10');if(f)a.insertBefore(f,a.querySelector('#mkClientFees'));}catch(e){}return r;};
 const oldProfile=renderClientProfileV54;
 renderClientProfileV54=async function(){await oldProfile.apply(this,arguments);try{enhanceClient();}catch(e){console.error('MAKTABY batch2 client tabs',e);}};

 /* 2) Linked case panel under the selected case. */
 function enhanceCase(){
  const app=document.getElementById('app');if(!app||page!=='cases'||app.querySelector('#mkCasePanel'))return;
  const i=Number(window.caseCompactSelectedIndex);const k=(db.cases||[])[i];if(!k||!app.querySelector('.v109-detail'))return;
  const client=(db.clients||[]).find(x=>x.name===k.client);
  const sessions=(db.cases||[]).filter(x=>(k.caseId&&x.caseId===k.caseId)||(k.number&&N(x.number)===N(k.number)&&N(x.client)===N(k.client)));
  const hist=[];sessions.forEach(x=>(x.history||[]).forEach(h=>hist.push(h)));hist.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
  const own=client?agreements().filter(a=>ownedBy(a,client)):[];
  const byCase=own.filter(a=>a.caseNumber&&k.number&&N(a.caseNumber)===N(k.number));
  const exps=(db.cloudExpenses||[]).filter(x=>x.approvalStatus==='approved'&&(k.caseId&&x.caseId&&String(x.caseId)===String(k.caseId))&&(canManageOffice()||x.employeeId===currentUser?.id));
  const docs=(db.clientDocuments||[]).filter(x=>x.client_name===k.client);
  const sec=(t,b)=>`<details open><summary>${t}</summary><div style="margin-top:8px">${b}</div></details>`;
  const feeHtml=canFees()?sec('الأتعاب والحسابات',(byCase.length?feeTable(byCase)+cards([['المتفق عليه',moneyV54(sum(byCase,totalOf))],['المدفوع',moneyV54(sum(byCase,paidOf)),'green'],['المتبقي',moneyV54(sum(byCase,remOf)),sum(byCase,remOf)>0?'red':'green']]):'<div class="empty">لا يوجد اتفاق مربوط برقم هذه القضية.</div>')+(own.length&&own.length!==byCase.length?`<div class="mk2-muted">إجمالي اتفاقات الموكل كله: متفق ${moneyV54(sum(own,totalOf))} · مدفوع ${moneyV54(sum(own,paidOf))} · متبقي ${moneyV54(sum(own,remOf))}. الربط هنا بالتطابق مع رقم القضية فقط، ولا يتم ربط تلقائي.</div>`:'')):'';
  const p=document.createElement('section');p.id='mkCasePanel';p.className='panel mk2-case';p.style.marginTop='12px';
  p.innerHTML=`<h3>الملف المرتبط بالقضية</h3><div class="mk2-muted">عرض فقط. كل البيانات من نفس السجلات الحالية.</div>`+
   sec('الموكل',client?`<p><b>${E(client.name)}</b> · ${E(client.phone||'—')}</p><button class="btn light" type="button" onclick="openClientProfile(${JSON.stringify(client.name).replace(/"/g,'&quot;')})">فتح ملف الموكل</button>`:`<div class="empty">الموكل غير مسجل في قائمة العملاء (${E(k.client||'—')}).</div>`)+
   sec(`الجلسات (${hist.length})`,hist.length?table(['التاريخ','الرول','القرار','سبب التأجيل'],hist.slice(0,30).map(h=>`<tr><td>${E(h.date||'—')}</td><td>${E(h.roll||'—')}</td><td>${E(h.decision||'—')}</td><td>${E(h.reason||'—')}</td></tr>`)):'<div class="empty">لا توجد جلسات سابقة مسجلة.</div>')+
   feeHtml+
   sec(`المصروفات (${exps.length})`,exps.length?table(['التاريخ','البند','البيان','المبلغ'],exps.map(x=>`<tr><td>${E(x.date||'—')}</td><td>${E(x.category||'—')}</td><td>${E(x.title||'—')}</td><td>${moneyV54(x.amount)}</td></tr>`))+`<div class="mk2-muted">المجموع: ${moneyV54(sum(exps,x=>Number(x.amount)||0))}</div>`:'<div class="empty">لا توجد مصروفات معتمدة مربوطة بهذه القضية.</div>')+
   sec(`المستندات (${docs.length})`,docs.length?'<ul>'+docs.slice(0,15).map(d=>`<li>${E(d.file_name||'ملف')} <span class="mk2-muted">${E(d.category||'')}</span></li>`).join('')+'</ul><div class="mk2-muted">للفتح أو الرفع: من ملف الموكل.</div>':'<div class="empty">لا توجد مستندات محملة لهذا الموكل في الذاكرة. افتح ملف الموكل للتفاصيل.</div>');
  app.appendChild(p);
 }

 /* 3) Fees overview page (admin / office manager). */
 const st=window.__mkFeeOv={q:'',only:true};
 const ownerName=a=>a.client||'—';
 function feeRows(){
  const q=N(st.q);
  return agreements().map(a=>({a,t:totalOf(a),p:paidOf(a),r:remOf(a)})).filter(x=>(!st.only||x.r>0)&&(!q||[x.a.client,x.a.caseNumber,x.a.description].some(v=>N(v).includes(q)))).sort((x,y)=>y.r-x.r);
 }
 function feeBody(){
  const rows=feeRows();const box=document.getElementById('mkFeeBody');if(!box)return;
  const t=sum(rows,x=>x.t),p=sum(rows,x=>x.p),r=sum(rows,x=>x.r);
  box.innerHTML=cards([['عدد الاتفاقات',rows.length],['المتفق عليه',moneyV54(t)],['المدفوع',moneyV54(p),'green'],['المتبقي',moneyV54(r),r>0?'red':'green']])+(rows.length?table(['الموكل','الاتفاق','القضية','المتفق عليه','المدفوع','المتبقي','الاستحقاق','آخر دفعة','الملف'],rows.map(x=>{const c=(db.clients||[]).find(z=>z.name===x.a.client);return `<tr><td>${E(ownerName(x.a))}</td><td>${E(x.a.description||'اتفاق أتعاب')}</td><td>${E(x.a.caseNumber||'—')}</td><td>${moneyV54(x.t)}</td><td>${moneyV54(x.p)}</td><td><b style="color:${x.r>0?'#c0392b':'#13834a'}">${moneyV54(x.r)}</b></td><td>${E(x.a.dueDate||'—')}</td><td>${E(lastPay(x.a)||'—')}</td><td>${c?`<button class="btn light" type="button" data-mk2client="${E(c.name)}">فتح</button>`:'—'}</td></tr>`;})):'<div class="empty">لا توجد اتفاقات مطابقة.</div>');
 }
 function feeCsv(){
  const rows=feeRows();const q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  const lines=[['الموكل','الاتفاق','القضية','المتفق عليه','المدفوع','المتبقي','الاستحقاق','آخر دفعة'].map(q).join(',')].concat(rows.map(x=>[x.a.client,x.a.description,x.a.caseNumber,x.t,x.p,x.r,x.a.dueDate,lastPay(x.a)].map(q).join(',')));
  const blob=new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'});const u=URL.createObjectURL(blob);const l=document.createElement('a');l.href=u;l.download='maktaby-fees-'+today()+'.csv';document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),2000);
 }
 function renderFees(){
  const app=document.getElementById('app');if(!app)return;
  setV54Page('الأتعاب والمتبقي','feesOverview');
  app.innerHTML=`<div class="pagehead"><div><h1>الأتعاب والمتبقي</h1><div class="sub">كل اتفاقات الأتعاب: المتفق عليه والمدفوع والمتبقي لكل موكل وقضية. عرض فقط، لا يغيّر أي بيانات.</div></div><div class="actions"><button class="btn light" type="button" id="mkFeeCsv">تصدير CSV</button></div></div><section class="panel"><div class="toolbar"><input class="search" id="mkFeeQ" type="search" placeholder="بحث بالموكل أو رقم القضية أو الاتفاق..." value="${E(st.q)}"><label style="white-space:nowrap"><input type="checkbox" id="mkFeeOnly" ${st.only?'checked':''}> عليهم متبقي فقط</label></div><div id="mkFeeBody"></div></section>`;
  document.getElementById('mkFeeQ').addEventListener('input',e=>{st.q=e.target.value;feeBody();});
  document.getElementById('mkFeeOnly').addEventListener('change',e=>{st.only=e.target.checked;feeBody();});
  document.getElementById('mkFeeCsv').addEventListener('click',feeCsv);
  document.getElementById('mkFeeBody').addEventListener('click',e=>{const b=e.target.closest('[data-mk2client]');if(b)openClientProfile(b.dataset.mk2client);});
  feeBody();
 }
 const nav=document.getElementById('nav');
 if(nav&&!nav.querySelector('[data-page="feesOverview"]')){const b=document.createElement('button');b.type='button';b.dataset.page='feesOverview';b.textContent='الأتعاب والمتبقي';b.style.display='none';nav.appendChild(b);}
 const navTimer=setInterval(()=>{if(currentUser){clearInterval(navTimer);const b=document.querySelector('#nav [data-page="feesOverview"]');if(b)b.style.display=canFees()?'':'none';}},500);
 document.addEventListener('click',e=>{const b=e.target.closest('#nav [data-page="feesOverview"]');if(!b)return;e.preventDefault();e.stopImmediatePropagation();if(!canFees()){alert('هذه الصفحة متاحة للمدير ومديرة المكتب فقط.');return;}page='feesOverview';render();},true);
 const baseRender=render;
 render=function(){
  if(page==='feesOverview'){if(canFees()){renderFees();return;}page='dashboard';}
  if(page==='income'&&!canFees()){alert('صفحة الوارد متاحة لصاحب المكتب فقط.');page='dashboard';}
  const r=baseRender.apply(this,arguments);
  try{const inc=document.querySelector('#nav [data-page="income"]');if(inc&&!canFees())inc.style.display='none';}catch(e){}
  if(page==='cases'){try{enhanceCase();}catch(e){console.error('MAKTABY batch2 case panel',e);}}
  return r;
 };
})();

typeof checks!=='undefined'&&console.log(`PASS ${checks.length}/${checks.length} web candidate source checks`);
if(typeof checks!=='undefined')for(const c of checks)console.log(' - '+c);

/* MAKTABY PRO 10 — calm floating UI: one small hub button instead of four floating items */
(function(){
 if(window.__maktabyHub10)return;window.__maktabyHub10=true;
 const st=document.createElement('style');st.textContent=`
 html body #mkFloatingNotifBtn,html body #mkCourtFab,html body #maktabyWeeklyBackupNotice{display:none!important}
 html body #maktabyV85Status:not([data-kind="error"]){display:none!important}
 html body .footer-connection{position:fixed!important;right:12px!important;bottom:14px!important;left:auto!important;width:12px!important;height:12px!important;min-width:0!important;padding:0!important;margin:0!important;border:0!important;border-radius:50%!important;background:transparent!important;box-shadow:none!important;font-size:0!important;z-index:9000!important;overflow:hidden!important;opacity:.7}
 html body .footer-connection i{width:12px!important;height:12px!important;display:block!important}
 html body .footer-connection b,html body .footer-connection strong{display:none!important}
 html body .footer-connection[data-bad="1"] i{background:#d93636!important}
 #mkHubBtn{position:fixed;left:14px;bottom:14px;width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.25);background:rgba(20,40,63,.86);color:#fff;font:700 22px/1 Tahoma,Arial,sans-serif;display:flex;align-items:center;justify-content:center;padding:0 0 6px;cursor:pointer;z-index:12010;box-shadow:0 3px 10px rgba(7,29,53,.25)}
 #mkHubBtn .mk-hub-badge{position:absolute;top:-5px;right:-5px;min-width:19px;height:19px;padding:0 4px;border:2px solid #fff;border-radius:12px;background:#d93636;color:#fff;font:800 10px/15px Tahoma,Arial,sans-serif;text-align:center;padding-bottom:0}
 #mkHubBtn .mk-hub-dot{position:absolute;top:-3px;right:-3px;width:11px;height:11px;border-radius:50%;background:#d6a744;border:2px solid #fff}
 #mkHubMenu{position:fixed;left:14px;bottom:66px;z-index:12011;min-width:210px;max-width:calc(100vw - 28px);background:#fff;border:1px solid #d9e2ec;border-radius:14px;box-shadow:0 12px 36px rgba(7,29,53,.25);padding:6px;direction:rtl;display:none}
 #mkHubMenu.open{display:block}
 #mkHubMenu button{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;padding:12px;border-radius:10px;font:700 14px Tahoma,Arial,sans-serif;color:#14283f;cursor:pointer;text-align:right}
 #mkHubMenu button:hover,#mkHubMenu button:active{background:#f1f4f8}
 #mkHubMenu .mk-hub-n{margin-right:auto;background:#d93636;color:#fff;border-radius:12px;padding:1px 8px;font-size:11px}
 #mkHubMenu .mk-hub-d{margin-right:auto;width:9px;height:9px;border-radius:50%;background:#d6a744}
 @media print{#mkHubBtn,#mkHubMenu{display:none!important}}`;
 document.head.appendChild(st);
 const $=id=>document.getElementById(id);
 let btn,menu;
 function unread(){const c=$('mkFloatingNotifCount');return c?parseInt(c.textContent,10)||0:0;}
 function backupDue(){return !!$('maktabyWeeklyBackupNotice');}
 function paint(){if(!btn)return;btn.querySelectorAll('.mk-hub-badge,.mk-hub-dot').forEach(e=>e.remove());const n=unread();if(n){const b=document.createElement('span');b.className='mk-hub-badge';b.textContent=n>99?'99+':String(n);btn.appendChild(b);}else if(backupDue()){const d=document.createElement('span');d.className='mk-hub-dot';btn.appendChild(d);}
  const f=document.querySelector('.footer-connection'),cs=$('cloudStatus');if(f&&cs)f.dataset.bad=/تعذر|غير متصل/.test(cs.textContent)?'1':'0';}
 function build(){menu.innerHTML='';const items=[];
  if($('mkFloatingNotifBtn'))items.push(['🔔','التنبيهات',unread()?`<span class="mk-hub-n">${unread()}</span>`:'',()=>$('mkFloatingNotifBtn').click()]);
  if($('mkCourtFab'))items.push(['⚖','وضع المحكمة','',()=>$('mkCourtFab').click()]);
  if(backupDue())items.push(['💾','نسخة احتياطية أسبوعية','<span class="mk-hub-d"></span>',()=>{const b=$('maktabyBackupNow');if(b)b.click();}]);
  items.forEach(([ic,label,extra,fn])=>{const b=document.createElement('button');b.type='button';b.innerHTML=`<span aria-hidden="true">${ic}</span><span>${label}</span>${extra}`;b.addEventListener('click',e=>{e.stopPropagation();menu.classList.remove('open');btn.setAttribute('aria-expanded','false');fn();setTimeout(paint,150);});menu.appendChild(b);});}
 function mount(){if($('mkHubBtn')||!document.body)return;
  btn=document.createElement('button');btn.type='button';btn.id='mkHubBtn';btn.textContent='⋯';btn.setAttribute('aria-label','القائمة السريعة: التنبيهات ووضع المحكمة');btn.setAttribute('aria-haspopup','true');btn.setAttribute('aria-expanded','false');
  menu=document.createElement('div');menu.id='mkHubMenu';menu.setAttribute('role','menu');
  document.body.append(btn,menu);
  btn.addEventListener('click',e=>{e.stopPropagation();const open=!menu.classList.contains('open');if(open)build();menu.classList.toggle('open',open);btn.setAttribute('aria-expanded',String(open));});
  document.addEventListener('click',e=>{if(menu.classList.contains('open')&&!menu.contains(e.target)&&e.target!==btn){menu.classList.remove('open');btn.setAttribute('aria-expanded','false');}});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.classList.remove('open');btn.setAttribute('aria-expanded','false');}});
  paint();}
 function start(){mount();setInterval(()=>{mount();paint();},1500);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* MAKTABY PRO 10 — Batch 3: faster navigation (back button, quick search, bottom bar on phone, recent items, faster forms). Display/navigation only; no data or permission code is touched. */
(function(){
 if(window.__maktabyBatch3)return;window.__maktabyBatch3=true;
 const $id=id=>document.getElementById(id);
 const isPhone=()=>window.matchMedia&&window.matchMedia('(max-width:760px)').matches;
 const st=document.createElement('style');st.textContent=`
 #mkBottomBar{position:fixed;left:0;right:0;bottom:0;z-index:9000;display:none;direction:rtl;background:#fff;border-top:1px solid #d9e2ec;box-shadow:0 -4px 14px rgba(7,29,53,.1);padding:4px 4px calc(4px + env(safe-area-inset-bottom))}
 #mkBottomBar button{flex:1;border:0;background:none;padding:7px 2px 5px;font:700 11px Tahoma,Arial,sans-serif;color:#51657d;display:flex;flex-direction:column;align-items:center;gap:2px;cursor:pointer;border-radius:10px}
 #mkBottomBar button i{font-style:normal;font-size:19px;line-height:1}
 #mkBottomBar button.on{color:#14283f;background:#eaf0f8}
 #mkMoreSheet{position:fixed;left:0;right:0;bottom:0;z-index:9100;background:#fff;border-radius:18px 18px 0 0;box-shadow:0 -10px 40px rgba(7,29,53,.3);padding:12px 12px calc(72px + env(safe-area-inset-bottom));direction:rtl;display:none;max-height:75vh;overflow:auto}
 #mkMoreSheet.open{display:grid;grid-template-columns:1fr 1fr;gap:8px}
 #mkMoreSheet button{border:1px solid #dbe5f1;background:#f7faff;border-radius:11px;padding:13px 8px;font:700 13px Tahoma,Arial,sans-serif;color:#14283f;cursor:pointer}
 #mkMoreScrim{position:fixed;inset:0;z-index:9050;background:rgba(4,17,33,.35);display:none}
 #mkMoreScrim.open{display:block}
 #mkSearchBtn{border:1px solid #d7e2ef;background:#f7faff;color:#14283f;border-radius:10px;padding:8px 13px;font:700 13px Tahoma,Arial,sans-serif;cursor:pointer;display:inline-flex;align-items:center;gap:6px}
 #mkRecent{margin:0 0 12px;padding:10px 12px;border:1px solid #dbe5f1;border-radius:12px;background:#fff;direction:rtl}
 #mkRecent b{font-size:12px;color:#51657d;display:block;margin-bottom:7px}
 #mkRecent .mk-chips{display:flex;gap:7px;overflow-x:auto;padding-bottom:2px}
 #mkRecent button{white-space:nowrap;border:1px solid #d7e2ef;background:#f7faff;border-radius:18px;padding:7px 13px;font:700 12px Tahoma,Arial,sans-serif;color:#14283f;cursor:pointer}
 #form .mk-addmore{margin-inline-start:8px}
 @media(max-width:760px){
  #mkBottomBar{display:flex}
  body{padding-bottom:68px}
  html body #mkHubBtn{bottom:76px}
  html body #mkHubMenu{bottom:128px}
  html body .footer-connection{bottom:78px!important}
  html body #mkFloatingNotifPanel{bottom:128px!important;max-height:58vh!important}
 }
 body:has(#mkMoreSheet.open) #mkHubBtn,body:has(#modal.show) #mkBottomBar,body:has(#modal.show) #mkHubBtn,body:has(#modal.show) #mkMoreSheet,body:has(#modal.show) #mkMoreScrim{display:none!important}
 @media print{#mkBottomBar,#mkMoreSheet,#mkSearchBtn,#mkRecent{display:none!important}}`;
 document.head.appendChild(st);

 /* 1) Back button: sections and client files get history entries; back closes an open form first. */
 let lastKey='',restoring=false,firstDone=false,closingByBack=false;
 const keyNow=()=>String(page)+'|'+(page==='clientProfile'?String(selectedClientNameV54||''):'');
 function pushIfChanged(){
  if(restoring)return;const k=keyNow();if(k===lastKey)return;lastKey=k;
  const s={mk:1,page:page,client:page==='clientProfile'?selectedClientNameV54:null};
  try{if(!firstDone){firstDone=true;history.replaceState(s,'');}else history.pushState(s,'');}catch(e){}
 }
 window.addEventListener('popstate',e=>{
  const modal=$id('modal');
  if(modal&&modal.classList.contains('show')){closingByBack=true;try{closeModal();}finally{closingByBack=false;}
   if(!(e.state&&e.state.mkModal)){/* we left the modal entry: stay on the same section */}
   return;}
  const s=e.state;if(!s||!s.mk||s.mkModal)return;
  restoring=true;
  try{if(s.page==='clientProfile'&&s.client){selectedClientNameV54=s.client;page='clientProfile';}else{page=s.page;}render();lastKey=keyNow();}
  catch(err){console.error('MAKTABY back',err);}finally{restoring=false;}
 });
 const baseRender=render;
 render=function(){const r=baseRender.apply(this,arguments);try{pushIfChanged();}catch(e){}try{afterRender();}catch(e){console.error('MAKTABY batch3 render',e);}return r;};
 /* opening a form adds one history entry so the back button closes it; closing it by buttons removes that entry */
 const baseOpenForm=openForm;
 openForm=function(){const r=baseOpenForm.apply(this,arguments);try{const m=$id('modal');if(m&&m.classList.contains('show')&&!(history.state&&history.state.mkModal))history.pushState({mk:1,mkModal:1,page:page},'');}catch(e){}return r;};
 const baseClose=closeModal;
 closeModal=function(){const __again=!!window.__mkAddAnother&&editingClientIndexV54===null,__t=formType;const r=baseClose.apply(this,arguments);try{if(!closingByBack&&history.state&&history.state.mkModal){closingByBack=true;history.back();setTimeout(()=>{closingByBack=false;},300);}}catch(e){}try{if(__again){window.__mkAddAnother=false;if(__t&&typeof fields==='object'&&fields[__t])setTimeout(()=>{try{openForm(__t);}catch(e){}},120);}}catch(e){}return r;};

 /* 2) Quick search: opens the existing command palette (works on phone). */
 function openSearch(){
  if(window.MAKTABY_COMMAND_PALETTE&&window.MAKTABY_COMMAND_PALETTE.open){window.MAKTABY_COMMAND_PALETTE.open();return;}
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true,cancelable:true}));
 }
 window.mkOpenSearch=openSearch;

 /* 4) Recent items (clients and cases), saved on this device only. */
 const RK='mk_recent_v1';
 const recents=()=>{try{return JSON.parse(localStorage.getItem(RK)||'[]');}catch(_){return [];}};
 function addRecent(it){try{const l=recents().filter(x=>!(x.t===it.t&&x.k===it.k));l.unshift(it);localStorage.setItem(RK,JSON.stringify(l.slice(0,5)));}catch(_){}}
 const baseOpenClient=openClientProfile;
 openClientProfile=function(name){try{if(name)addRecent({t:'client',k:String(name),l:String(name)});}catch(e){}return baseOpenClient.apply(this,arguments);};
 if(typeof window.selectCaseCompactV10==='function'){const baseSel=window.selectCaseCompactV10;window.selectCaseCompactV10=function(i){try{const c=(db.cases||[])[Number(i)];if(c&&c.number)addRecent({t:'case',k:String(c.number)+'|'+String(c.client||''),l:'قضية '+c.number+(c.client?' · '+c.client:'')});}catch(e){}return baseSel.apply(this,arguments);};}
 function openRecent(it){
  if(it.t==='client'){openClientProfile(it.k);return;}
  const [num,cl]=String(it.k).split('|');const i=(db.cases||[]).findIndex(c=>String(c.number)===num&&String(c.client||'')===cl);
  if(i<0){alert('هذه القضية لم تعد موجودة في القائمة.');return;}
  page='cases';window.selectCaseCompactV10?window.selectCaseCompactV10(i):render();
 }
 function paintRecent(){
  const app=$id('app');if(!app||page!=='dashboard')return;
  const old=$id('mkRecent');if(old)old.remove();
  const l=recents();if(!l.length)return;
  const d=document.createElement('div');d.id='mkRecent';d.innerHTML='<b>فتحتها مؤخرًا</b><div class="mk-chips"></div>';
  const chips=d.querySelector('.mk-chips');
  l.forEach(it=>{const b=document.createElement('button');b.type='button';b.textContent=(it.t==='client'?'👤 ':'⚖ ')+it.l;b.addEventListener('click',()=>openRecent(it));chips.appendChild(b);});
  app.insertBefore(d,app.firstChild);
 }

 /* 3) Bottom bar on phone, with the rest of the sections under "المزيد". */
 const MAIN=[['dashboard','الرئيسية','⌂'],['cases','القضايا','⚖'],['clients','العملاء','♟'],['tasks','المهام','▤']];
 let bar,sheet,scrim;
 function navBtn(p){return document.querySelector('#nav [data-page="'+p+'"]');}
 function closeMore(){sheet&&sheet.classList.remove('open');scrim&&scrim.classList.remove('open');}
 function buildBar(){
  if($id('mkBottomBar')||!document.body)return;
  bar=document.createElement('nav');bar.id='mkBottomBar';bar.setAttribute('aria-label','التنقل السريع');
  MAIN.forEach(([p,l,ic])=>{const b=document.createElement('button');b.type='button';b.dataset.p=p;b.innerHTML='<i aria-hidden="true">'+ic+'</i>'+l;b.addEventListener('click',()=>{closeMore();const n=navBtn(p);if(n)n.click();});bar.appendChild(b);});
  const s=document.createElement('button');s.type='button';s.innerHTML='<i aria-hidden="true">🔍</i>بحث';s.addEventListener('click',()=>{closeMore();openSearch();});bar.appendChild(s);
  const m=document.createElement('button');m.type='button';m.dataset.p='more';m.innerHTML='<i aria-hidden="true">☰</i>المزيد';m.addEventListener('click',()=>{if(sheet.classList.contains('open')){closeMore();return;}buildSheet();sheet.classList.add('open');scrim.classList.add('open');});bar.appendChild(m);
  sheet=document.createElement('div');sheet.id='mkMoreSheet';scrim=document.createElement('div');scrim.id='mkMoreScrim';scrim.addEventListener('click',closeMore);
  document.body.append(scrim,sheet,bar);
 }
 function buildSheet(){
  sheet.innerHTML='';
  document.querySelectorAll('#nav button[data-page]').forEach(n=>{
   if(MAIN.some(x=>x[0]===n.dataset.page))return;
   if(getComputedStyle(n).display==='none')return;
   const b=document.createElement('button');b.type='button';b.textContent=(n.textContent||'').trim();b.addEventListener('click',()=>{closeMore();n.click();});sheet.appendChild(b);
  });
 }
 function paintBar(){if(!bar)return;bar.querySelectorAll('button[data-p]').forEach(b=>{const p=b.dataset.p;b.classList.toggle('on',p===page||(p==='clients'&&page==='clientProfile'));});}
 function mountSearchBtn(){
  if($id('mkSearchBtn'))return;const top=document.querySelector('.reference-topbar');if(!top)return;
  const b=document.createElement('button');b.type='button';b.id='mkSearchBtn';b.innerHTML='🔍 <span>بحث سريع</span>';b.setAttribute('aria-label','بحث سريع عن موكل أو قضية أو قسم');b.addEventListener('click',openSearch);top.appendChild(b);
 }
 function afterRender(){buildBar();paintBar();mountSearchBtn();paintRecent();}

 /* 5) Faster forms: focus first field, Enter moves to the next field, keyboard hints, save and add another. */
 const FORM_OK=new Set(['client','case','announcement','task','enumeration','transaction','income','expense']);
 function enhanceForm(){
  const root=$id('formFields');if(!root||root.dataset.mkFast==='1')return;root.dataset.mkFast='1';
  root.querySelectorAll('input[name="amount"]').forEach(i=>{i.setAttribute('inputmode','decimal');});
  root.querySelectorAll('input[name="phone"],input[name="phone2"]').forEach(i=>{i.setAttribute('inputmode','tel');i.setAttribute('autocomplete','tel');});
  root.querySelectorAll('input[name="nationalId"]').forEach(i=>i.setAttribute('inputmode','numeric'));
  const first=root.querySelector('input:not([type=hidden]):not([type=checkbox]):not([disabled]),select,textarea');
  if(first&&!first.value)setTimeout(()=>{try{first.focus({preventScroll:false});}catch(e){}},80);
  const form=$id('form');
  if(form&&!form.querySelector('.mk-addmore')&&FORM_OK.has(formType)&&editingClientIndexV54===null&&!(typeof editingCaseIndex!=='undefined'&&editingCaseIndex!==null)){
   const sub=form.querySelector('button[type=submit],button.goldbtn,button:not([type=button])');
   if(sub){const b=document.createElement('button');b.type='button';b.className='btn light mk-addmore';b.textContent='حفظ وإضافة آخر';
    b.addEventListener('click',()=>{window.__mkAddAnother=true;clearTimeout(window.__mkAddT);window.__mkAddT=setTimeout(()=>{window.__mkAddAnother=false;},5000);if(form.requestSubmit)form.requestSubmit(sub);else sub.click();});
    sub.after(b);}
  }
 }
 document.addEventListener('keydown',e=>{
  if(e.key!=='Enter'||e.shiftKey||e.ctrlKey||e.isComposing)return;
  const t=e.target;if(!t||!t.closest||!t.closest('#formFields'))return;
  if(t.tagName!=='INPUT'||t.hasAttribute('list'))return;
  const type=(t.getAttribute('type')||'text').toLowerCase();if(['button','submit','checkbox','radio','file'].includes(type))return;
  const all=[...document.querySelectorAll('#formFields input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([disabled]),#formFields select:not([disabled]),#formFields textarea:not([disabled])')].filter(x=>x.offsetParent!==null);
  const i=all.indexOf(t);if(i<0||i===all.length-1)return;
  e.preventDefault();all[i+1].focus();
 },true);
 const mo=new MutationObserver(()=>{const m=$id('modal');if(m&&m.classList.contains('show')){const r=$id('formFields');if(r&&r.dataset.mkFast!=='1')enhanceForm();}else{const r=$id('formFields');if(r)r.dataset.mkFast='';}});
 function startFormWatch(){const m=$id('modal');if(m)mo.observe(m,{attributes:true,attributeFilter:['class']});const f=$id('formFields');if(f)mo.observe(f,{childList:true});}

 /* 6) Desktop shortcuts: "/" opens search; G then H/C/L/T goes home/cases/clients/tasks. */
 let gAt=0;
 document.addEventListener('keydown',e=>{
  if(e.ctrlKey||e.metaKey||e.altKey)return;const t=e.target;
  if(t&&(t.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)))return;
  const m=$id('modal');if(m&&m.classList.contains('show'))return;
  if(typeof currentUser==='undefined'||!currentUser)return;
  const k=e.key.toLowerCase();
  if(k==='/'){e.preventDefault();openSearch();return;}
  if(k==='g'){gAt=Date.now();return;}
  if(Date.now()-gAt<1200){const map={h:'dashboard',c:'cases',l:'clients',t:'tasks'};if(map[k]){gAt=0;const n=navBtn(map[k]);if(n&&getComputedStyle(n).display!=='none'){e.preventDefault();n.click();}}}
 });

 document.addEventListener('invalid',()=>{window.__mkAddAnother=false;},true);
 function start(){startFormWatch();setInterval(()=>{try{buildBar();paintBar();mountSearchBtn();startFormWatch();}catch(e){}},2000);}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();

/* Task KPIs fix: count archived tasks in the tasks page numbers (done tasks move to the archive automatically). */
(function(){
 if(window.__mkTaskKpiFix)return;window.__mkTaskKpiFix=true;
 function fix(){
  try{
   if(page!=='tasks')return;
   const done=document.querySelector('.task-kpi-done strong');
   if(!done||done.dataset.mkFixed)return;
   const total=document.querySelector('.task-kpi-total strong');
   const q=String(window.taskSearch||'').trim().toLocaleLowerCase('ar');
   const arch=(db.taskArchive||[]).filter(x=>!q||[x.task,x.client,x.court,x.assignee,x.status,x.priority,x.source,x.notes].some(v=>String(v||'').toLocaleLowerCase('ar').includes(q))).length;
   if(!arch)return;
   const d=(parseInt(done.textContent,10)||0)+arch,t=(parseInt(total.textContent,10)||0)+arch;
   done.textContent=d;done.dataset.mkFixed='1';total.textContent=t;
   const em=done.parentElement.querySelector('em');if(em)em.textContent='منها '+arch+' في الأرشيف';
   const te=total.parentElement.querySelector('em');if(te)te.textContent='تشمل المؤرشفة';
   const pct=t?Math.round(d/t*100):0;
   const ps=document.querySelector('.task-progress-heading>strong');if(ps)ps.textContent=pct+'%';
   const bar=document.querySelector('.task-progress-track i');if(bar)bar.style.width=pct+'%';
  }catch(e){}
 }
 const prev=render;
 render=function(){const r=prev.apply(this,arguments);fix();return r;};
})();

/* ===== MAKTABY Batch 4: faster start + cleaner numbers ===== */
(function(){
 if(window.__mkBatch4)return;window.__mkBatch4=true;
 /* Latin digits in every Arabic date/time/number the app prints, so numbers look the same everywhere. */
 try{
  const fix=l=>{if(l===undefined||l===null)return l;const s=String(Array.isArray(l)?l[0]:l);if(!/^ar/i.test(s)||/-nu-/.test(s))return l;return s+(/-u-/.test(s)?'':'-u')+'-nu-latn';};
  ['toLocaleDateString','toLocaleTimeString','toLocaleString'].forEach(m=>{const o=Date.prototype[m];Date.prototype[m]=function(l,...r){return o.call(this,fix(l),...r);};});
  const on=Number.prototype.toLocaleString;Number.prototype.toLocaleString=function(l,...r){return on.call(this,fix(l),...r);};
  const d=new Date(),w=document.getElementById('topWeekday'),f=document.getElementById('topFullDate');
  if(w)w.textContent=d.toLocaleDateString('ar-EG',{weekday:'long'});
  if(f)f.textContent=d.toLocaleDateString('ar-EG',{day:'numeric',month:'long',year:'numeric'});
 }catch(_){}
 /* Instant start: a returning, still-signed-in user sees the last saved office data at once, while the live data loads in the background. */
 const PK='mkProfileCache1';
 const wipe=()=>{try{localStorage.removeItem(PK);}catch(_){}};
 let provisional=false;
 const banner=(on)=>{let b=document.getElementById('mkSyncBanner');if(!on){if(b)b.remove();return;}if(!b){b=document.createElement('div');b.id='mkSyncBanner';b.textContent='جارٍ تحديث بيانات المكتب… التعديل يتاح خلال ثوانٍ';b.style.cssText='position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:9999;background:#14283f;color:#fff;font-size:12px;padding:5px 14px;border-radius:0 0 10px 10px;box-shadow:0 2px 8px #0003';document.body.appendChild(b);}};
 try{
  const prev=loadCloudState;
  loadCloudState=async function(){
   const r=await prev.apply(this,arguments);try{performance.mark('mk-cloud-load-done');}catch(_){}
   try{if(currentUser&&currentUser.id)localStorage.setItem(PK,JSON.stringify({id:currentUser.id,name:currentUser.name,role:currentUser.role}));}catch(_){}
   if(provisional){provisional=false;banner(false);}
   return r;
  };
  const guard=(name)=>{const o=window[name];if(typeof o!=='function')return;window[name]=function(){if(provisional)throw new Error('جارٍ تحديث بيانات المكتب. انتظر ثواني ثم أعد المحاولة.');return o.apply(this,arguments);};};
  ['openForm','save','saveCloudState'].forEach(guard);
  const lo=logout;logout=async function(){const r=await lo.apply(this,arguments);if(!currentUser)wipe();return r;};
  if(window.sb&&sb.auth&&sb.auth.onAuthStateChange)sb.auth.onAuthStateChange(ev=>{if(ev==='SIGNED_OUT')wipe();});
 }catch(_){}
 (async function(){
  try{
   let p=null;try{p=JSON.parse(localStorage.getItem(PK)||'null');}catch(_){}
   if(!p||!p.id||!window.sb||!localStorage.getItem(STORAGE_KEY))return;
   const {data:{session}}=await sb.auth.getSession();
   if(!session||session.user.id!==p.id){wipe();return;}
   if(currentUser)return;
   currentUser={id:p.id,email:session.user.email,name:p.name,role:p.role};
   provisional=true;
   if($('#topUserName'))$('#topUserName').textContent=currentUser.name;
   $('#loginScreen').style.display='none';
   $('#userBadge').innerHTML=esc(currentUser.name)+' — <a href="#" onclick="logout();return false" style="color:inherit">خروج</a>';
   $('#importBtn').style.display=isAdmin()?'inline-block':'none';$('#backupBtn').style.display=isAdmin()?'inline-block':'none';
   if($('#recoveryBackupBtn'))$('#recoveryBackupBtn').style.display=isAdmin()?'inline-block':'none';
   if($('#recoveryHealthBtn'))$('#recoveryHealthBtn').style.display=isAdmin()?'inline-block':'none';
   $('#syncBtn').style.display=canManageOffice()?'inline-block':'none';
   banner(true);render();try{performance.mark('mk-instant-render');}catch(_){}
   /* If the live load has not finished in 25s (offline, expired, or account disabled), fall back to the normal screen. */
   setTimeout(()=>{if(provisional){provisional=false;banner(false);}},25000);
  }catch(_){}
 })();
})();

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
 const nk=s=>String(s==null?'':s).replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();
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
 const nk=s=>String(s==null?'':s).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[أإآٱ]/g,'ا').replace(/ى/g,'ي').replace(/ة/g,'ه').replace(/^(ا\.|ا\s)\s*/,'').replace(/\./g,' ').replace(/\s+/g,' ').trim();
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
