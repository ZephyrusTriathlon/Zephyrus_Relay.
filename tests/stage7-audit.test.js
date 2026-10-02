const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {promisify}=require('node:util');
const execFile=promisify(require('node:child_process').execFile);
const {createOperationalFixture,cleanupOperationalFixture}=require('./operational-fixture');
if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');

test('Stage 7 second-audit regressions on persisted operational fixtures',{timeout:240000},async t=>{
  const {createDatabase}=await import('../apps/api/src/db.js');
  const {createApp}=await import('../apps/api/src/app.js');
  const db=createDatabase(),fixtures=[],cookies=[],users=[],browsers=[];
  const app=createApp({database:()=>db}),server=app.listen(0,'127.0.0.1');
  await new Promise(r=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,cookie,body,key=randomUUID())=>{
    const r=await fetch(base+'/api'+path,{headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json',...(key?{'Idempotency-Key':key}:{})})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
    return {status:r.status,data:r.status===204?null:await r.json()};
  };
  const login=async identifier=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier,password:'RelayDemo!26'})});assert.equal(r.status,200);const c=r.headers.get('set-cookie').split(';')[0];cookies.push(c);return c;};
  const op=async(f,cookie,action,a,body={},status=200,key=randomUUID())=>{const r=await request(`/operations/trips/${f.trip.id}${a?`/allocations/${a.id}`:''}/${action}`,cookie,body,key);assert.equal(r.status,status,JSON.stringify(r.data));return r.data;};
  t.after(async()=>{
    for(const b of browsers)await b.close();
    for(const c of cookies)await request('/auth/logout',c,{});
    await new Promise(r=>server.close(r));await app.locals.sessionStore.close();
    for(const f of fixtures.reverse())await cleanupOperationalFixture(db,f);
    await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();
  });
  const [dispatcher,loader,driver,store]=await Promise.all(['dispatcher','loader','driver','store'].map(login));
  const candidateDays=await db.calendarDay.findMany({where:{date:{gte:new Date('2024-09-01'),lte:new Date('2024-09-30')},isOperating:true},orderBy:{date:'asc'}});
  let date;
  for(const day of candidateDays){if(!await db.trip.count({where:{deliveryDate:day.date}})&&!await db.order.count({where:{deliveryDate:day.date}})){date=day.date.toISOString().slice(0,10);break;}}
  assert.ok(date,'An unused operating fixture date is required; existing work is never reset');
  const fixture=async options=>{const f=await createOperationalFixture(db,{date,...options});fixtures.push(f);const release=await request('/planning/release',dispatcher,{date});assert.equal(release.status,200,JSON.stringify(release.data));assert.ok(release.data.trips.some(x=>x.id===f.trip.id));return f;};
  const allocationSnapshot={loadingCheck:true,loadingIssues:{orderBy:{reportedAt:'asc'}},exceptions:{orderBy:{reportedAt:'asc'}},events:{orderBy:{recordedAt:'asc'}},proof:{include:{receipt:true}},order:{include:{items:true,history:{orderBy:{occurredAt:'asc'}}}}};
  const snapshot=f=>db.trip.findUnique({where:{id:f.trip.id},include:{stops:{orderBy:{position:'asc'},include:{allocations:{orderBy:{id:'asc'},include:allocationSnapshot}}}}});
  const prepare=async f=>{for(const a of f.allocations)await op(f,loader,'load',a,{cartons:10});await op(f,loader,'complete-loading');await op(f,driver,'start');};
  const pod=()=>({recipient:'Audit Recipient',cartons:10,verified:true,deliveredAt:new Date().toISOString()});
  let multi,field,dispatchBrowser;
  const openBrowser=async()=>{const b=await require('./cdp').connect({isolated:true});browsers.push(b);await b.send('Page.navigate',{url:base});await b.waitFor('identityReady');return b;};
  const uiLogin=async(b,id)=>{
    if(await b.run('!!currentAccount()')){await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await b.waitFor("!!document.querySelector('#login-form')");}
    await b.input('#login-id',id);await b.input('#login-password','RelayDemo!26');await b.click('[type="submit"]');await b.waitFor('!!currentAccount()');
    if(['loader','driver'].includes(id))await b.waitFor('!fieldLoading && fieldTrips.length>0');
  };
  const selectTrip=async(b,f)=>b.run(`(()=>{const select=document.querySelector('#field-trip');select.value=${JSON.stringify(f.trip.id)};select.dispatchEvent(new Event('change'));})()`);
  const dispatcherReload=async(status)=>{
    await dispatchBrowser.send('Page.reload');await dispatchBrowser.waitFor("!!document.querySelector('#planning-date')");
    await dispatchBrowser.input('#planning-date',date,'change');await dispatchBrowser.click('[data-action="planning-load"]');await dispatchBrowser.waitFor('!!planningDay && !planningBusy');
    const text=await dispatchBrowser.run(`([...document.querySelectorAll('h3')].find(h=>h.textContent.includes(${JSON.stringify(multi.trip.tripNumber)}))||{}).textContent`);
    assert.ok(text?.endsWith('| '+status),`Dispatcher reload must render ${status}: ${text}`);
  };
  const controls=async(b,selectors)=>{
    assert.equal(await b.run('document.documentElement.scrollWidth<=innerWidth+1'),true);
    for(const [selector,label] of selectors){
      const result=await b.run(`(()=>{const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.getClientRects().length);if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {text:e.textContent,disabled:e.disabled,left:r.left,right:r.right,width:r.width,height:r.height};})()`);
      assert.ok(result&&result.width>0&&result.height>0&&result.left>=-1,selector);assert.ok(!result.disabled,selector);assert.ok(result.text.includes(label),`${selector}: ${result.text}`);
    }
    assert.deepEqual(await b.run("[...document.querySelectorAll('.nav button')].map(e=>e.dataset.action)"),['workspace-home','account','activity']);
  };

  await t.test('HTTP role and assignment boundaries protect every online action',async()=>{
    multi=await fixture({outletIds:['OUT004','OUT005','OUT011']});
    assert.equal((await request('/operations/trips',null)).status,401);
    await op(multi,dispatcher,'start',null,{},403);await op(multi,loader,'start',null,{},403);await op(multi,driver,'load',multi.allocations[0],{cartons:10},403);
    await op(multi,driver,'start',null,{},409);
    await op(multi,loader,'load',multi.allocations[0],{cartons:10},400,null);
    const template=await db.user.findUnique({where:{email:'store@relay.demo'}});
    const otherDepot=await db.depot.findFirstOrThrow({where:{id:{not:multi.trip.depotId}}});
    for(const role of ['LOADER','DRIVER','STORE_MANAGER']){
      const id=randomUUID(),email=`audit-${id}@relay.demo`;await db.user.create({data:{id,email,displayName:'Isolated scoped actor',role,passwordHash:template.passwordHash,depotId:role==='LOADER'?otherDepot.id:null,outletId:role==='STORE_MANAGER'?'OUT005':null}});users.push(id);
      const cookie=await login(email);await op(multi,cookie,role==='LOADER'?'load':role==='DRIVER'?'start':'receipt',role==='DRIVER'?null:multi.allocations[0],role==='DRIVER'?{}:{cartons:10},404);
      if(role!=='STORE_MANAGER')assert.equal((await request('/operations/trips',cookie)).data.trips.some(t=>t.id===multi.trip.id),false);
    }
    await db.trip.update({where:{id:multi.trip.id},data:{driverId:null}});await op(multi,driver,'start',null,{},404);
    await db.trip.update({where:{id:multi.trip.id},data:{driverId:'demo-user-driver'}});
  });

  await t.test('Three-stop reverse loading and Loader Designathon controls survive phone/tablet reloads',async()=>{
    field=await openBrowser();dispatchBrowser=await openBrowser();await uiLogin(dispatchBrowser,'dispatcher');await dispatcherReload('RELEASED');
    await uiLogin(field,'loader');await selectTrip(field,multi);
    const expected=[...multi.stops].reverse().map(s=>s.id);
    assert.deepEqual(await field.run('fieldOrders.map(o=>o.stopId)'),multi.stops.map(s=>s.id));
    assert.deepEqual(await field.run("[...document.querySelectorAll('.shipment [data-action=loaded]')].map(b=>fieldOrders.find(o=>o.id===b.dataset.id).stopId)"),expected);
    for(const width of [360,768,1024]){
      await field.viewport(width);assert.ok((await field.run("document.querySelector('h1').textContent")).includes('Every carton. In the right order.'));
      assert.deepEqual(await field.run("[...document.querySelectorAll('.cargo-position b')].map(e=>Number(e.textContent))"),[3,2,1]);
      await controls(field,[['[data-action="loaded"]:not(:disabled)','Confirm loaded'],['[data-action="issue"]:not(:disabled)','Report an issue']]);
      assert.equal(await field.run("document.querySelector('[data-action=complete-loading]').textContent.includes('Complete loading')"),true);
      assert.equal(await field.run("document.querySelectorAll('[data-action=offline],button[data-role]').length"),0);
      await field.screenshot(`stage07-audit-loader-${width}`);
    }
  });

  await t.test('Quantity mismatch 10/8 and 10/12 persists; 10/10 rechecks normally without changing allocation',async()=>{
    const a=multi.allocations[2];
    for(const checked of [8,12]){
      await field.click(`[data-action="issue"][data-id="${a.id}"]`);
      await field.run("document.querySelector('#issue-type').value='Quantity mismatch'");await field.input('#issue-cartons',String(checked));await field.input('#issue-note',`Counted ${checked}`);await field.click('[data-action="save-issue"]');await field.waitFor('!fieldBusy && fieldOrders.some(o=>o.issue)');
      await field.send('Page.reload');await field.waitFor('!fieldLoading && fieldTrips.length>0');await selectTrip(field,multi);
      const stored=(await snapshot(multi)).stops[2].allocations[0];assert.equal(stored.loadingCheck.loadedCartons,checked);assert.equal(stored.loadingCheck.status,'ISSUE');assert.equal(stored.order.items[0].cartons,10);assert.equal(stored.loadingIssues.filter(i=>i.status==='OPEN').length,1);
      await op(multi,loader,'complete-loading',null,{},409);await op(multi,loader,'load',a,{cartons:10},409);
      await dispatcherReload('LOADING');
      await field.click(`[data-action="resolve"][data-id="${a.id}"]`);await field.input('#resolution','Reconciled against original manifest');await field.click('[data-action="resolved"]');await field.waitFor('!fieldBusy && fieldOrders.every(o=>!o.issue)');
    }
    await op(multi,loader,'loading-issue',a,{type:'QUANTITY_MISMATCH',cartons:-1},400);
    for(const a of [...multi.allocations].reverse()){
      await field.click(`[data-action="loaded"][data-id="${a.id}"]`);await field.waitFor(`!fieldBusy && fieldOrders.find(o=>o.id===${JSON.stringify(a.id)}).loaded`);
    }
    await controls(field,[['[data-action="complete-loading"]','Complete loading']]);await field.click('[data-action="complete-loading"]');await field.waitFor("!fieldBusy && selectedFieldTrip().status==='READY'");await dispatcherReload('READY');
    const before=await snapshot(multi);await op(multi,loader,'loading-issue',a,{type:'DAMAGED',cartons:0},409);assert.deepEqual(await snapshot(multi),before);
  });

  await t.test('Driver 360/390/430 controls continue elsewhere, persist deferral and return to complete',async()=>{
    await uiLogin(field,'driver');await selectTrip(field,multi);
    for(const width of [360,390,430]){await field.viewport(width);await controls(field,[['[data-action="start-route"]','Start route']]);}
    await field.click('[data-action="start-route"]');await field.waitFor("!fieldBusy && selectedFieldTrip().status==='IN_PROGRESS'");await dispatcherReload('IN_PROGRESS');
    for(const width of [360,390,430]){await field.viewport(width);await controls(field,[['[data-action="arrived"]','arrived'],['[data-action="issue"]','Report a delivery issue']]);}
    const first=multi.allocations[0];await field.click('[data-action="issue"]');await field.input('#issue-note','Receiving desk closed; return later');await field.click('[data-action="save-issue"]');await field.waitFor(`!fieldBusy && nextDelivery()?.stopId===${JSON.stringify(multi.stops[1].id)}`);
    await op(multi,driver,'complete',null,{},409);assert.equal((await snapshot(multi)).stops[0].status,'DEFERRED');
    await field.send('Page.reload');await field.waitFor('!fieldLoading && fieldTrips.length>0');await selectTrip(field,multi);
    assert.equal(await field.run('nextDelivery().stopId'),multi.stops[1].id);
    for(const a of multi.allocations.slice(1)){
      await field.click('[data-action="arrived"]');await field.waitFor('!fieldBusy && nextDelivery()?.arrived');
      for(const width of [360,390,430]){await field.viewport(width);await controls(field,[['[data-action="verify-delivery"]','Verify & confirm delivery']]);}
      for(const cartons of [8,12]){
        await op(multi,driver,'pod',a,{...pod(),cartons},409);
        await op(multi,driver,'exception',a,{type:'PARTIAL_DELIVERY',details:`Expected 10, counted ${cartons}`});
        assert.equal(await db.proofOfDelivery.count({where:{allocationId:a.id}}),0);
        await op(multi,driver,'resolve',a,{resolution:'Count reconciled to 10'});await op(multi,driver,'arrive',a);
      }
      await field.click('[data-action="verify-delivery"]');await field.input('#recipient','Audit Recipient');await field.click('#verified');await field.click('[data-action="delivered"]');await field.waitFor(`!fieldBusy && fieldOrders.find(o=>o.id===${JSON.stringify(a.id)}).proof`);
    }
    await op(multi,driver,'complete',null,{},409);assert.equal((await snapshot(multi)).status,'IN_PROGRESS');
    for(const width of [360,390,430]){await field.viewport(width);await controls(field,[[`[data-action="retry-stop"][data-id="${first.id}"]`,'Retry']]);}
    await field.click(`[data-action="retry-stop"][data-id="${first.id}"]`);await field.input('#resolution','Receiving desk reopened');await field.click('[data-action="resolved"]');await field.waitFor('!fieldBusy && nextDelivery()?.returnRequested');
    await field.click('[data-action="arrived"]');await field.waitFor('!fieldBusy && nextDelivery()?.arrived');await field.click('[data-action="verify-delivery"]');await field.input('#recipient','Audit Recipient');await field.click('#verified');await field.click('[data-action="delivered"]');await field.waitFor("!fieldBusy && selectedFieldTrip().status==='COMPLETED'");
    await dispatcherReload('COMPLETED');
    const final=await snapshot(multi);assert.ok(final.stops.every(s=>s.status==='COMPLETED'));assert.deepEqual(final.stops.map(s=>s.id),multi.stops.map(s=>s.id));
    for(const a of multi.allocations)assert.equal(await db.proofOfDelivery.count({where:{allocationId:a.id}}),1);
    await op(multi,store,'receipt',first,{cartons:10});
    const history=(await snapshot(multi)).stops[0].allocations[0].order.history;assert.deepEqual(history.map(h=>h.status),['CONFIRMED','PLANNED','IN_DELIVERY','DELIVERED','RECEIVED']);
    assert.deepEqual(field.errors,[]);assert.deepEqual(dispatchBrowser.errors,[]);
  });

  for(const order of ['Store then Driver','Driver then Store'])await t.test(`Mixed shared-stop issues reconcile: ${order}`,async()=>{
    const f=await fixture({sharedFirst:true}),[a,b]=f.allocations;await prepare(f);await op(f,driver,'arrive',a);await op(f,driver,'pod',a,pod());
    await op(f,store,'receipt-issue',a,{type:'DAMAGED_GOODS',details:'Inspect packaging'});await op(f,driver,'exception',b,{type:'RECIPIENT_UNAVAILABLE',details:'Recipient left'});
    const resolveStore=()=>op(f,store,'resolve-receipt',a,{resolution:'Packaging intact'}),resolveDriver=()=>op(f,driver,'resolve',b,{resolution:'Recipient returned'});
    await (order==='Store then Driver'?resolveStore():resolveDriver());
    let stop=(await snapshot(f)).stops[0];assert.equal(stop.status,'DEFERRED');assert.equal(stop.allocations.flatMap(a=>a.exceptions).filter(e=>e.status==='OPEN').length,1);await op(f,driver,'arrive',b,{},409);await op(f,driver,'complete',null,{},409);
    await (order==='Store then Driver'?resolveDriver():resolveStore());stop=(await snapshot(f)).stops[0];assert.equal(stop.status,'PENDING');assert.equal(stop.allocations.flatMap(a=>a.exceptions).filter(e=>e.status==='OPEN').length,0);assert.equal(stop.allocations.flatMap(a=>a.exceptions).length,2);
    await op(f,driver,'arrive',b);await op(f,driver,'pod',b,pod());assert.equal((await snapshot(f)).status,'COMPLETED');assert.equal(await db.tripStop.count({where:{tripId:f.trip.id}}),1);
  });

  await t.test('Durable action IDs suppress delayed replay while allowing a new exception action',async()=>{
    const f=await fixture({}),a=f.allocations[0],loadId=randomUUID(),r1=randomUUID(),resolveId=randomUUID();
    await op(f,loader,'load',a,{cartons:10},200,loadId);await op(f,loader,'complete-loading');await op(f,driver,'start');
    const issue={type:'STORE_CLOSED',details:'Receiving desk unavailable'};
    await op(f,driver,'exception',a,issue,200,r1);await op(f,driver,'resolve',a,{resolution:'Desk reopened'},200,resolveId);await op(f,driver,'arrive',a);
    const before=await snapshot(f);await op(f,driver,'exception',a,issue,200,r1);await op(f,loader,'load',a,{cartons:10},200,loadId);assert.deepEqual(await snapshot(f),before);
    await op(f,driver,'exception',a,{...issue,details:'Changed payload'},409,r1);
    await op(f,driver,'exception',a,issue,200,randomUUID());assert.equal(await db.deliveryException.count({where:{allocationId:a.id}}),2);assert.equal(await db.deliveryEvent.count({where:{allocationId:a.id,type:'DEFERRED'}}),2);
    await op(f,driver,'resolve',a,{resolution:'Desk reopened'},200,resolveId);assert.equal((await snapshot(f)).stops[0].status,'DEFERRED','Old resolution must not close a new issue');
    await op(f,driver,'resolve',a,{resolution:'Second reopening'});await op(f,driver,'arrive',a);
    const proof=pod(),podId=randomUUID();await op(f,driver,'pod',a,proof,200,podId);await op(f,driver,'pod',a,proof,200,podId);
    const receiptId=randomUUID();await op(f,store,'receipt',a,{cartons:10},200,receiptId);await op(f,store,'receipt',a,{cartons:10},200,receiptId);
    const end=await snapshot(f);await op(f,driver,'exception',a,issue,200,r1);assert.deepEqual(await snapshot(f),end);
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:a.id}}),1);assert.equal(await db.receiptConfirmation.count({where:{proof:{allocationId:a.id}}}),1);
    assert.equal(await db.syncMutation.count({where:{deviceId:'stage7-online',clientMutationId:r1}}),1);
  });

  await t.test('Database suite passes twice after a completed walkthrough and preserves unrelated receipts',async()=>{
    const before=await snapshot(multi);
    assert.equal(before.status,'COMPLETED');assert.equal(before.stops[0].allocations[0].order.status,'RECEIVED');
    const childEnv={...process.env};delete childEnv.NODE_TEST_CONTEXT;
    for(let run=1;run<=2;run++){
      const result=await execFile(process.execPath,['--env-file-if-exists=.env','--test','--test-reporter=tap','tests/database.integration.js'],{env:childEnv,timeout:60000,maxBuffer:1024*1024});
      assert.match(result.stdout,/# fail 0/);assert.match(result.stdout,/# tests 5/);assert.deepEqual(await snapshot(multi),before);console.log(`Post-walkthrough database run ${run}: 5 passed, 0 failed`);
    }
  });
});
