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
  function mirrorSnapshot(raw) {
    clearTimeout(snapshotTimer);
    snapshotTimer = setTimeout(() => {
      put('snapshots', { id: 'office-state', savedAt: new Date().toISOString(), data: raw })
        .catch(e => console.warn('MAKTABY local mirror unavailable:', e));
    }, 350);
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

  const ready = openDB().then(async () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) mirrorSnapshot(raw);
    return true;
  }).catch(e => { console.warn('MAKTABY offline storage disabled:', e); return false; });
  window.MAKTABY_OFFLINE = { ready, enqueueExpense, drainExpenseOutbox, drainStateOutbox, attachStateSync,
    pendingExpenses: async () => (await all('expenseOutbox')).length,
    snapshotStatus: async () => { const rows = await all('snapshots'); return rows[0] ? { savedAt: rows[0].savedAt, bytes: String(rows[0].data || '').length } : null; } };
  window.addEventListener('online', () => setTimeout(() => { drainExpenseOutbox(); drainStateOutbox(); }, 700));
  window.addEventListener('focus', () => { if (navigator.onLine) { drainExpenseOutbox(); drainStateOutbox(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && navigator.onLine) { drainExpenseOutbox(); drainStateOutbox(); } });
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
