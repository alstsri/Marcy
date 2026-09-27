const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
function boot(t,onboarded=true){
 const clock={now:'2026-09-24T23:59:00'};const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.fetch=()=>{throw Error('Unexpected network');};
  const D=w.Date;w.Date=class extends D{constructor(...args){super(...(args.length?args:[clock.now]));}};
  w.localStorage.setItem('marcy_data',JSON.stringify({periods:onboarded?['2026-08-01']:[],tensions:[],onboarded,settings:{default_cycle_length:28,manual_cycle_length:null}}));
 }});t.after(()=>dom.window.close());const w=dom.window;if(onboarded)w.switchView('manage');assert.deepEqual(errors,[]);return {w,clock};
}
const forms=[['#log-date','#log-btn','periods'],['#tension-date','#tension-btn','tensions'],['#onboard-date','#onboard-go','periods']];
test('all entry paths reject future dates even if the picker limit is bypassed',t=>{
 for(const [inputId,buttonId] of forms){
  const {w}=boot(t,inputId!=='#onboard-date');const input=w.document.querySelector(inputId);
  assert.equal(input.max,'2026-09-24');const original=w.localStorage.getItem('marcy_data');
  input.removeAttribute('max');input.value='2026-09-25';w.document.querySelector(buttonId).click();
  assert.equal(w.localStorage.getItem('marcy_data'),original);
  assert.match(w.document.querySelector('#toast').textContent,/today or an earlier date/);
 }
});
test('today and earlier dates are accepted by every entry path',t=>{
 for(const [inputId,buttonId,key] of forms)for(const date of ['2026-09-24','2026-09-23']){
  const {w}=boot(t,inputId!=='#onboard-date');w.document.querySelector(inputId).value=date;w.document.querySelector(buttonId).click();
  assert.ok(w.loadData()[key].includes(date));
 }
});
test('date limits follow the local day after midnight without reloading',t=>{
 for(const [inputId,buttonId,key] of forms){
  const {w,clock}=boot(t,inputId!=='#onboard-date');clock.now='2026-09-25T00:01:00';
  const input=w.document.querySelector(inputId);input.dispatchEvent(new w.Event('focus'));
  assert.equal(input.max,'2026-09-25');input.value='2026-09-25';w.document.querySelector(buttonId).click();assert.ok(w.loadData()[key].includes('2026-09-25'));
 }
});
test('invalid and missing dates cannot be saved',t=>{
 const {w}=boot(t);
 for(const value of ['', '2026-02-30', '2026-13-01', 'not-a-date']){
  assert.equal(w.validLogDate(value),false);
  const input=w.document.querySelector('#tension-date');Object.defineProperty(input,'value',{configurable:true,get:()=>value});
  const original=w.localStorage.getItem('marcy_data');w.document.querySelector('#tension-btn').click();assert.equal(w.localStorage.getItem('marcy_data'),original);
 }
});
