/* MAKTABY PRO 10.9.0 — durable local journal + safe expense outbox.
 * The service worker never receives auth tokens and never writes to Supabase.
 * Network writes are replayed by the authenticated page only.
 */
(function () {
  'use strict';
  const DB_NAME = 'maktaby-offline-10.9.0';
  const DB_VERSION = 1;
  const EXPENSE_TAG = 'maktaby-expense-outbox-10.9.0';
  const STATE_TAG = 'maktaby-state-outbox-10.9.0';
  const STORAGE_KEY = 'hanyLawDemoPreloaded20261030';
  let dbPromise;
  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB غير مدعوم'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('snapshots')) d.createObjectStore('snapshots', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('expenseOutbox')) d.createObjectStore('expenseOutbox', { keyPath: 'submission_key' });
        if (!d.objectStoreNames.contains('stateOutbox')) d.createObjectStore('stateOutbox', { keyPath: 'id' });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('تعذر فتح قاعدة البيانات المحلية'));
    });
    return dbPromise;
  }
  async function put(store, value) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).put(value);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('تعذر الحفظ المحلي'));
    });
  }
  async function all(store) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const req = d.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }
  async function remove(store, key) {
    const d = await openDB();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => reject(tx.error || new Error('تعذر تحديث قائمة الانتظار'));
    });
  }
  let snapshotTimer = 0;
  let snapshotWritePromise = Promise.resolve();
  async function digestSnapshot(raw) {
    try {
      if (!window.crypto?.subtle || typeof TextEncoder === 'undefined') return null;
      const bytes = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
      return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
    } catch (_) { return null; }
  }
  async function queueSnapshotWrite(raw) {
    const checksum = await digestSnapshot(raw);
    const record = { id: 'office-state', savedAt: new Date().toISOString(), data: raw, checksum, checksumAlgorithm: checksum ? 'SHA-256' : 'unavailable' };
    snapshotWritePromise = snapshotWritePromise
      .catch(() => {})
      .then(() => put('snapshots', record));
    return snapshotWritePromise;
  }
  function mirrorSnapshot(raw) {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      queueSnapshotWrite(raw).catch(e => console.warn('MAKTABY local mirror unavailable:', e));
    }, 350);
  }
  // Force the latest local snapshot to IndexedDB before the page is backgrounded.
  // This is a recovery mirror only; it never overwrites the live cloud state.
  async function flushSnapshot() {
    clearTimeout(snapshotTimer);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    await queueSnapshotWrite(raw);
    return { savedAt: new Date().toISOString(), bytes: raw.length };
  }
  const originalSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    const result = originalSetItem.call(this, key, value);
    if (this === window.localStorage && key === STORAGE_KEY) mirrorSnapshot(String(value));
    return result;
  };
  async function registerSync() {
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        if (reg.sync && typeof reg.sync.register === 'function') { await reg.sync.register(EXPENSE_TAG); await reg.sync.register(STATE_TAG); }
      }
    } catch (e) { console.info('MAKTABY Background Sync unavailable; online event fallback remains active.'); }
  }
  async function enqueueExpense(payload, userId, localStorageKey) {
    if (!payload || !payload.submission_key || !userId || payload.employee_id !== userId) throw new Error('بيانات طلب المصروف غير مكتملة.');
    if (!Number.isFinite(Number(payload.amount)) || Number(payload.amount) <= 0) throw new Error('قيمة المصروف غير صحيحة.');
    await put('expenseOutbox', { ...payload, userId, localStorageKey: localStorageKey || '', queuedAt: new Date().toISOString() });
    await registerSync();
    return true;
  }
  let draining = false;
  async function drainExpenseOutbox() {
    if (draining || !navigator.onLine || !window.sb?.auth || !window.sb?.from) return;
    draining = true;
    try {
      const { data, error } = await window.sb.auth.getSession();
      const session = data?.session;
      if (error || !session?.user?.id) return;
      const rows = (await all('expenseOutbox')).sort((a, b) => String(a.queuedAt).localeCompare(String(b.queuedAt)));
      for (const row of rows) {
        if (!navigator.onLine) break;
        // Never replay another user's pending write under the current session.
        if (row.userId !== session.user.id || row.employee_id !== session.user.id) continue;
        const payload = { client_name: row.client_name, expense_type: row.expense_type, description: row.description,
          amount: Number(row.amount), expense_date: row.expense_date, employee_id: row.employee_id,
          employee_name: row.employee_name, approval_status: 'pending', submission_key: row.submission_key };
        const { error: insertError } = await window.sb.from('expenses').insert(payload);
        if (insertError) {
          if (insertError.code === '23505') {
            const existing = await window.sb.from('expenses').select('id').eq('submission_key', row.submission_key).maybeSingle();
            if (existing.error || !existing.data?.id) break;
          } else break;
        }
        await remove('expenseOutbox', row.submission_key);
        if (row.localStorageKey) localStorage.removeItem(row.localStorageKey);
      }
      const remaining = await all('expenseOutbox');
      window.dispatchEvent(new CustomEvent('maktaby:outbox-status', { detail: { pending: remaining.length } }));
      if (!remaining.length && typeof window.setCloudStatus === 'function') window.setCloudStatus('تم إرسال العمليات المحفوظة محليًا');
    } catch (e) {
      console.warn('MAKTABY outbox sync deferred:', e);
    } finally { draining = false; }
  }
  let stateSyncAttached = false;
  async function drainStateOutbox() {
    if (!navigator.onLine || !window.__maktabyStateSyncPending || typeof window.saveCloudState !== 'function' || window.__maktabyStateSyncRunning) return;
    window.__maktabyStateSyncRunning = true;
    try {
      await window.saveCloudState();
      await remove('stateOutbox', 'office-state');
      window.__maktabyStateSyncPending = false;
      if (typeof window.setCloudStatus === 'function') window.setCloudStatus('تمت مزامنة التعديلات المحفوظة محليًا');
    } catch (e) {
      // Version conflicts are intentionally not retried automatically: the local
      // snapshot remains intact and the existing compare-and-swap guard blocks overwrite.
      console.warn('MAKTABY pending state sync requires review:', e);
      if (typeof window.setCloudStatus === 'function') window.setCloudStatus('توجد تعديلات محلية تنتظر المراجعة أو المزامنة');
    } finally { window.__maktabyStateSyncRunning = false; }
  }
  function attachStateSync() {
    if (stateSyncAttached || typeof window.saveCloudState !== 'function') return false;
    stateSyncAttached = true;
    const original = window.saveCloudState;
    const wrapped = async function () {
      try {
        const result = await original.apply(this, arguments);
        await remove('stateOutbox', 'office-state').catch(() => {});
        window.__maktabyStateSyncPending = false;
        return result;
      } catch (e) {
        if (!navigator.onLine || e instanceof TypeError) {
          window.__maktabyStateSyncPending = true;
          await put('stateOutbox', { id: 'office-state', queuedAt: new Date().toISOString() }).catch(err => console.warn('MAKTABY state outbox unavailable:', err));
          await registerSync();
        }
        throw e;
      }
    };
    wrapped.__maktabyOfflineWrapped = true;
    window.saveCloudState = wrapped;
    return true;
  }
  async function restoreStateOutboxMarker() {
    try { window.__maktabyStateSyncPending = (await all('stateOutbox')).some(x => x.id === 'office-state'); }
    catch (_) { window.__maktabyStateSyncPending = false; }
  }

  async function inspectSnapshot() {
    const rows = await all('snapshots');
    const record = rows.find(x => x.id === 'office-state');
    if (!record) return { exists: false, verified: false, reason: 'missing' };
    let parsed = false;
    try { JSON.parse(record.data); parsed = true; } catch (_) {}
    const actual = record.checksum ? await digestSnapshot(record.data) : null;
    const verified = !!(parsed && record.checksum && actual && actual === record.checksum);
    return { exists: true, verified, parsed, checksumAlgorithm: record.checksumAlgorithm || 'legacy-unverified', savedAt: record.savedAt || null, bytes: String(record.data || '').length, reason: verified ? 'ok' : (!parsed ? 'invalid-json' : (!record.checksum ? 'legacy-unverified' : 'checksum-mismatch')) };
  }
  async function exportRecoveryBackup() {
    if (typeof window.MAKTABY_RECOVERY_ADMIN_CHECK !== 'function' || !window.MAKTABY_RECOVERY_ADMIN_CHECK()) throw new Error('تنزيل نسخة الاسترداد متاح للمدير الرئيسي فقط.');
    await flushSnapshot();
    const rows = await all('snapshots');
    const record = rows.find(x => x.id === 'office-state');
    if (!record || !record.data) throw new Error('لا توجد نسخة محلية صالحة للتصدير.');
    const status = await inspectSnapshot();
    if (!status.parsed || (record.checksum && !status.verified)) throw new Error('فشل التحقق من سلامة النسخة المحلية؛ لم يتم تصديرها.');
    return { format: 'MAKTABY_LOCAL_RECOVERY', formatVersion: 1, appVersion: '10.9.1', createdAt: new Date().toISOString(), snapshot: record, verification: status };
  }
  async function storageDiagnostics() {
    const [snapshot, expenses, statePending] = await Promise.all([inspectSnapshot(), all('expenseOutbox'), all('stateOutbox')]);
    let estimate = null;
    try { if (navigator.storage?.estimate) estimate = await navigator.storage.estimate(); } catch (_) {}
    return { online: !!navigator.onLine, indexedDB: true, snapshot, pendingExpenses: expenses.length, pendingStateSync: statePending.some(x => x.id === 'office-state'), storage: estimate ? { usage: estimate.usage || 0, quota: estimate.quota || 0 } : null };
  }

  async function checkLogoutSafety() {
    const [expenses, stateRows] = await Promise.all([all('expenseOutbox'), all('stateOutbox')]);
    const pendingStateSync = stateRows.some(x => x.id === 'office-state');
    return { ok: expenses.length === 0 && !pendingStateSync, pendingExpenses: expenses.length, pendingStateSync };
  }
  async function clearSensitiveLocalData() {
    const safety = await checkLogoutSafety();
    if (!safety.ok) return { ok: false, reason: 'pending-operations', ...safety };
    // Close this tab's IndexedDB handle before deleting the local recovery mirror.
    try { const d = await openDB(); d.close(); dbPromise = null; }
    catch (e) { return { ok: false, reason: 'database-close-failed', error: e.message }; }
    const deleted = await new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error || new Error('تعذر حذف قاعدة البيانات المحلية'));
      request.onblocked = () => reject(new Error('قاعدة البيانات المحلية ما زالت مفتوحة في تبويب آخر. أغلق التبويبات الأخرى ثم أعد تسجيل الخروج.'));
    }).catch(error => ({ error }));
    if (deleted !== true) return { ok: false, reason: 'database-delete-failed', error: deleted.error?.message || 'تعذر حذف قاعدة البيانات المحلية' };
    try { localStorage.removeItem(STORAGE_KEY); }
    catch (e) { return { ok: false, reason: 'local-storage-clear-failed', error: e.message }; }
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter(key => key.startsWith('maktaby-shell-')).map(key => caches.delete(key)));
      }
    } catch (e) { console.warn('MAKTABY shell cache cleanup deferred:', e); }
    return { ok: true, cleared: ['office-state', 'indexeddb', 'maktaby-shell-cache'] };
  }

  const ready = openDB().then(async () => {
    await flushSnapshot();
    return true;
  }).catch(e => { console.warn('MAKTABY offline storage disabled:', e); return false; });
  window.MAKTABY_OFFLINE = { ready, enqueueExpense, drainExpenseOutbox, drainStateOutbox, attachStateSync, flushSnapshot, exportRecoveryBackup, inspectSnapshot, storageDiagnostics, checkLogoutSafety, clearSensitiveLocalData,
    pendingExpenses: async () => (await all('expenseOutbox')).length,
    pendingStateSync: async () => (await all('stateOutbox')).some(x => x.id === 'office-state'),
    snapshotStatus: inspectSnapshot };
  window.showMaktabyStorageDiagnostics = async function () {
    if (typeof window.MAKTABY_RECOVERY_ADMIN_CHECK !== 'function' || !window.MAKTABY_RECOVERY_ADMIN_CHECK()) throw new Error('فحص حماية البيانات متاح للمدير الرئيسي فقط.');
    const d = await storageDiagnostics();
    const fmt = n => Number(n || 0).toLocaleString('ar-EG');
    const snapshotText = !d.snapshot.exists ? 'لا توجد نسخة محلية' : d.snapshot.verified ? 'سليمة — SHA-256' : d.snapshot.reason === 'legacy-unverified' ? 'قديمة — لم يُحفظ لها بصمة تحقق' : 'تحذير — فشل التحقق';
    const usageText = d.storage ? `${fmt(d.storage.usage)} من ${fmt(d.storage.quota)} بايت` : 'غير متاح';
    alert(`فحص حماية بيانات مكتبي\n\nحالة الاتصال: ${d.online ? 'متصل' : 'غير متصل'}\nالنسخة المحلية: ${snapshotText}\nآخر حفظ: ${d.snapshot.savedAt ? new Date(d.snapshot.savedAt).toLocaleString('ar-EG') : '—'}\nعمليات مصروفات معلقة: ${fmt(d.pendingExpenses)}\nمزامنة حالة معلقة: ${d.pendingStateSync ? 'نعم' : 'لا'}\nمساحة المتصفح: ${usageText}\n\nهذا الفحص لا يثبت نجاح الاتصال بقاعدة Supabase ولا يغني عن النسخة السحابية.`);
    return d;
  };
  window.downloadMaktabyRecoveryBackup = async function () {
    const backup = await exportRecoveryBackup();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'MAKTABY_LOCAL_RECOVERY_10_9_1_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1500);
    return backup.verification;
  };
  window.addEventListener('online', () => window.dispatchEvent(new CustomEvent('maktaby:network-status', { detail: { online: true } })));
  window.addEventListener('offline', () => window.dispatchEvent(new CustomEvent('maktaby:network-status', { detail: { online: false } })));
  window.addEventListener('online', () => setTimeout(() => { drainExpenseOutbox(); drainStateOutbox(); }, 700));
  window.addEventListener('focus', () => { if (navigator.onLine) { drainExpenseOutbox(); drainStateOutbox(); } });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushSnapshot().catch(e => console.warn('MAKTABY snapshot flush deferred:', e));
    else if (navigator.onLine) { drainExpenseOutbox(); drainStateOutbox(); }
  });
  window.addEventListener('pagehide', () => {
    flushSnapshot().catch(e => console.warn('MAKTABY page-exit snapshot deferred:', e));
  });
  setInterval(() => { if (navigator.onLine) { drainExpenseOutbox(); drainStateOutbox(); } }, 20000);
  if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', event => {
      if (event.data?.type === 'MAKTABY_DRAIN_EXPENSE_OUTBOX') drainExpenseOutbox();
      if (event.data?.type === 'MAKTABY_DRAIN_STATE_OUTBOX') drainStateOutbox();
    });
  }
  window.addEventListener('load', () => {
    const timer = setInterval(() => { if (attachStateSync()) clearInterval(timer); }, 100);
    setTimeout(() => clearInterval(timer), 10000);
    setTimeout(async () => { await restoreStateOutboxMarker(); drainExpenseOutbox(); drainStateOutbox(); }, 1200);
  });
})();
