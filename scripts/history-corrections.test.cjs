const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
const base=()=>({periods:['2026-08-01','2026-08-29'],tensions:['2026-07-30','2026-08-02','2026-09-02'],period_ends:{'2026-08-01':'2026-08-05'},settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true});
function boot(t,data=base()){
 const timers=[],errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.fetch=()=>{throw Error('Unexpected network');};
  const D=w.Date;w.Date=class extends D{constructor(...args){super(...(args.length?args:['2026-09-24T12:00:00']));}};
  const set=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>{if(ms===10000){timers.push(fn);return 0;}return set(fn,ms,...args);};
  w.localStorage.setItem('marcy_data',JSON.stringify(data));
 }});t.after(()=>dom.window.close());const w=dom.window;w.switchView('manage');assert.deepEqual(errors,[]);return {w,timers};
}
const undo=w=>w.document.querySelector('.toast-undo');
function details(w,day=2,view='completed'){
 const mode=w.document.querySelector('#tension-mode');mode.value=view;mode.dispatchEvent(new w.Event('change'));
 w.document.querySelector(`[data-tension-day="${day}"]`).click();
 if(w.document.querySelector('#tension-details-toggle').getAttribute('aria-expanded')==='false')w.document.querySelector('#tension-details-toggle').click();
}
function confirm(w){w.document.querySelector('#confirm-yes').click();}

test('completed, current and unmapped tension events are deletable with cancel, date confirmation and Undo',t=>{
 for(const [date,day,view] of [['2026-08-02',2,'completed'],['2026-09-02',5,'current'],['2026-07-30',27,'completed']]){
  const {w}=boot(t);details(w,day,view);const original=w.localStorage.getItem('marcy_data');
  const button=w.document.querySelector(`[data-delete-tension="${date}"]`);assert.ok(button);assert.equal(button.getAttribute('onclick'),null);
  button.click();assert.match(w.document.querySelector('#confirm-root').textContent,new RegExp(date));
  w.document.querySelector('.confirm-cancel').click();assert.equal(w.localStorage.getItem('marcy_data'),original);
  button.click();confirm(w);assert.equal(w.loadData().tensions.includes(date),false);assert.equal(w.loadData().tensions.length,2);
  undo(w).click();assert.equal(w.loadData().tensions.includes(date),true);assert.equal(w.loadData().tensions.length,3);
 }
});

test('period deletion removes only its end date and Undo restores both',t=>{
 const {w}=boot(t);w.togglePeriodHistory();w.document.querySelector('[data-delete-period="2026-08-01"]').click();
 assert.match(w.document.querySelector('#confirm-root').textContent,/2026-08-01/);w.dismissConfirm();assert.equal(w.loadData().periods.length,2);
 w.confirmDel('2026-08-01');confirm(w);assert.equal(w.loadData().period_ends['2026-08-01'],undefined);
 assert.equal(w.loadData().periods.length,1);assert.equal(w.loadData().tensions.length,3);
 undo(w).click();assert.equal(w.loadData().period_ends['2026-08-01'],'2026-08-05');assert.equal(w.loadData().periods.length,2);
});

test('last period deletion leaves Data settings, import/export, footer links and tension correction usable',t=>{
 const {w}=boot(t,{...base(),periods:['2026-08-01']});w.confirmDel('2026-08-01');confirm(w);
 assert.ok(w.document.querySelector('#settings-cycle'));assert.ok(w.document.querySelector('#import-file'));
 assert.ok(w.document.querySelector('[onclick="exportData()"]'));assert.ok(w.document.querySelector('a[href="privacy.html"]'));
 details(w);assert.equal(w.document.querySelectorAll('[data-delete-tension]').length,3);
 undo(w).click();assert.equal(w.loadData().periods.length,1);
});

test('logging a tension or period offers Undo; resuming tracking can be undone too',t=>{
 for(const type of ['tension','period']){
  const data={...base(),paused:true};const {w}=boot(t,data);
  w.document.querySelector(type==='tension'?'#tension-date':'#log-date').value='2026-09-24';
  w.document.querySelector(type==='tension'?'#tension-btn':'#log-btn').click();
  assert.ok(w.loadData()[type==='tension'?'tensions':'periods'].includes('2026-09-24'));
  if(type==='period')assert.equal(w.loadData().paused,false);
  undo(w).click();assert.equal(w.loadData()[type==='tension'?'tensions':'periods'].includes('2026-09-24'),false);
  assert.equal(w.loadData().paused,true);
 }
});

test('Undo expires and cannot overwrite another save or a different tab',t=>{
 const {w,timers}=boot(t);w.confirmDelTension('2026-08-02');confirm(w);assert.ok(undo(w));timers.at(-1)();assert.equal(undo(w),null);
 w.confirmDelTension('2026-09-02');confirm(w);const stale=undo(w);
 const changed=w.loadData();changed.partner_name='Alex';w.saveData(changed);assert.equal(undo(w),null);
 stale.click();assert.equal(w.loadData().partner_name,'Alex');assert.equal(w.loadData().tensions.includes('2026-09-02'),false);
 w.confirmDelTension('2026-07-30');confirm(w);
 const other=w.loadData();other.tensions.push('2026-09-23');w.localStorage.setItem('marcy_data',JSON.stringify(other));
 undo(w).click();assert.equal(w.loadData().tensions.includes('2026-09-23'),true);assert.equal(w.loadData().tensions.includes('2026-07-30'),false);
});

test('a duplicate log does not offer an Undo that could delete an existing entry',t=>{
 const {w}=boot(t);w.document.querySelector('#tension-date').value='2026-08-02';w.document.querySelector('#tension-btn').click();
 assert.equal(undo(w),null);assert.equal(w.loadData().tensions.length,3);
});


test('an accidentally logged future date remains available for deletion in details',t=>{
 const {w}=boot(t,{...base(),tensions:['2026-10-01']});details(w);
 const button=w.document.querySelector('[data-delete-tension="2026-10-01"]');assert.ok(button);
 button.click();confirm(w);assert.equal(w.loadData().tensions.length,0);
});
