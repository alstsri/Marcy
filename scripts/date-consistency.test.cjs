const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
function boot(t,now='2026-09-28T23:59:59',onboarded=true){
 const state={now,timer:null,hidden:false,errors:[]};const vc=new VirtualConsole();vc.on('jsdomError',e=>state.errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.fetch=()=>{throw Error('Unexpected network');};
  const D=w.Date;w.Date=class extends D{constructor(...args){super(...(args.length?args:[state.now]));}};
  Object.defineProperty(w.document,'hidden',{get:()=>state.hidden});
  const timer=w.setTimeout.bind(w);w.setTimeout=(fn,delay,...args)=>{if(fn.name==='refreshCalendarDate'){state.timer={fn,delay};return 0;}return timer(fn,delay,...args);};
  w.localStorage.setItem('marcy_data',JSON.stringify({periods:onboarded?['2026-09-01']:[],tensions:[],onboarded,settings:{default_cycle_length:28,manual_cycle_length:null}}));
 }});t.after(()=>dom.window.close());assert.deepEqual(state.errors,[]);return {w:dom.window,state};
}

test('late-day count agrees across status, ring and timeline, with due today at zero',t=>{
 for(const late of [0,1,3,13,14,15]){
  const date=new Date(2026,8,29+late,12);const now=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}T12:00:00`;
  const {w}=boot(t,now);const status=w.getStatus();assert.equal(status.days_late,late);assert.equal(status.days_to_period,late ? -late : 0);
  assert.equal(w.document.querySelector('.ring-day').textContent,late?'+'+late:'0');assert.equal(w.document.querySelector('.ring-label').textContent,late?'past due':'due today');
  if(late>=3&&late<=14)assert.match(w.document.querySelector('.phase-label').textContent,new RegExp(`${late}D LATE`));
  const pause=w.document.querySelector('[onclick="pauseTracking()"]');assert.equal(!!pause,late>=14);
 }
});

test('midnight timer updates the visible dashboard without reloading',t=>{
 const {w,state}=boot(t);assert.equal(w.document.querySelector('.ring-day').textContent,'28');assert.equal(state.timer.delay,1050);
 const raw=w.localStorage.getItem('marcy_data');state.now='2026-09-29T00:00:01';state.timer.fn();
 assert.equal(w.document.querySelector('.ring-day').textContent,'0');assert.equal(w.document.querySelector('.ring-label').textContent,'due today');
 assert.equal(w.localStorage.getItem('marcy_data'),raw);assert.ok(state.timer.delay>0);
});

test('returning from background refreshes once while preserving focused drafts and chosen dates',t=>{
 const {w,state}=boot(t);w.switchView('manage');
 const name=w.document.querySelector('#settings-name');name.value='Unfinished';name.focus();name.setSelectionRange(2,5);
 const date=w.document.querySelector('#log-date');date.value='2026-09-28';date.dispatchEvent(new w.Event('input'));
 const defaultDate=w.document.querySelector('#tension-date');assert.equal(defaultDate.value,'2026-09-28');
 state.hidden=true;state.now='2026-09-30T08:00:00';state.timer.fn();assert.equal(w.document.querySelector('#tension-date').value,'2026-09-28');
 state.hidden=false;w.document.dispatchEvent(new w.Event('visibilitychange'));
 assert.equal(w.document.querySelector('#settings-name').value,'Unfinished');assert.equal(w.document.activeElement.id,'settings-name');assert.equal(w.document.activeElement.selectionStart,2);
 assert.equal(w.document.querySelector('#log-date').value,'2026-09-28');assert.equal(w.document.querySelector('#log-date').max,'2026-09-30');
 assert.equal(w.document.querySelector('#tension-date').value,'2026-09-30');
 assert.equal(w.document.querySelector('[aria-current="date"]').dataset.tensionDay,'30');
 const same=w.document.querySelector('#settings-name');w.dispatchEvent(new w.Event('focus'));assert.equal(w.document.querySelector('#settings-name'),same);
});

test('pageshow refresh preserves onboarding name and email while advancing the untouched date',t=>{
 const {w,state}=boot(t,'2026-09-28T23:59:59',false);
 w.document.querySelector('#onboard-name').value='Alex';w.document.querySelector('#onboard-email').value='draft@example.com';
 state.now='2026-09-29T10:00:00';w.dispatchEvent(new w.Event('pageshow'));
 assert.equal(w.document.querySelector('#onboard-name').value,'Alex');assert.equal(w.document.querySelector('#onboard-email').value,'draft@example.com');
 assert.equal(w.document.querySelector('#onboard-date').value,'2026-09-29');assert.equal(w.document.querySelector('#onboard-date').max,'2026-09-29');
});
