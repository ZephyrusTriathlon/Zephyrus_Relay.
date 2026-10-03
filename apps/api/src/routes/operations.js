import { Router } from 'express';
import { requireRole } from '../auth.js';
import { getDatabase } from '../db.js';
import { fieldScope, tripInclude, operate, manifestVersion } from '../operations.js';
import { z } from 'zod';
export function operationRoutes({database=getDatabase}={}) {
  const router=Router();
  router.use(requireRole('LOADER','DRIVER','STORE_MANAGER'));
  router.use((req,res,next)=>{
    if(req.method==='POST'&&!z.uuid().safeParse(req.get('Idempotency-Key')).success)return res.status(400).json({error:{code:'INVALID_ACTION_ID',message:'A UUID Idempotency-Key is required.'}});
    next();
  });
  const run=fn=>async(req,res)=>{try{await fn(req,res);}catch(e){res.status(e.operational?e.status:['P2034','P2002','P2028'].includes(e.code)?409:503).json({error:{code:e.operational?'INVALID_OPERATION':'OPERATION_UNAVAILABLE',message:e.operational?e.message:'Operation unavailable; refresh and retry.'}});}};
  router.get('/trips',run(async(req,res)=>res.json({trips:(await database().trip.findMany({where:fieldScope(req.user),include:tripInclude,orderBy:[{deliveryDate:'desc'},{tripNumber:'asc'}],take:100})).map(t=>({...t,baseVersion:manifestVersion(t)}))})));
  router.post('/trips/:tripId/:action',run(async(req,res)=>res.json(await operate(database(),req.user,req.params.tripId,req.params.action,undefined,req.body,req.get('Idempotency-Key')))));
  router.post('/trips/:tripId/allocations/:allocationId/:action',run(async(req,res)=>res.json(await operate(database(),req.user,req.params.tripId,req.params.action,req.params.allocationId,req.body,req.get('Idempotency-Key')))));
  return router;
}
