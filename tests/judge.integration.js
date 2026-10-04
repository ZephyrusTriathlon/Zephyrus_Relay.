// Explicit fresh-scenario acceptance: advances the seeded route, never resets it.
// Run only against a dedicated fresh supplied-reference database with RELAY_JUDGE_TEST=true.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
test('fresh supplied judge scenario on production-default built UI',{timeout:240000},async t=>{
  assert.equal(process.env.RELAY_JUDGE_TEST,'true','Explicit opt-in required: this test completes the seeded judge route');
  require('node:fs').mkdirSync(require('node:path').resolve(__dirname,'../artifacts/stage10/judge'),{recursive:true});
  process.env.SESSION_COOKIE_SECURE='false'; // loopback HTTP production preview
  const {createApp}=await import('../apps/api/src/app.js');
  const {createDatabase}=await import('../apps/api/src/db.js');
  const {seedNetwork}=await import('../prisma/seed-network.js');
  const db=createDatabase();
  let app,server,b;
  t.after(async()=>{await b?.close();if(server)await new Promise(r=>server.close(r));await app?.locals.sessionStore.close();await db.$disconnect();});
  assert.equal((await db.trip.findUniqueOrThrow({where:{id:'demo-trip-01'}})).status,'DRAFT','Use a fresh database; existing judge work is preserved');
  assert.equal(await db.order.count(),5);
  const {configuredOrderClock}=await import('../apps/api/src/order-clock.js');
  const orderClock=await configuredOrderClock({database:()=>db,env:{NODE_ENV:'production',RELAY_JUDGE_MODE:'true'}});
  app=createApp({database:()=>db,production:true,sessionSecret:process.env.SESSION_SECRET,orderClock});
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=process.env.RELAY_JUDGE_BASE_URL||`http://127.0.0.1:${server.address().port}`;
  b=await require('./cdp').connect();
  const wait=async expression=>{for(let n=0;n<150;n++){if(await b.run(expression).catch(()=>false))return;await b.pause(100);}throw Error('Timed out: '+expression+'; '+await b.run('document.body.innerText.slice(-1800)'));};
  const login=async id=>{await b.input('#login-id',id);await b.input('#login-password','RelayDemo!26');await b.click('[type="submit"]');await wait(`currentAccount()?.email===${JSON.stringify(id+'@relay.demo')} && !document.querySelector('#login-form')`);};
  const logout=async()=>{await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait("!!document.querySelector('#login-form')");};
  const widths=[320,360,375,390,412,430,768,834,1024,1280,1440];
  const layouts=async role=>{
    for(const width of widths){await b.viewport(width);assert.ok(await b.run('document.documentElement.scrollWidth <= innerWidth+1'),`${role} overflow at ${width}`);}
    await b.viewport(role==='loader'?834:role==='dispatch'?1440:390);
    await b.screenshot(`stage10/judge/${role}`);
    assert.equal(await b.run('window.relayDevTools'),false);
    assert.doesNotMatch(await b.run('document.body.innerText'),/Switch demo account|Switch role|Simulate offline|R-07 simulation|Open saved planning data/i);
  };
  const request=(path,cookie,body,headers={})=>fetch(base+path,{headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()}),...headers},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  await t.test('production static exposure, normal authentication and unauthorized actions',async()=>{
    for(const path of ['/data/General%20Data/outlets.csv','/.git/config','/.env','/.env.example','/prisma/schema.prisma','/prisma/judge-data/General%20Data/outlets.csv','/package-lock.json','/package.json','/artifacts/stage9/regression.log','/apps/api/src/auth.js','/assets/app.js.map','/etc/passwd'])assert.equal((await request(path)).status,404,path);
    assert.equal((await request('/api/ready')).status,200);
    assert.equal((await request('/api/planning/release',null,{date:'2025-01-02'})).status,401);
    for(const role of ['store','dispatcher','loader','driver']){
      const r=await request('/api/auth/login',null,{identifier:role,password:'RelayDemo!26'});assert.equal(r.status,200);
      const header=r.headers.get('set-cookie');assert.match(header,/HttpOnly/i);assert.match(header,/SameSite=Lax/i);const cookie=header.split(';')[0];
      assert.doesNotMatch(await (await request('/api/auth/me',cookie)).text(),/passwordHash|RelayDemo/);
      if(role!=='dispatcher')assert.equal((await request('/api/planning/release',cookie,{date:'2025-01-02'})).status,403);
      if(role!=='driver')assert.equal((await request('/api/sync',cookie,{mutations:[]})).status,403);
      assert.equal((await request('/api/auth/logout',cookie,{}, {Origin:'https://elsewhere.invalid'})).status,403);
      assert.equal((await request('/api/auth/logout',cookie,{})).status,204);
      assert.equal((await request('/api/auth/me',cookie)).status,401);
    }
  });
  await b.send('Page.navigate',{url:base});await wait('typeof identityReady!=="undefined" && identityReady');
  await t.test('Store scoped historical orders and responsive cards',async()=>{
    await login('store');await wait('!!storeData && !storeLoading');await layouts('store-replenishment');
    await b.click('[data-action="store-orders"]');await layouts('store-tracking');
    assert.equal(await b.run('storeOwnOrders().length'),3);await logout();
  });
  await t.test('Dispatcher rejection, persisted deferral, draft review and atomic release',async()=>{
    await b.viewport(1440);await login('dispatcher');await b.input('#planning-date','2025-01-02','change');await b.click('[data-action="planning-load"]');await wait('!!planningDay && !planningBusy');
    await b.click('[data-planning-order="demo-order-van-only"]');await b.input('#planning-vehicle','VEH001','change');await b.click('[data-action="planning-validate"]');await wait('!!planningResult && !planningBusy');
    assert.ok(await b.run('planningResult.violations.some(v=>v.code==="VAN_ACCESS_REQUIRED")'));
    await b.click('#planning-retry');await b.click('[data-action="planning-allocate"]');await wait('!!planningResult && !planningBusy');
    assert.ok(await db.deferral.count({where:{orderId:'demo-order-capacity'}})>1);
    await b.click('[data-action="planning-review"][data-trip="demo-trip-01"]');assert.equal(await b.run('planningEdit.departureMinute'),285);await b.input('#edit-departure','04:46');await b.click('[data-action="planning-edit"]');await wait('!planningBusy && !planningEdit');
    assert.equal((await db.trip.findUnique({where:{id:'demo-trip-01'}})).plannedDepartureAt.toISOString(),'2025-01-01T23:16:00.000Z');
    const unassigned=await b.run('planningDay.trips.filter(t=>t.status==="DRAFT"&&!t.driverId).map(t=>t.id)');
    for(const id of unassigned){await b.click(`[data-action="planning-select-trip"][data-trip="${id}"]`);await b.click(`[data-action="planning-review"][data-trip="${id}"]`);await b.input('#edit-driver','demo-user-driver','change');await b.click('[data-action="planning-edit"]');await wait('!planningBusy && !planningEdit');}
    await layouts('dispatch');await b.click('[data-action="planning-release"]');await wait('!planningBusy && planningDay.trips.every(t=>t.status==="RELEASED")');await logout();
  });
  const select=async()=>{await wait('!fieldLoading && fieldTrips.length>0');await b.input('#field-trip','demo-trip-01','change');await wait('selectedFieldTrip()?.id==="demo-trip-01"');};
  await t.test('Loader reverse manifest and completion at all required widths',async()=>{
    await login('loader');await select();await layouts('loader');
    for(let i=0;i<3;i++){await b.click('[data-action="loaded"]:not([disabled])');await wait(`!fieldBusy && fieldOrders.filter(o=>o.loaded).length===${i+1}`);}
    await b.click('[data-action="complete-loading"]');await wait('!fieldBusy && selectedFieldTrip()?.status==="READY"');await logout();
  });
  const pod=async recipient=>{const id=await b.run('nextDelivery().id');await b.click('[data-action="verify-delivery"]');await b.input('#recipient',recipient);await b.click('#verified');await b.screenshot('stage10/judge/driver-pod',false);await b.click('[data-action="delivered"]');await wait(`!fieldBusy && fieldOrders.find(o=>o.id===${JSON.stringify(id)})?.proof`);};
  const reload=async()=>{const token=randomUUID();await b.run(`window.judgeReload=${JSON.stringify(token)}`);await b.send('Page.reload');await wait(`window.judgeReload!==${JSON.stringify(token)} && typeof identityReady!=="undefined" && identityReady && !fieldLoading && fieldOrders.length===3`);};
  await t.test('Driver online POD, real offline reload/outbox and reconnect',async()=>{
    await login('driver');await select();await wait('!!navigator.serviceWorker.controller && driverOffline.details().mode!=="SYNCING"');
    await b.click('[data-action="start-route"]');await wait('!fieldBusy && selectedFieldTrip()?.status==="IN_PROGRESS"');await layouts('driver');
    await b.click('[data-action="arrived"]');await wait('!fieldBusy && nextDelivery()?.arrived');
    await pod('Sahan Jayawardena');await pod('Sahan Jayawardena');
    await b.send('Network.enable');await b.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});await wait('!navigator.onLine');await reload();
    await b.click('[data-action="arrived"]');await wait('!fieldBusy && nextDelivery()?.arrived');await pod('Tharushi Silva');
    assert.equal(await db.proofOfDelivery.count(),2);assert.ok(await b.run('driverOffline.details().pending')>=2);
    await reload();assert.ok(await b.run('driverOffline.details().pending')>=2);await b.screenshot('stage10/judge/driver-offline');
    await b.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
    await wait('navigator.onLine && driverOffline.details().pending===0 && selectedFieldTrip()?.status==="COMPLETED"');
    assert.equal(await db.proofOfDelivery.count(),3);await b.screenshot('stage10/judge/driver-synced');await logout();
  });
  await t.test('Store confirms both receipts, seed rerun preserves final state',async()=>{
    await login('store');await wait('!!storeData && !storeLoading');await b.click('[data-action="store-orders"]');
    for(const id of ['demo-order-chilled','demo-order-ambient']){await b.click(`[data-action="store-receipt"][data-id="${id}"]`);await wait('!!document.querySelector("[data-action=store-confirm-receipt]")');await b.screenshot('stage10/judge/store-receipt');await b.click('[data-action="store-confirm-receipt"]');await wait(`storeOwnOrders().find(o=>o.id===${JSON.stringify(id)})?.status==="RECEIVED" && document.querySelector('.dialog-body')?.textContent.includes('Receipt confirmed')`);await b.click('.dialog-close');}
    const before=await db.order.findMany({orderBy:{id:'asc'}});await seedNetwork(db);assert.deepEqual(await db.order.findMany({orderBy:{id:'asc'}}),before);
    assert.equal(await db.receiptConfirmation.count(),2);assert.equal((await db.trip.findUnique({where:{id:'demo-trip-01'}})).status,'COMPLETED');await logout();
  });
  assert.deepEqual(b.errors,[]);
});
