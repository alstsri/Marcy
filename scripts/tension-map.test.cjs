const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM, VirtualConsole} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
function boot(t, data, plugin) {
  const vc = new VirtualConsole(); const errors=[]; vc.on('jsdomError', e=>errors.push(e.message));
  const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
    w.structuredClone=structuredClone; w.scrollTo=()=>{};
    w.fetch=()=>{throw new Error('Unexpected network call');};
    const OriginalDate=w.Date;
    w.Date=class extends OriginalDate {constructor(...args){super(...(args.length?args:['2026-09-24T12:00:00']));}};
    w.localStorage.setItem('marcy_data',JSON.stringify({settings:{default_cycle_length:28,manual_cycle_length:null},onboarded:true,...data}));
    if(plugin) w.Capacitor={Plugins:{LocalNotifications:plugin}};
  }}); t.after(()=>dom.window.close()); assert.deepEqual(errors,[]); return dom.window;
}
const summary=(w)=>w.getTensionAnalysis(w.loadData());

test('existing event dates map to completed/current cycles and prehistory without migration',t=>{
  const data={periods:['2026-08-01','2026-08-29'],tensions:['2026-07-30','2026-08-01','2026-08-28','2026-08-29','2026-09-24']};
  const w=boot(t,data); const raw=w.localStorage.getItem('marcy_data'), a=summary(w);
  assert.equal(w.getTensionDay(a,1).events,1);
  assert.equal(w.getTensionDay(a,28).events,1);
  assert.equal(w.getTensionDay(a,1).currentRecorded,true);
  assert.equal(w.getTensionDay(a,27).currentRecorded,true);
  assert.deepEqual(Array.from(a.unmapped),['2026-07-30']);
  w.switchView('manage');
  assert.ok(w.document.querySelector('.tension-map').textContent.includes('2026-07-30'));
  assert.equal(w.localStorage.getItem('marcy_data'),raw);
});

test('uniform daily events produce a uniform full-cycle map, not a peak',t=>{
  const w=boot(t,{periods:['2026-08-01','2026-08-29'],tensions:Array.from({length:28},(_,i)=>`2026-08-${String(i+1).padStart(2,'0')}`)});
  const a=summary(w);
  for(let d=1;d<=28;d++){ const cell=w.getTensionDay(a,d);assert.equal(cell.events,1);assert.equal(cell.eligible,1);assert.equal(cell.rate,1); }
  assert.equal(a.hottest_day_before,undefined);
  assert.equal(w.getStatus().tension_alert,undefined);
  assert.doesNotMatch(w.document.querySelector('#content').textContent,/peak tension|tension alert/i);
  w.switchView('manage');
  const levels=[...w.document.querySelectorAll('[aria-label="Completed cycles"] .heat-cell')].map(el=>el.dataset.level);
  assert.deepEqual([...new Set(levels)],['4']);
});

test('different lengths use per-day denominators and current cycle never dilutes rates',t=>{
  const w=boot(t,{periods:['2026-07-01','2026-07-21','2026-08-20'],tensions:['2026-07-05','2026-08-14','2026-08-24']});
  const a=summary(w);
  assert.equal(w.getTensionDay(a,5).events,1); assert.equal(w.getTensionDay(a,5).eligible,2); assert.equal(w.getTensionDay(a,5).rate,.5);
  assert.equal(w.getTensionDay(a,25).events,1); assert.equal(w.getTensionDay(a,25).eligible,1); assert.equal(w.getTensionDay(a,25).rate,1);
  assert.equal(w.getTensionDay(a,31).rate,null);
  assert.equal(w.getTensionDay(a,5).currentRecorded,true);
});

test('single in-progress cycle shows current observations with no completed coverage',t=>{
  const w=boot(t,{periods:['2026-09-20'],tensions:['2026-09-21']}); w.switchView('manage');
  const historical=w.document.querySelector('[aria-label="Completed cycles"] [data-tension-day="2"]');
  const current=w.document.querySelector('[aria-label="Current cycle"] [data-tension-day="2"]');
  assert.equal(historical.querySelector('small').textContent,'—');
  assert.equal(current.querySelector('small').textContent,'●');
  assert.equal(w.document.querySelector('[aria-label="Current cycle"] [data-tension-day="6"] small').textContent,'—');
  current.click();
  assert.ok(w.document.querySelector('.heat-details').textContent.includes('2026-09-21 — event recorded'));
});

test('day details include actual dates and missing entries; later days remain reachable',t=>{
  const w=boot(t,{periods:['2026-07-01','2026-08-15','2026-09-15'],tensions:['2026-08-09']});w.switchView('manage');
  w.document.querySelector('[data-tension-page="1"]').click();
  const cell=w.document.querySelector('[aria-label="Completed cycles"] [data-tension-day="40"]');
  assert.ok(cell);assert.equal(cell.querySelector('small').textContent,'1/1'); cell.click();
  assert.match(w.document.querySelector('.heat-details').textContent,/2026-08-09: event recorded/);
  w.document.querySelector('[data-tension-page="0"]').click();
  w.document.querySelector('[data-tension-day="2"]').click();
  assert.match(w.document.querySelector('.heat-details').textContent,/2026-07-02: no event recorded/);
  assert.match(w.document.querySelector('.heat-details').textContent,/2026-08-16: no event recorded/);
});

test('logging tension shows the refreshed map without switching back to dashboard',t=>{
  const w=boot(t,{periods:['2026-09-20'],tensions:[]});w.switchView('manage');
  w.document.querySelector('#tension-date').value='2026-09-24';w.document.querySelector('#tension-btn').click();
  assert.ok(w.document.querySelector('.tension-map'));
  assert.equal(w.document.querySelector('[aria-label="Current cycle"] [data-tension-day="5"] small').textContent,'●');
});

test('long intervals remain visible instead of silently discarding irregular cycles',t=>{
  const w=boot(t,{periods:['2026-06-01','2026-08-01'],tensions:['2026-07-30']}); const a=summary(w);
  assert.equal(a.cycles[0].length,61); assert.equal(w.getTensionDay(a,60).events,1);
});

test('native startup cancels previously pending tension alerts and schedules no new ones',async t=>{
  let scheduled=[],cancelled=[];let done;const complete=new Promise(resolve=>done=resolve);
  boot(t,{periods:['2026-09-20'],tensions:['2026-09-21']},{
    requestPermissions:async()=>({display:'granted'}),
    getPending:async()=>({notifications:[{id:3,title:'Peak tension day'}]}),
    cancel:async pending=>{cancelled=pending.notifications;},
    schedule:async request=>{scheduled=request.notifications;done();},
  });await complete;
  assert.equal(cancelled[0].id,3); assert.ok(scheduled.length);
  assert.ok(scheduled.every(n=>!/tension/i.test(n.title+n.body)));
});
