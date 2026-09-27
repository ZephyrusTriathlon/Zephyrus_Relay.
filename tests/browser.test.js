const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('connected lifecycle, offline persistence, exceptions and responsive layouts', async(t)=>{
 const tabs=await (await fetch('http://127.0.0.1:9222/json')).json();
 const ws=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise(r=>ws.addEventListener('open',r,{once:true}));
 t.after(()=>ws.close());
 let serial=0;const pending=new Map();const errors=[];
 ws.addEventListener('message',e=>{const msg=JSON.parse(e.data);if(msg.id){pending.get(msg.id)?.(msg);pending.delete(msg.id)}if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails.text)});
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++serial;pending.set(id,msg=>msg.error?reject(msg.error):resolve(msg.result));ws.send(JSON.stringify({id,method,params}))});
 const run=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value};
 const click=selector=>run(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 await send('Runtime.enable');await send('Page.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1050,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:'http://127.0.0.1:4173'});await wait(1000);
 await run("localStorage.clear();state=seed();role='dispatch';render()");
 fs.mkdirSync('artifacts',{recursive:true});
 const shot=async name=>{await run("document.querySelector('#toast').classList.remove('show')");const {data}=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync('artifacts/'+name+'.png',Buffer.from(data,'base64'))};
 await shot('dispatch-desktop');
 await click('[data-role="store"]');await click('[data-action="recommended"]');await shot('store-desktop');
 assert.equal(await run('quantities.reduce((a,b)=>a+b,0)'),40);
 await click('[data-action="create-order"]');await click('[data-action="place-order"]');
 assert.equal(await run("state.orders.find(o=>o.id==='ORD-2847').cartons"),40);
 await click('[data-action="go-dispatch"]');await click('[data-action="assign"][data-id="ORD-2847"]');
 assert.equal(await run("state.orders.find(o=>o.id==='ORD-2847').route"),'R-07');
 await click('[data-action="confirm-dispatch"]');await click('[data-action="release"]');
 await click('[data-role="loader"]');await click('[data-action="offline"]');
 await click('[data-action="issue"]');await click('[data-action="save-issue"]');
 assert.equal(await run('assigned().filter(o=>o.issue).length'),1);
 await click('[data-action="resolve"]');await run("document.querySelector('#resolution').value='Located and counted missing cartons'");await click('[data-action="resolved"]');
 await click('[data-action="loaded"]:not([disabled])');
 assert.ok(await run('state.pending.length>0'));
 await send('Emulation.setDeviceMetricsOverride',{width:834,height:1112,deviceScaleFactor:1,mobile:false});await shot('loader-tablet');
 await send('Page.reload');await wait(500);assert.equal(await run('state.orders.filter(o=>o.loaded).length'),1);
 await run("role='loader';render()");
 while(await run('assigned().some(o=>!o.loaded)'))await click('[data-action="loaded"]:not([disabled])');
 await click('[data-action="complete-loading"]');assert.equal(await run('state.ready'),true);
 await click('[data-role="delivery"]');await click('[data-action="start-route"]');
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await shot('delivery-mobile');
 assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true);
 while(await run("assigned().some(o=>o.status!=='Delivered')")){
  await click('[data-action="arrived"]');await click('[data-action="verify-delivery"]');
  await run("document.querySelector('#verified').checked=true;document.querySelector('#recipient').value='Nimasha Perera'");
  await click('[data-action="delivered"]');
 }
 assert.equal(await run("state.orders.find(o=>o.id==='ORD-2847').status"),'Delivered');
 await click('[data-action="offline"]');assert.equal(await run('state.pending.length'),0);
 await shot('delivery-complete');
 for(const width of [390,768,1280,1440]){
  await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:width<500});
  for(const view of ['store','dispatch','loader','delivery']){
   await run(`role='${view}';render()`);
   assert.equal(await run('document.documentElement.scrollWidth<=innerWidth'),true,`${view} overflows at ${width}`);
  }
 }
 assert.deepEqual(errors,[]);
 await run("state=seed();save();role='dispatch';location.hash='dispatch';render()");
 ws.close();
});
