/* MAKTABY PRO 10.9.0 — Smart Auto-Fill & one-click favorites. Local suggestions only; no DB writes. */
(()=>{'use strict';
 if(window.__MAKTABY_SMART_AUTOFILL_109)return; window.__MAKTABY_SMART_AUTOFILL_109=true;
 const KEY='maktaby.smartAutofill.v1', MAX=12, CHIP_MAX=5;
 const groups=[
  {id:'court',re:/المحكم|محكم|جهة قضائي/},
  {id:'circuit',re:/الدائر|دائرة/},
  {id:'caseType',re:/نوع.*قضي|نوع.*دعوى|تصنيف.*قضي/},
  {id:'expense',re:/بند.*مصروف|نوع.*مصروف/}
 ];
 const read=()=>{try{const x=JSON.parse(localStorage.getItem(KEY)||'{}');return x&&typeof x==='object'?x:{}}catch(_){return {}}};
 const write=x=>{try{localStorage.setItem(KEY,JSON.stringify(x))}catch(e){console.warn('Smart Auto-Fill storage unavailable',e)}};
 const norm=s=>String(s||'').replace(/\s+/g,' ').trim();
 function labelFor(el){const id=el.id;if(id){const l=document.querySelector('label[for="'+CSS.escape(id)+'"]');if(l)return norm(l.textContent)}const p=el.closest('label');if(p)return norm(p.textContent);const wrap=el.parentElement;return norm(wrap?.querySelector('label,.field-label,.form-label')?.textContent||el.getAttribute('aria-label')||el.placeholder)}
 function groupFor(el){if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement))return null;if(el.type==='password'||el.type==='email'||el.type==='tel'||el.type==='date'||el.type==='number'||el.type==='hidden'||el.type==='file')return null;const l=labelFor(el);return groups.find(g=>g.re.test(l))||null}
 function attach(el){const g=groupFor(el);if(!g||el.dataset.mkSmartFill)return;el.dataset.mkSmartFill='1';el.dataset.mkSmartFillKey='mkSF'+Math.random().toString(36).slice(2,9);
  const listId='mkSmartFill_'+g.id;let dl=document.getElementById(listId);if(!dl){dl=document.createElement('datalist');dl.id=listId;document.body.appendChild(dl)}el.setAttribute('list',listId);el.setAttribute('autocomplete','on');
  const host=el.parentElement||el;
  const chips=document.createElement('div');chips.className='mkSmartFavorites';chips.dataset.for=el.dataset.mkSmartFillKey;chips.setAttribute('aria-label','القيم المفضلة');chips.style.cssText='display:flex;flex-wrap:wrap;gap:5px;margin:5px 0 2px;';
  const paint=()=>{const s=read(),b=s[g.id]||{recent:[],favorite:[]},vals=[...(b.favorite||[]),...(b.recent||[])];dl.replaceChildren(...[...new Set(vals)].slice(0,MAX).map(v=>{const o=document.createElement('option');o.value=v;return o}));chips.replaceChildren(...(b.favorite||[]).slice(0,CHIP_MAX).map(v=>{const chip=document.createElement('button');chip.type='button';chip.className='mkSmartFavoriteChoice';chip.textContent='★ '+v;chip.title='استخدام هذه القيمة';chip.style.cssText='border:1px solid #d8e0e8;border-radius:999px;background:#fff;color:#765b18;cursor:pointer;padding:4px 9px;font-size:11px;max-width:100%;';chip.addEventListener('click',()=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.focus();save()});return chip}));chips.style.display=chips.childElementCount?'flex':'none';};
  const save=()=>{const v=norm(el.value);if(!v)return;const s=read(),b=s[g.id]||{recent:[],favorite:[]};b.recent=[v,...(b.recent||[]).filter(x=>x!==v)].slice(0,MAX);s[g.id]=b;write(s);paint()};
  const btn=document.createElement('button');btn.type='button';btn.className='mkSmartFavorite';btn.textContent='☆';btn.title='إضافة القيمة الحالية للمفضلة';btn.setAttribute('aria-label','إضافة القيمة الحالية للمفضلة');btn.style.cssText='margin-inline-start:5px;border:1px solid #d8e0e8;border-radius:7px;background:#fff;color:#9a741f;cursor:pointer;padding:3px 7px;font-size:16px;vertical-align:middle';btn.addEventListener('click',()=>{const v=norm(el.value);if(!v){el.focus();return}const s=read(),b=s[g.id]||{recent:[],favorite:[]};b.favorite=[v,...(b.favorite||[]).filter(x=>x!==v)].slice(0,MAX);s[g.id]=b;write(s);paint();btn.textContent='★';setTimeout(()=>btn.textContent='☆',900)});
  el.insertAdjacentElement('afterend',btn);btn.insertAdjacentElement('afterend',chips);el.addEventListener('change',save);el.addEventListener('blur',save);paint();
 }
 function scan(root=document){root.querySelectorAll?.('#formFields input,#formFields textarea,.modal input,.modal textarea').forEach(attach)}
 scan();new MutationObserver(ms=>{for(const m of ms){m.addedNodes.forEach(n=>{if(n.nodeType===1){attach(n);scan(n)}})}}).observe(document.documentElement,{childList:true,subtree:true});
})();
