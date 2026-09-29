const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
const KEY='marcy_data', MARKER='marcy_storage_v1';
const data=()=>({periods:['2026-08-01'],tensions:['2026-08-02'],settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true});
const flush=()=>new Promise(r=>setImmediate(r));
async function boot(t,{legacy={},native={},missing=false,failGet=false,failSet=null,failRemove=null,blockedLegacy=false}={}){
 const state={values:new Map(Object.entries(native)),failGet,failSet,failRemove,hold:null,errors:[],writes:[],blobs:[],files:[],shares:[]};
 const vc=new VirtualConsole();vc.on('jsdomError',e=>state.errors.push(e.message));
 const plugin={
  async get({key}){if(state.failGet)throw Error('read');return {value:state.values.get(key)??null};},
  async keys(){if(state.failGet)throw Error('keys');return {keys:[...state.values.keys()]};},
  async set({key,value}){state.writes.push(key);if(state.hold)await state.hold;if(state.failSet===key)throw Error('write');state.values.set(key,value);},
  async remove({key}){if(state.failRemove===key)throw Error('remove');state.values.delete(key);},
 };
 const dom=new JSDOM(html,{url:'https://marcy.test',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.fetch=async()=>({ok:true});
  const D=w.Date;w.Date=class extends D{constructor(...a){super(...(a.length?a:['2026-09-28T12:00:00']));}};
  for(const [k,v] of Object.entries(legacy))w.localStorage.setItem(k,v);
  if(blockedLegacy){w.Storage.prototype.getItem=function(k){throw Error('blocked');};Object.defineProperty(w.Storage.prototype,'length',{get(){throw Error('blocked');}});}
  w.Capacitor={isNativePlatform:()=>true,Plugins:missing?{}:{
   Preferences:plugin,
   Filesystem:{async writeFile(options){state.files.push(options);return {uri:`file:///cache/${options.path}`};}},
   Share:{async share(options){state.shares.push(options);return {activityType:''};}},
  }};
  w.URL.createObjectURL=b=>{state.blobs.push(b);return 'blob:test';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 }});t.after(()=>dom.window.close());const w=dom.window;await w.startApp();assert.deepEqual(state.errors,[]);return {w,state,plugin};
}

test('migration preserves exact primary and recovery bytes and leaves unrelated storage alone',async t=>{
 const raw=JSON.stringify(data()),recovery=' { broken';
 const {w,state}=await boot(t,{legacy:{[KEY]:raw,[KEY+'_recovery_old']:recovery,other:'keep'}});
 assert.equal(state.values.get(KEY),raw);assert.equal(state.values.get(KEY+'_recovery_old'),recovery);assert.equal(state.values.get(MARKER),'1');
 assert.equal(w.localStorage.getItem(KEY),null);assert.equal(w.localStorage.getItem('other'),'keep');assert.equal(w.loadData().periods[0],'2026-08-01');
 assert.ok(state.writes.indexOf(KEY+'_recovery_old')<state.writes.indexOf(KEY));assert.ok(state.writes.indexOf(KEY)<state.writes.indexOf(MARKER));
});

test('existing native records win, even with unavailable web storage',async t=>{
 const raw=JSON.stringify(data());
 const {w,state}=await boot(t,{native:{[KEY]:raw,[MARKER]:'1'},blockedLegacy:true});
 assert.equal(w.loadData().periods[0],'2026-08-01');const next=data();next.partner_name='New';assert.equal(await w.saveData(next),true);
 assert.equal(JSON.parse(state.values.get(KEY)).partner_name,'New');
});

test('interrupted migration keeps the legacy source and retries safely',async t=>{
 for(const key of [KEY+'_recovery_old',KEY,MARKER]){
  const raw=JSON.stringify(data());const {w,state}=await boot(t,{legacy:{[KEY]:raw,[KEY+'_recovery_old']:'broken'},failSet:key});
  assert.ok(w.document.querySelector('#recovery-retry'));assert.equal(w.document.querySelector('#onboard-go'),null);assert.equal(w.localStorage.getItem(KEY),raw);
  state.failSet=null;await w.startApp();assert.equal(state.values.get(KEY),raw);assert.equal(w.localStorage.getItem(KEY),null);assert.equal(w.loadData().periods.length,1);
 }
});

test('missing plugin or failed native reads never fall back to empty or stale web history',async t=>{
 for(const options of [{missing:true},{failGet:true},{blockedLegacy:true}]){
  const {w}=await boot(t,options);assert.ok(w.document.querySelector('#recovery-retry'));assert.equal(w.document.querySelector('#onboard-go'),null);
  assert.equal(await w.saveData(data()),false);assert.throws(()=>w.loadData());
 }
});

test('malformed native history is retained and archived before confirmed restore',async t=>{
 const {w,state}=await boot(t,{legacy:{[KEY]:' {broken'}});assert.ok(w.document.querySelector('#recovery-download'));
 assert.equal(state.values.get(KEY),' {broken');assert.equal(await w.saveData(data()),false);
 assert.equal(await w.saveData(data(),{restore:true}),true);
 const recovered=[...state.values].filter(([k])=>k.startsWith(KEY+'_recovery_'));assert.equal(recovered.length,1);assert.equal(recovered[0][1],' {broken');
 assert.equal(w.loadData().periods.length,1);
});

test('native save waits for persistence and blocks competing edits without reporting success',async t=>{
 const {w,state}=await boot(t,{native:{[KEY]:JSON.stringify(data()),[MARKER]:'1'}});w.switchView('manage');
 let release;state.hold=new Promise(r=>release=r);w.document.querySelector('#settings-name').value='Alex';w.document.querySelector('#settings-save-name').click();
 assert.ok(w.document.querySelector('#content').hasAttribute('inert'));assert.equal(w.loadData().partner_name,null);assert.doesNotMatch(w.document.querySelector('#toast').textContent,/personalized/);
 assert.equal(await w.saveData(data()),false);release();await flush();assert.equal(w.loadData().partner_name,'Alex');assert.match(w.document.querySelector('#toast').textContent,/personalized/);assert.equal(w.document.querySelector('#content').hasAttribute('inert'),false);
});

test('failed native save keeps old records and can recover through a fresh read',async t=>{
 const raw=JSON.stringify(data());const {w,state}=await boot(t,{native:{[KEY]:raw,[MARKER]:'1'}});state.failSet=KEY;
 const next=data();next.tensions.push('2026-08-03');assert.equal(await w.saveData(next),false);assert.equal(state.values.get(KEY),raw);assert.ok(w.document.querySelector('#recovery-retry'));
 state.failSet=null;await w.startApp();assert.equal(w.loadData().tensions.length,1);assert.equal(await w.saveData(next),true);
});

test('fresh start removes native history and recovery only, retaining migration protection',async t=>{
 const raw=JSON.stringify(data());const {w,state}=await boot(t,{native:{[KEY]:raw,[KEY+'_recovery_old']:'broken',[MARKER]:'1',other:'keep'},legacy:{[KEY]:raw,other:'keep'}});
 assert.equal(await w.eraseMarcyData(),true);assert.equal(state.values.has(KEY),false);assert.equal(state.values.has(KEY+'_recovery_old'),false);assert.equal(state.values.get('other'),'keep');assert.equal(state.values.get(MARKER),'1');assert.ok(w.document.querySelector('#onboard-go'));
 // A stale web copy cannot resurrect records after a successful erase.
 w.localStorage.setItem(KEY,raw);await w.startApp();assert.equal(w.loadData().periods.length,0);assert.equal(state.values.has(KEY),false);
});

test('erase waits for an in-flight save and suppresses its stale success callback',async t=>{
 const {w,state}=await boot(t,{native:{[KEY]:JSON.stringify(data()),[MARKER]:'1'}});let release;state.hold=new Promise(r=>release=r);
 let success=false;const saving=w.persistData(data(),()=>{success=true;});const erasing=w.eraseMarcyData();release();await saving;assert.equal(await erasing,true);assert.equal(success,false);assert.equal(state.values.has(KEY),false);assert.ok(w.document.querySelector('#onboard-go'));
});

test('erase failure is not reported as success and preserves primary until recovery removal succeeds',async t=>{
 const raw=JSON.stringify(data());const {w,state}=await boot(t,{native:{[KEY]:raw,[KEY+'_recovery_old']:'broken',[MARKER]:'1'},failRemove:KEY+'_recovery_old'});
 assert.equal(await w.eraseMarcyData(),false);assert.equal(state.values.get(KEY),raw);assert.match(w.document.querySelector('#toast').textContent,/could not erase/);
 state.failRemove=null;await w.startApp();assert.equal(await w.eraseMarcyData(),true);
});

test('native import confirms replacement and export shares the committed native history as a file',async t=>{
 const {w,state}=await boot(t,{native:{[KEY]:JSON.stringify(data()),[MARKER]:'1'}});
 w.FileReader=class{readAsText(){this.onload({target:{result:JSON.stringify({periods:['2026-09-01'],tensions:[]})}});}};
 w.importData({size:100});assert.match(w.document.querySelector('#confirm-root').textContent,/replace your current history/);
 assert.equal(w.loadData().periods[0],'2026-08-01');w.document.querySelector('#confirm-yes').click();await flush();assert.equal(w.loadData().periods[0],'2026-09-01');
 assert.equal(await w.exportData(),true);assert.equal(state.blobs.length,0);assert.equal(state.files.length,1);assert.equal(state.files[0].directory,'CACHE');assert.equal(state.files[0].encoding,'utf8');
 assert.equal(JSON.parse(state.files[0].data).periods[0],'2026-09-01');assert.deepEqual(Array.from(state.shares[0].files),['file:///cache/marcy-backup-2026-09-28.json']);assert.equal(w.localStorage.getItem(KEY),null);
});

test('native deletion and Undo persist in Preferences',async t=>{
 const {w,state}=await boot(t,{native:{[KEY]:JSON.stringify(data()),[MARKER]:'1'}});
 w.confirmDelTension('2026-08-02');w.document.querySelector('#confirm-yes').click();await flush();assert.equal(JSON.parse(state.values.get(KEY)).tensions.length,0);
 w.document.querySelector('.toast-undo').click();await flush();assert.equal(JSON.parse(state.values.get(KEY)).tensions[0],'2026-08-02');
});

test('email completion waits for a pending edit and preserves that edit',async t=>{
 const {w,state}=await boot(t,{native:{[KEY]:JSON.stringify(data()),[MARKER]:'1'}});let reply;w.fetch=()=>new Promise(r=>reply=r);
 const signup=w.submitEmail('person@example.com');let release;state.hold=new Promise(r=>release=r);const next=data();next.partner_name='Alex';const saving=w.saveData(next);
 reply({ok:true});await flush();release();await saving;assert.equal(await signup,true);assert.equal(w.loadData().partner_name,'Alex');assert.equal(w.loadData().email,'person@example.com');
});

test('a bridge failure after committing reloads the actual saved state without replaying the edit',async t=>{
 const {w,state,plugin}=await boot(t,{native:{[KEY]:JSON.stringify(data()),[MARKER]:'1'}});const original=plugin.set;
 plugin.set=async args=>{await original(args);throw Error('lost acknowledgement');};
 const next=data();next.tensions.push('2026-08-03');assert.equal(await w.saveData(next),false);assert.ok(w.document.querySelector('#recovery-retry'));
 plugin.set=original;await w.startApp();assert.equal(w.loadData().tensions.length,2);
});

test('migrated records survive reload with the web-view store completely empty',async t=>{
 const first=await boot(t,{legacy:{[KEY]:JSON.stringify(data())}});
 const second=await boot(t,{native:Object.fromEntries(first.state.values)});assert.equal(second.w.loadData().tensions[0],'2026-08-02');assert.equal(second.state.writes.length,0);
});
