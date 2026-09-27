const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../docs/sw.js'),'utf8');
const root='https://marcy.test/Marcy/';
function boot(){
 const handlers={},stores=new Map();const state={offline:false,status:200,body:'initial',quota:false,blocked:false,skip:false,claimed:false,installRequests:[]};
 const caches={
  async open(name){if(state.blocked)throw Error('blocked');if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {
   async addAll(requests){state.installRequests=requests;const results=await Promise.all(requests.map(async request=>{const response=await fetcher(request);if(!response.ok)throw Error('install failed');return [request.url,response];}));for(const [key,value] of results)store.set(key,value);},
   async put(key,value){if(state.quota)throw Error('full');store.set(key,value.clone());},
   async match(key){return store.get(key)?.clone();}
  };},
  async keys(){return [...stores.keys()];},async delete(key){return stores.delete(key);}
 };
 const fetcher=async()=>{if(state.offline)throw Error('offline');return new Response(state.body,{status:state.status});};
 vm.runInNewContext(source,{URL,Request,Response,Set,caches,fetch:fetcher,self:{location:{href:root+'sw.js'},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:async()=>{state.skip=true;},clients:{claim:async()=>{state.claimed=true;}}}});
 async function lifecycle(name){let pending;handlers[name]({waitUntil:p=>pending=p});await pending;}
 function request(url,method='GET'){let response;handlers.fetch({request:new Request(url,{method}),respondWith:p=>response=p});return response;}
 return {state,stores,lifecycle,request};
}

test('installation includes all bundled fonts and linked pages, and activation preserves unrelated caches',async()=>{
 const {state,stores,lifecycle}=boot();stores.set('marcy-v5',new Map());stores.set('other-site',new Map());
 await lifecycle('install');assert.equal(state.skip,true);
 for(const file of ['index.html','privacy.html','support.html','manifest.json','icon.svg',...['300','400','500','600','700'].map(w=>`fonts/jbm-${w}.ttf`)]){
  assert.ok(state.installRequests.some(r=>r.url===root+file&&r.cache==='reload'));
  assert.ok(fs.existsSync(path.join(__dirname,'../docs',file)));
 }
 await lifecycle('activate');assert.equal(state.claimed,true);assert.equal(stores.has('marcy-v5'),false);assert.equal(stores.has('other-site'),true);
});

test('successful online loads refresh the shared root/index offline copy',async()=>{
 const {state,lifecycle,request}=boot();await lifecycle('install');state.body='updated app';
 assert.equal(await (await request(root+'?verify=latest')).text(),'updated app');state.offline=true;
 for(const url of [root,root+'index.html',root+'index.html?standalone=yes'])assert.equal(await (await request(url)).text(),'updated app');
});

test('privacy, support and fonts are available offline and update after online loads',async()=>{
 const {state,lifecycle,request}=boot();await lifecycle('install');state.offline=true;
 for(const file of ['privacy.html','support.html','fonts/jbm-400.ttf'])assert.equal(await (await request(root+file)).text(),'initial');
 state.offline=false;state.body='updated policy';await request(root+'privacy.html');state.offline=true;
 assert.equal(await (await request(root+'privacy.html')).text(),'updated policy');
});

test('HTTP errors never replace the working offline copy',async()=>{
 const {state,lifecycle,request}=boot();await lifecycle('install');state.status=500;state.body='server error';
 assert.equal(await (await request(root)).text(),'initial');state.offline=true;assert.equal(await (await request(root)).text(),'initial');
});

test('cache write failures still return the online response; unavailable offline copies return 503',async()=>{
 const {state,lifecycle,request}=boot();await lifecycle('install');state.quota=true;state.body='online app';
 assert.equal(await (await request(root)).text(),'online app');state.blocked=true;
 assert.equal(await (await request(root)).text(),'online app');state.offline=true;assert.equal((await request(root)).status,503);
});

test('email submissions, external resources and unrelated same-origin paths are not intercepted',()=>{
 const {request}=boot();assert.equal(request('https://formspree.io/f/example','POST'),undefined);
 assert.equal(request(root+'index.html','POST'),undefined);assert.equal(request('https://outside.test/image'),undefined);
 assert.equal(request('https://marcy.test/another-app/index.html'),undefined);assert.equal(request(root+'unknown.json'),undefined);
});

test('failed precaching does not activate an incomplete worker',async()=>{
 const {state,lifecycle}=boot();state.offline=true;await assert.rejects(lifecycle('install'));assert.equal(state.skip,false);
});
