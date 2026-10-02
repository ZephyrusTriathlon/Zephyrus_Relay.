import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { getDatabase } from '../db.js';
import { loadPlanningData } from '../planning-data.js';
import { allocateOrders, validateTrip, weekBounds, PLANNING_POLICY } from '../../../../packages/domain/src/planning.js';

const day=value=>new Date(`${value}T00:00:00Z`);
const key=value=>value.toISOString().slice(0,10);
const includeOrder={outlet:true,items:{orderBy:{lineNumber:'asc'}},deferrals:{orderBy:{deferredAt:'asc'}}};
const at=(date,minutes)=>new Date(new Date(`${date}T00:00:00+05:30`).getTime()+minutes*60000);
const businessMinute=value=>{const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Colombo',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(value).map(p=>[p.type,p.value]));return Number(p.hour)*60+Number(p.minute);};
function error(code,message,status=400){return Object.assign(new Error(message),{planningCode:code,status});}
const reasons={CAPACITY_WEIGHT:'CAPACITY',CAPACITY_VOLUME:'CAPACITY',REFRIGERATION_REQUIRED:'TEMPERATURE',VAN_ACCESS_REQUIRED:'ACCESS',DELIVERY_WINDOW:'DELIVERY_WINDOW',MALL_WINDOW:'DELIVERY_WINDOW',WEEKLY_FUEL_QUOTA:'FUEL'};

async function context(db,date) {
  const calendar=await db.calendarDay.findUnique({where:{date:day(date)}});
  if(!calendar?.isOperating)throw error('INVALID_PLANNING_DATE','Planning requires an operating date in the shared calendar.');
  const week=weekBounds(date);
  const [vehicles,depots,trips]=await Promise.all([
    db.vehicle.findMany({orderBy:{id:'asc'}}),db.depot.findMany(),
    db.trip.findMany({where:{deliveryDate:{gte:day(week.start),lt:day(week.end)}},include:{vehicle:true,stops:{orderBy:{position:'asc'},include:{allocations:{include:{order:{include:includeOrder}}}}}},orderBy:{id:'asc'}})
  ]);
  const data=await loadPlanningData(depots);
  const existingTrips=trips.map(trip=>{
    const orders=trip.stops.flatMap(stop=>stop.allocations.map(a=>a.order));
    // Existing Stage 2 draft has no snapshot: derive its reservation from persisted
    // orders/departure and the same shared model, never from browser prototype fuel.
    let result=trip.planningContext?.metrics;
    if(trip.status!=='CANCELLED'&&!result&&trip.plannedDepartureAt&&orders.length){
      const derived=validateTrip({date:key(trip.deliveryDate),vehicle:trip.vehicle,orders,departureMinute:businessMinute(trip.plannedDepartureAt),...data});
      if(!derived.violations.some(v=>['INVALID_PLANNING_INPUT','ROUTE_DATA_MISSING'].includes(v.code)))result=derived.metrics;
    }
    return {id:trip.id,vehicleId:trip.vehicleId,date:key(trip.deliveryDate),status:trip.status,sequence:trip.sequence,
      departureMinute:result?.departureMinute,returnMinute:result?.returnMinute,fuelLitres:result?.fuelLitres};
  });
  return {vehicles,trips,existingTrips,...data};
}

export function planningRoutes({database=getDatabase}={}) {
  const router=Router();router.use(requireRole('DISPATCHER'));
  const run=handler=>async(req,res)=>{try{await handler(req,res);}catch(e){if(e.planningCode)return res.status(e.status).json({error:{code:e.planningCode,message:e.message}});if(['P2034','P2002','P2028'].includes(e.code))return res.status(409).json({error:{code:'PLANNING_CONFLICT',message:'Planning changed concurrently; reload and retry.'}});res.status(503).json({error:{code:'PLANNING_UNAVAILABLE',message:'Planning data or database is unavailable.'}});}};
  router.get('/day/:date',run(async(req,res)=>{
    const parsed=z.iso.date().safeParse(req.params.date);
    if(!parsed.success||Object.keys(req.query).length)throw error('INVALID_PLANNING_INPUT','Use a valid ISO business date without query parameters.');
    const db=database(),date=parsed.data;
    const snapshot=await db.$transaction(async tx=>{
      const c=await context(tx,date);
      const orders=await tx.order.findMany({where:{deliveryDate:day(date)},include:{...includeOrder,allocation:true},orderBy:{id:'asc'}});
      return {date,policy:PLANNING_POLICY,orders,vehicles:c.vehicles,trips:c.trips.filter(t=>key(t.deliveryDate)===date),reservations:c.existingTrips};
    },{isolationLevel:'RepeatableRead',timeout:30000});
    res.json(snapshot);
  }));
  router.post('/validate',run(async(req,res)=>{
    const input=z.strictObject({date:z.iso.date(),vehicleId:z.string().min(1),orderIds:z.array(z.string().min(1)).min(1).max(200),departureMinute:z.number().int().min(0).max(1439).default(PLANNING_POLICY.departureMinute)}).safeParse(req.body);
    if(!input.success||new Set(input.data.orderIds).size!==input.data.orderIds.length)throw error('INVALID_PLANNING_INPUT','Provide a date, vehicle, unique order IDs and departure minute.');
    const {date,vehicleId,orderIds,departureMinute}=input.data;
    const result=await database().$transaction(async tx=>{
      const c=await context(tx,date),vehicle=c.vehicles.find(v=>v.id===vehicleId);
      const orders=await tx.order.findMany({where:{id:{in:orderIds},deliveryDate:day(date),status:{in:['CONFIRMED','DEFERRED']},allocation:null},include:includeOrder});
      if(!vehicle||orders.length!==orderIds.length)throw error('INVALID_PLANNING_INPUT','Vehicle or unallocated orders are unavailable for this date.');
      return validateTrip({date,vehicle,orders:orderIds.map(id=>orders.find(o=>o.id===id)),departureMinute,...c});
    },{isolationLevel:'RepeatableRead',timeout:30000});
    res.json(result);
  }));
  router.post('/allocate',run(async(req,res)=>{
    const parsed=z.strictObject({date:z.iso.date(),retryDeferred:z.boolean().default(false)}).safeParse(req.body);
    if(!parsed.success)throw error('INVALID_PLANNING_INPUT','Provide a date and optional retryDeferred boolean.');
    const {date,retryDeferred}=parsed.data;
    const result=await database().$transaction(async tx=>{
      // All planning writes share this lock. The snapshot is read after acquisition,
      // so simultaneous dispatchers cannot spend the same fuel/trip slots twice.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(76605)`;
      const c=await context(tx,date);
      const orders=await tx.order.findMany({where:{deliveryDate:day(date),status:{in:retryDeferred?['CONFIRMED','DEFERRED']:['CONFIRMED']},allocation:null},include:includeOrder,orderBy:{id:'asc'},take:201});
      if(orders.length>200)throw error('PLANNING_BATCH_LIMIT','At most 200 pending orders can be planned in one day run.');
      const served=await tx.order.groupBy({by:['outletId'],where:{outletId:{in:orders.map(o=>o.outletId)},deliveryDate:{lt:day(date)},status:{in:['DELIVERED','RECEIVED']}},_max:{deliveryDate:true}});
      for(const order of orders)order.lastServedDate=served.find(s=>s.outletId===order.outletId)?._max.deliveryDate?.toISOString().slice(0,10);
      const plan=allocateOrders({date,orders,...c});
      const now=new Date(),ids=new Map();
      for(const proposed of plan.trips){
        const metrics=proposed.validation.metrics;
        const trip=await tx.trip.create({data:{tripNumber:`PLAN-${randomUUID()}`,deliveryDate:day(date),sequence:proposed.sequence,depotId:proposed.vehicle.depotId,vehicleId:proposed.vehicle.id,status:'DRAFT',plannedDepartureAt:at(date,metrics.departureMinute),planningContext:{policy:PLANNING_POLICY,metrics,decisions:plan.decisions.filter(d=>d.tripId===proposed.id)}}});
        ids.set(proposed.id,trip.id);
        for(const [index,stop] of metrics.stops.entries()){
          const stored=await tx.tripStop.create({data:{tripId:trip.id,outletId:stop.outletId,position:index+1,expectedAt:at(date,stop.arrivalMinute)}});
          for(const orderId of stop.orderIds){
            await tx.allocation.create({data:{orderId,outletId:stop.outletId,tripId:trip.id,tripStopId:stored.id,allocatedAt:now}});
            await tx.order.update({where:{id:orderId},data:{status:'PLANNED'}});
            await tx.deferral.updateMany({where:{orderId,resolvedAt:null},data:{resolvedAt:now}});
          }
        }
      }
      const next=await tx.calendarDay.findFirst({where:{date:{gt:day(date)},isOperating:true},orderBy:{date:'asc'}});
      for(const deferred of plan.deferrals){
        const codes=[...new Set(deferred.rejections.flatMap(r=>r.violations.map(v=>v.code)))].sort();
        if(!codes.length)codes.push('NO_VEHICLES');
        const explanation=`${deferred.explanation} Candidate rejection codes: ${codes.join(', ')||'NO_VEHICLES'}.`;
        const attempts=(orders.find(o=>o.id===deferred.orderId)?.deferrals.length ?? 0)+1;
        await tx.deferral.create({data:{orderId:deferred.orderId,reason:reasons[codes[0]]??'OTHER',explanation,impact:`Planning attempt ${attempts}; order remains unallocated. Dispatcher review required.`,deferredById:req.user.id,deferredAt:now,nextEligibleDate:next?.date??null,planningContext:{...deferred,date,policy:PLANNING_POLICY,codes,attempts}}});
        await tx.order.update({where:{id:deferred.orderId},data:{status:'DEFERRED'}});
        deferred.explanation=explanation;deferred.attempts=attempts;
      }
      return {date,policy:plan.policy,trips:plan.trips.map(t=>({id:ids.get(t.id),vehicleId:t.vehicle.id,sequence:t.sequence,status:'DRAFT',validation:t.validation})),decisions:plan.decisions.map(d=>({...d,tripId:ids.get(d.tripId)})),deferrals:plan.deferrals};
    },{timeout:60000,maxWait:10000});
    res.json(result);
  }));
  return router;
}
