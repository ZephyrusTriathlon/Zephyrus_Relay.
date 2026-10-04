const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID,createHash}=require('node:crypto');
const fs=require('node:fs');
if(fs.existsSync('.env'))process.loadEnvFile('.env');

test('packaged references retain supplied fleet, access and calendar diversity',async()=>{
  const manifest=JSON.parse(fs.readFileSync('prisma/judge-data/manifest.json','utf8'));
  for(const [name,hash] of Object.entries(manifest.files)) {
    const bytes=fs.readFileSync('prisma/judge-data/General Data/'+name);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
    if(fs.existsSync('data/General Data/'+name))assert.deepEqual(bytes,fs.readFileSync('data/General Data/'+name));
  }
  const {loadNetwork}=await import('../prisma/import-network.js');const n=await loadNetwork();
  assert.equal(n.vehicles.filter(v=>v.temperature==='AMBIENT').length,44);
  assert.equal(n.outlets.filter(o=>o.mallWindow).length,12);
  assert.equal(n.calendar.filter(c=>c.monsoon).length,486);assert.equal(n.calendar.filter(c=>c.isPayday).length,59);
});

test('monsoon allowance can make a formerly feasible arrival late and includes return travel',async()=>{
  const {loadNetwork}=await import('../prisma/import-network.js');const n=await loadNetwork();
  const {makeDemo}=await import('../prisma/demo.js');const demo=makeDemo(n);
  const {loadPlanningData}=await import('../apps/api/src/planning-data.js');const data=await loadPlanningData(n.depots);
  const {validateTrip}=await import('../packages/domain/src/planning.js');
  const order=demo.orders[0],outlet=n.outlets.find(o=>o.id===order.outletId);
  const input={date:'2025-01-02',vehicle:n.vehicles.find(v=>v.id===demo.trip.vehicleId),orders:[{...order,outlet,items:[order.item]}],departureMinute:240,...data};
  const dry=validateTrip(input),wet=validateTrip({...input,calendar:{monsoon:true}});
  assert.equal(dry.feasible,true);assert.equal(wet.metrics.travelFactor,1.2);
  assert.equal(wet.metrics.distanceKm,dry.metrics.distanceKm);assert.ok(wet.metrics.returnMinute>dry.metrics.returnMinute);
  const leg=data.travel.find(t=>t.depotId===outlet.depotId&&t.district===outlet.district);
  input.departureMinute=470-leg.outboundMinutes;
  input.orders[0]={...input.orders[0],windowCloseTime:'07:50',outlet:{...outlet,windowCloseTime:'07:50'}};
  assert.equal(validateTrip(input).feasible,true);
  assert.ok(validateTrip({...input,calendar:{monsoon:true}}).violations.some(v=>v.code==='DELIVERY_WINDOW'));
});

test('production judge configuration, authoritative catalogue, deferred carry-forward and release readiness',{timeout:120000},async t=>{
  const previousSecure=process.env.SESSION_COOKIE_SECURE;process.env.SESSION_COOKIE_SECURE='false';
  t.after(()=>{if(previousSecure===undefined)delete process.env.SESSION_COOKIE_SECURE;else process.env.SESSION_COOKIE_SECURE=previousSecure;});
  const {createDatabase}=await import('../apps/api/src/db.js');const db=createDatabase();
  const {configuredOrderClock}=await import('../apps/api/src/order-clock.js');
  const env={NODE_ENV:'production',RELAY_JUDGE_MODE:'true',RELAY_JUDGE_ORDER_NOW:'2024-11-11T15:00:00+05:30'};
  const clock=await configuredOrderClock({env,database:()=>db});
  const {createApp}=await import('../apps/api/src/app.js');
  const app=createApp({database:()=>db,orderClock:clock,production:true,sessionSecret:'submission-regression-secret-at-least-32'});
  const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}/api`,orderIds=[],tripIds=[];
  const request=async(path,cookie,body,key)=>{const r=await fetch(base+path,{headers:{...(cookie?{cookie}:{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{})});return {status:r.status,body:r.status===204?null:await r.json(),headers:r.headers};};
  const login=async identifier=>{const r=await request('/auth/login',null,{identifier,password:'RelayDemo!26'});assert.equal(r.status,200);return r.headers.get('set-cookie').split(';')[0];};
  t.after(async()=>{
    await new Promise(r=>server.close(r));await app.locals.sessionStore.close();
    const a=await db.allocation.findMany({where:{orderId:{in:orderIds}}});tripIds.push(...a.map(x=>x.tripId));
    await db.loadingCheck.deleteMany({where:{allocationId:{in:a.map(x=>x.id)}}});
    await db.allocation.deleteMany({where:{id:{in:a.map(x=>x.id)}}});
    await db.tripStop.deleteMany({where:{tripId:{in:tripIds}}});await db.trip.deleteMany({where:{id:{in:tripIds}}});
    for(const model of ['deferral','orderStatusEvent','orderItem'])await db[model].deleteMany({where:{orderId:{in:orderIds}}});
    await db.order.deleteMany({where:{id:{in:orderIds}}});await db.$disconnect();
  });
  const store=await login('store'),dispatcher=await login('dispatcher');
  const payload={deliveryDate:'2024-11-12',temperatureRequirement:'FROZEN',items:[{productCode:'WPF-FROZEN-10',units:2}]};
  const id=randomUUID();let order;
  await t.test('normal production clock configuration exposes a disclosed covered ordering date',async()=>{
    const r=await request('/orders/context',store);assert.equal(r.status,200);
    assert.equal(r.body.ordering.earliestDeliveryDate,'2024-11-12');assert.equal(r.body.scenario.mode,'judge');
    assert.ok(r.body.catalogue.some(p=>p.temp==='frozen'));
    assert.equal((await request('/scenario',store)).body.scenario.businessDate,'2024-11-11');
    assert.equal((await request('/scenario')).status,401);
    await assert.rejects(configuredOrderClock({env:{...env,RELAY_JUDGE_ORDER_NOW:'2030-01-01T15:00:00+05:30'},database:()=>db}),/coverage/);
    const uid=randomUUID();await db.user.create({data:{id:uid,email:uid+'@test.invalid',displayName:'Non-demo guard test',role:'DRIVER',source:'APPLICATION'}});
    try{await assert.rejects(configuredOrderClock({env,database:()=>db}),/isolated/);}finally{await db.user.delete({where:{id:uid}});}
  });
  await t.test('frozen order persists authoritative carton values and rejects tampering',async()=>{
    const before=await db.order.count();
    for(const body of [{...payload,temperatureRequirement:'AMBIENT'},{...payload,items:[{...payload.items[0],unitWeightKg:0.001}]},{...payload,items:[{...payload.items[0],unitVolumeM3:0.001}]},{...payload,items:[{productCode:'UNKNOWN',units:1}]}])assert.equal((await request('/orders',store,body)).status,400);
    assert.equal(await db.order.count(),before);
    const r=await request('/orders',store,payload,id);assert.equal(r.status,201,JSON.stringify(r.body));order=r.body.order;orderIds.push(order.id);
    assert.equal(order.weightKg,22);assert.equal(order.volumeM3,0.07);assert.equal(order.temperatureRequirement,'FROZEN');
    assert.equal(order.requestedDeliveryDate.slice(0,10),payload.deliveryDate);
    assert.equal((await request('/orders',store,payload,id)).status,200);
  });
  await t.test('deferred movement validates role, target day and version; original request and retry survive',async()=>{
    await db.order.update({where:{id:order.id},data:{status:'DEFERRED'}});
    order=await db.order.findUnique({where:{id:order.id}});
    const body={orderId:order.id,version:order.updatedAt.toISOString(),date:'2024-11-14',reason:'CAPACITY',explanation:'Protect this delivery on the next available run.'};
    assert.equal((await request('/planning/reschedule',store,body)).status,403);
    for(const date of ['2024-11-12','2024-11-17','2030-01-01'])assert.equal((await request('/planning/reschedule',dispatcher,{...body,date})).status,400);
    const responses=await Promise.all([request('/planning/reschedule',dispatcher,body),request('/planning/reschedule',dispatcher,body)]);
    assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
    const original=await request('/planning/day/2024-11-12',dispatcher),destination=await request('/planning/day/2024-11-14',dispatcher);
    assert.ok(!original.body.orders.some(o=>o.id===order.id));assert.ok(destination.body.orders.some(o=>o.id===order.id));
    const persisted=await db.order.findUnique({where:{id:order.id},include:{history:true,deferrals:true}});
    assert.equal(persisted.requestedDeliveryDate.toISOString().slice(0,10),'2024-11-12');assert.equal(persisted.status,'CONFIRMED');
    assert.equal(persisted.deferrals.length,1);assert.ok(persisted.history.some(h=>h.note.includes('Rescheduled')));
    assert.equal((await request('/orders',store,payload,id)).status,200,'Lost acknowledgement replay uses original request date');
    assert.equal(typeof destination.body.calendar.monsoon,'boolean');
  });
  await t.test('Dispatcher can move a deferred order through the visible dialog',async()=>{
    // Set up a second deferral to exercise the UI independently of the API race above.
    await db.order.update({where:{id:order.id},data:{status:'DEFERRED'}});
    const b=await require('./cdp').connect();
    try{
      const wait=async expression=>{for(let i=0;i<150;i++){if(await b.run(expression).catch(()=>false))return;await b.pause(100);}throw Error('UI wait failed: '+expression);};
      await b.send('Page.navigate',{url:base.replace(/\/api$/,'')});await wait('typeof identityReady!=="undefined" && identityReady');
      await b.input('#login-id','dispatcher');await b.input('#login-password','RelayDemo!26');await b.click('[type="submit"]');await wait('currentAccount()?.role==="DISPATCHER"');
      await b.input('#planning-date','2024-11-14','change');await b.click('[data-action="planning-load"]');await wait('!!planningDay && !planningBusy');
      await b.click(`[data-action="planning-reschedule"][data-id="${order.id}"]`);
      await b.input('#reschedule-date','2024-11-16');await b.input('#reschedule-note','Carry forward after dispatcher capacity review');await b.click('[data-action="planning-save-reschedule"]');
      await wait('planningDay?.date==="2024-11-16" && !planningBusy');
      assert.ok(await b.run(`planningDay.orders.some(o=>o.id===${JSON.stringify(order.id)}&&o.status==='CONFIRMED')`));
      assert.equal((await db.order.findUnique({where:{id:order.id}})).requestedDeliveryDate.toISOString().slice(0,10),'2024-11-12');
      assert.deepEqual(b.errors,[]);
    }finally{await b.close();}
  });
  await t.test('new frozen trip cannot release without an active Driver and releases after normal review',async()=>{
    const date='2024-11-16';const allocation=await request('/planning/allocate',dispatcher,{date});assert.equal(allocation.status,200,JSON.stringify(allocation.body));
    assert.equal(allocation.body.trips.length,1);const trip=allocation.body.trips[0];tripIds.push(trip.id);
    assert.equal((await db.vehicle.findUnique({where:{id:trip.vehicleId}})).temperature,'REEFER');
    const blocked=await request('/planning/release',dispatcher,{date});assert.equal(blocked.status,409);assert.equal(blocked.body.violations[0].code,'DRIVER_REQUIRED');
    const saved=await db.trip.findUnique({where:{id:trip.id}});
    const edit=await request('/planning/edit',dispatcher,{date,tripId:trip.id,version:saved.updatedAt.toISOString(),vehicleId:trip.vehicleId,driverId:'demo-user-driver',departureMinute:240,orderIds:[order.id]});assert.equal(edit.body.accepted,true,JSON.stringify(edit.body));
    await db.user.update({where:{id:'demo-user-driver'},data:{active:false}});
    try{assert.equal((await request('/planning/release',dispatcher,{date})).status,409);}finally{await db.user.update({where:{id:'demo-user-driver'},data:{active:true}});}
    assert.equal((await request('/planning/release',dispatcher,{date})).status,200);
    assert.ok((await db.deferral.findMany({where:{orderId:order.id}})).every(d=>d.resolvedAt));
  });
});
