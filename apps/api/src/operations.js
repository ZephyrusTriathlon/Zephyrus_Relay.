// Shared online execution rules. Stage 8 can call these same transaction functions.
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
export const allocationInclude = { order: { include: { items: { orderBy: { lineNumber: 'asc' } } } }, loadingCheck: true, loadingIssues: { orderBy: { reportedAt: 'asc' } }, exceptions: { orderBy: { reportedAt: 'asc' } }, events: { orderBy: { recordedAt: 'asc' } }, proof: { include: { receipt: true } } };
export const tripInclude = { vehicle: true, depot: true, driver: { select: { id: true, displayName: true } }, stops: { orderBy: { position: 'asc' }, include: { outlet: true, allocations: { include: allocationInclude } } } };
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status, operational: true }); };
const text = z.string().trim().min(2).max(500);
const cartonCount = z.number().int().min(0).max(2147483647);
const schemas = {
  load: z.strictObject({ cartons: cartonCount }),
  'loading-issue': z.strictObject({ type: z.enum(['MISSING','DAMAGED','QUANTITY_MISMATCH','OTHER']), details: z.string().trim().max(500).default(''), cartons: cartonCount.default(0) }),
  resolve: z.strictObject({ resolution: text }),
  exception: z.strictObject({ type: z.enum(['STORE_CLOSED','RECIPIENT_UNAVAILABLE','DAMAGED_GOODS','PARTIAL_DELIVERY','REFUSED','ACCESS_DELAYED']), details: z.string().trim().max(500).default('') }),
  pod: z.strictObject({ recipient: text, cartons: z.number().int().positive(), verified: z.literal(true), deliveredAt: z.iso.datetime({ offset: true }) }),
  receipt: z.strictObject({ cartons: z.number().int().positive() }),
  'receipt-issue': z.strictObject({ type: z.enum(['DAMAGED_GOODS','PARTIAL_DELIVERY']), details: text }),
  'resolve-receipt': z.strictObject({ resolution: text }),
};
const expected = a => a.order.items.reduce((n,i) => n+i.cartons,0);
const open = list => list.filter(i => i.status === 'OPEN');
// Re-read aggregate state after writes, rather than deciding from one allocation's
// historical exception list. A completed physical handoff is not reversed by a
// subsequent Store receipt dispute.
export async function reconcileTripStopState(tx, stopId) {
  const stop=await tx.tripStop.findUnique({where:{id:stopId},include:{allocations:{include:{proof:true,exceptions:true}}}});
  const blocked=stop.allocations.some(a=>open(a.exceptions).length);
  const delivered=stop.allocations.length>0&&stop.allocations.every(a=>a.proof);
  let status=stop.status;
  if(delivered&&!blocked)status='COMPLETED';
  // Receipt reconciliation alone does not undo a physical arrival. An existing
  // deferral stays blocked until every attached issue has been resolved.
  else if(!blocked&&stop.status==='DEFERRED')status='PENDING';
  if(status!==stop.status)await tx.tripStop.update({where:{id:stop.id},data:{status,
    ...(status==='PENDING'?{arrivedAt:null,completedAt:null}:{}),
    ...(status==='COMPLETED'?{completedAt:new Date()}: {})}});
  return status;
}
async function orderStatus(tx, a, status) {
  if(a.order.status === status) return;
  // The Stage 4 PostgreSQL trigger records exactly one history event per change.
  await tx.order.update({ where:{id:a.orderId}, data:{status} });
}
async function event(tx,a,type,user,note) {
  await tx.deliveryEvent.create({data:{allocationId:a.id,type,actorId:user.id,occurredAt:new Date(),note}});
}
export function fieldScope(user) {
  if(user.role === 'LOADER' && user.depotId) return {depotId:user.depotId,status:{in:['RELEASED','LOADING','READY']}};
  if(user.role === 'DRIVER') return {driverId:user.id,status:{in:['RELEASED','LOADING','READY','IN_PROGRESS','COMPLETED']}};
  fail('An assigned Loader or Driver account is required.',403);
}
export async function operate(db,user,tripId,action,allocationId,body={},actionId=randomUUID()) {
  const loader=['load','loading-issue','complete-loading'];
  const store=['receipt','receipt-issue','resolve-receipt'];
  const required=store.includes(action)?'STORE_MANAGER':loader.includes(action)?'LOADER':action==='resolve'&&['LOADER','DRIVER'].includes(user?.role)?user.role:'DRIVER';
  if(!user || user.role!==required || !['LOADER','DRIVER','STORE_MANAGER'].includes(required)) fail('Forbidden',403);
  if(!Object.hasOwn(schemas,action) && !['start','arrive','complete-loading','complete'].includes(action)) fail('Unknown operation',400);
  const parsed=(schemas[action] || z.strictObject({})).safeParse(body);
  if(!parsed.success) fail('Invalid operation payload. Verify quantities and required fields.',400);
  if(!z.uuid().safeParse(actionId).success) fail('A UUID Idempotency-Key is required.',400);
  const input=parsed.data;
  return db.$transaction(async tx=>{
    // Serialize retries and transitions before reading state, including across processes.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76607)`;
    const where=required==='STORE_MANAGER'?{id:tripId,allocations:{some:{id:allocationId,outletId:user.outletId??'__none__'}}}:required==='LOADER'?{id:tripId,depotId:user.depotId??'__none__'}:{id:tripId,driverId:user.id};
    const trip=await tx.trip.findFirst({where,include:tripInclude});
    if(!trip) fail('Trip not found in your assignment.',404);
    const request={allocationId:allocationId??null,input};
    const key={deviceId:'stage7-online',clientMutationId:actionId};
    const prior=await tx.syncMutation.findUnique({where:{deviceId_clientMutationId:key}});
    if(prior){
      if(prior.actorId!==user.id||prior.entityId!==tripId||prior.operation!==action||!isDeepStrictEqual(prior.payload.request,request))fail('Idempotency-Key was already used for a different action.');
      return prior.payload.result;
    }
    const result=await (async()=>{
    const allocations=trip.stops.flatMap(s=>s.allocations);
    const a=allocations.find(a=>a.id===allocationId),stop=trip.stops.find(s=>s.id===a?.tripStopId);
    if(!['start','complete','complete-loading'].includes(action)&&(!a || (required==='STORE_MANAGER'&&a.outletId!==user.outletId))) fail('Allocation not found.',404);
    const now=new Date();
    if(required==='STORE_MANAGER') {
      if(!a.proof) fail('Delivery proof is required before receipt.');
      if(action==='receipt' && a.proof.receipt) {
        if(input.cartons!==a.proof.receipt.receivedCartons) fail('Receipt was already confirmed with a different quantity.');
        return {ok:true};
      }
      if(a.proof.receipt || a.order.status!=='DELIVERED') fail('Receipt is already closed.');
      if(action==='receipt-issue') {
        if(!open(a.exceptions).length) await tx.deliveryException.create({data:{allocationId:a.id,type:input.type,details:input.details,reportedById:user.id}});
        await reconcileTripStopState(tx,stop.id);
      } else if(action==='resolve-receipt') {
        await tx.deliveryException.updateMany({where:{allocationId:a.id,status:'OPEN'},data:{status:'RESOLVED',resolution:input.resolution,resolvedAt:now}});
        await reconcileTripStopState(tx,stop.id);
      } else {
        if(open(a.exceptions).length) fail('Resolve the receipt discrepancy before confirming.');
        if(input.cartons!==a.proof.deliveredCartons) fail('Report a receipt discrepancy for mismatched quantities.');
        await tx.receiptConfirmation.create({data:{proofId:a.proof.id,confirmedById:user.id,receivedCartons:input.cartons}});
        await orderStatus(tx,a,'RECEIVED');
      }
      return {ok:true};
    }
    if(required==='LOADER') {
      if(action==='complete-loading' && trip.status==='READY') return {ok:true};
      if(!['RELEASED','LOADING'].includes(trip.status)) fail('This manifest is no longer open for loading.');
      if(action==='complete-loading') {
        if(trip.status!=='LOADING') fail('Begin loading and check the manifest before completion.');
        if(!allocations.length || allocations.some(a=>a.loadingCheck?.status!=='LOADED'||a.loadingCheck.loadedCartons!==expected(a)||open(a.loadingIssues).length)) fail('Check every allocation and resolve all loading issues first.');
        await tx.trip.update({where:{id:trip.id},data:{status:'READY'}});
      } else {
        if(action==='load') {
          if(open(a.loadingIssues).length) fail('Resolve the loading issue before rechecking.');
          if(input.cartons!==expected(a)) fail('Report a quantity mismatch before continuing.');
        }
        if(action==='resolve') {
          if(!open(a.loadingIssues).length) return {ok:true};
          await tx.loadingIssue.updateMany({where:{allocationId:a.id,status:'OPEN'},data:{status:'RESOLVED',resolution:input.resolution,resolvedAt:now}});
        } else if(action==='loading-issue' && !open(a.loadingIssues).length) {
          await tx.loadingIssue.create({data:{allocationId:a.id,type:input.type,details:`${input.details}${input.details?'\n':''}Checked ${input.cartons} of ${expected(a)} cartons.`,reportedById:user.id}});
        }
        const data={status:action==='load'?'LOADED':action==='resolve'?'PENDING':'ISSUE',loadedCartons:action==='resolve'?0:input.cartons,checkedById:user.id,checkedAt:now};
        await tx.loadingCheck.upsert({where:{allocationId:a.id},create:{allocationId:a.id,...data},update:data});
        if(trip.status==='RELEASED') await tx.trip.update({where:{id:trip.id},data:{status:'LOADING'}});
      }
      return {ok:true};
    }
    if(action==='start') {
      if(trip.status==='IN_PROGRESS') return {ok:true};
      if(trip.status!=='READY') fail('Only a READY assigned trip can start.');
      await tx.trip.update({where:{id:trip.id},data:{status:'IN_PROGRESS',startedAt:now}});
      for(const allocation of allocations) {await orderStatus(tx,allocation,'IN_DELIVERY');await event(tx,allocation,'STARTED',user);}
      return {ok:true};
    }
    if(action==='pod' && a.proof) {
      if(input.cartons!==a.proof.deliveredCartons || input.recipient!==a.proof.recipient) fail('POD already exists with different delivery details.');
      return {ok:true};
    }
    if(action==='complete' && trip.status==='COMPLETED') return {ok:true};
    if(trip.status!=='IN_PROGRESS') fail('Start the ready route before recording delivery activity.');
    if(action==='complete') {
      if(!allocations.length||allocations.some(a=>!a.proof||open(a.exceptions).length)) fail('Outstanding deliveries prevent completion.');
      await tx.trip.update({where:{id:trip.id},data:{status:'COMPLETED',completedAt:now}});
      return {ok:true};
    }
    if(a.proof) fail('This delivery is already complete.');
    if(action==='arrive') {
      if(stop.status==='ARRIVED') return {ok:true};
      if(stop.status!=='PENDING'||stop.allocations.some(a=>open(a.exceptions).length)) fail('Resolve this stop before arrival.');
      await tx.tripStop.update({where:{id:stop.id},data:{status:'ARRIVED',arrivedAt:now}});
      for(const allocation of stop.allocations.filter(a=>!a.proof)) await event(tx,allocation,'ARRIVED',user);
    } else if(action==='exception') {
      if(!open(a.exceptions).length) {await tx.deliveryException.create({data:{allocationId:a.id,type:input.type,details:input.details,reportedById:user.id}});await event(tx,a,'DEFERRED',user,input.details);}
      await tx.tripStop.update({where:{id:stop.id},data:{status:'DEFERRED'}});
      await reconcileTripStopState(tx,stop.id);
    } else if(action==='resolve') {
      if(!open(a.exceptions).length) return {ok:true};
      await tx.deliveryException.updateMany({where:{allocationId:a.id,status:'OPEN'},data:{status:'RESOLVED',resolution:input.resolution,resolvedAt:now}});
      await event(tx,a,'REATTEMPTED',user,input.resolution);
      await reconcileTripStopState(tx,stop.id);
    } else if(action==='pod') {
      if(stop.status!=='ARRIVED'||open(a.exceptions).length) fail('Record arrival and resolve outstanding exceptions first.');
      if(input.cartons!==expected(a)) fail('Report partial delivery when carton counts differ.');
      if(new Date(input.deliveredAt)>new Date(now.getTime()+60000)) fail('Delivery time cannot be in the future.',400);
      await tx.proofOfDelivery.create({data:{allocationId:a.id,recipient:input.recipient,deliveredCartons:input.cartons,verified:true,deliveredAt:new Date(input.deliveredAt),driverId:user.id}});
      await event(tx,a,'DELIVERED',user);
      await orderStatus(tx,a,'DELIVERED');
      await reconcileTripStopState(tx,stop.id);
      if(allocations.every(other=>(other.id===a.id||other.proof)&&!open(other.exceptions).length)) await tx.trip.update({where:{id:trip.id},data:{status:'COMPLETED',completedAt:now}});
    }
    return {ok:true};
    })();
    // Persist response and domain writes together. This is an online receipt of
    // an applied action, not an offline queue or a synchronization endpoint.
    const recordedAt=new Date();
    await tx.syncMutation.create({data:{...key,actorId:user.id,entityType:'Trip',entityId:tripId,operation:action,baseVersion:0,
      payload:{request,result},status:'APPLIED',clientOccurredAt:recordedAt,appliedAt:recordedAt}});
    return result;
  },{timeout:30000,maxWait:10000});
}
