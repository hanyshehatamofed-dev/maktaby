/* MAKTABY PRO 10.9.0 — Voice-to-Case Notes (review-before-save).
 * Browser speech recognition is optional; transcript is never auto-saved.
 * Applying notes uses the existing session save/approval workflow.
 */
(function () {
  'use strict';
  if (window.__maktabyVoiceCaseNotes109) return;
  window.__maktabyVoiceCaseNotes109 = true;
  const escV = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let recognition = null;
  let stopTimer = 0;
  let listening = false;
  function caseRows() {
    try { return (db.cases || []).filter(c => !c.archived); } catch (_) { return []; }
  }
  function mount() {
    if (typeof page === 'undefined' || page !== 'cases') return;
    const app = document.getElementById('app');
    if (!app || app.querySelector('#maktabyVoiceNotes109')) return;
    const rows = caseRows();
    if (!rows.length) return;
    const panel = document.createElement('section');
    panel.id = 'maktabyVoiceNotes109';
    panel.className = 'panel';
    panel.style.cssText = 'margin:10px 0 14px;padding:14px;border:1px solid #d8dee7;border-radius:14px;background:#fff';
    panel.innerHTML = `<div class="pagehead" style="margin:0 0 10px"><div><h2 style="margin:0">🎙️ ملاحظات الجلسة بالصوت</h2><div class="sub">سجّل ملخصًا حتى 30 ثانية، راجع النص ثم طبّقه على سجل الجلسة من خلال مسار الحفظ والاعتماد المعتاد.</div></div><span class="badge">تجريبي</span></div>
      <div class="formgrid"><label>اختر القضية<select id="maktabyVoiceCase109"><option value="">اختر القضية</option>${rows.map((c,i)=>`<option value="${escV(c.caseId||c.id||i)}">${escV(c.number||'بلا رقم')} — ${escV((c.clients||[c.client]).filter(Boolean).join('، ')||'موكل غير محدد')} — ${escV(c.court||'')}</option>`).join('')}</select></label>
      <label>تاريخ الجلسة القادمة (اختياري)<input id="maktabyVoiceNextDate109" type="date"></label></div>
      <div class="actions" style="margin:10px 0"><button class="btn goldbtn" id="maktabyVoiceStart109" type="button">بدء التسجيل الصوتي (30 ثانية)</button><button class="btn light" id="maktabyVoiceStop109" type="button" disabled>إيقاف التسجيل</button><span id="maktabyVoiceStatus109" class="muted" aria-live="polite">جاهز للتسجيل</span></div>
      <label style="display:block;margin:8px 0">النص المستخرج — راجعه وصححه<textarea id="maktabyVoiceTranscript109" rows="3" maxlength="5000" placeholder="سيظهر النص هنا، ويمكنك كتابته أو تصحيحه يدويًا"></textarea></label>
      <label style="display:block;margin:8px 0">المطلوب تنفيذه (اختياري)<input id="maktabyVoiceAction109" type="text" maxlength="1000" placeholder="مثال: تقديم أصل المستند / إعلان الخصم"></label>
      <div class="actions"><button class="btn goldbtn" id="maktabyVoiceApply109" type="button">مراجعة وتطبيق على سجل الجلسة</button><button class="btn light" id="maktabyVoiceClear109" type="button">مسح النص</button></div>
      <p class="muted" style="font-size:11px;margin:8px 0 0">الخصوصية: لا يُحفظ التسجيل الصوتي. خدمة التعرف على الكلام تعتمد على دعم المتصفح وقد تعالج الصوت عبر خدمة خارجية؛ لا تسجل بيانات سرية إلا بعد مراعاة سياسة المكتب. لا يتم الحفظ تلقائيًا؛ يلزم مراجعة النص والضغط على تطبيق.</p>`;
    const head = app.querySelector('.pagehead');
    (head || app.firstChild)?.insertAdjacentElement('afterend', panel) || app.prepend(panel);
    const status = panel.querySelector('#maktabyVoiceStatus109');
    const start = panel.querySelector('#maktabyVoiceStart109');
    const stop = panel.querySelector('#maktabyVoiceStop109');
    const transcript = panel.querySelector('#maktabyVoiceTranscript109');
    const setStatus = text => { if (status) status.textContent = text; };
    const stopRecognition = () => {
      clearTimeout(stopTimer);
      if (recognition && listening) { try { recognition.stop(); } catch (_) {} }
      listening = false; start.disabled = false; stop.disabled = true;
    };
    start.addEventListener('click', () => {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) { setStatus('التعرف الصوتي غير مدعوم في هذا المتصفح؛ اكتب النص يدويًا.'); return; }
      if (!panel.querySelector('#maktabyVoiceCase109').value) { setStatus('اختر القضية أولًا.'); return; }
      try {
        recognition = new SpeechRecognition();
        recognition.lang = 'ar-EG'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
        let finalText = transcript.value.trim();
        recognition.onresult = event => {
          let interim = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const part = event.results[i][0]?.transcript || '';
            if (event.results[i].isFinal) finalText += (finalText ? ' ' : '') + part;
            else interim += part;
          }
          transcript.value = (finalText + (interim ? ' ' + interim : '')).trim().slice(0, 5000);
        };
        recognition.onerror = event => setStatus('تعذر التعرف الصوتي: ' + (event.error || 'خطأ غير معروف') + '. يمكنك كتابة النص يدويًا.');
        recognition.onend = () => { listening = false; start.disabled = false; stop.disabled = true; clearTimeout(stopTimer); if (status && status.textContent === 'جارٍ الاستماع…') setStatus('انتهى التسجيل؛ راجع النص قبل التطبيق.'); };
        recognition.start(); listening = true; start.disabled = true; stop.disabled = false; setStatus('جارٍ الاستماع…');
        stopTimer = setTimeout(stopRecognition, 30000);
      } catch (error) { setStatus('تعذر بدء التسجيل: ' + (error.message || error)); }
    });
    stop.addEventListener('click', stopRecognition);
    panel.querySelector('#maktabyVoiceClear109').addEventListener('click', () => { transcript.value = ''; panel.querySelector('#maktabyVoiceAction109').value = ''; panel.querySelector('#maktabyVoiceNextDate109').value = ''; setStatus('تم مسح المسودة.'); });
    panel.querySelector('#maktabyVoiceApply109').addEventListener('click', async () => {
      stopRecognition();
      const key = panel.querySelector('#maktabyVoiceCase109').value;
      const text = transcript.value.trim();
      const action = panel.querySelector('#maktabyVoiceAction109').value.trim();
      const nextDate = panel.querySelector('#maktabyVoiceNextDate109').value;
      if (!key) return alert('اختر القضية أولًا.');
      if (!text && !action && !nextDate) return alert('لا توجد ملاحظات أو بيانات لتطبيقها.');
      const list = caseRows();
      const c = list.find((x,i) => String(x.caseId||x.id||i) === String(key));
      if (!c) return alert('القضية لم تعد موجودة في القائمة؛ أعد تحميل الصفحة.');
      const index = db.cases.indexOf(c);
      if (index < 0) return alert('تعذر تحديد سجل القضية بأمان.');
      const decision = [text ? 'ملخص الجلسة (مفرغ صوتيًا بعد المراجعة): ' + text : '', action ? 'المطلوب تنفيذه: ' + action : ''].filter(Boolean).join('\n');
      const decisionInput = document.getElementById('decision_' + index);
      const nextInput = document.getElementById('next_' + index);
      if (!decisionInput || !nextInput) return alert('حقول القضية غير متاحة. أعد فتح صفحة القضايا وحاول مرة أخرى.');
      if (decisionInput.disabled || nextInput.disabled) return alert('لا تملك صلاحية تعديل هذه الجلسة.');
      if (decision) decisionInput.value = [decisionInput.value.trim(), decision].filter(Boolean).join('\n\n');
      if (nextDate) nextInput.value = nextDate;
      if (typeof window.saveSessionUpdate !== 'function') return alert('مسار حفظ الجلسة غير متاح؛ لم يتم حفظ أي تغيير.');
      const ok = confirm('سيتم إرسال/حفظ ملخص الجلسة عبر مسار الجلسات المعتاد. إذا كان حسابك موظفًا فسيُرسل طلب اعتماد للإدارة. هل تريد المتابعة؟');
      if (!ok) return;
      await window.saveSessionUpdate(index);
      setStatus('تم إرسال البيانات إلى مسار الحفظ المعتاد. تحقق من حالة المزامنة أو طلب الاعتماد.');
    });
  }

  // Executive Voice-to-Action Engine: deterministic parsing, explicit review, and existing save/approval paths.
  let voiceWorker=null,voiceWorkerSeq=0;const voiceWorkerPending=new Map();
  function requestVoiceParse(text,caseRow){return new Promise((resolve,reject)=>{try{if(!window.Worker)throw new Error('Web Worker غير مدعوم');if(!voiceWorker){voiceWorker=new Worker(new URL('js/maktaby-compute-worker.10443361e180.js',document.baseURI));voiceWorker.onmessage=e=>{const m=e.data||{},p=voiceWorkerPending.get(m.id);if(!p)return;voiceWorkerPending.delete(m.id);m.error?p.reject(new Error(m.error)):p.resolve(m.result);};voiceWorker.onerror=()=>{for(const p of voiceWorkerPending.values())p.reject(new Error('تعذر تشغيل محرك التحليل بالخلفية'));voiceWorkerPending.clear();voiceWorker=null;};}const id=++voiceWorkerSeq;voiceWorkerPending.set(id,{resolve,reject});voiceWorker.postMessage({id,op:'voiceParse',payload:{text,caseRow,today:(typeof today==='function'?today():new Date().toLocaleDateString('en-CA'))}});}catch(error){reject(error);}});}
  function stableVoiceOperationId(parts) {
    const input=JSON.stringify(parts);let hash=2166136261;for(let i=0;i<input.length;i++){hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619);}return 'va-'+(hash>>>0).toString(16);
  }
  function voiceWalletBalance(employeeId) {
    const rows=Array.isArray(db?.walletTransactions)?db.walletTransactions:[];
    return rows.filter(x=>String(x.employee_id||'')===String(employeeId)).reduce((sum,x)=>sum+(String(x.entry_type)==='credit'?1:-1)*(Number(x.amount)||0),0);
  }
  function ensureVoiceActionPanel(caseRow,index,button) {
    let panel=document.getElementById('mkVoiceActionPanel109');
    if(!panel){panel=document.createElement('section');panel.id='mkVoiceActionPanel109';panel.style.cssText='margin:14px 0;padding:15px;border:1px solid #cbd6e2;border-radius:14px;background:#fff;color:#17324f;direction:rtl';const body=document.querySelector('#mkCourtBody');const hint=body?.querySelector('.mkCourtHint');if(body)body.insertBefore(panel,hint||null);}
    panel.dataset.caseKey=String(caseRow.caseId||caseRow.id||'');panel.dataset.caseIndex=String(index);
    panel.innerHTML=`<div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><div><h3 style="margin:0 0 4px">🎙️ السكرتير الصوتي التنفيذي</h3><small style="color:#66788a">${escV(caseRow.client||'موكل متعدد')} — قضية ${escV(caseRow.number||'—')}</small></div><button type="button" id="mkVoiceClose109" class="btn light">إغلاق</button></div>
      <p style="font-size:12px;color:#66788a;line-height:1.7;margin:9px 0">قل الأمر باللهجة المصرية، ثم راجع الخطة قبل التنفيذ. مثال: «تأجيل قضية حنا لجلسة 15 يناير لتقديم المستندات وصرف 200 جنيه انتقالات».</p>
      <textarea id="mkVoiceTranscriptAction109" rows="3" maxlength="1200" style="width:100%;box-sizing:border-box;padding:11px;border:1px solid #cbd5e1;border-radius:9px" placeholder="اكتب الأمر هنا أو استخدم الميكروفون"></textarea>
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin:9px 0"><button type="button" id="mkVoiceListen109" class="btn goldbtn">🎙️ ابدأ الاستماع</button><button type="button" id="mkVoiceAnalyze109" class="btn light">تحليل الأمر</button><span id="mkVoiceStatusAction109" role="status" aria-live="polite" style="align-self:center;font-size:12px;color:#66788a">جاهز</span></div>
      <div id="mkVoicePlan109"></div><p style="font-size:11px;color:#748397;margin:9px 0 0">لا يُحفظ الصوت. قد يعالج المتصفح الصوت عبر خدمة التعرف التابعة له. لا تُنفذ أي خطوة قبل مراجعة الخطة والتأكيد. المصروف يظل معلقًا ولا يُخصم من العهدة إلا بعد اعتماد الإدارة من شاشة المصروفات.</p>`;
    panel.querySelector('#mkVoiceClose109').onclick=()=>panel.remove();
    const transcript=panel.querySelector('#mkVoiceTranscriptAction109');
    const status=panel.querySelector('#mkVoiceStatusAction109');
    const planHost=panel.querySelector('#mkVoicePlan109');
    let parsed=null, operationId='';
    const analyze=async()=>{
      status.textContent='جارٍ تحليل الأمر في الخلفية…';
      try{parsed=await requestVoiceParse(transcript.value,caseRow);}catch(error){status.textContent='تعذر تشغيل التحليل بالخلفية: '+(error.message||error)+'. افتح النظام من رابط HTTPS ثم أعد المحاولة.';return;}
      if(parsed.error){planHost.innerHTML=`<div role="alert" style="padding:10px;border-radius:9px;background:#fff2f0;color:#9b2c2c">${escV(parsed.error)}</div>`;return;}
      const clients=parsed.clientNames;
      const balance=voiceWalletBalance(currentUser?.id);
      const expenseHtml=parsed.expense?`<div style="margin-top:8px;padding:10px;background:#fff8e8;border-radius:9px"><b>3) مصروف على حساب الموكل</b><div>المبلغ بالجنيه: <input id="mkVoiceExpenseAmount109" type="number" min="0.01" step="0.01" value="${escV(parsed.expense.amount)}"></div><div>بند المصروف: <select id="mkVoiceExpenseType109"><option>انتقالات</option><option>تصوير</option><option>رسوم محكمة</option><option>رسوم إعلان</option><option>خبير</option><option>تنفيذ</option><option>مصروفات أخرى</option></select></div><div style="font-size:12px">الموكل: يُرحّل إلى الاتفاق المختار عند اعتماد الإدارة. رصيد عهدتك الحالي: ${balance.toLocaleString('en-US')} جنيه.</div><div style="font-size:11px;color:#805d16">لن يتم الخصم الآن؛ الخصم يتم فقط بعد اعتماد المصروف بالطريقة المحاسبية الحالية.</div></div>`:'';
      planHost.innerHTML=`<div style="border:1px solid #dbe3eb;border-radius:11px;padding:12px;margin-top:8px"><h4 style="margin:0 0 8px">مراجعة الإجراءات المقترحة</h4><label style="display:block;margin:7px 0">الموكل المرتبط بالمصروف<select id="mkVoiceClient109" style="width:100%;padding:9px;border:1px solid #cbd5e1;border-radius:8px">${clients.map(n=>`<option value="${escV(n)}">${escV(n)}</option>`).join('')}</select></label><div style="padding:9px;background:#f2f6fa;border-radius:8px;margin:7px 0"><b>1) تحديث الجلسة</b><div>التاريخ الجديد: <input id="mkVoiceNextDateAction109" type="date" value="${escV(parsed.nextDate)}"></div><div>القرار: تأجيل</div></div><div style="padding:9px;background:#f2f6fa;border-radius:8px;margin:7px 0"><b>2) إنشاء مهمة قبل الجلسة بأسبوع</b><div>المهمة: <input id="mkVoiceTaskText109" type="text" maxlength="250" value="${escV(parsed.purpose)}" style="width:100%;box-sizing:border-box;padding:8px;margin:5px 0;border:1px solid #cbd5e1;border-radius:7px"></div><div>موعد المهمة: <input id="mkVoiceTaskDate109" type="date" value="${escV(parsed.taskDate)}"></div></div>${expenseHtml}<div style="font-size:11px;color:#66788a;margin-top:8px">سيُنشأ معرّف آمن للعملية بعد اعتماد البيانات لمنع تكرارها.</div><button type="button" id="mkVoiceApply109" class="btn goldbtn" style="width:100%;margin-top:10px">مراجعة نهائية وتنفيذ الإجراءات</button><div id="mkVoiceProgress109" aria-live="polite" style="margin-top:8px;font-size:12px"></div></div>`;
      const expenseType=panel.querySelector('#mkVoiceExpenseType109');if(expenseType&&parsed.expense)expenseType.value=parsed.expense.category;
      panel.querySelector('#mkVoiceApply109').onclick=()=>apply();
      status.textContent='تم التحليل؛ راجع كل البيانات قبل التنفيذ.';
    };
    async function apply(){
      const nextDate=panel.querySelector('#mkVoiceNextDateAction109')?.value||'';
      const taskDate=panel.querySelector('#mkVoiceTaskDate109')?.value||'';
      const taskText=panel.querySelector('#mkVoiceTaskText109')?.value.trim()||'';
      const clientName=panel.querySelector('#mkVoiceClient109')?.value||'';
      const expense=parsed?.expense?{amount:Number(panel.querySelector('#mkVoiceExpenseAmount109')?.value),category:panel.querySelector('#mkVoiceExpenseType109')?.value||parsed.expense.category}:null;
      const todayKey=voiceToday();
      operationId=stableVoiceOperationId([parsed.caseKey,nextDate,taskDate,taskText,clientName,expense?.amount||0,expense?.category||'']);
      if(!nextDate||nextDate<=todayKey)return alert('تاريخ الجلسة يجب أن يكون تاريخًا مستقبليًا صحيحًا.');
      if(!taskText||!taskDate||taskDate<todayKey||taskDate>nextDate)return alert('راجع المهمة وموعدها؛ يجب أن يكون موعد المهمة اليوم أو بعده وقبل الجلسة. إذا كانت الجلسة خلال أقل من أسبوع، عدّل الموعد يدويًا.');
      const currentCase=(db.cases||[]).find(x=>String(x.caseId||x.id||'')===String(parsed.caseKey));
      if(!currentCase)return alert('القضية لم تعد موجودة في القائمة؛ لم يبدأ التنفيذ.');
      if(nextDate<=String(currentCase.date||''))return alert('تاريخ الجلسة الجديدة يجب أن يكون بعد تاريخ الجلسة الحالية.');
      const client= (db.clients||[]).find(x=>voiceNorm(x.name)===voiceNorm(clientName));
      if(!client)return alert('اسم الموكل غير مطابق لملف عميل مسجل؛ لم يبدأ التنفيذ.');
      if(!window.saveSessionUpdate||typeof saveCloudState!=='function'||!Array.isArray(db.tasks))return alert('مسارات الحفظ الحالية غير متاحة؛ لم يبدأ التنفيذ.');
      let userId=currentUser?.id;
      if(expense){
        if(!Number.isFinite(expense.amount)||expense.amount<=0)return alert('أدخل قيمة مصروف صحيحة أكبر من صفر.');
        if(!userId||!window.sb&&!((typeof sb!=='undefined')&&sb))return alert('جلسة الدخول غير متاحة لتسجيل المصروف.');
        const balance=voiceWalletBalance(userId);
        if(!Array.isArray(db.walletTransactions)||balance<expense.amount)return alert(`رصيد العهدة المتاح (${balance.toLocaleString('en-US')} جنيه) أقل من المصروف المطلوب (${expense.amount} جنيه)، أو لم يتم تحميل رصيد العهدة. لم يبدأ التنفيذ.`);
      }
      if(!confirm(`سيتم تنفيذ الإجراءات على القضية ${currentCase.number||''}:\n1) ترحيل الجلسة إلى ${nextDate}.\n2) إنشاء مهمة «${taskText}» بتاريخ ${taskDate}.\n${expense?`3) تسجيل مصروف ${expense.amount} جنيه على حساب ${clientName} كطلب معلق؛ والخصم من عهدتك بعد اعتماد الإدارة.\n`:''}\nهل راجعت البيانات وتؤكد التنفيذ؟`))return;
      const progress=panel.querySelector('#mkVoiceProgress109');const setProgress=t=>{if(progress)progress.textContent=t;};
      const stableKey=String(currentCase.caseId||currentCase.id||'');
      const currentIndex=db.cases.findIndex(x=>String(x.caseId||x.id||'')===stableKey);
      const sourceId=operationId;
      const historyDone=(currentCase.history||[]).some(h=>String(h?.sourceId||'')===sourceId);
      if(!historyDone){
        const host=document.createElement('div');host.style.display='none';host.innerHTML=`<input id="next_${currentIndex}"><input id="reason_${currentIndex}"><input id="decision_${currentIndex}"><input id="voice_action_${currentIndex}">`;document.body.appendChild(host);
        host.querySelector('#next_'+currentIndex).value=nextDate;host.querySelector('#reason_'+currentIndex).value=taskText;host.querySelector('#decision_'+currentIndex).value='تأجيل';host.querySelector('#voice_action_'+currentIndex).value=sourceId;
        setProgress('1/3 — جارٍ حفظ قرار الجلسة…');let sessionOk=false;
        try{sessionOk=await window.saveSessionUpdate(currentIndex)===true;}finally{host.remove();}
        if(!sessionOk){setProgress('توقف التنفيذ عند الجلسة. راجع حالة المزامنة قبل إعادة المحاولة؛ لم نكمل بقية الإجراءات.');return;}
      }
      setProgress('1/3 — تم تحديث الجلسة.');
      const taskSourceKey='voice-action:'+operationId+':task';
      if(!(db.tasks||[]).some(t=>String(t.sourceKey||'')===taskSourceKey)){
        const task={_id:'task-'+operationId,sourceKey:taskSourceKey,source:'السكرتير الصوتي التنفيذي',sourceCaseId:stableKey,caseId:stableKey,caseNumber:String(currentCase.number||''),client:clientName,clients:parsed.clientNames,court:currentCase.court||'',task:taskText,date:taskDate,assignee:currentUser?.name||'',status:'مطلوب',priority:'عادية',createdAt:new Date().toISOString(),notes:'أُنشئت من أمر صوتي بعد المراجعة.'};
        if(typeof recordTaskHistoryV106==='function')recordTaskHistoryV106(task,'إنشاء صوتي',{task:task.task,date:task.date,sourceKey:task.sourceKey},currentUser?.name||'الإدارة');
        db.tasks.push(task);localStorage.setItem(STORAGE_KEY,JSON.stringify(db));
        try{await saveCloudState();}catch(error){setProgress('تم إنشاء المهمة محليًا، لكن تعذر تأكيد مزامنتها: '+(error?.message||error)+'. احتفظنا بمعرّف يمنع تكرارها؛ راجع الاتصال قبل أي إعادة محاولة.');return;}
      }
      setProgress('2/3 — تم إنشاء المهمة ومزامنتها.');
      if(expense){
        const marker='[MAKTABY_VOICE_ACTION:'+operationId+']';
        const description=`${expense.category} — ${currentCase.number?'القضية رقم '+currentCase.number+' — ':''}${marker} — ${taskText}`;
        const lookup=await sb.from('expenses').select('id').eq('employee_id',userId).eq('description',description).maybeSingle();
        if(lookup.error){setProgress('تم حفظ الجلسة والمهمة، لكن تعذر التحقق من عدم تكرار المصروف: '+lookup.error.message+'. أوقفنا التسجيل المالي للحماية.');return;}
        if(!lookup.data){
          const {data:{user},error:userError}=await sb.auth.getUser();
          if(userError||!user?.id||String(user.id)!==String(userId)){setProgress('تم حفظ الجلسة والمهمة، لكن تعذر مطابقة جلسة الدخول مع حساب العهدة. لم نسجل المصروف.');return;}
          const payload={client_name:String(client.name).trim(),expense_type:expense.category,description,amount:Number(expense.amount),expense_date:todayKey,employee_id:user.id,employee_name:currentUser?.name||'',approval_status:'pending'};
          const {error:insertError}=await sb.from('expenses').insert(payload);
          if(insertError){
            const retry=await sb.from('expenses').select('id').eq('employee_id',user.id).eq('description',payload.description).maybeSingle();
            if(retry.error||!retry.data){setProgress('تم حفظ الجلسة والمهمة، لكن تعذر تأكيد تسجيل المصروف: '+insertError.message+'. راجع شاشة المصروفات قبل إعادة المحاولة.');return;}
          }
        }
        setProgress('3/3 — تم تسجيل المصروف كطلب معلق. سيُخصم من العهدة بعد اعتماد الإدارة وربطه باتفاق الموكل.');
        try{await loadCloudState();}catch(refreshError){setProgress('تم تسجيل المصروف على السحابة، لكن تعذر تحديث العرض: '+(refreshError?.message||refreshError)+'. لا تكرر التسجيل.');}
      }else setProgress('3/3 — اكتملت الإجراءات المطلوبة (لا يوجد مبلغ مصروف في الأمر).');
      status.textContent='اكتمل تنفيذ الأمر الصوتي.';
      panel.querySelector('#mkVoiceApply109').disabled=true;
      panel.querySelector('#mkVoiceApply109').textContent='تم التنفيذ';
      try{window.MAKTABY_COURTROOM_MODE?.refresh?.();}catch(_){}
      alert('اكتملت الإجراءات التي أمكن حفظها. راجع سجل الجلسة والمهام. المصروف — إن وُجد — ما زال معلقًا حتى اعتماد الإدارة.');
    }
    panel.querySelector('#mkVoiceAnalyze109').onclick=analyze;
    panel.querySelector('#mkVoiceListen109').onclick=()=>{
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SR){status.textContent='التعرف الصوتي غير مدعوم هنا؛ اكتب الأمر في المربع ثم اضغط تحليل الأمر.';transcript.focus();return;}
      try{
        const rec=new SR();rec.lang='ar-EG';rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;
        panel.querySelector('#mkVoiceListen109').disabled=true;status.textContent='جارٍ الاستماع…';let finalText='';
        rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const part=e.results[i][0]?.transcript||'';if(e.results[i].isFinal)finalText+=part+' ';else interim+=part;}transcript.value=(finalText+interim).trim().slice(0,1200);};
        rec.onerror=e=>{status.textContent='تعذر التعرف الصوتي: '+(e.error||'خطأ')+'. يمكنك كتابة الأمر يدويًا.';};
        rec.onend=()=>{panel.querySelector('#mkVoiceListen109').disabled=false;status.textContent=transcript.value.trim()?'انتهى الاستماع؛ راجع النص ثم حلله.':'لم يتم التقاط كلام واضح؛ حاول مرة أخرى أو اكتب الأمر.';};
        rec.start();
      }catch(error){panel.querySelector('#mkVoiceListen109').disabled=false;status.textContent='تعذر بدء الميكروفون: '+(error?.message||error);}
    };
    panel.querySelector('#mkVoiceAnalyze109').onclick=analyze;
    panel.scrollIntoView({behavior:'smooth',block:'nearest'});
    if(button){button.textContent='🎙️ السكرتير الصوتي التنفيذي';}
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(SR)panel.querySelector('#mkVoiceListen109').click();else{status.textContent='التعرف الصوتي غير مدعوم؛ يمكنك كتابة الأمر يدويًا.';transcript.focus();}
  }
  window.MAKTABY_VOICE_ACTION_109={start:ensureVoiceActionPanel,parse:requestVoiceParse};

  const priorRender = window.render;
  if (typeof priorRender === 'function') {
    window.render = function () { const result = priorRender.apply(this, arguments); setTimeout(mount, 0); return result; };
  }
  document.addEventListener('click', event => {
    if (event.target.closest('#nav [data-page="cases"]')) setTimeout(mount, 50);
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 100));
  else setTimeout(mount, 100);
})();
