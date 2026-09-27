const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
function boot(t,{native=false}={}){
 const state={errors:[],blobs:[],pending:[{id:3}],failCancel:false,failRemove:null,hold:null,requests:[]};const vc=new VirtualConsole();vc.on('jsdomError',e=>state.errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};
  const D=w.Date;w.Date=class extends D{constructor(...args){super(...(args.length?args:['2026-09-24T12:00:00']));}};
  w.fetch=(url,options)=>new Promise(resolve=>state.requests.push({resolve,options}));
  w.localStorage.setItem('marcy_data',JSON.stringify({periods:['2026-09-20'],tensions:['2026-09-21'],onboarded:true,settings:{default_cycle_length:28,manual_cycle_length:null}}));
  w.localStorage.setItem('marcy_data_recovery_test','unreadable original');w.localStorage.setItem('other-app','keep me');
  const remove=w.Storage.prototype.removeItem;w.Storage.prototype.removeItem=function(key){if(key===state.failRemove)throw Error('storage failure');return remove.call(this,key);};
  w.URL.createObjectURL=blob=>{state.blobs.push(blob);return 'blob:backup';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
  if(native)w.Capacitor={Plugins:{LocalNotifications:{
   getPending:async()=>({notifications:[...state.pending]}),
   cancel:async()=>{if(state.failCancel)throw Error('plugin failure');state.pending=[];},
   checkPermissions:async()=>({display:'granted'}),
   schedule:async({notifications})=>{if(state.hold)await state.hold();state.pending=[...notifications];}
  }}};
 }});t.after(()=>dom.window.close());const w=dom.window;w.switchView('manage');assert.deepEqual(state.errors,[]);return {w,state};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('erase dialog offers export and cancellation without deleting anything',t=>{
 const {w,state}=boot(t);const original=w.localStorage.getItem('marcy_data');w.document.querySelector('#erase-data').click();
 assert.match(w.document.querySelector('#confirm-root').textContent,/cannot be undone/);
 w.document.querySelector('#erase-export').click();assert.equal(state.blobs.length,1);assert.ok(w.document.querySelector('#confirm-yes'));
 w.document.querySelector('.confirm-cancel').click();assert.equal(w.localStorage.getItem('marcy_data'),original);assert.equal(w.localStorage.getItem('marcy_data_recovery_test'),'unreadable original');
});

test('confirmed erasure clears only Marcy records and recovery copies and returns to onboarding',async t=>{
 const {w,state}=boot(t,{native:true});await w.eval('notificationQueue');assert.ok(state.pending.length);
 w.document.querySelector('#erase-data').click();w.document.querySelector('#confirm-yes').click();await flush();
 assert.equal(w.localStorage.getItem('marcy_data'),null);assert.equal(w.localStorage.getItem('marcy_data_recovery_test'),null);
 assert.equal(w.localStorage.getItem('other-app'),'keep me');assert.equal(state.pending.length,0);assert.ok(w.document.querySelector('#onboard-go'));
 assert.match(w.document.querySelector('#toast').textContent,/Marcy data erased/);assert.equal(w.document.querySelector('.toast-undo'),null);
});

test('cancellation failure keeps data and offers an honest failure instead of success',async t=>{
 const {w,state}=boot(t,{native:true});await w.eval('notificationQueue');state.failCancel=true;
 const original=w.localStorage.getItem('marcy_data');assert.equal(await w.eraseMarcyData(),false);
 assert.equal(w.localStorage.getItem('marcy_data'),original);assert.equal(w.localStorage.getItem('marcy_data_recovery_test'),'unreadable original');
 assert.match(w.document.querySelector('#toast').textContent,/could not cancel reminders/);
 state.failCancel=false;assert.equal(await w.eraseMarcyData(),true);
});

test('storage deletion failure is reported and a retry can finish',async t=>{
 for(const key of ['marcy_data_recovery_test','marcy_data']){
  const {w,state}=boot(t);state.failRemove=key;assert.equal(await w.eraseMarcyData(),false);
  assert.notEqual(w.localStorage.getItem('marcy_data'),null);assert.match(w.document.querySelector('#toast').textContent,/could not erase all data/);
  state.failRemove=null;assert.equal(await w.eraseMarcyData(),true);assert.equal(w.localStorage.getItem('other-app'),'keep me');
 }
});

test('erasing waits for a slow schedule and then cancels its reminders',async t=>{
 const {w,state}=boot(t,{native:true});await w.eval('notificationQueue');let release,entered;
 const hold=new Promise(r=>release=r);const started=new Promise(r=>entered=r);state.hold=()=>{entered();return hold;};
 w.saveData(w.loadData());await started;const erasure=w.eraseMarcyData();assert.equal(w.saveData(w.loadData()),false);
 release();assert.equal(await erasure,true);assert.equal(state.pending.length,0);assert.equal(w.localStorage.getItem('marcy_data'),null);
});

test('an in-flight email response cannot recreate erased records',async t=>{
 const {w,state}=boot(t);const signup=w.submitEmail('test@example.com');assert.equal(state.requests.length,1);
 await w.eraseMarcyData();assert.equal(state.requests[0].options.signal.aborted,true);state.requests[0].resolve({ok:true});await signup;
 assert.equal(w.localStorage.getItem('marcy_data'),null);assert.ok(w.document.querySelector('#onboard-go'));assert.match(w.document.querySelector('#toast').textContent,/Marcy data erased/);
});

test('an import started before erasure cannot reopen confirmation or restore data afterward',async t=>{
 const {w}=boot(t);let reader;w.FileReader=class{constructor(){reader=this;}readAsText(){}};
 w.importData({size:100});await w.eraseMarcyData();reader.onload({target:{result:JSON.stringify({periods:['2026-09-01']})}});
 assert.equal(w.localStorage.getItem('marcy_data'),null);assert.equal(w.document.querySelector('#confirm-yes'),null);
});
