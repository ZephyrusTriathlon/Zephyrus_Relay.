const {randomUUID}=require('node:crypto');

// Every operational ID is owned by this fixture. Supplied reference data is read
// only. A private vehicle avoids sequence/fuel conflicts with real walkthroughs.
async function createOperationalFixture(db,{outletIds=['OUT004'],sharedFirst=false,cartons=10,date='2024-09-03',cloneOutlets=false}={}) {
  const fixture={orders:[],allocations:[],stops:[],outlets:[],mutationIds:[]};
  await db.$transaction(async tx=>{
    const reference=await tx.vehicle.findUniqueOrThrow({where:{id:'VEH001'}});
    fixture.vehicle=await tx.vehicle.create({data:{...reference,id:`TEST-${randomUUID()}`,source:'APPLICATION'}});
    fixture.trip=await tx.trip.create({data:{tripNumber:`TEST-${randomUUID()}`,vehicleId:fixture.vehicle.id,depotId:reference.depotId,driverId:'demo-user-driver',deliveryDate:new Date(date+'T00:00:00Z'),plannedDepartureAt:new Date(date+'T04:00:00+05:30')}});
    for(const [index,outletId] of outletIds.entries()) {
      let outlet=await tx.outlet.findUniqueOrThrow({where:{id:outletId}});
      if(cloneOutlets){outlet=await tx.outlet.create({data:{...outlet,id:`TEST-${randomUUID()}`,source:'APPLICATION'}});fixture.outlets.push(outlet);}
      const stop=await tx.tripStop.create({data:{tripId:fixture.trip.id,outletId:outlet.id,position:index+1}});fixture.stops.push(stop);
      for(let j=0;j<(sharedFirst&&index===0?2:1);j++) {
        const order=await tx.order.create({data:{orderNumber:`TEST-${randomUUID()}`,outletId:outlet.id,deliveryDate:fixture.trip.deliveryDate,temperatureRequirement:'AMBIENT',windowOpenTime:outlet.windowOpenTime,windowCloseTime:outlet.windowCloseTime,
          items:{create:{lineNumber:1,productCode:'STAGE7-AUDIT',description:'Isolated audit cartons',cartons,unitWeightKg:1,unitVolumeM3:0.01,temperatureRequirement:'AMBIENT'}}}});
        fixture.orders.push(order);
        fixture.allocations.push(await tx.allocation.create({data:{orderId:order.id,outletId:outlet.id,tripId:fixture.trip.id,tripStopId:stop.id}}));
        await tx.order.update({where:{id:order.id},data:{status:'PLANNED'}});
      }
    }
  });
  return fixture;
}

async function cleanupOperationalFixture(db,f) {
  const orderIds=f.orders.map(o=>o.id),allocationIds=f.allocations.map(a=>a.id);
  await db.$transaction(async tx=>{
    await tx.syncMutation.deleteMany({where:{OR:[{entityType:'Trip',entityId:f.trip.id},{id:{in:f.mutationIds}}]}});
    await tx.receiptConfirmation.deleteMany({where:{proof:{allocationId:{in:allocationIds}}}});
    for(const model of ['proofOfDelivery','deliveryEvent','deliveryException','loadingIssue','loadingCheck'])await tx[model].deleteMany({where:{allocationId:{in:allocationIds}}});
    await tx.allocation.deleteMany({where:{id:{in:allocationIds}}});
    await tx.tripStop.deleteMany({where:{tripId:f.trip.id}});await tx.trip.delete({where:{id:f.trip.id}});
    for(const model of ['deferral','orderStatusEvent','orderItem'])await tx[model].deleteMany({where:{orderId:{in:orderIds}}});
    await tx.order.deleteMany({where:{id:{in:orderIds}}});await tx.vehicle.delete({where:{id:f.vehicle.id}});
    await tx.outlet.deleteMany({where:{id:{in:f.outlets.map(o=>o.id)}}});
  });
}
module.exports={createOperationalFixture,cleanupOperationalFixture};
