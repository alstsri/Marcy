const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
const base = () => ({periods:['2026-09-01'],tensions:[],settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true});
function fakePlugin() {
  const state={pending:[{id:3,title:'Old reminder'}],permission:'granted',requests:0,calls:[],fail:null,hold:null};
  const plugin={
    async getPending(){state.calls.push('pending');if(state.fail==='pending')throw Error();return {notifications:[...state.pending]};},
    async cancel(){state.calls.push('cancel');if(state.fail==='cancel')throw Error();state.pending=[];},
    async checkPermissions(){state.calls.push('permission');if(state.fail==='permission')throw Error();return {display:state.permission};},
    async requestPermissions(){state.requests++;return {display:state.permissionAfterPrompt||'granted'};},
    async schedule({notifications}){state.calls.push('schedule');if(state.fail==='schedule')throw Error();if(state.hold)await state.hold();state.pending=[...notifications];}
  };
  return {plugin,state};
}
function boot(t,{data=base(),now='2026-09-24T12:00:00',native=true}={}) {
  const {plugin,state}=fakePlugin();const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.structuredClone=structuredClone;w.scrollTo=()=>{};w.fetch=()=>{throw Error('Unexpected network');};
    const DateBase=w.Date;w.Date=class extends DateBase {constructor(...args){super(...(args.length?args:[now]));}};
    w.localStorage.setItem('marcy_data',JSON.stringify(data));
    if(native)w.Capacitor={Plugins:{LocalNotifications:plugin}};
  }});t.after(()=>dom.window.close());assert.deepEqual(errors,[]);
  return {w:dom.window,state};
}
const settled=w=>w.eval('notificationQueue');
const dates=s=>s.pending.map(n=>[n.id,n.schedule.at.getMonth()+1,n.schedule.at.getDate(),n.schedule.at.getHours()]);
function log(w,date){w.switchView('manage');w.document.querySelector('#log-date').value=date;w.document.querySelector('#log-btn').click();}
function restore(w,data){return new Promise(resolve=>{const Reader=w.FileReader;w.FileReader=class extends Reader{constructor(){super();this.addEventListener('loadend',()=>{w.FileReader=Reader;w.document.querySelector('#confirm-yes').click();resolve();},{once:true});}};w.importData(new w.File([JSON.stringify(data)],'backup.json'));});}

test('logging, pausing, resuming and deleting periods replace the pending schedule',async t=>{
 const {w,state}=boot(t);await settled(w);assert.equal(state.pending.length,0);
 log(w,'2026-09-24');await settled(w);assert.ok(state.pending.length);
 const original=JSON.stringify(dates(state));
 w.pauseTracking();await settled(w);assert.equal(state.pending.length,0);
 log(w,'2026-09-23');await settled(w);assert.equal(w.loadData().paused,false);assert.ok(state.pending.length);
 w.confirmDel('2026-09-24');w.document.querySelector('#confirm-yes').click();await settled(w);
 assert.notEqual(JSON.stringify(dates(state)),original);
 for(const d of [...w.loadData().periods]){w.confirmDel(d);w.document.querySelector('#confirm-yes').click();}
 await settled(w);assert.equal(state.pending.length,0);
});

test('cycle settings and confirmed import refresh reminders without reloading',async t=>{
 const {w,state}=boot(t,{data:{...base(),periods:['2026-09-20']}});await settled(w);
 const original=JSON.stringify(dates(state));w.switchView('manage');w.document.querySelector('#settings-cycle').value='30';w.document.querySelector('#settings-save-cycle').click();await settled(w);
 assert.notEqual(JSON.stringify(dates(state)),original);
 await restore(w,{...base(),periods:['2026-09-24']});await settled(w);
 assert.deepEqual(dates(state),[[1,10,4,9],[2,10,15,9]]);
 await restore(w,{...base(),periods:[]});await settled(w);assert.equal(state.pending.length,0);
});

test('first period starts scheduling after onboarding and permission is requested only once',async t=>{
 const {w,state}=boot(t,{data:{...base(),periods:[],onboarded:false}});await settled(w);assert.equal(state.requests,0);
 state.permission='prompt';w.document.querySelector('#onboard-date').value='2026-09-24';w.document.querySelector('#onboard-go').click();await settled(w);
 assert.equal(state.requests,1);assert.ok(state.pending.length);
 w.saveData(w.loadData());await settled(w);assert.equal(state.requests,1);
});

test('today at 9am is scheduled only before 9am, with stable event IDs',async t=>{
 for(const [time,count] of [['08:59:00',2],['09:00:00',1],['12:00:00',1]]){
  const {w,state}=boot(t,{now:`2026-09-11T${time}`});await settled(w);
  assert.equal(state.pending.length,count);assert.equal(state.pending.at(-1).id,2);
  assert.ok(state.pending.every(n=>n.schedule.at>new w.Date()));
 }
});

test('denied permission still cancels old reminders; paused startup does not request permission',async t=>{
 const {w,state}=boot(t);state.permission='denied';await settled(w);assert.equal(state.pending.length,0);assert.equal(state.requests,0);
 const paused=boot(t,{data:{...base(),paused:true}});await settled(paused.w);assert.equal(paused.state.pending.length,0);assert.equal(paused.state.calls.includes('permission'),false);
});

test('pause during an in-flight schedule cancels the newly queued stale reminders',async t=>{
 const {w,state}=boot(t);await settled(w);
 let release,entered;const started=new Promise(r=>entered=r);const hold=new Promise(r=>release=r);
 state.hold=async()=>{entered();await hold;};log(w,'2026-09-24');await started;
 w.pauseTracking();release();await settled(w);assert.equal(state.pending.length,0);
 assert.equal(state.calls.at(-1),'cancel');
});

test('rapid edits leave only the newest dates scheduled',async t=>{
 const {w,state}=boot(t);await settled(w);
 for(const date of ['2026-09-20','2026-09-21','2026-09-24'])w.saveData({...base(),periods:[date]});
 await settled(w);assert.deepEqual(dates(state),[[1,10,4,9],[2,10,15,9]]);
});

test('plugin failures are reported without losing data or breaking subsequent updates',async t=>{
 for(const failure of ['pending','cancel','permission','schedule']){
  const {w,state}=boot(t);await settled(w);state.pending=[{id:3}];state.fail=failure;
  const data={...base(),periods:['2026-09-24']};w.saveData(data);await settled(w);
  assert.equal(w.loadData().periods[0],'2026-09-24');assert.match(w.document.querySelector('#toast').textContent,/could not update reminders/);
  state.fail=null;w.saveData(w.loadData());await settled(w);assert.equal(state.pending.length,2);
 }
});

test('web saves work without a native notification plugin',async t=>{
 const {w,state}=boot(t,{native:false});w.saveData({...base(),paused:true});await w.scheduleNotifications();
 assert.equal(w.loadData().paused,true);assert.equal(state.calls.length,0);
});
