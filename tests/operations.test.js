const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');

test('Stage 7 real online lifecycle, authorization, retries and responsive browser', {timeout:180000},async t=>{
  const {createApp}=await import('../apps/api/src/app.js');
  const {createDatabase}=await import('../apps/api/src/db.js');
  const {operate}=await import('../apps/api/src/operations.js');
  const db=createDatabase(),ids=[],tripIds=[],cookies=[];
  const date='2024-04-09',deliveryDate=new Date(date+'T00:00:00Z');
  const app=createApp({database:()=>db,orderClock:()=>new Date('2024-04-08T10:00:00+05:30')});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  // Browser context isolation also prevents concurrent suites sharing cookies.
  const base=`http://localhost:${server.address().port}`;
  let browser;
  const request=(path,cookie,body)=>fetch(base+'/api'+path,{headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  const json=async(path,cookie,body,status=200)=>{const r=await request(path,cookie,body);const data=await r.json();assert.equal(r.status,status,JSON.stringify(data));return data;};
  const login=async identifier=>{const r=await request('/auth/login',null,{identifier,password:'RelayDemo!26'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];cookies.push(cookie);return cookie;};
  t.after(async()=>{
    if(browser){await browser.run("authRequest('logout',{})").catch(()=>{});await browser.close();}
    for(const cookie of cookies)await request('/auth/logout',cookie,{});
    await new Promise(r=>server.close(r));await app.locals.sessionStore.close();
    const allocations=await db.allocation.findMany({where:{orderId:{in:ids}}});const aids=allocations.map(a=>a.id);tripIds.push(...allocations.map(a=>a.tripId));
    await db.syncMutation.deleteMany({where:{deviceId:'stage7-online',entityId:{in:tripIds}}});
    await db.receiptConfirmation.deleteMany({where:{proof:{allocationId:{in:aids}}}});
    for(const model of ['proofOfDelivery','deliveryEvent','deliveryException','loadingIssue','loadingCheck'])await db[model].deleteMany({where:{allocationId:{in:aids}}});
    await db.allocation.deleteMany({where:{id:{in:aids}}});await db.tripStop.deleteMany({where:{tripId:{in:tripIds}}});await db.trip.deleteMany({where:{id:{in:tripIds}}});
    for(const model of ['deferral','orderStatusEvent','orderItem'])await db[model].deleteMany({where:{orderId:{in:ids}}});
    await db.order.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
  });
  assert.equal(await db.order.count({where:{deliveryDate}}),0,'Fixture date must be free; never reset user work');
  const store=await login('store'),dispatcher=await login('dispatcher'),loader=await login('loader'),driver=await login('driver');
  const storeUser=await db.user.findUnique({where:{email:'store@relay.demo'}}),loaderUser=await db.user.findUnique({where:{email:'loader@relay.demo'}}),driverUser=await db.user.findUnique({where:{email:'driver@relay.demo'}});
  let trip,a,b;
  const op=(actor,action,allocation,body={},status=200)=>json(`/operations/trips/${trip.id}${allocation?`/allocations/${allocation.id}`:''}/${action}`,actor,body,status);
  await t.test('Store creates isolated orders, Stage 6 allocates and releases one shared physical stop',async()=>{
    for(let i=0;i<2;i++){
      const {order}=await json('/orders',store,{deliveryDate:date,temperatureRequirement:'AMBIENT',items:[{productCode:'STAGE7',description:'Stage 7 isolated cartons',units:2,unitWeightKg:1,unitVolumeM3:0.01}]},201);ids.push(order.id);
    }
    const plan=await json('/planning/allocate',dispatcher,{date});assert.equal(plan.trips.length,1);tripIds.push(plan.trips[0].id);
    trip=await db.trip.findUnique({where:{id:tripIds[0]},include:{stops:true,allocations:true}});assert.equal(trip.stops.length,1);[a,b]=trip.allocations;
    const release=await json('/planning/release',dispatcher,{date});assert.equal(release.released,true);
    assert.equal((await json('/operations/trips',driver)).trips.some(t=>t.id===trip.id),false);
    await op(driver,'start',null,{},404);
    // Fixture-only assignment, not a production scheduling subsystem.
    await db.trip.update({where:{id:trip.id},data:{driverId:driverUser.id}});
    assert.equal((await json('/operations/trips',loader)).trips.find(t=>t.id===trip.id).status,'RELEASED');
    assert.equal((await json('/operations/trips',driver)).trips.find(t=>t.id===trip.id).stops.length,1);
  });
  await t.test('401, role protection, depot, Driver assignment and Store outlet boundaries',async()=>{
    await json('/operations/trips',null,undefined,401);await json('/operations/trips',dispatcher,undefined,403);await json('/operations/trips',store,undefined,403);
    await op(driver,'load',a,{cartons:2},403);await op(loader,'start',null,{},403);await op(store,'resolve',a,{resolution:'Forbidden'},403);
    await assert.rejects(operate(db,{...loaderUser,depotId:'another-depot'},trip.id,'load',a.id,{cartons:2}),{status:404});
    await assert.rejects(operate(db,{...driverUser,id:'another-driver'},trip.id,'start',undefined,{}),{status:404});
    await assert.rejects(operate(db,{...storeUser,outletId:'another-outlet'},trip.id,'receipt',a.id,{cartons:2}),{status:404});
    await op(driver,'start',null,{},409);await op(store,'receipt',a,{cartons:2},409);
  });
  await t.test('Loading shortfall persists, blocks READY, resolves and rechecks without changing allocations',async()=>{
    await op(loader,'loading-issue',b,{type:'MISSING',details:'One carton missing',cartons:1});
    const snapshot=(await json('/operations/trips',loader)).trips.find(t=>t.id===trip.id);assert.equal(snapshot.status,'LOADING');assert.equal(snapshot.stops[0].allocations.find(x=>x.id===b.id).loadingCheck.loadedCartons,1);
    await op(loader,'complete-loading',null,{},409);await op(loader,'load',b,{cartons:2},409);await op(driver,'start',null,{},409);
    await op(loader,'resolve',b,{resolution:'Located missing carton'});await op(loader,'load',b,{cartons:1},409);
    await Promise.all([op(loader,'load',b,{cartons:2}),op(loader,'load',b,{cartons:2})]);
    assert.equal(await db.loadingCheck.count({where:{allocationId:b.id}}),1);
    await op(loader,'resolve',b,{resolution:'Located missing carton'});
    assert.equal((await db.loadingCheck.findUnique({where:{allocationId:b.id}})).status,'LOADED','A resolution retry must not revert an already rechecked load');
    const dispatch=await json(`/planning/day/${date}`,dispatcher);assert.equal(dispatch.trips[0].status,'LOADING');assert.equal(dispatch.trips[0].stops[0].allocations.find(x=>x.id===b.id).loadingIssues[0].status,'RESOLVED');
  });
  await t.test('Browser Loader confirms, reload retains state; phone/tablet layouts',async()=>{
    browser=await require('./cdp').connect({isolated:true});
    await browser.send('Page.navigate',{url:base});await browser.waitFor("identityReady && document.querySelector('#login-form')");
    await browser.input('#login-id','loader');await browser.input('#login-password','RelayDemo!26');await browser.click('[type="submit"]');
    await browser.waitFor('fieldTrips.length>0');
    await browser.run(`fieldTripId=${JSON.stringify(trip.id)};render()`);
    for(const width of [360,768,1024]){
      await browser.viewport(width);assert.equal(await browser.run('document.documentElement.scrollWidth<=innerWidth+1'),true,`Loader ${width}`);
      assert.equal(await browser.run("!!document.querySelector('[data-action=offline]')"),false);
      await browser.screenshot(`stage07-loader-${width}`);
    }
    await browser.click(`[data-action="loaded"][data-id="${a.id}"]`);await browser.waitFor('!fieldBusy && fieldOrders.every(o=>o.loaded)');
    await browser.send('Page.reload');await browser.waitFor('fieldTrips.length>0');await browser.run(`fieldTripId=${JSON.stringify(trip.id)};render()`);
    assert.equal(await browser.run('fieldOrders.every(o=>o.loaded)'),true);
    await browser.click('[data-action="complete-loading"]');await browser.waitFor("!fieldBusy && selectedFieldTrip().status==='READY'");
    assert.equal((await db.trip.findUnique({where:{id:trip.id}})).status,'READY');
    await op(loader,'loading-issue',a,{type:'DAMAGED',details:'Stale action',cartons:0},409);
    assert.equal(await db.loadingIssue.count({where:{allocationId:a.id}}),0);
  });
  await t.test('Assigned Driver starts, defers, retries, arrives and saves POD through mobile screens',async()=>{
    await browser.click('[data-action="account"]');await browser.click('[data-action="sign-out"]');await browser.waitFor("!!document.querySelector('#login-form')");
    await browser.input('#login-id','driver');await browser.input('#login-password','RelayDemo!26');await browser.click('[type="submit"]');await browser.waitFor('fieldTrips.length>0');await browser.run(`fieldTripId=${JSON.stringify(trip.id)};render()`);
    for(const width of [360,390,430]){await browser.viewport(width);assert.equal(await browser.run('document.documentElement.scrollWidth<=innerWidth+1'),true,`Driver ${width}`);await browser.screenshot(`stage07-driver-${width}`);}
    await browser.click('[data-action="start-route"]');await browser.waitFor("!fieldBusy && selectedFieldTrip().status==='IN_PROGRESS'");
    await op(driver,'start');assert.equal(await db.deliveryEvent.count({where:{allocationId:a.id,type:'STARTED'}}),1);
    await op(driver,'exception',a,{type:'STORE_CLOSED',details:'Return after receiving desk opens'});
    await browser.send('Page.reload');await browser.waitFor('fieldTrips.length>0');await browser.run(`fieldTripId=${JSON.stringify(trip.id)};render()`);
    assert.equal(await browser.run('fieldOrders.every(o=>o.deferred)'),true);
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:a.id}}),0);await op(driver,'complete',null,{},409);
    await browser.click(`[data-action="retry-stop"][data-id="${a.id}"]`);await browser.input('#resolution','Store reopened');await browser.click('[data-action="resolved"]');await browser.waitFor('!fieldBusy && fieldOrders.every(o=>!o.deferred)');
    await browser.click('[data-action="arrived"]');await browser.waitFor('!fieldBusy && fieldOrders.every(o=>o.arrived)');
    const proof={recipient:'Stage Seven Recipient',cartons:2,verified:true,deliveredAt:new Date().toISOString()};
    await op(driver,'resolve',a,{resolution:'Store reopened'});
    assert.equal((await db.tripStop.findUnique({where:{id:a.tripStopId}})).status,'ARRIVED','A resolution retry must not reverse a later arrival');
    const failingDb={$transaction:(fn,options)=>db.$transaction(tx=>fn(new Proxy(tx,{get(target,key){if(key==='deliveryEvent')return {create:async()=>{throw new Error('Injected event persistence failure');}};return target[key];}})),options)};
    await assert.rejects(operate(failingDb,driverUser,trip.id,'pod',a.id,proof),/Injected event persistence failure/);
    assert.equal((await db.order.findUnique({where:{id:a.orderId}})).status,'IN_DELIVERY');
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:a.id}}),0,'POD insertion rolls back when its related event fails');
    await op(driver,'pod',a,{...proof,cartons:1},409);assert.equal(await db.proofOfDelivery.count({where:{allocationId:a.id}}),0);
    await browser.click('[data-action="verify-delivery"]');await browser.input('#recipient',proof.recipient);await browser.click('#verified');await browser.click('[data-action="delivered"]');await browser.waitFor('!fieldBusy && fieldOrders.some(o=>o.proof)');
    const delivered=(await db.proofOfDelivery.findFirst({where:{allocationId:{in:[a.id,b.id]}}})).allocationId;
    const first=delivered===a.id?a:b,second=delivered===a.id?b:a;
    await op(driver,'pod',first,proof);assert.equal(await db.proofOfDelivery.count({where:{allocationId:first.id}}),1);await op(driver,'complete',null,{},409);
    await op(driver,'pod',first,{...proof,cartons:1},409);
    await op(store,'receipt-issue',first,{type:'DAMAGED_GOODS',details:'Inspect packaging before receipt'});
    await Promise.all([op(driver,'pod',second,proof),op(driver,'pod',second,proof)]);
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:second.id}}),1);
    assert.equal(await db.deliveryEvent.count({where:{allocationId:second.id,type:'DELIVERED'}}),1);
    assert.equal((await db.trip.findUnique({where:{id:trip.id}})).status,'IN_PROGRESS','An open receipt discrepancy blocks route completion');
    await browser.click('[data-action="field-refresh"]');await browser.waitFor("!!document.querySelector('[data-action=complete-route]')");
    await browser.click('[data-action="complete-route"]');await browser.waitFor('!fieldBusy');
    assert.equal((await db.trip.findUnique({where:{id:trip.id}})).status,'IN_PROGRESS');
    await op(store,'resolve-receipt',first,{resolution:'Packaging inspected; goods intact'});
    await browser.click('[data-action="complete-route"]');await browser.waitFor("!fieldBusy && selectedFieldTrip().status==='COMPLETED'");
    assert.equal((await db.trip.findUnique({where:{id:trip.id}})).status,'COMPLETED');
    assert.equal(await db.tripStop.count({where:{tripId:trip.id}}),1);
  });
  await t.test('Store receipt issue remains outstanding, resolution and confirmation survive reload',async()=>{
    await browser.click('[data-action="account"]');await browser.click('[data-action="sign-out"]');await browser.waitFor("!!document.querySelector('#login-form')");await browser.input('#login-id','store');await browser.input('#login-password','RelayDemo!26');await browser.click('[type="submit"]');await browser.waitFor('!!storeData');
    // API-backed dialog also works for a historical order outside the first listing page.
    await browser.run(`showStoreReceipt(${JSON.stringify(a.orderId)})`);await browser.waitFor("!!document.querySelector('[data-action=store-confirm-receipt]')");
    await browser.input('#receipt-note','One carton requires recount');await browser.click('[data-action="store-receipt-issue"]');await browser.waitFor("!!document.querySelector('[data-action=store-resolve-receipt]')");
    await op(store,'receipt',a,{cartons:2},409);assert.equal((await db.order.findUnique({where:{id:a.orderId}})).status,'DELIVERED');
    const dispatch=await json(`/planning/day/${date}`,dispatcher);assert.equal(dispatch.trips[0].status,'COMPLETED');assert.equal(dispatch.trips[0].stops[0].allocations.find(x=>x.id===a.id).exceptions.filter(x=>x.status==='OPEN').length,1);
    await browser.input('#receipt-note','All cartons found and recounted');await browser.click('[data-action="store-resolve-receipt"]');await browser.waitFor("!!document.querySelector('[data-action=store-confirm-receipt]')");await browser.click('[data-action="store-confirm-receipt"]');await browser.waitFor("document.querySelector('#dialog').textContent.includes('Receipt confirmed')");
    await Promise.all([op(store,'receipt',a,{cartons:2}),op(store,'receipt',a,{cartons:2})]);
    const proof=await db.proofOfDelivery.findUnique({where:{allocationId:a.id}});assert.equal(await db.receiptConfirmation.count({where:{proofId:proof.id}}),1);
    await op(store,'receipt',a,{cartons:1},409);
    await browser.send('Page.reload');await browser.waitFor('!!storeData');await browser.run(`showStoreReceipt(${JSON.stringify(a.orderId)})`);await browser.waitFor("document.querySelector('#dialog').textContent.includes('Receipt confirmed')");
    const {order}=await json('/orders/'+a.orderId,store);assert.equal(order.status,'RECEIVED');assert.equal(order.allocation.id,a.id);assert.equal(order.allocation.tripId,trip.id);
    assert.deepEqual(order.history.map(h=>h.status),['CONFIRMED','PLANNED','IN_DELIVERY','DELIVERED','RECEIVED']);
    assert.deepEqual(browser.errors,[]);
  });
});
