'use strict';
// Static regression checks for the multi-improvement recovery/safety batch.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const offline = fs.readFileSync(path.join(root, 'src/js/maktaby-offline-sync.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/js/renderer.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'src/sw.js'), 'utf8');
const checks = [
  ['local recovery snapshots include SHA-256 when Web Crypto is available', /crypto\?\.subtle[\s\S]*?digest\('SHA-256'/.test(offline)],
  ['snapshot verification parses JSON and compares checksum', /async function inspectSnapshot\([\s\S]*?JSON\.parse\(record\.data\)[\s\S]*?actual === record\.checksum/.test(offline)],
  ['legacy snapshots are marked unverified rather than falsely trusted', /legacy-unverified/.test(offline)],
  ['recovery export is restricted through the real admin-role check', /MAKTABY_RECOVERY_ADMIN_CHECK/.test(offline) && /window\.MAKTABY_RECOVERY_ADMIN_CHECK=isAdmin/.test(renderer)],
  ['recovery export rejects corrupted snapshots', /!status\.parsed \|\| \(record\.checksum && !status\.verified\)/.test(offline)],
  ['recovery export is a separate downloadable artifact', /MAKTABY_LOCAL_RECOVERY/.test(offline) && /downloadMaktabyRecoveryBackup/.test(index)],
  ['recovery export does not automatically overwrite local or cloud data', !/localStorage\.setItem\([^\n]*record\.data/.test(offline) && !/saveCloudState\([^\n]*record\.data/.test(offline)],
  ['storage diagnostics report pending queues and browser quota', /async function storageDiagnostics\([\s\S]*?navigator\.storage\?\.estimate[\s\S]*?pendingExpenses[\s\S]*?pendingStateSync/.test(offline)],
  ['admin can run a visible storage health report without changing data', /showMaktabyStorageDiagnostics/.test(offline) && /recoveryHealthBtn/.test(index) && /recoveryHealthBtn/.test(renderer)],
  ['recovery action is shown only for admin sessions', /recoveryBackupBtn/ .test(renderer) && /isAdmin\(\)\?'inline-block':'none'/.test(renderer)],
  ['service worker shell cache revision refreshed', /__MAKTABY_BUILD_ID__/.test(sw) && /__MAKTABY_PRECACHE__/.test(sw)],
  ['app version remains 10.9.1 for maintenance-only changes', /Version 10\.9\.1/.test(index) && /"version": "10\.9\.1"/.test(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))],
];
let passed = 0;
for (const [name, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); if (ok) passed++; }
console.log(JSON.stringify({ passed, total: checks.length, scope: 'static-only' }, null, 2));
if (passed !== checks.length) process.exitCode = 1;
