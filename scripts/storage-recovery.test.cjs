const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
const base=()=>({periods:['2026-08-01'],tensions:['2026-08-02'],settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true});
function boot(t,{raw=JSON.stringify(base()),readFailure=false}={}){
 const state={readFailure,writeFailure:false,failPrimary:false,blobs:[],errors:[]};const vc=new VirtualConsole();vc.on('jsdomError',e=>state.errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.fetch=async()=>({ok:true});
  const D=w.Date;w.Date=class extends D{constructor(...args){super(...(args.length?args:['2026-09-24T12:00:00']));}};
  if(raw!==null)w.localStorage.setItem('marcy_data',raw);
  const get=w.Storage.prototype.getItem,set=w.Storage.prototype.setItem;
  w.Storage.prototype.getItem=function(key){if(state.readFailure)throw new w.DOMException('blocked','SecurityError');return get.call(this,key);};
  w.Storage.prototype.setItem=function(key,value){if(state.writeFailure||(state.failPrimary&&key==='marcy_data'))throw new w.DOMException('full','QuotaExceededError');return set.call(this,key,value);};
  w.URL.createObjectURL=blob=>{state.blobs.push(blob);return 'blob:recovery';};w.URL.revokeObjectURL=()=>{};w.HTMLAnchorElement.prototype.click=function(){};
 }});t.after(()=>dom.window.close());assert.deepEqual(state.errors,[]);return {w:dom.window,state};
}
function restore(w,data,confirm=true){return new Promise(resolve=>{
 const Reader=w.FileReader;w.FileReader=class extends Reader{constructor(){super();this.addEventListener('loadend',()=>{w.FileReader=Reader;if(confirm)w.document.querySelector('#confirm-yes')?.click();resolve();},{once:true});}};
 w.importData(new w.File([JSON.stringify(data)],'backup.json'));
});}
const blobText=(w,blob)=>new Promise(resolve=>{const r=new w.FileReader();r.onload=()=>resolve(r.result);r.readAsText(blob);});

test('unreadable JSON and invalid data shapes open recovery without overwriting or injecting data',async t=>{
 for(const raw of ['', '{broken', 'null', '[]', '{"periods":[null]}', '{"periods":[],"settings":false}', '<img src=x onerror=alert(1)>']){
  const {w}=boot(t,{raw});assert.ok(w.document.querySelector('#recovery-download'));assert.equal(w.document.querySelector('#onboard-go'),null);
  assert.equal(w.localStorage.getItem('marcy_data'),raw);assert.equal(w.saveData(base()),false);assert.equal(w.localStorage.getItem('marcy_data'),raw);
  assert.equal(w.document.querySelector('#content img'),null);
 }
});

test('download preserves exact unreadable bytes',async t=>{
 const raw=' {"periods": [ BROKEN\n';const {w,state}=boot(t,{raw});w.document.querySelector('#recovery-download').click();
 assert.equal(await blobText(w,state.blobs[0]),raw);assert.equal(w.localStorage.getItem('marcy_data'),raw);
});

test('confirmed restore archives unreadable data first; cancel and invalid backup leave it untouched',async t=>{
 const raw='{broken';const {w}=boot(t,{raw});await restore(w,{periods:[null]});assert.equal(w.localStorage.getItem('marcy_data'),raw);
 await restore(w,base(),false);w.document.querySelector('.confirm-cancel').click();assert.equal(w.localStorage.length,1);
 await restore(w,base());const keys=Object.keys(w.localStorage).filter(k=>k.startsWith('marcy_data_recovery_'));
 assert.equal(keys.length,1);assert.equal(w.localStorage.getItem(keys[0]),raw);assert.equal(w.loadData().periods[0],'2026-08-01');
 assert.equal(w.document.querySelector('#recovery-import'),null);
});

test('restore cannot replace unreadable records if preservation or final write fails',async t=>{
 for(const failure of ['writeFailure','failPrimary']){
  const raw='{broken';const {w,state}=boot(t,{raw});state[failure]=true;await restore(w,base());
  assert.equal(w.localStorage.getItem('marcy_data'),raw);assert.ok(w.document.querySelector('#recovery-import'));
  assert.match(w.document.querySelector('#toast').textContent,/could not save/);
 }
});

test('blocked storage is not mistaken for a fresh install and retry recovers access',t=>{
 const {w,state}=boot(t,{readFailure:true});assert.ok(w.document.querySelector('#recovery-retry'));assert.equal(w.saveData(base()),false);
 state.readFailure=false;w.document.querySelector('#recovery-retry').click();assert.equal(w.document.querySelector('#recovery-retry'),null);
 assert.equal(w.loadData().periods[0],'2026-08-01');
});

test('failed logging, deletion, pause and settings saves preserve data and show failure',t=>{
 const actions=[
 w=>{w.document.querySelector('#log-date').value='2026-09-24';w.document.querySelector('#log-btn').click();},
 w=>{w.document.querySelector('#tension-date').value='2026-09-24';w.document.querySelector('#tension-btn').click();},
 w=>{w.confirmDel('2026-08-01');w.document.querySelector('#confirm-yes').click();},
 w=>{w.confirmDelTension('2026-08-02');w.document.querySelector('#confirm-yes').click();},
 w=>w.pauseTracking(),
 w=>{w.document.querySelector('#settings-cycle').value='30';w.document.querySelector('#settings-save-cycle').click();}
 ];
 for(const act of actions){const {w,state}=boot(t);w.switchView('manage');const before=w.localStorage.getItem('marcy_data');state.writeFailure=true;act(w);
  assert.equal(w.localStorage.getItem('marcy_data'),before);assert.match(w.document.querySelector('#toast').textContent,/could not save/);assert.equal(w.document.querySelector('.toast-undo'),null);assert.deepEqual(state.errors,[]);
 }
});

test('failed first save stays on onboarding and failed accepted email save is reported accurately',async t=>{
 const {w,state}=boot(t,{raw:null});state.writeFailure=true;w.document.querySelector('#onboard-go').click();
 assert.ok(w.document.querySelector('#onboard-go'));assert.equal(w.localStorage.getItem('marcy_data'),null);assert.match(w.document.querySelector('#toast').textContent,/could not save/);
 const other=boot(t);other.w.switchView('manage');other.state.writeFailure=true;await other.w.submitEmail('test@example.com');
 assert.equal(other.w.loadData().email,null);assert.match(other.w.document.querySelector('#toast').textContent,/could not save/);assert.equal(other.w.document.querySelector('#settings-save-email').disabled,false);
});

test('legacy records and past future-date mistakes remain readable while imports stay strict',t=>{
 const {w}=boot(t,{raw:JSON.stringify({periods:['2026-08-01'],tensions:['2026-10-01']})});assert.equal(w.document.querySelector('#recovery-import'),null);
 assert.equal(w.loadData().tensions[0],'2026-10-01');assert.throws(()=>w.validateBackup({periods:['2026-10-01']}));
});


test('a read failure after the page opens moves an attempted log into recovery',t=>{
 const {w,state}=boot(t);w.switchView('manage');const original=w.localStorage.getItem('marcy_data');state.readFailure=true;
 w.document.querySelector('#tension-btn').click();assert.ok(w.document.querySelector('#recovery-retry'));assert.deepEqual(state.errors,[]);
 state.readFailure=false;assert.equal(w.localStorage.getItem('marcy_data'),original);
});
