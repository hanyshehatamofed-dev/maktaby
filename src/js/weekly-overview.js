/* MAKTABY PRO 10.9.1 — isolated seven-day dashboard overview. */
(function(g){
 'use strict';
 if(g.MAKTABY_WEEKLY_OVERVIEW_109)return;
 function render({todayKey,allCases,openTasks,safeDate,sessionCount}){
  const weekDays=Array.from({length:7},(_,i)=>{const d=new Date(todayKey+'T00:00:00');d.setDate(d.getDate()+i);const key=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');return {key,label:i===0?'اليوم':d.toLocaleDateString('ar-EG',{weekday:'short'}),sessions:allCases.filter(c=>String(c.date||'').slice(0,10)===key).length,tasks:openTasks.filter(t=>String(t.date||'').slice(0,10)===key).length};});
  const weekHtml=weekDays.map(d=>`<button type="button" class="mk-week-day ${d.key===todayKey?'is-today':''}" data-ref-go="${d.sessions?'cases':'tasks'}" aria-label="${d.label}: ${d.sessions} جلسة و${d.tasks} مهمة"><b>${d.label}</b><small>${safeDate(d.key)}</small><span><i>⚖ ${d.sessions}</i><i>✓ ${d.tasks}</i></span></button>`).join('');
  return `<section class="mk-week-overview" aria-label="نظرة الأسبوع"><div class="mk-week-head"><div><b>نظرة الأسبوع</b><small>توزيع الجلسات والمهام خلال الأيام السبعة القادمة</small></div><strong>${sessionCount} جلسة</strong></div><div class="mk-week-grid">${weekHtml}</div></section>`;
 }
 Object.defineProperty(g,'MAKTABY_WEEKLY_OVERVIEW_109',{value:Object.freeze({render}),writable:false,configurable:false});
})(window);
