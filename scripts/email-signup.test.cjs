const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM,VirtualConsole}=require('jsdom');
const html=fs.readFileSync(path.join(__dirname,'../docs/index.html'),'utf8');
function boot(t,{onboarded=true}={}){
 const requests=[],timeouts=[];const errors=[];const vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://marcy.test/',runScripts:'dangerously',virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.scrollTo=()=>{};
  w.fetch=(url,options)=>new Promise((resolve,reject)=>{requests.push({url,options,resolve,reject});options.signal.addEventListener('abort',()=>reject(Error('aborted')));});
  const timer=w.setTimeout.bind(w);w.setTimeout=(fn,ms,...args)=>{if(ms===15000){timeouts.push(fn);return 0;}return timer(fn,ms,...args);};
  w.localStorage.setItem('marcy_data',JSON.stringify({periods:onboarded?['2026-09-01']:[],tensions:[],onboarded,settings:{default_cycle_length:28,manual_cycle_length:null}}));
 }});t.after(()=>dom.window.close());assert.deepEqual(errors,[]);return {w:dom.window,requests,timeouts};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));

test('signup waits for acceptance, prevents duplicate requests, and preserves edits made while waiting',async t=>{
 const {w,requests}=boot(t);w.switchView('manage');
 const result=w.submitEmail('test@example.com');
 assert.equal(w.loadData().email,null);assert.equal(w.loadData().email_prompted,false);
 assert.equal(w.document.querySelector('#settings-save-email').disabled,true);
 assert.equal(await w.submitEmail('duplicate@example.com'),false);assert.equal(requests.length,1);
 assert.equal(requests[0].options.headers.Accept,'application/json');
 assert.deepEqual(JSON.parse(requests[0].options.body),{email:'test@example.com'});
 const data=w.loadData();data.partner_name='New name';w.saveData(data);
 requests[0].resolve({ok:true,status:200});assert.equal(await result,true);
 assert.equal(w.loadData().email,'test@example.com');assert.equal(w.loadData().email_prompted,true);
 assert.equal(w.document.querySelector('#email-signup-status').textContent,'you’re signed up.');
 assert.equal(w.document.querySelector('#settings-email'),null);
 assert.equal(w.document.querySelector('#settings-save-email'),null);
 assert.equal(w.document.querySelector('#settings-clear-email'),null);
 assert.equal(w.loadData().partner_name,'New name');assert.match(w.document.querySelector('#toast').textContent,/keep you posted/);
});

test('HTTP errors, network errors and timeouts show failure, preserve records and allow retry',async t=>{
 for(const failure of ['http','network','timeout']){
  const {w,requests,timeouts}=boot(t);w.switchView('manage');const before=w.localStorage.getItem('marcy_data');
  const result=w.submitEmail('retry@example.com');
  if(failure==='http')requests[0].resolve({ok:false,status:500});
  else if(failure==='network')requests[0].reject(Error('offline'));
  else timeouts[0]();
  assert.equal(await result,false);assert.equal(w.localStorage.getItem('marcy_data'),before);
  assert.match(w.document.querySelector('#toast').textContent,/couldn't sign up/);
  assert.equal(w.document.querySelector('#settings-email').value,'retry@example.com');
  assert.equal(w.document.querySelector('#settings-save-email').disabled,false);
  w.document.querySelector('#settings-save-email').click();assert.equal(requests.length,2);
  requests[1].resolve({ok:true});await flush();assert.equal(w.loadData().email,'retry@example.com');
 }
});

test('onboarding finishes without marking a failed signup complete and offers the draft in settings',async t=>{
 const {w,requests}=boot(t,{onboarded:false});
 w.document.querySelector('#onboard-email').value='onboard@example.com';w.document.querySelector('#onboard-go').click();
 assert.equal(w.loadData().onboarded,true);assert.equal(w.loadData().periods.length,1);assert.equal(w.loadData().email,null);
 requests[0].resolve({ok:false,status:422});await flush();
 assert.equal(w.loadData().email,null);assert.equal(w.loadData().email_prompted,false);
 assert.match(w.document.querySelector('#toast').textContent,/couldn't sign up/);
 w.switchView('manage');assert.equal(w.document.querySelector('#settings-email').value,'onboard@example.com');
});

test('accepted onboarding signup keeps the newly saved period and partner name',async t=>{
 const {w,requests}=boot(t,{onboarded:false});
 w.document.querySelector('#onboard-email').value='onboard@example.com';w.document.querySelector('#onboard-name').value='Alex';
 w.document.querySelector('#onboard-go').click();requests[0].resolve({ok:true});await flush();
 assert.equal(w.loadData().email,'onboard@example.com');assert.equal(w.loadData().partner_name,'Alex');assert.equal(w.loadData().periods.length,1);
});
