/* MAKTABY PRO 10.9.1 — isolated task completion/archive lifecycle. */
(function(g){
 'use strict';
 if(g.MAKTABY_TASK_ARCHIVE_109)return;
 function archiveCompletedTask(task,sourceIndex,ctx){
  const {db,today,ensureTaskIdentity,recordTaskHistory,isCompleted,actor='الإدارة'}=ctx||{};
  if(!task||!db||!isCompleted?.(task.status))return false;
  task.status='تم التنفيذ';
  db.taskArchive=Array.isArray(db.taskArchive)?db.taskArchive:[];
  db.achievements=Array.isArray(db.achievements)?db.achievements:[];
  const completedAt=task.completionDate||today(),now=new Date().toISOString();
  task.completionDate=completedAt;task.completionNote=String(task.completionNote||task.notes||'').trim();
  task.completedBy=String(task.completedBy||task.assignee||actor||'غير محدد');task.archivedAt=task.archivedAt||now;
  const sourceRow=Number.isInteger(sourceIndex)?db.tasks[sourceIndex]:null;
  const taskId=ensureTaskIdentity(task);
  if(sourceRow&&!sourceRow._id&&!sourceRow.id)sourceRow._id=taskId;
  const legacyKey=x=>[x?.task||'',x?.client||'',x?.court||'',x?.date||'',x?.assignee||''].map(v=>String(v).trim()).join('|');
  const archiveIndex=db.taskArchive.findIndex(x=>String(x?._id||x?.id||'')===taskId||(!x?._id&&!x?.id&&legacyKey(x)===legacyKey(task)));
  if(archiveIndex<0)recordTaskHistory(task,'أرشفة تلقائية بعد تحديد الحالة تم التنفيذ',{status:{to:'تم التنفيذ'},completionDate:completedAt},actor);
  if(archiveIndex>=0){const old=db.taskArchive[archiveIndex];task._id=old._id||old.id||taskId;db.taskArchive[archiveIndex]={...old,...task};}
  else db.taskArchive.unshift({...task});
  const achievementKey='task-completion:'+taskId+':'+completedAt;
  if(!db.achievements.some(a=>a.requestId===achievementKey))db.achievements.push({requestId:achievementKey,employee:task.completedBy,kind:'مهمة',subject:[task.client||'',task.task||'مهمة مكتبية',task.court||''].filter(Boolean).join(' | '),date:completedAt,details:task.completionNote||'تم إنهاء المهمة وأرشفتها تلقائيًا.',approvedBy:actor||'الإدارة',approvedAt:now,source:'task_completion',taskKey:taskId});
  let idx=-1;
  if(sourceRow&&(sourceRow===task||String(sourceRow._id||sourceRow.id||'')===taskId))idx=sourceIndex;
  if(idx<0)idx=db.tasks.findIndex(x=>String(x?._id||x?.id||'')===taskId);
  if(idx<0){const matches=[];db.tasks.forEach((x,i)=>{if(legacyKey(x)===legacyKey(task))matches.push(i);});if(matches.length===1)idx=matches[0];}
  if(idx>=0)db.tasks.splice(idx,1);
  return true;
 }
 Object.defineProperty(g,'MAKTABY_TASK_ARCHIVE_109',{value:Object.freeze({archiveCompletedTask}),writable:false,configurable:false});
})(window);
