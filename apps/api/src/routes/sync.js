import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../auth.js';
import { getDatabase } from '../db.js';
import { operate, tripInclude, manifestVersion } from '../operations.js';

const actions={ARRIVAL:'arrive',DELIVERY_EXCEPTION:'exception',EXCEPTION_RESOLUTION:'resolve',DELIVERY_COMPLETE:'pod'};
const mutation=z.strictObject({idempotencyKey:z.uuid(),tripId:z.string().min(1).max(100),entityId:z.string().min(1).max(100),type:z.enum(Object.keys(actions)),occurredAt:z.iso.datetime({offset:true}),baseVersion:z.number().int().min(0).max(2147483647),payload:z.record(z.string(),z.unknown())});
export function syncRoutes({database=getDatabase}={}) {
  const router=Router();router.use(requireRole('DRIVER'));
  router.post('/',async(req,res)=>{
    const parsed=z.strictObject({mutations:z.array(mutation).min(1).max(50)}).safeParse(req.body);
    if(!parsed.success)return res.status(400).json({error:{code:'INVALID_BATCH',message:'Invalid field actions.'}});
    const results=[],blocked=new Set();
    for(const m of parsed.data.mutations){
      if(blocked.has(m.tripId)){results.push({idempotencyKey:m.idempotencyKey,state:'NEEDS_ATTENTION',code:'DEPENDENCY_BLOCKED',message:'An earlier action on this trip needs attention.'});continue;}
      try {
        // All ownership, entity, manifest, payload and lifecycle decisions are
        // made inside the SAME transaction service as the online endpoint.
        const acknowledgement=await operate(database(),req.user,m.tripId,actions[m.type],m.entityId,m.payload,m.idempotencyKey,{baseVersion:m.baseVersion,occurredAt:m.occurredAt});
        results.push({idempotencyKey:m.idempotencyKey,state:'ACKNOWLEDGED',acknowledgement});
      }catch(error){
        blocked.add(m.tripId);
        results.push({idempotencyKey:m.idempotencyKey,state:error.operational?'NEEDS_ATTENTION':'PENDING',code:error.operational?error.code:'TEMPORARILY_UNAVAILABLE',message:error.operational?error.message:'Unable to save right now. Reconnect and retry.'});
      }
    }
    // Fresh authoritative views are independently scoped; reassignment never
    // leaks a former assignment. Clients must retain conflicts, not apply them.
    try {
      const trips=await database().trip.findMany({where:{id:{in:parsed.data.mutations.map(m=>m.tripId)},driverId:req.user.id},include:tripInclude});
      res.json({results,trips:trips.map(t=>({...t,baseVersion:manifestVersion(t)}))});
    }catch{res.status(503).json({error:{code:'REFRESH_UNAVAILABLE',message:'Reconnect and retry. Already saved actions will not be duplicated.'}});}
  });return router;
}
