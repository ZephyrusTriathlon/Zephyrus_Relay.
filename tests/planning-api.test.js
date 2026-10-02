const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');

test('Dispatcher planning APIs persist valid drafts and explainable deferrals atomically', {timeout:90000},async t=>{
  const {createApp}=await import('../apps/api/src/app.js');
  const {createDatabase}=await import('../apps/api/src/db.js');
  const db=createDatabase();
  const date='2024-02-06',deliveryDate=new Date(date+'T00:00:00Z'),ids=[],tripIds=[],cookies=[],vehicleIds=[];
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
    await db.vehicle.deleteMany({where:{id:{in:vehicleIds}}});
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
    for(const cookie of [null,await login('store'),await login('loader'),await login('driver')])for(const [path,body] of [[`/planning/day/${date}`,undefined],['/planning/allocate',{date}],['/planning/release',{date}],['/planning/edit',{date}],['/planning/validate',{date,vehicleId:fleet[0].id,orderIds:[ids[0]]}]])assert.equal((await request(path,cookie,body)).status,cookie?403:401);
    const cross=await fetch(base+'/planning/allocate',{method:'POST',headers:{cookie:dispatcher,'Content-Type':'application/json',origin:'https://invalid.example'},body:JSON.stringify({date})});assert.equal(cross.status,403);
    for(const body of [{date:'bad'},{date,vehicleId:'forged'},{date,orderClock:'forged'}])assert.equal((await request('/planning/allocate',dispatcher,body)).status,400);
    for(const bad of ['2024-02-04','2030-01-01']){const r=await request('/planning/allocate',dispatcher,{date:bad});assert.equal(r.status,400);assert.equal((await r.json()).error.code,'INVALID_PLANNING_DATE');}
  });
  await t.test('validation uses persisted quantities, vehicles and windows without writes',async()=>{
    const truck=fleet.find(v=>v.type==='TRUCK'&&v.temperature==='AMBIENT'&&v.depotId===outlet.depotId);
    const before=await db.allocation.count({where:{orderId:{in:ids}}});
    const response=await request('/planning/validate',dispatcher,{date,vehicleId:truck.id,orderIds:[ids[0]]});assert.equal(response.status,200);
    const result=await response.json();assert.equal(result.feasible,false);
    assert.ok(result.violations.some(v=>v.code==='REFRIGERATION_REQUIRED'));assert.ok(result.violations.some(v=>v.code==='VAN_ACCESS_REQUIRED'));
    assert.equal(await db.allocation.count({where:{orderId:{in:ids}}}),before);
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

  });
  await t.test('manual changes are validated, stale edits rejected, release revalidates and finalizes real manifests',async()=>{
    const getTrip=()=>db.trip.findFirst({where:{deliveryDate,status:'DRAFT'},include:{stops:{include:{allocations:true}}}});
    let trip=await getTrip();
    const original=JSON.stringify(trip);
    const body={date,tripId:trip.id,version:trip.updatedAt.toISOString(),vehicleId:trip.vehicleId,departureMinute:240,orderIds:[ids[0]]};
    const truck=fleet.find(v=>v.type==='TRUCK'&&v.depotId===outlet.depotId);
    const invalid=await request('/planning/edit',dispatcher,{...body,vehicleId:truck.id});assert.equal(invalid.status,200);assert.equal((await invalid.json()).accepted,false);
    assert.equal(JSON.stringify(await getTrip()),original);
    const valid=await request('/planning/edit',dispatcher,{...body,departureMinute:241});assert.equal(valid.status,200);assert.equal((await valid.json()).accepted,true);
    assert.equal((await request('/planning/edit',dispatcher,body)).status,409);
    trip=await getTrip();assert.equal(trip.planningContext.metrics.departureMinute,241);
    const item=await db.orderItem.findFirst({where:{orderId:ids[0]}});
    await db.orderItem.update({where:{id:item.id},data:{cartons:1000000}});
    try{
      const blocked=await request('/planning/release',dispatcher,{date});assert.equal(blocked.status,409);assert.ok((await blocked.json()).violations.some(v=>v.code==='CAPACITY_WEIGHT'));
      assert.equal((await getTrip()).status,'DRAFT');
    }finally{await db.orderItem.update({where:{id:item.id},data:{cartons:item.cartons}});}
    const released=await request('/planning/release',dispatcher,{date});assert.equal(released.status,200);assert.equal((await released.json()).trips.length,1);
    const saved=await db.trip.findUnique({where:{id:trip.id},include:{stops:{include:{allocations:true}}}});
    assert.equal(saved.status,'RELEASED');assert.ok(saved.planningContext.release.actorId);assert.ok(saved.planningContext.release.at);
    assert.equal(saved.stops[0].allocations[0].orderId,ids[0]);assert.equal(saved.stops[0].position,1);assert.equal(saved.stops[0].outletId,outlet.id);
    assert.equal(saved.stops[0].expectedAt.toISOString(),new Date(new Date(date+'T00:00:00+05:30').getTime()+saved.planningContext.metrics.stops[0].arrivalMinute*60000).toISOString());
    assert.equal((await request('/planning/edit',dispatcher,{...body,version:saved.updatedAt.toISOString()})).status,409);
    assert.equal((await(await request('/planning/release',dispatcher,{date})).json()).trips.length,0);
  });
  await t.test('cancelled persisted trips reserve sequences but not active daily slots, including concurrent replacements',async()=>{
    // Only this fixture vehicle can carry these orders; the supplied fleet tops out at 7200 kg.
    const vehicle=await db.vehicle.create({data:{id:`stage5-${randomUUID()}`,type:'VAN',temperature:'REEFER',weightCapacityKg:9000,volumeCapacityM3:100,fuelType:'DIESEL',kmPerLitre:100,weeklyFuelQuotaL:1000,depotId:outlet.depotId,source:'DEMO'}});
    vehicleIds.push(vehicle.id);
    const addOrder=async(requestedDate=deliveryDate)=>{
      const order=await db.order.create({data:{orderNumber:`STAGE5-CANCEL-${randomUUID()}`,deliveryDate:requestedDate,outletId:outlet.id,temperatureRequirement:'CHILLED',windowOpenTime:outlet.windowOpenTime,windowCloseTime:outlet.windowCloseTime,items:{create:{lineNumber:1,productCode:'cancel-regression',description:'Cancellation persistence regression',cartons:1,unitWeightKg:8000,unitVolumeM3:1,temperatureRequirement:'CHILLED'}}}});
      ids.push(order.id);return order;
    };
    await addOrder();
    const initial=await request('/planning/allocate',dispatcher,{date});assert.equal(initial.status,200);
    const first=(await initial.json()).trips[0];tripIds.push(first.id);
    assert.equal(first.vehicleId,vehicle.id);assert.equal(first.sequence,1);
    await db.trip.update({where:{id:first.id},data:{status:'CANCELLED'}});
    const replacement=await addOrder();
    const candidate=await request('/planning/validate',dispatcher,{date,vehicleId:vehicle.id,orderIds:[replacement.id]});
    assert.equal(candidate.status,200);assert.equal((await candidate.json()).feasible,true);
    await addOrder();
    const responses=await Promise.all([request('/planning/allocate',dispatcher,{date}),request('/planning/allocate',dispatcher,{date})]);
    for(const response of responses)assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const plans=await Promise.all(responses.map(r=>r.json()));
    const replacements=plans.flatMap(p=>p.trips);tripIds.push(...replacements.map(t=>t.id));
    assert.equal(replacements.length,2);assert.deepEqual(replacements.map(t=>t.sequence).sort(),[2,3]);
    assert.ok(replacements.every(t=>t.status==='DRAFT'&&t.validation.feasible));
    assert.equal(await db.trip.count({where:{vehicleId:vehicle.id,deliveryDate,status:{not:'CANCELLED'}}}),2);
    const extra=await addOrder();
    const full=await request('/planning/allocate',dispatcher,{date});assert.equal(full.status,200);
    const deferred=(await full.json()).deferrals.find(d=>d.orderId===extra.id);
    assert.ok(deferred.rejections.filter(r=>r.vehicleId===vehicle.id).every(r=>r.violations.some(v=>v.code==='DAILY_TRIP_LIMIT'||v.code==='CAPACITY_WEIGHT')));
    // Two cancelled records plus one active record still leave exactly one active slot.
    await db.trip.update({where:{id:replacements.find(t=>t.sequence===2).id},data:{status:'CANCELLED'}});
    const retry=await request('/planning/allocate',dispatcher,{date,retryDeferred:true});assert.equal(retry.status,200);
    const last=(await retry.json()).trips.find(t=>t.vehicleId===vehicle.id);tripIds.push(last.id);assert.equal(last.sequence,4);
    assert.equal(await db.allocation.count({where:{tripId:{in:[...replacements.map(t=>t.id),last.id]}}}),3);
    assert.ok((await db.deferral.findMany({where:{orderId:extra.id}})).every(d=>d.resolvedAt));
    const view=await(await request(`/planning/day/${date}`,dispatcher)).json();
    assert.equal(view.trips.filter(t=>t.vehicleId===vehicle.id&&t.status==='CANCELLED').length,2);
    // Across different dates, the shared lock must also protect weekly fuel.
    const dates=['2024-02-09','2024-02-10'];
    for(const value of dates){const when=new Date(value+'T00:00:00Z');assert.equal(await db.order.count({where:{deliveryDate:when}}),0);await addOrder(when);}
    await db.vehicle.update({where:{id:vehicle.id},data:{weeklyFuelQuotaL:0.75}});
    const competing=await Promise.all(dates.map(date=>request('/planning/allocate',dispatcher,{date})));
    for(const response of competing)assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
    const weekly=await Promise.all(competing.map(r=>r.json()));
    tripIds.push(...weekly.flatMap(p=>p.trips.map(t=>t.id)));
    assert.equal(weekly.flatMap(p=>p.trips).length,1);assert.equal(weekly.flatMap(p=>p.deferrals).length,1);
    assert.ok(weekly.flatMap(p=>p.deferrals)[0].rejections.filter(r=>r.vehicleId===vehicle.id).every(r=>r.violations.some(v=>v.code==='WEEKLY_FUEL_QUOTA')));
  });
});
