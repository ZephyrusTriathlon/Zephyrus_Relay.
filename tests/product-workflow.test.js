const {test}=require('node:test');
const assert=require('node:assert/strict');
if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');

test('new Store order completes the production UI handoffs, issue recovery, offline POD and receipt',{timeout:120000},async t=>{
  const previousSecure=process.env.SESSION_COOKIE_SECURE;process.env.SESSION_COOKIE_SECURE='false';
  t.after(()=>{if(previousSecure===undefined)delete process.env.SESSION_COOKIE_SECURE;else process.env.SESSION_COOKIE_SECURE=previousSecure;});
  const {createApp}=await import('../apps/api/src/app.js');
  const {createDatabase}=await import('../apps/api/src/db.js');
  const db=createDatabase(),date='2024-09-04',deliveryDate=new Date(date+'T00:00:00Z');
  assert.equal(await db.order.count({where:{deliveryDate}}),0,'Dedicated unused fixture date required');
  // Inject a historical clock only into this test app; supplied calendars stay intact.
  const app=createApp({database:()=>db,production:true,sessionSecret:'product-workflow-test-secret-32-characters',orderClock:()=>new Date('2024-09-03T15:59:00+05:30')});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const b=await require('./cdp').connect({isolated:true});let orderId,tripId;
  t.after(async()=>{
    await b.close();await new Promise(r=>server.close(r));await app.locals.sessionStore.close();
    // Discover only this order's persisted handoff; never clear a whole date/database.
    if(orderId){const a=await db.allocation.findUnique({where:{orderId}});tripId=a?.tripId||tripId;
      if(a){await db.receiptConfirmation.deleteMany({where:{proof:{allocationId:a.id}}});
        for(const model of ['proofOfDelivery','deliveryEvent','deliveryException','loadingIssue','loadingCheck'])await db[model].deleteMany({where:{allocationId:a.id}});
        await db.syncMutation.deleteMany({where:{entityType:'Trip',entityId:tripId}});await db.allocation.delete({where:{id:a.id}});}
      if(tripId){await db.tripStop.deleteMany({where:{tripId}});await db.trip.delete({where:{id:tripId}});}
      for(const model of ['deferral','orderStatusEvent','orderItem'])await db[model].deleteMany({where:{orderId}});
      await db.order.delete({where:{id:orderId}});
    }await db.$disconnect();
  });
  const wait=async expression=>{for(let i=0;i<150;i++){if(await b.run(expression).catch(()=>false))return;await b.pause(100);}throw Error(expression+'; '+await b.run('document.body.innerText.slice(-1400)'));};
  const login=async id=>{await b.input('#login-id',id);await b.input('#login-password','RelayDemo!26');await b.click('[type="submit"]');await wait(`currentAccount()?.email===${JSON.stringify(id+'@relay.demo')}`);};
  const logout=async()=>{await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait('!!document.querySelector("#login-form")');};
  const select=async()=>{await wait('!fieldLoading && fieldTrips.length>0');await b.input('#field-trip',tripId,'change');await wait(`selectedFieldTrip()?.id===${JSON.stringify(tripId)}`);};
  await b.send('Page.navigate',{url:`http://127.0.0.1:${server.address().port}`});await wait('identityReady');
  await login('store');await wait('!!storeData && !storeLoading');await b.viewport(390);
  assert.equal(await b.run('window.relayDevTools'),false);await b.input('#store-date',date,'change');
  const product=await b.run('storeFilteredProducts()[0].i');await b.click(`[data-action="store-step"][data-product="${product}"][data-delta="1"]`);
  await b.click('[data-action="create-order"]');await b.click('[data-action="place-order"]');await wait('!!document.querySelector("[data-order-id]") && !storeSubmitting');
  orderId=await b.run('document.querySelector("[data-order-id]").dataset.orderId');assert.equal((await db.order.findUniqueOrThrow({where:{id:orderId}})).status,'CONFIRMED');
  await b.click('.dialog-close');await b.run("state.history=[{message:'Private prototype residue',time:'10:00'}]");await b.click('[data-action="activity"]');assert.doesNotMatch(await b.run('document.querySelector("#main").innerText'),/Private prototype residue/);assert.match(await b.run('document.querySelector("#main").innerText'),/Confirmed/);await wait('!storeLoading');
  await b.send('Page.reload');await wait('!!storeData && !storeLoading');assert.ok(await b.run(`storeOwnOrders().some(o=>o.id===${JSON.stringify(orderId)})`));await logout();
  await b.viewport(1440);await login('dispatcher');await b.input('#planning-date',date,'change');await b.click('[data-action="planning-load"]');await wait('!!planningDay && !planningBusy');
  await b.click('[data-action="planning-allocate"]');await wait('!planningBusy && planningDay?.trips.length===1');tripId=await b.run('planningDay.trips[0].id');
  await b.click('[data-action="planning-review"]');await b.input('#edit-driver','demo-user-driver','change');await b.click('[data-action="planning-edit"]');await wait('!planningBusy && !planningEdit');
  assert.equal((await db.trip.findUniqueOrThrow({where:{id:tripId}})).driverId,'demo-user-driver');
  await b.click('[data-action="planning-release"]');await wait('!planningBusy && planningDay.trips[0].status==="RELEASED"');await logout();
  await login('driver');await select();assert.equal(await b.run('document.querySelectorAll("button[data-role]").length'),0,'Waiting Driver has no prototype role-switch controls');
  await b.click('.driver-empty [data-action="field-refresh"]');await wait('!fieldLoading && selectedFieldTrip()?.status==="RELEASED"');await logout();
  await login('loader');await select();await b.viewport(768);await b.click('[data-action="issue"]');
  assert.doesNotMatch(await b.run('document.querySelector(".dialog-body").innerText'),new RegExp((await db.allocation.findUniqueOrThrow({where:{orderId}})).id),'Loading sheet shows the order reference, not its internal allocation identity');
  await b.input('#issue-type','Missing cartons','change');await b.input('#issue-cartons','0');await b.input('#issue-note','Carton requires recount');await b.click('[data-action="save-issue"]');await wait('!fieldBusy && fieldOrders[0].issue');
  assert.equal(await b.run('document.querySelector("[data-action=complete-loading]").disabled'),true);
  await b.click('[data-action="resolve"]');await b.input('#resolution','Original carton located and verified');await b.click('[data-action="resolved"]');await wait('!fieldBusy && !fieldOrders[0].issue');
  await b.click('[data-action="loaded"]');await wait('!fieldBusy && fieldOrders[0].loaded');await b.click('[data-action="complete-loading"]');await wait('!fieldBusy && selectedFieldTrip().status==="READY"');await logout();
  await login('driver');await select();await b.viewport(390);await wait('!!navigator.serviceWorker.controller');await b.click('[data-action="start-route"]');await wait('!fieldBusy && selectedFieldTrip().status==="IN_PROGRESS"');
  await b.click('[data-action="issue"]');await b.input('#issue-note','Receiving desk temporarily closed');await b.click('[data-action="save-issue"]');await wait('!fieldBusy && fieldOrders[0].deferred');
  await b.click('[data-action="field-route-toggle"]');await b.click('#driver-route-overview [data-action="retry-stop"]');await b.input('#resolution','Receiving desk reopened');await b.click('[data-action="resolved"]');await wait('!fieldBusy && nextDelivery()?.returnRequested');
  await b.send('Network.enable');await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await wait('!navigator.onLine');
  await b.click('[data-action="arrived"]');await wait('!fieldBusy && nextDelivery()?.arrived');await b.click('[data-action="verify-delivery"]');
  assert.doesNotMatch(await b.run('document.querySelector(".dialog-body").innerText'),new RegExp((await db.allocation.findUniqueOrThrow({where:{orderId}})).id),'POD sheet shows the order reference');
  await b.click('[data-action="delivered"]');assert.ok(await b.run('!!document.querySelector("[aria-invalid=true]")'),'Missing verification produces inline validation');
  await b.input('#recipient','Workflow recipient');await b.click('#verified');await b.click('[data-action="delivered"]');await wait('!fieldBusy && fieldOrders[0].proof');
  const allocation=await db.allocation.findUniqueOrThrow({where:{orderId}});assert.equal(await db.proofOfDelivery.count({where:{allocationId:allocation.id}}),0);
  await b.send('Page.reload');await wait('identityReady && !fieldLoading && fieldOrders.length===1 && driverOffline.details().pending>=2');
  assert.match(await b.run('document.body.innerText'),/pending sync|waiting to sync/i);
  await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});await wait('driverOffline.details().pending===0 && selectedFieldTrip()?.status==="COMPLETED"');await logout();
  await login('store');await wait('!!storeData && !storeLoading');await b.click('[data-action="store-orders"]');await b.click(`[data-action="store-receipt"][data-id="${orderId}"]`);await wait('!!document.querySelector("#receipt-note")');
  await b.input('#receipt-note','Packaging requires inspection');await b.click('[data-action="store-receipt-issue"]');await wait('!!document.querySelector("[data-action=store-resolve-receipt]") && !storeReceiptBusy');
  await b.input('#receipt-note','Packaging inspected and accepted');await b.click('[data-action="store-resolve-receipt"]');await wait('!storeReceiptBusy && !!document.querySelector("[data-action=store-confirm-receipt]")');
  await b.click('[data-action="store-confirm-receipt"]');await wait(`storeOwnOrders().find(o=>o.id===${JSON.stringify(orderId)})?.status==="RECEIVED"`);await b.click('.dialog-close');await logout();
  await b.viewport(1440);await login('dispatcher');await b.input('#planning-date',date,'change');await b.click('[data-action="planning-load"]');await wait('!!planningDay && !planningBusy');
  assert.equal(await b.run('planningDay.trips[0].status'),'COMPLETED');assert.ok(await b.run('planningDay.trips[0].stops[0].allocations[0].proof.receipt'));
  await b.click('[data-action="activity"]');assert.match(await b.run('document.querySelector(".dialog-body").innerText'),/Completed/);assert.doesNotMatch(await b.run('document.querySelector(".dialog-body").innerText'),/Private prototype residue/);
  assert.deepEqual(b.errors,[]);
});
