const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');

test('Dispatcher planning APIs persist valid drafts and explainable deferrals atomically', {timeout:90000},async t=>{
  const {createApp}=await import('../apps/api/src/app.js');
  const {createDatabase}=await import('../apps/api/src/db.js');
  const db=createDatabase();
  const date='2024-02-06',deliveryDate=new Date(date+'T00:00:00Z'),ids=[],tripIds=[],cookies=[];
  assert.equal((await db.calendarDay.findUnique({where:{date:deliveryDate}}))?.isOperating,true);
  // Refuse to touch a date containing user work; cleanup only our recorded IDs.
  assert.equal(await db.order.count({where:{deliveryDate}}),0,'Use a dedicated development database with this fixture date free');
  let failDeferral=false;
  const database=()=>new Proxy(db,{get(target,key){
    if(key==='$transaction')return (callback,options)=>db.$transaction(tx=>callback(new Proxy(tx,{get(target,key){
      if(key==='deferral'&&failDeferral)return new Proxy(target.deferral,{get(model,method){if(method==='create')return async()=>{throw Error('Injected persistence failure');};return model[method];}});
      return target[key];
    }})),options);
    return target[key];
  }});
  const app=createApp({database,sessionSecret:'planning-test-secret-at-least-32-characters'});
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  const base=`http://127.0.0.1:${server.address().port}/api`;
  const request=(path,cookie,body)=>fetch(base+path,{headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});
  t.after(async()=>{
    for(const cookie of cookies)await request('/auth/logout',cookie,{});
    await new Promise(resolve=>server.close(resolve));await app.locals.sessionStore.close();
    const allocations=await db.allocation.findMany({where:{orderId:{in:ids}}});tripIds.push(...allocations.map(a=>a.tripId));
    await db.deferral.deleteMany({where:{orderId:{in:ids}}});
    await db.allocation.deleteMany({where:{orderId:{in:ids}}});
    await db.tripStop.deleteMany({where:{tripId:{in:tripIds}}});await db.trip.deleteMany({where:{id:{in:tripIds}}});
    await db.orderStatusEvent.deleteMany({where:{orderId:{in:ids}}});await db.orderItem.deleteMany({where:{orderId:{in:ids}}});await db.order.deleteMany({where:{id:{in:ids}}});await db.$disconnect();
  });
  async function login(name){const r=await request('/auth/login',null,{identifier:name,password:'RelayDemo!26'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];cookies.push(cookie);return cookie;}
  const dispatcher=await login('dispatcher');
  const outlet=await db.outlet.findFirst({where:{parkingConstraint:'VAN_ONLY',brand:'FRESH'},orderBy:{id:'asc'}});
  const fleet=await db.vehicle.findMany();
  for(const [label,cartons,weight] of [['fits',1,13],['oversized',1000,Math.max(...fleet.map(v=>Number(v.weightCapacityKg))) ]]){
    const order=await db.order.create({data:{orderNumber:`STAGE5-TEST-${randomUUID()}`,deliveryDate,outletId:outlet.id,temperatureRequirement:'CHILLED',windowOpenTime:outlet.windowOpenTime,windowCloseTime:outlet.windowCloseTime,items:{create:{lineNumber:1,productCode:label,description:'Stage 5 isolated test fixture',cartons,unitWeightKg:weight,unitVolumeM3:0.032,temperatureRequirement:'CHILLED'}}}});ids.push(order.id);
  }
  await t.test('authentication, all other roles, origin and input protections',async()=>{
    assert.equal((await(await request(`/planning/day/${date}`,null)).json()).error.code,'UNAUTHENTICATED');
    for(const cookie of [null,await login('store'),await login('loader'),await login('driver')])for(const [path,body] of [[`/planning/day/${date}`,undefined],['/planning/allocate',{date}],['/planning/validate',{date,vehicleId:fleet[0].id,orderIds:[ids[0]]}]])assert.equal((await request(path,cookie,body)).status,cookie?403:401);
    const cross=await fetch(base+'/planning/allocate',{method:'POST',headers:{cookie:dispatcher,'Content-Type':'application/json',origin:'https://invalid.example'},body:JSON.stringify({date})});assert.equal(cross.status,403);
    for(const body of [{date:'bad'},{date,vehicleId:'forged'},{date,orderClock:'forged'}])assert.equal((await request('/planning/allocate',dispatcher,body)).status,400);
    for(const bad of ['2024-02-04','2030-01-01']){const r=await request('/planning/allocate',dispatcher,{date:bad});assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_PLANNING_DATE');}
  });
  await t.test('validation uses persisted quantities, vehicles and windows without writes',async()=>{
    const truck=fleet.find(v=>v.type==='TRUCK'&&v.temperature==='AMBIENT'&&v.depotId===outlet.depotId);
    const before=await db.allocation.count();
    const response=await request('/planning/validate',dispatcher,{date,vehicleId:truck.id,orderIds:[ids[0]]});assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.feasible,false);
    assert.ok(result.violations.some(v=>v.code==='REFRIGERATION_REQUIRED'));assert.ok(result.violations.some(v=>v.code==='VAN_ACCESS_REQUIRED'));
    assert.equal(await db.allocation.count(),before);
    assert.equal((await request('/planning/validate',dispatcher,{date,vehicleId:truck.id,orderIds:[ids[0]],weightKg:0})).status,400);
    assert.equal((await request('/planning/validate',dispatcher,{date,vehicleId:truck.id,orderIds:[ids[0],ids[0]]})).status,400);
    assert.equal((await request('/planning/validate',dispatcher,{date,vehicleId:truck.id,orderIds:['missing']})).status,400);
  });
  await t.test('failure after trip writes rolls back the complete plan',async()=>{
    failDeferral=true;
    try{assert.equal((await request('/planning/allocate',dispatcher,{date})).status,503);}finally{failDeferral=false;}
    assert.equal(await db.allocation.count({where:{orderId:{in:ids}}}),0);assert.equal(await db.trip.count({where:{deliveryDate}}),0);
    assert.ok((await db.order.findMany({where:{id:{in:ids}}})).every(o=>o.status==='CONFIRMED'));
  });
  await t.test('concurrent allocation creates one draft and one genuine deferral, then is idempotent',async()=>{
    const responses=await Promise.all([request('/planning/allocate',dispatcher,{date}),request('/planning/allocate',dispatcher,{date})]);
    for(const r of responses)assert.equal(r.status,200,JSON.stringify(await r.clone().json()));
    const plans=await Promise.all(responses.map(r=>r.json()));assert.equal(plans.reduce((n,p)=>n+p.trips.length,0),1);assert.equal(plans.reduce((n,p)=>n+p.deferrals.length,0),1);
    const allocation=await db.allocation.findUnique({where:{orderId:ids[0]},include:{trip:{include:{vehicle:true}},tripStop:true}});
    assert.equal(allocation.trip.status,'DRAFT');assert.equal(allocation.trip.vehicle.type,'VAN');assert.equal(allocation.trip.vehicle.temperature,'REEFER');
    assert.ok(allocation.tripStop.expectedAt);assert.ok(allocation.trip.planningContext.metrics.distanceKm>0);
    const history=await db.orderStatusEvent.findMany({where:{orderId:ids[0]},orderBy:{occurredAt:'asc'}});assert.deepEqual(history.map(h=>h.status),['CONFIRMED','PLANNED']);
    const deferred=await db.deferral.findMany({where:{orderId:ids[1]}});assert.equal(deferred.length,1);assert.equal(deferred[0].reason,'CAPACITY');assert.ok(deferred[0].explanation.includes('CAPACITY_WEIGHT'));assert.equal(deferred[0].planningContext.attempts,1);
    assert.equal((await db.order.findUnique({where:{id:ids[1]}})).status,'DEFERRED');
    const again=await(await request('/planning/allocate',dispatcher,{date})).json();assert.equal(again.trips.length,0);assert.equal(again.deferrals.length,0);
  });
  await t.test('explicit deferred retry appends history and day view exposes reasons and reservations',async()=>{
    const retry=await request('/planning/allocate',dispatcher,{date,retryDeferred:true});assert.equal(retry.status,200);assert.equal((await retry.json()).deferrals[0].attempts,2);
    const history=await db.deferral.findMany({where:{orderId:ids[1]}});assert.equal(history.length,2);assert.ok(history.every(d=>d.deferredAt&&d.deferredById&&d.planningContext.rejections.length));
    const view=await request(`/planning/day/${date}`,dispatcher);assert.equal(view.status,200);const json=await view.json();assert.equal(json.orders.length,2);assert.equal(json.trips.length,1);assert.ok(json.reservations.length);assert.equal(json.orders.find(o=>o.id===ids[1]).deferrals.length,2);
    assert.equal((await request('/planning/release',dispatcher,{date})).status,404);
  });
});
