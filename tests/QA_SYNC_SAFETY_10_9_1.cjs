'use strict';
// Static safety regression checks for the 10.9.1 sync/offline layer.
// These checks do not replace live Supabase, browser, or multi-user tests.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src/js/renderer.js'), 'utf8');
const offline = fs.readFileSync(path.join(root, 'src/js/maktaby-offline-sync.js'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'src/sw.js'), 'utf8');
const checks = [
  ['cloud state writes go through atomic RPC', /sb\.rpc\('maktaby_save_state_atomic'/.test(renderer)],
  ['atomic writes carry expected shared revision', /p_expected_shared_updated_at:\s*cloudStateVersions\.office_shared_state/.test(renderer)],
  ['atomic writes carry expected employee revision', /p_expected_employee_updated_at:\s*cloudStateVersions\.employee_shared_state/.test(renderer)],
  ['atomic writes carry expected financial revision', /p_expected_financial_updated_at:\s*cloudStateVersions\.office_financial_state/.test(renderer)],
  ['financial state writes are admin-only', /if\(financial!==null&&!isAdmin\(\)\)/.test(renderer)],
  ['financial merge preserves cloud rows and local rows by identity', /function mergeFinancialRows\([\s\S]*?const keyed=new Map\(\)/.test(renderer)],
  ['fixed commitment inactive rows are retained as tombstones', /active:row\?\.active!==false/.test(renderer)],
  ['expense outbox requires a stable submission key', /!payload\.submission_key/.test(offline)],
  ['expense outbox binds queued writes to employee identity', /payload\.employee_id !== userId/.test(offline)],
  ['expense replay requires current authenticated session', /window\.sb\?\.auth/.test(offline) && /session\?\.user\?\.id/.test(offline)],
  ['expense replay refuses another user pending write', /row\.userId !== session\.user\.id \|\| row\.employee_id !== session\.user\.id/.test(offline)],
  ['duplicate expense submission is verified before queue removal', /insertError\.code === '23505'[\s\S]*?select\('id'\)[\s\S]*?maybeSingle\(\)/.test(offline)],
  ['offline state sync leaves conflicts for review', /Version conflicts are intentionally not retried automatically/.test(offline)],
  ['latest local snapshot can be flushed immediately', /async function flushSnapshot\(\)[\s\S]*?await queueSnapshotWrite\(raw\)/.test(offline)],
  ['snapshot flush is requested when the page is hidden or exits', /visibilitychange'[\s\S]*?if \(document\.hidden\) flushSnapshot\(\)/.test(offline) && /pagehide'[\s\S]*?flushSnapshot\(\)/.test(offline)],
  ['offline recovery diagnostics expose pending state and snapshot status', /pendingStateSync: async/.test(offline) && /snapshotStatus: inspectSnapshot/.test(offline)],
  ['service worker never handles non-GET requests', /if \(request\.method !== 'GET'\) return/.test(sw)],
  ['service worker excludes Supabase/API paths from cache', /url\.pathname\.startsWith\('\/rest\/'\)[\s\S]*?url\.pathname\.startsWith\('\/functions\/'\)/.test(sw)],
  ['service worker background sync only wakes authenticated page', /client\.postMessage\(\{ type: 'MAKTABY_DRAIN_STATE_OUTBOX' \}\)/.test(sw) && !/fetch\([^)]*expenses/.test(sw)],
  ['logout is blocked while expense or state writes remain pending', /async function checkLogoutSafety\([\s\S]*?expenses\.length === 0 && !pendingStateSync/.test(offline) && /if\(!safety\.ok\)/.test(renderer)],
  ['logout clears local mirror and app shell cache only after safety check', /async function clearSensitiveLocalData\([\s\S]*?checkLogoutSafety\(\)[\s\S]*?localStorage\.removeItem\(STORAGE_KEY\)[\s\S]*?maktaby-shell-/.test(offline)],
];
let passed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (ok) passed++;
}
console.log(JSON.stringify({ passed, total: checks.length, scope: 'static-only' }, null, 2));
if (passed !== checks.length) process.exitCode = 1;
