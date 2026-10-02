import { z } from 'zod';

export const PLANNING_POLICY = Object.freeze({ version: 'relay-district-v1', departureMinute: 240,
  distance: 'Depot to first district; same-district inter-stop legs; cross-district legs via home depot; last district back to depot.',
  time: 'Supplied free-flow minutes plus supplied service allowances and waiting. Estimates, not traffic forecasts; return travel reserves the vehicle.' });
const minute = value => /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? Number(value.slice(0,2))*60+Number(value.slice(3)) : NaN;
const positive = z.coerce.number().finite().positive();
const measurement = positive.refine(n=>Number.isSafeInteger(Math.round(n*1000))&&Math.abs(n*1000-Math.round(n*1000))<0.000001,'At most three decimal places');
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const outletSchema = z.object({ id:z.string(), depotId:z.string(), district:z.string(), brand:z.enum(['FRESH','STYLE','TECH']),
  dockType:z.enum(['STREET','REAR_DOCK','MALL_BAY']), parkingConstraint:z.enum(['NORMAL','VAN_ONLY','MALL_DOCK']),
  windowOpenTime:clock, windowCloseTime:clock, mallWindow:z.string().nullable() });
const orderSchema = z.object({ id:z.string(), outlet:outletSchema, temperatureRequirement:z.enum(['AMBIENT','CHILLED']),
  windowOpenTime:clock, windowCloseTime:clock, items:z.array(z.object({cartons:positive.int().safe(),unitWeightKg:measurement,unitVolumeM3:measurement})).min(1) });
const vehicleSchema = z.object({id:z.string(),depotId:z.string(),type:z.enum(['VAN','TRUCK']),temperature:z.enum(['AMBIENT','REEFER']),
  weightCapacityKg:measurement,volumeCapacityM3:measurement,kmPerLitre:positive,weeklyFuelQuotaL:positive});
const milli = value => Math.round(Number(value)*1000);
export function orderLoad(order) {
  return order.items.reduce((sum,item)=>({weightMilli:sum.weightMilli+item.cartons*milli(item.unitWeightKg),volumeMilli:sum.volumeMilli+item.cartons*milli(item.unitVolumeM3)}),{weightMilli:0,volumeMilli:0});
}
export function deliveryWindow(order) {
  const outlet = order.outlet;
  const mall = outlet.mallWindow?.split('-').map(minute);
  return {open:Math.max(minute(order.windowOpenTime),minute(outlet.windowOpenTime),mall?.[0] ?? 0),
    close:Math.min(minute(order.windowCloseTime),minute(outlet.windowCloseTime),mall?.[1] ?? 1439)};
}
export function weekBounds(date) {
  const start=new Date(`${date}T00:00:00Z`); start.setUTCDate(start.getUTCDate()-(start.getUTCDay()+6)%7);
  const end=new Date(start);end.setUTCDate(end.getUTCDate()+7);
  return {start:start.toISOString().slice(0,10),end:end.toISOString().slice(0,10)};
}

// All inputs are explicit; no database, environment, browser or wall-clock reads.
export function validateTrip({date,vehicle,orders,departureMinute=PLANNING_POLICY.departureMinute,existingTrips=[],travel=[],service=[],id}={}) {
  const violations=[];
  const fail=(code,message,context={})=>violations.push({code,message,...context});
  if (!z.iso.date().safeParse(date).success || !vehicleSchema.safeParse(vehicle).success || !Array.isArray(orders) || !orders.length ||
      orders.some(o=>!orderSchema.safeParse(o).success) || !Array.isArray(existingTrips) || existingTrips.some(t=>!t||typeof t.vehicleId!=='string') || !Array.isArray(travel) || !Array.isArray(service) || !Number.isInteger(departureMinute) || departureMinute<0 || departureMinute>=1440 ||
      new Set(orders.map(o=>o.id)).size!==orders.length) {
    return {feasible:false,violations:[{code:'INVALID_PLANNING_INPUT',message:'Complete, unique orders, valid vehicle data and a local departure minute are required.'}]};
  }
  const load=orders.map(orderLoad).reduce((a,b)=>({weightMilli:a.weightMilli+b.weightMilli,volumeMilli:a.volumeMilli+b.volumeMilli}),{weightMilli:0,volumeMilli:0});
  if(!Number.isSafeInteger(load.weightMilli)||!Number.isSafeInteger(load.volumeMilli))fail('INVALID_PLANNING_INPUT','Load exceeds supported exact measurement range.');
  for(const order of orders){
    const context={orderId:order.id,outletId:order.outlet.id};
    if(order.outlet.depotId!==vehicle.depotId)fail('DEPOT_MISMATCH','Vehicle and outlet must share a home depot.',context);
    if(order.temperatureRequirement==='CHILLED'&&vehicle.temperature!=='REEFER')fail('REFRIGERATION_REQUIRED','Chilled orders require a reefer.',context);
    if(order.outlet.parkingConstraint==='VAN_ONLY'&&vehicle.type!=='VAN')fail('VAN_ACCESS_REQUIRED','This outlet requires a van.',context);
  }
  if(load.weightMilli>milli(vehicle.weightCapacityKg))fail('CAPACITY_WEIGHT','Trip weight exceeds vehicle capacity.',{actual:load.weightMilli/1000,limit:Number(vehicle.weightCapacityKg)});
  if(load.volumeMilli>milli(vehicle.volumeCapacityM3))fail('CAPACITY_VOLUME','Trip volume exceeds vehicle capacity.',{actual:load.volumeMilli/1000,limit:Number(vehicle.volumeCapacityM3)});
  let current=departureMinute,distanceKm=0,previous=null;
  const stops=[];
  // Multiple orders for one outlet share a physical stop and one service allowance.
  const groups=new Map();
  for(const order of orders){if(!groups.has(order.outlet.id))groups.set(order.outlet.id,[]);groups.get(order.outlet.id).push(order);}
  for(const group of groups.values()) {
    const outlet=group[0].outlet;
    const leg=travel.find(row=>row.depotId===vehicle.depotId&&row.district===outlet.district);
    const allowance=service.find(row=>row.brand===outlet.brand&&row.dockType===outlet.dockType)?.minutes;
    if(!leg || !['outboundKm','outboundMinutes','interStopKm','interStopMinutes'].every(key=>Number.isFinite(leg[key])&&leg[key]>0) || !Number.isFinite(allowance)||allowance<=0) {
      fail('ROUTE_DATA_MISSING','Supplied travel or service data is unavailable.',{outletId:outlet.id});continue;
    }
    if(previous?.district===outlet.district){distanceKm+=leg.interStopKm;current+=leg.interStopMinutes;}
    else {distanceKm+=(previous?.outboundKm ?? 0)+leg.outboundKm;current+=(previous?.outboundMinutes ?? 0)+leg.outboundMinutes;}
    const windows=group.map(deliveryWindow);
    current=Math.max(current,...windows.map(w=>w.open));
    const arrivalMinute=current;
    for(const order of group) {
      const context={orderId:order.id,outletId:outlet.id};
      if(!Number.isFinite(arrivalMinute)||arrivalMinute<Math.max(minute(order.windowOpenTime),minute(order.outlet.windowOpenTime))||arrivalMinute>Math.min(minute(order.windowCloseTime),minute(order.outlet.windowCloseTime)))fail('DELIVERY_WINDOW','Arrival falls outside the requested/outlet delivery-window intersection.',{...context,arrivalMinute});
      const mall=order.outlet.mallWindow?.split('-').map(minute);
      const needsMall=order.outlet.dockType==='MALL_BAY'||order.outlet.parkingConstraint==='MALL_DOCK';
      if((needsMall&&!mall)||(mall&&(!Number.isFinite(mall[0])||!Number.isFinite(mall[1])||mall[0]>=mall[1]||arrivalMinute<mall[0]||arrivalMinute>mall[1])))fail('MALL_WINDOW','Arrival must satisfy the supplied mall access window.',{...context,arrivalMinute});
    }
    stops.push({outletId:outlet.id,orderIds:group.map(o=>o.id),arrivalMinute,serviceMinutes:allowance});
    current+=allowance;previous={...leg,district:outlet.district};
  }
  distanceKm+=previous?.outboundKm ?? 0;current+=previous?.outboundMinutes ?? 0;
  const fuelLitres=distanceKm/Number(vehicle.kmPerLitre);
  const week=weekBounds(date);
  const other=existingTrips.filter(t=>t.vehicleId===vehicle.id&&t.status!=='CANCELLED'&&(!id||t.id!==id));
  if(other.some(t=>!z.iso.date().safeParse(t.date).success))fail('PLANNING_CONTEXT_MISSING','Existing trips must have known business dates to check weekly reservations.');
  const weekly=other.filter(t=>t.date>=week.start&&t.date<week.end);
  const daily=other.filter(t=>t.date===date);
  if(weekly.some(t=>!Number.isFinite(t.fuelLitres)||t.fuelLitres<0)||daily.some(t=>!Number.isFinite(t.departureMinute)||!Number.isFinite(t.returnMinute)||t.departureMinute<0||t.returnMinute<t.departureMinute||t.returnMinute>=1440))fail('PLANNING_CONTEXT_MISSING','Existing trips have unknown or invalid fuel/timing; this vehicle cannot be safely allocated.');
  const weeklyFuelLitres=weekly.reduce((sum,t)=>sum+t.fuelLitres,0)+fuelLitres;
  if(weeklyFuelLitres>Number(vehicle.weeklyFuelQuotaL))fail('WEEKLY_FUEL_QUOTA','Weekly reserved fuel exceeds the vehicle quota.',{actual:weeklyFuelLitres,limit:Number(vehicle.weeklyFuelQuotaL)});
  if(daily.length>=2)fail('DAILY_TRIP_LIMIT','A vehicle may execute at most two trips per business date.',{actual:daily.length+1,limit:2});
  if(daily.some(t=>departureMinute<t.returnMinute&&current>t.departureMinute))fail('TRIP_OVERLAP','Vehicle has not returned from another trip.');
  if(!Number.isFinite(current)||current>=1440)fail('DELIVERY_WINDOW','Route must return within the planning business date.');
  return {feasible:violations.length===0,violations,metrics:{weightKg:load.weightMilli/1000,volumeM3:load.volumeMilli/1000,distanceKm,fuelLitres,weeklyFuelLitres,departureMinute,returnMinute:current,stops,policy:PLANNING_POLICY.version}};
}

export function prioritizeOrders(orders,date) {
  return orders.map(order=>{
    const w=deliveryWindow(order),load=orderLoad(order);
    const days=order.lastServedDate?Math.max(0,Math.floor((new Date(date)-new Date(order.lastServedDate))/86400000)):3650;
    const signals=[order.deferrals?.length ?? 0,days,Number(order.temperatureRequirement==='CHILLED'),Number(order.outlet.parkingConstraint==='VAN_ONLY'),-(w.close-w.open),Number(order.outlet.brand==='FRESH'),load.weightMilli,load.volumeMilli];
    return {order,signals};
  }).sort((a,b)=>{for(let i=0;i<a.signals.length;i++){const delta=b.signals[i]-a.signals[i];if(delta)return delta;}return a.order.id<b.order.id?-1:a.order.id>b.order.id?1:0;});
}

export function allocateOrders({date,orders,vehicles,existingTrips=[],travel,service}) {
  const trips=[],decisions=[],deferrals=[];
  const fleet=[...vehicles].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
  for(const {order,signals} of prioritizeOrders(orders,date)) {
    const candidates=[],rejections=[];
    for(const vehicle of fleet) {
      const baselines=()=>[...existingTrips,...trips.map(t=>({id:t.id,vehicleId:t.vehicle.id,date,sequence:t.sequence,...t.validation.metrics}))];
      const own=trips.filter(t=>t.vehicle.id===vehicle.id);
      const used=baselines().filter(t=>t.vehicleId===vehicle.id&&t.date===date&&t.status!=='CANCELLED');
      const sequence=[1,2].find(n=>!used.some(t=>t.sequence===n)) ?? 3;
      const next={id:`plan-${vehicle.id}-${sequence}`,vehicle,sequence,orders:[],departureMinute:Math.max(PLANNING_POLICY.departureMinute,...used.map(t=>t.returnMinute ?? PLANNING_POLICY.departureMinute))};
      for(const target of [...own,next]) {
        const input={date,vehicle,orders:[...target.orders,order],departureMinute:target.departureMinute,existingTrips:baselines(),travel,service,id:target.id};
        const validation=validateTrip(input);
        if(!validation.feasible){rejections.push({vehicleId:vehicle.id,tripId:target.id,violations:validation.violations});continue;}
        const score=[target.orders.length?0:1,validation.metrics.fuelLitres-(target.validation?.metrics.fuelLitres ?? 0),1-validation.metrics.weightKg/Number(vehicle.weightCapacityKg)];
        candidates.push({target,validation,score});
      }
    }
    candidates.sort((a,b)=>{for(let i=0;i<a.score.length;i++){if(a.score[i]!==b.score[i])return a.score[i]-b.score[i];}return a.target.id<b.target.id?-1:1;});
    if(!candidates.length){deferrals.push({orderId:order.id,code:'NO_FEASIBLE_CANDIDATE',explanation:'No vehicle/trip candidate satisfies all hard constraints.',priority:signals,rejections});continue;}
    const winner=candidates[0];
    winner.target.orders.push(order);winner.target.validation=winner.validation;
    if(!trips.includes(winner.target))trips.push(winner.target);
    decisions.push({orderId:order.id,tripId:winner.target.id,vehicleId:winner.target.vehicle.id,priority:signals,score:winner.score,explanation:'Selected the feasible candidate with the best lexicographic score: existing trip, incremental fuel, then weight utilization and stable ID.',rejections});
  }
  // Independent final pass includes all other new reservations before persistence.
  for(const trip of trips){trip.validation=validateTrip({date,vehicle:trip.vehicle,orders:trip.orders,departureMinute:trip.departureMinute,id:trip.id,existingTrips:[...existingTrips,...trips.map(t=>({id:t.id,vehicleId:t.vehicle.id,date,...t.validation.metrics}))],travel,service});if(!trip.validation.feasible)throw new Error('Allocator produced an invalid plan');}
  return {date,policy:PLANNING_POLICY,trips,decisions,deferrals};
}
