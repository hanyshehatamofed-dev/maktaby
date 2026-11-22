const fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.join(__dirname,'src');
const renderer=fs.readFileSync(path.join(root,'js/renderer.10_9_1_case_tools04.js'),'utf8');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const modPath=path.join(root,'js/maktaby-legal-calculator.10_9_1.js');
const mod=fs.readFileSync(modPath,'utf8');
const checks=[];const check=(name,ok)=>checks.push({name,ok:!!ok});
check('calculator implementation extracted from main renderer',!renderer.includes('MAKTABY PRO 10.9.1 — Egyptian Legal & Fee Calculator'));
check('main renderer is smaller after extraction',fs.statSync(path.join(root,'js/renderer.10_9_1_case_tools04.js')).size<569746);
check('calculator module retains duplicate-load guard',mod.includes('__MAKTABY_EG_LEGAL_CALC_1091'));
check('calculator module retains local-only storage notice',mod.includes('لم تُرحّل إلى حسابات الموكل أو السحابة'));
check('calculator module retains render integration',mod.includes('const prior=render;render=function()'));
check('navigation entry is created after core startup',index.includes('data-page="legalCalculator"'));
check('module is requested only from calculator navigation click',index.includes("optional('js/maktaby-legal-calculator.10_9_1.js','legal calculator')"));
check('calculator module is not precached by service worker',!sw.includes('/js/maktaby-legal-calculator.10_9_1.js'));
check('service-worker shell cache revision refreshed',sw.includes('refactor-stage3-store-session-tools12'));
for(const f of [path.join(root,'js/renderer.10_9_1_case_tools04.js'),modPath,path.join(root,'index.html'),path.join(root,'sw.js')]){
 try{if(f.endsWith('.js'))new vm.Script(fs.readFileSync(f,'utf8'),{filename:f});}catch(e){check('syntax '+path.basename(f),false);console.error(e);}
}
for(const c of checks)console.log((c.ok?'PASS ':'FAIL ')+c.name);
console.log(JSON.stringify({passed:checks.filter(x=>x.ok).length,total:checks.length},null,2));
if(checks.some(x=>!x.ok))process.exit(1);
