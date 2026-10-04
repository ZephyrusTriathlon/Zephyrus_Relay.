import bcrypt from 'bcrypt';
import { loadNetwork } from './import-network.js';
import { makeDemo } from './demo.js';
import { RecordSource } from '../packages/domain/src/index.js';

export async function counts(db) {
  const [outlets, vehicles, depots, calendarDays, demoOrders, demoTrips, demoUsers] = await Promise.all([
    db.outlet.count({ where: { source: RecordSource.SUPPLIED } }), db.vehicle.count({ where: { source: RecordSource.SUPPLIED } }),
    db.depot.count({ where: { source: RecordSource.SUPPLIED } }), db.calendarDay.count({ where: { source: RecordSource.SUPPLIED } }),
    db.order.count({ where: { source: RecordSource.DEMO } }), db.trip.count({ where: { source: RecordSource.DEMO } }), db.user.count({ where: { source: RecordSource.DEMO } })
  ]);
  return { outlets, vehicles, depots, calendarDays, demoOrders, demoTrips, demoUsers };
}

export async function seedNetwork(db, { dataDir } = {}) {
  if (process.env.RELAY_ALLOW_SEED !== 'true' || process.env.NODE_ENV === 'production') throw new Error('Seeding requires RELAY_ALLOW_SEED=true outside production');
  // Complete validation and demo selection before opening the write transaction.
  const network = await loadNetwork(dataDir);
  const demo = makeDemo(network);
  const passwordHashes = await Promise.all(demo.users.map(() => bcrypt.hash('RelayDemo!26', 12)));
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(76602)`;
    for (const [model, rows, key] of [['depot', network.depots, 'id'], ['outlet', network.outlets, 'id'], ['vehicle', network.vehicles, 'id'], ['calendarDay', network.calendar, 'date']]) {
      for (const record of rows) {
        const where = { [key]: record[key] };
        const existing = await tx[model].findUnique({ where });
        if (existing && existing.source !== RecordSource.SUPPLIED) throw new Error(`Seed refused to overwrite a non-supplied ${model} record`);
        // Refuse to change references underneath existing operational work.
        const decimalFields=new Set(['weightCapacityKg','volumeCapacityM3','kmPerLitre','weeklyFuelQuotaL','festivalRamp']);
        if(existing&&Object.entries(record).some(([field,value])=>value instanceof Date ? +existing[field]!==+value : decimalFields.has(field) ? Number(existing[field])!==Number(value) : existing[field]!==value))throw new Error('Reference dataset differs from existing records. Use a fresh database; existing operations were not changed.');
        await tx[model].upsert({ where, create: record, update: record });
      }
    }
    async function createOnce(model, record) {
      if (record.source) {
        const existing = await tx[model].findUnique({ where: { id: record.id }, select: { source: true } });
        if (existing && existing.source !== RecordSource.DEMO) throw new Error(`Seed ID conflict in ${model}`);
      }
      // Existing transaction state is preserved; re-seeding is not a reset command.
      await tx[model].upsert({ where: { id: record.id }, create: record, update: {} });
    }
    for (const [index, original] of demo.users.entries()) {
      const user = { ...original, email: original.role === 'STORE_MANAGER' ? 'store@relay.demo' : original.email,
        depotId: original.role === 'LOADER' ? demo.trip.depotId : null };
      await createOnce('user', { ...user, passwordHash: passwordHashes[index] });
      // Upgrade Stage 2 accounts once; never reset an existing password on repeat seed.
      await tx.user.updateMany({ where: { id: user.id, source: RecordSource.DEMO, passwordHash: null },
        data: { email: user.email, depotId: user.depotId, passwordHash: passwordHashes[index] } });
      // Label-only upgrades preserve credentials and operational progress.
      await tx.user.updateMany({where:{id:user.id,source:RecordSource.DEMO,displayName:`Relay demo ${user.role.toLowerCase().replace('_',' ')}`},data:{displayName:user.displayName}});
    }
    for (const { item, ...order } of demo.orders) {
      await createOnce('order', {...order,requestedDeliveryDate:order.deliveryDate});
      await createOnce('orderItem', { ...item, orderId: order.id });
      await tx.order.updateMany({where:{id:order.id,source:RecordSource.DEMO,orderNumber:order.orderNumber.replace('ORD-','DEMO-')},data:{orderNumber:order.orderNumber}});
      await tx.orderItem.updateMany({where:{id:item.id,description:{in:['Relay demo chilled cartons','Relay demo ambient cartons']}},data:{description:item.description,productCode:item.productCode}});
    }
    await createOnce('trip', demo.trip);
    await tx.trip.updateMany({where:{id:demo.trip.id,source:RecordSource.DEMO,tripNumber:demo.trip.tripNumber.replace('TRIP-','DEMO-')},data:{tripNumber:demo.trip.tripNumber}});
    for (const stop of demo.stops) await createOnce('tripStop', stop);
    for (const allocation of demo.allocations) {
      await createOnce('allocation', allocation);
      await createOnce('loadingCheck', { id: `demo-loading-${allocation.id.slice(16)}`, allocationId: allocation.id, status: demo.loadingStatus, updatedAt: demo.createdAt });
    }
    await createOnce('deferral', demo.deferral);
    await tx.deferral.updateMany({where:{id:demo.deferral.id,explanation:'Relay-created example: requested cartons exceed the largest supplied vehicle weight capacity.'},data:{explanation:demo.deferral.explanation,impact:demo.deferral.impact}});
    const result = await counts(tx);
    if (result.outlets !== 120 || result.vehicles !== 60 || result.depots !== 2 || result.calendarDays !== network.calendar.length) throw new Error('Unexpected supplied records already exist; seed rolled back without deleting them');
    return result;
  }, { timeout: 120000, maxWait: 10000 });
}
