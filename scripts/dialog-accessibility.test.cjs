const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
function boot(t){
 const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};w.localStorage.setItem('marcy_data',JSON.stringify({periods:['2026-08-01'],tensions:[],onboarded:true,settings:{default_cycle_length:28,manual_cycle_length:null}}));
 }});t.after(()=>dom.window.close());const w=dom.window;w.switchView('manage');assert.deepEqual(errors,[]);return w;
}
function key(w,name,shiftKey=false){const e=new w.KeyboardEvent('keydown',{key:name,shiftKey,bubbles:true,cancelable:true});w.document.activeElement.dispatchEvent(e);return e;}

test('dialog announces its message, focuses Cancel, and hides background until Escape restores focus',t=>{
 const w=boot(t);const trigger=w.document.querySelector('#erase-data');trigger.focus();trigger.click();
 const dialog=w.document.querySelector('[role="dialog"]');assert.equal(dialog.getAttribute('aria-modal'),'true');
 assert.ok(w.document.getElementById(dialog.getAttribute('aria-describedby')));assert.ok(w.document.activeElement.classList.contains('confirm-cancel'));
 assert.equal(w.document.querySelector('#content').getAttribute('aria-hidden'),'true');assert.ok(w.document.querySelector('#bottom-nav').hasAttribute('inert'));
 key(w,'Escape');assert.equal(w.document.querySelector('[role="dialog"]'),null);assert.equal(w.document.activeElement,trigger);
 assert.equal(w.document.querySelector('#content').hasAttribute('aria-hidden'),false);assert.equal(w.document.querySelector('#bottom-nav').hasAttribute('inert'),false);
});

test('Tab wraps through every control including export and focus cannot escape',t=>{
 const w=boot(t);w.confirmEraseData();const first=w.document.querySelector('#erase-export'),last=w.document.querySelector('#confirm-yes');
 last.focus();assert.equal(key(w,'Tab').defaultPrevented,true);assert.equal(w.document.activeElement,first);
 assert.equal(key(w,'Tab',true).defaultPrevented,true);assert.equal(w.document.activeElement,last);
 w.document.querySelector('#settings-name').focus();assert.ok(w.document.activeElement.classList.contains('confirm-cancel'));
 w.dismissConfirm();w.document.querySelector('#settings-name').focus();assert.equal(w.document.activeElement.id,'settings-name');
});

test('Cancel and backdrop dismissal restore the opener and preserve existing background state',t=>{
 const w=boot(t);const nav=w.document.querySelector('#bottom-nav');nav.setAttribute('aria-hidden','false');nav.setAttribute('inert','');
 const trigger=w.document.querySelector('#erase-data');
 for(const selector of ['.confirm-cancel','.confirm-overlay']){trigger.focus();trigger.click();w.document.querySelector(selector).click();assert.equal(w.document.activeElement,trigger);assert.equal(nav.getAttribute('aria-hidden'),'false');assert.ok(nav.hasAttribute('inert'));}
});

test('deleting an entry returns focus to the content when its opener disappears',t=>{
 const w=boot(t);w.togglePeriodHistory();const trigger=w.document.querySelector('[data-delete-period]');trigger.focus();trigger.click();
 w.document.querySelector('#confirm-yes').click();assert.equal(w.document.querySelector('[role="dialog"]'),null);
 assert.equal(w.document.activeElement.id,'content');assert.equal(w.loadData().periods.length,0);
});

test('replacing a dialog does not leave stale keyboard or focus handlers',t=>{
 const w=boot(t);w.document.querySelector('#erase-data').focus();w.confirmEraseData();let confirmed=false;
 w.showConfirm('A different question',()=>{confirmed=true;});key(w,'Escape');assert.equal(confirmed,false);
 const input=w.document.querySelector('#settings-name');input.focus();assert.equal(w.document.activeElement,input);
 assert.equal(key(w,'Tab').defaultPrevented,false);
});
