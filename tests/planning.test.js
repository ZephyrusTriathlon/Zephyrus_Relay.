const {test}=require('node:test');
const assert=require('node:assert/strict');
const base=()=>({date:'2025-01-03',departureMinute:240,
  vehicle:{id:'V1',depotId:'D1',type:'VAN',temperature:'REEFER',weightCapacityKg:100,volumeCapacityM3:10,kmPerLitre:10,weeklyFuelQuotaL:100},
  orders:[{id:'O1',outlet:{id:'S1',depotId:'D1',district:'A',brand:'FRESH',dockType:'STREET',parkingConstraint:'NORMAL',windowOpenTime:'05:00',windowCloseTime:'07:30',mallWindow:null},temperatureRequirement:'AMBIENT',windowOpenTime:'05:00',windowCloseTime:'07:30',items:[{cartons:10,unitWeightKg:10,unitVolumeM3:1}]}],
  travel:[{depotId:'D1',district:'A',outboundKm:12,outboundMinutes:24,interStopKm:4,interStopMinutes:8},{depotId:'D1',district:'B',outboundKm:20,outboundMinutes:30,interStopKm:5,interStopMinutes:10}],
  service:[{brand:'FRESH',dockType:'STREET',minutes:16},{brand:'FRESH',dockType:'MALL_BAY',minutes:18},{brand:'STYLE',dockType:'STREET',minutes:46}],existingTrips:[]});

test('hard constraint matrix, exact boundaries and compound failures',async t=>{
  const {validateTrip}=await import('../packages/domain/src/planning.js');
  const cases=[
    ['chilled needs reefer',x=>{x.orders[0].temperatureRequirement='CHILLED';x.vehicle.temperature='AMBIENT';},['REFRIGERATION_REQUIRED']],
    ['chilled with reefer',x=>{x.orders[0].temperatureRequirement='CHILLED';},[]],
    ['ambient with ambient',x=>{x.vehicle.temperature='AMBIENT';},[]],
    ['van-only rejects truck',x=>{x.orders[0].outlet.parkingConstraint='VAN_ONLY';x.vehicle.type='TRUCK';},['VAN_ACCESS_REQUIRED']],
    ['van-only accepts van',x=>{x.orders[0].outlet.parkingConstraint='VAN_ONLY';},[]],
    ['exact weight and volume capacities',()=>{},[]],
    ['weight above limit while volume passes',x=>{x.orders[0].items[0].unitWeightKg=10.001;},['CAPACITY_WEIGHT']],
    ['volume above limit while weight passes',x=>{x.orders[0].items[0].unitVolumeM3=1.001;},['CAPACITY_VOLUME']],
    ['wrong home depot',x=>{x.orders[0].outlet.depotId='D2';},['DEPOT_MISMATCH']],
    ['supplied early window is narrower than 08:00',x=>{x.departureMinute=450;},['DELIVERY_WINDOW']],
    ['requested window intersects supplied window',x=>{x.orders[0].windowOpenTime='08:00';x.orders[0].windowCloseTime='09:00';},['DELIVERY_WINDOW']],
    ['mall window already closed',x=>{x.orders[0].outlet.mallWindow='03:00-04:30';},['MALL_WINDOW']],
    ['mall waiting respects both windows',x=>{x.orders[0].outlet.mallWindow='05:30-06:00';},[]],
    ['mall access missing fails closed',x=>{x.orders[0].outlet.dockType='MALL_BAY';},['MALL_WINDOW']],
    ['third trip',x=>{x.existingTrips=[1,2].map(n=>({id:'T'+n,vehicleId:'V1',date:x.date,fuelLitres:1,departureMinute:0,returnMinute:200}));},['DAILY_TRIP_LIMIT']],
    ['fuel includes return leg',x=>{x.vehicle.weeklyFuelQuotaL=2;},['WEEKLY_FUEL_QUOTA']],
    ['fuel at exact quota',x=>{x.vehicle.weeklyFuelQuotaL=2.4;},[]],
    ['compound temperature and access',x=>{x.vehicle.temperature='AMBIENT';x.vehicle.type='TRUCK';x.orders[0].temperatureRequirement='CHILLED';x.orders[0].outlet.parkingConstraint='VAN_ONLY';},['REFRIGERATION_REQUIRED','VAN_ACCESS_REQUIRED']],
    ['temperature passes but access fails',x=>{x.vehicle.type='TRUCK';x.orders[0].temperatureRequirement='CHILLED';x.orders[0].outlet.parkingConstraint='VAN_ONLY';},['VAN_ACCESS_REQUIRED']],
    ['missing route data',x=>{x.travel=[];},['ROUTE_DATA_MISSING']],
    ['missing service data',x=>{x.service=[];},['ROUTE_DATA_MISSING']],
    ['unknown existing fuel',x=>{x.existingTrips=[{vehicleId:'V1',date:x.date,departureMinute:0,returnMinute:200}];},['PLANNING_CONTEXT_MISSING']],
    ['unknown existing business date',x=>{x.existingTrips=[{vehicleId:'V1',fuelLitres:99}];},['PLANNING_CONTEXT_MISSING']],
    ['overlapping vehicle use',x=>{x.existingTrips=[{vehicleId:'V1',date:x.date,fuelLitres:1,departureMinute:230,returnMinute:400}];},['TRIP_OVERLAP']],
    ['invalid efficiency',x=>{x.vehicle.kmPerLitre=0;},['INVALID_PLANNING_INPUT']],
    ['duplicate order IDs',x=>{x.orders.push(structuredClone(x.orders[0]));},['INVALID_PLANNING_INPUT']]
  ];
  for(const [name,change,codes] of cases)await t.test(name,()=>{
    const input=base();change(input);const result=validateTrip(input);
    assert.equal(result.feasible,codes.length===0,JSON.stringify(result));
    assert.deepEqual(result.violations.map(v=>v.code).sort(),codes.sort());
    assert.ok(result.violations.every(v=>v.message));
  });
});

test('shared stop, cross-district legs, waiting, weekly boundaries and cancellation',async()=>{
  const {validateTrip,weekBounds}=await import('../packages/domain/src/planning.js');
  const input=base();input.orders[0].items[0].cartons=1;
  input.orders.push({...structuredClone(input.orders[0]),id:'O2'});
  let result=validateTrip(input);
  assert.equal(result.metrics.stops.length,1);assert.equal(result.metrics.distanceKm,24);assert.equal(result.metrics.returnMinute,340);
  input.orders[1].outlet.id='S2';
  result=validateTrip(input);assert.equal(result.metrics.distanceKm,28);assert.equal(result.metrics.stops[1].arrivalMinute,324);
  input.orders[1].outlet.district='B';input.orders[1].outlet.brand='STYLE';
  result=validateTrip(input);assert.equal(result.feasible,true);assert.equal(result.metrics.distanceKm,64);
  assert.deepEqual(weekBounds('2025-01-03'),{start:'2024-12-30',end:'2025-01-06'});
  input.existingTrips=[{vehicleId:'V1',date:'2025-01-05',fuelLitres:99},{vehicleId:'V1',date:'2024-12-29',fuelLitres:999}];
  assert.ok(validateTrip(input).violations.some(v=>v.code==='WEEKLY_FUEL_QUOTA'));
  input.existingTrips[0].status='CANCELLED';assert.equal(validateTrip(input).feasible,true);
});

test('allocation is deterministic, priority cannot bypass feasibility, and demand really defers',async()=>{
  const {allocateOrders,validateTrip,prioritizeOrders}=await import('../packages/domain/src/planning.js');
  const input=base(), orders=Array.from({length:5},(_,i)=>({...structuredClone(input.orders[0]),id:'O'+i}));
  orders[0].deferrals=[{},{}];orders[0].items[0].cartons=11;
  const args={...input,orders,vehicles:[input.vehicle]};
  const before=structuredClone(args),result=allocateOrders(args);
  assert.deepEqual(args,before,'pure allocator does not mutate inputs');
  assert.deepEqual(result,allocateOrders({...args,orders:[...orders].reverse()}));
  assert.equal(result.trips.length,2);assert.equal(result.decisions.length,2);assert.equal(result.deferrals.length,3);
  assert.ok(result.deferrals.find(d=>d.orderId==='O0').rejections.every(r=>r.violations.some(v=>v.code==='CAPACITY_WEIGHT')));
  assert.ok(result.deferrals.every(d=>d.explanation&&d.code&&d.rejections.length));
  assert.equal(prioritizeOrders(orders,input.date)[0].order.id,'O0');
  for(const trip of result.trips)assert.equal(validateTrip({...input,orders:trip.orders,departureMinute:trip.departureMinute,existingTrips:result.trips.filter(t=>t!==trip).map(t=>({vehicleId:t.vehicle.id,date:input.date,...t.validation.metrics}))}).feasible,true);
});

test('fleet ordering and tie breaks are stable; no universal brand/district or Task 2B time budget',async()=>{
  const {allocateOrders,validateTrip}=await import('../packages/domain/src/planning.js');
  const input=base();input.orders[0].items[0].cartons=1;
  const other={...structuredClone(input.orders[0]),id:'O2'};other.outlet.id='S2';other.outlet.brand='STYLE';other.outlet.district='B';other.windowOpenTime='14:00';other.windowCloseTime='18:00';other.outlet.windowOpenTime='14:00';other.outlet.windowCloseTime='18:00';
  const result=validateTrip({...input,orders:[...input.orders,other]});assert.equal(result.feasible,true);assert.ok(result.metrics.returnMinute-input.departureMinute>480);
  const fleet=[input.vehicle,{...input.vehicle,id:'V2'}];
  assert.deepEqual(allocateOrders({...input,vehicles:fleet}),allocateOrders({...input,vehicles:fleet.reverse()}));
});

test('seeded competition example selects a real van and defers the oversized order',async()=>{
  const {loadNetwork}=await import('../prisma/import-network.js');
  const {makeDemo,DEMO_DATE}=await import('../prisma/demo.js');
  const {loadPlanningData}=await import('../apps/api/src/planning-data.js');
  const {allocateOrders,validateTrip}=await import('../packages/domain/src/planning.js');
  const network=await loadNetwork(),demo=makeDemo(network),data=await loadPlanningData(network.depots);
  const orders=demo.orders.map(o=>({...o,outlet:network.outlets.find(s=>s.id===o.outletId),items:[o.item],deferrals:o.status==='DEFERRED'?[demo.deferral]:[]}));
  const legacy=validateTrip({date:DEMO_DATE,vehicle:network.vehicles.find(v=>v.id===demo.trip.vehicleId),orders:orders.filter(o=>o.status==='PLANNED'),departureMinute:285,...data});
  const plan=allocateOrders({date:DEMO_DATE,orders:orders.filter(o=>o.status!=='PLANNED'),vehicles:network.vehicles,existingTrips:[{id:demo.trip.id,vehicleId:demo.trip.vehicleId,date:DEMO_DATE,sequence:1,...legacy.metrics}],...data});
  assert.equal(plan.decisions[0].orderId,'demo-order-van-only');assert.equal(plan.decisions[0].vehicleId,'VEH037');
  assert.ok(plan.decisions[0].rejections.find(r=>r.vehicleId==='VEH001').violations.some(v=>v.code==='VAN_ACCESS_REQUIRED'));
  assert.equal(plan.deferrals[0].orderId,'demo-order-capacity');assert.ok(plan.deferrals[0].rejections.every(r=>r.violations.some(v=>v.code==='CAPACITY_WEIGHT')));
  assert.equal(plan.trips[0].validation.metrics.distanceKm,24);assert.equal(plan.trips[0].validation.metrics.stops[0].arrivalMinute,300);
});

test('priority signals have a documented lexicographic order and stable ties',async()=>{
  const {prioritizeOrders}=await import('../packages/domain/src/planning.js');
  const original=base().orders[0];original.lastServedDate='2025-01-02';
  const variants=[
    o=>{o.deferrals=[{}];},o=>{o.lastServedDate='2025-01-01';},o=>{o.temperatureRequirement='CHILLED';},
    o=>{o.outlet.parkingConstraint='VAN_ONLY';},o=>{o.windowCloseTime='06:00';},o=>{o.outlet.brand='FRESH';},
    o=>{o.items[0].unitWeightKg=11;},o=>{o.items[0].unitVolumeM3=2;}
  ];
  original.outlet.brand='STYLE';
  const orders=variants.map((modify,i)=>{const o=structuredClone(original);o.id='P'+i;modify(o);return o;});
  assert.deepEqual(prioritizeOrders(orders.reverse(),'2025-01-03').map(p=>p.order.id),variants.map((_,i)=>'P'+i));
});

test('varied deterministic demand never yields an invalid final trip',async()=>{
  const {allocateOrders,validateTrip}=await import('../packages/domain/src/planning.js');
  for(let scenario=0;scenario<25;scenario++){
    const input=base();
    const vehicles=[input.vehicle,{...input.vehicle,id:'V2',type:'TRUCK',temperature:'AMBIENT'}];
    const orders=Array.from({length:8},(_,i)=>{const o=structuredClone(input.orders[0]);o.id='O'+i;o.outlet.id='S'+i;o.items[0].cartons=1+(scenario*7+i*3)%12;o.outlet.district=i%2?'A':'B';o.temperatureRequirement=i%3?'AMBIENT':'CHILLED';o.outlet.parkingConstraint=i%4?'NORMAL':'VAN_ONLY';return o;});
    const args={...input,vehicles,orders},result=allocateOrders(args);
    assert.deepEqual(result,allocateOrders({...args,orders:[...orders].reverse(),vehicles:[...vehicles].reverse()}));
    assert.equal(result.decisions.length+result.deferrals.length,orders.length);
    for(const trip of result.trips)assert.equal(validateTrip({...input,vehicle:trip.vehicle,orders:trip.orders,departureMinute:trip.departureMinute,existingTrips:result.trips.filter(t=>t!==trip).map(t=>({vehicleId:t.vehicle.id,date:input.date,...t.validation.metrics}))}).feasible,true);
  }
});
