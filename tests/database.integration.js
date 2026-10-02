// Explicit opt-in integration suite. Uses a dedicated database, never arbitrary existing tables.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { readFile } = require('node:fs/promises');
const {createOperationalFixture,cleanupOperationalFixture}=require('./operational-fixture');

test('PostgreSQL migration, supplied network, repeatable seed, relations and development reads', { timeout: 180000 }, async t => {
  assert.equal(process.env.RELAY_ALLOW_SEED, 'true', 'Use a dedicated development database and enable RELAY_ALLOW_SEED');
  assert.notEqual(process.env.NODE_ENV, 'production');
  const { createDatabase } = await import('../apps/api/src/db.js');
  const { seedNetwork, counts } = await import('../prisma/seed-network.js');
  const { loadNetwork } = await import('../prisma/import-network.js');
  const { parse } = await import('csv-parse/sync');
  const db = createDatabase();
  t.after(() => db.$disconnect());
  assert.equal((await db.$queryRaw`SELECT 1 AS connected`)[0].connected, 1);
  const network = await loadNetwork();
  const first = await seedNetwork(db);
  assert.deepEqual(first, { outlets: 120, vehicles: 60, depots: 2, calendarDays: network.calendar.length, demoOrders: 5, demoTrips: 1, demoUsers: 4 });
  const beforeOrders = await db.order.findMany({ where:{source:'DEMO'}, orderBy: { id: 'asc' }, include: { items: true } });
  const beforeAllocations = await db.allocation.count({where:{trip:{source:'DEMO'}}});
  assert.deepEqual(await seedNetwork(db), first);
  assert.deepEqual(await db.order.findMany({where:{source:'DEMO'}, orderBy: { id: 'asc' }, include: { items: true } }), beforeOrders);
  assert.equal(await db.allocation.count({where:{trip:{source:'DEMO'}}}), beforeAllocations);

  await t.test('every supplied value survives import, including exact decimal capacities and calendar business flags', async () => {
    // Compare to independently parsed source rows, not importer-derived expected values.
    const directory = process.env.RELAY_DATA_DIR || 'data';
    const path = require('node:path');
    const csv = async file => parse(await readFile(path.join(directory, 'General Data', file)), { columns: true, bom: true });
    const depots = await db.depot.findMany();
    const names = Object.fromEntries(depots.map(depot => [depot.id, depot.name]));
    const outlets = await db.outlet.findMany({ orderBy: { id: 'asc' } });
    const vehicles = await db.vehicle.findMany({ orderBy: { id: 'asc' } });
    for (const row of await csv('outlets.csv')) {
      const actual = outlets.find(item => item.id === row.outlet_id);
      assert.ok(actual);
      assert.equal(actual.brand, row.brand.toUpperCase());
      assert.equal(actual.district, row.district);
      assert.equal(names[actual.depotId], row.depot);
      assert.equal(actual.dockType, row.dock_type.toUpperCase());
      assert.equal(actual.parkingConstraint, row.parking_constraint.toUpperCase());
      assert.equal(actual.mallWindow, row.mall_window || null);
      assert.equal(actual.windowOpenTime, row.window_open_time);
      assert.equal(actual.windowCloseTime, row.window_close_time);
    }
    for (const row of await csv('vehicles.csv')) {
      const actual = vehicles.find(item => item.id === row.vehicle_id);
      assert.ok(actual);
      assert.equal(actual.type, row.type.toUpperCase());
      assert.equal(actual.temperature, row.temp.toUpperCase());
      assert.equal(actual.fuelType, row.fuel_type.toUpperCase());
      assert.equal(names[actual.depotId], row.depot);
      for (const [field, column] of [['weightCapacityKg','weight_cap_kg'],['volumeCapacityM3','volume_cap_m3'],['kmPerLitre','km_per_l'],['weeklyFuelQuotaL','weekly_fuel_quota_l']]) assert.equal(actual[field].toNumber(), Number(row[column]));
    }
    const calendar = await db.calendarDay.findMany({ orderBy: { date: 'asc' } });
    const rawCalendar = await csv('calendar.csv');
    assert.equal(calendar.length, rawCalendar.length);
    for (const row of rawCalendar) {
      const actual = calendar.find(day => day.date.toISOString().slice(0, 10) === row.date);
      for (const [field, column] of [['isWeekend','is_weekend'],['isPayday','is_payday'],['isHoliday','is_holiday'],['monsoon','monsoon'],['isOperating','is_operating']]) assert.equal(actual[field], row[column] === '1');
      assert.equal(actual.festival, row.festival || null);
      assert.equal(actual.festivalRamp.toNumber(), Number(row.festival_ramp));
    }
  });

  await t.test('independent order IDs allow repeated outlet/date and database constraints reject inconsistent allocations', async () => {
    const fixture=await createOperationalFixture(db,{outletIds:['OUT004','OUT005'],sharedFirst:true,cloneOutlets:true});
    try {
    const orders = await db.order.findMany({ where: { source: 'DEMO' }, include: { items: true } });
    assert.equal(new Set(orders.map(order => order.id)).size, 5);
    const chilled = orders.find(order => order.id === 'demo-order-chilled');
    assert.ok(orders.some(order => order.id !== chilled.id && order.outletId === chilled.outletId && +order.deliveryDate === +chilled.deliveryDate));
    assert.ok(orders.some(order => order.temperatureRequirement === 'AMBIENT'));
    assert.equal(chilled.temperatureRequirement, 'CHILLED');
    const capacity = orders.find(order => order.id === 'demo-order-capacity');
    const largest = Math.max(...network.vehicles.map(vehicle => Number(vehicle.weightCapacityKg)));
    assert.ok(capacity.items[0].cartons * capacity.items[0].unitWeightKg.toNumber() > largest);
    const unallocated=await db.order.create({data:{orderNumber:`TEST-${randomUUID()}`,outletId:fixture.outlets[1].id,deliveryDate:fixture.trip.deliveryDate,temperatureRequirement:'AMBIENT',windowOpenTime:'04:00',windowCloseTime:'08:00'}});fixture.orders.push(unallocated);
    const invalid = { id: randomUUID(), orderId: unallocated.id, outletId: fixture.outlets[0].id, tripId: fixture.trip.id, tripStopId: fixture.stops[0].id };
    await assert.rejects(db.allocation.create({ data: invalid }), { code: 'P2003' });
    await assert.rejects(db.orderItem.create({ data: { id: randomUUID(), orderId: fixture.orders[0].id, lineNumber: 99, productCode: 'TEST', description: 'Invalid test', cartons: -1, unitWeightKg: 1, unitVolumeM3: 1, temperatureRequirement: 'AMBIENT' } }));
    await assert.rejects(db.tripStop.create({ data: { id: randomUUID(), tripId: fixture.trip.id, outletId: fixture.outlets[0].id, position: 1 } }), { code: 'P2002' });
    await assert.rejects(db.outlet.delete({ where: { id: fixture.outlets[0].id } }), { code: 'P2003' });
    assert.deepEqual(await counts(db), first);
    }finally{await cleanupOperationalFixture(db,fixture);}
  });

  await t.test('loading, delivery, receipt and sync records link correctly without leaving test data', async () => {
    const fixture=await createOperationalFixture(db);
    const allocationId=fixture.allocations[0].id,mutationId=randomUUID();
    try {
    const rollback = new Error('ROLLBACK_TEST');
    await assert.rejects(db.$transaction(async tx => {
      const when = new Date('2025-01-02T06:00:00+05:30');
      await tx.loadingIssue.create({ data: { allocationId, type: 'MISSING', details: 'Synthetic integration test', reportedById: 'demo-user-loader' } });
      await tx.deliveryEvent.create({ data: { allocationId, type: 'ARRIVED', actorId: 'demo-user-driver', occurredAt: when } });
      await tx.deliveryException.create({ data: { allocationId, type: 'RECIPIENT_UNAVAILABLE', details: 'Synthetic integration test', reportedById: 'demo-user-driver' } });
      const proof = await tx.proofOfDelivery.create({ data: { allocationId, recipient: 'Synthetic test recipient', deliveredCartons: 12, verified: true, deliveredAt: when, driverId: 'demo-user-driver' } });
      const receipt = await tx.receiptConfirmation.create({ data: { proofId: proof.id, confirmedById: 'demo-user-store_manager', receivedCartons: 12 } });
      const mutation = await tx.syncMutation.create({ data: { id:mutationId, deviceId: 'integration-device', clientMutationId: randomUUID(), actorId: 'demo-user-driver', entityType: 'ProofOfDelivery', entityId: proof.id, operation: 'CREATE', baseVersion: 0, payload: { synthetic: true }, clientOccurredAt: when } });
      assert.equal(receipt.proofId, proof.id);
      assert.equal(mutation.status, 'PENDING');
      assert.equal((await tx.proofOfDelivery.findUnique({ where: { id: proof.id } })).deliveredAt.toISOString(), '2025-01-02T00:30:00.000Z');
      throw rollback;
    }), error => error === rollback);
    assert.equal(await db.proofOfDelivery.count({where:{allocationId}}), 0);
    assert.equal(await db.syncMutation.count({where:{id:mutationId}}), 0);
    }finally{await cleanupOperationalFixture(db,fixture);}
  });

  await t.test('development read APIs return bounded data and reject mutations', async () => {
    const { createApp } = await import('../apps/api/src/app.js');
    const app = createApp({ devReads: true, database: () => db });
    const server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    try {
      const base = `http://127.0.0.1:${server.address().port}/api`;
      const login = await fetch(base + '/auth/login', { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:'dispatcher',password:'RelayDemo!26'}) });
      assert.equal(login.status, 200);
      const headers = {cookie:login.headers.get('set-cookie').split(';')[0]};
      for (const [endpoint, total] of [['outlets',await db.outlet.count()],['vehicles',await db.vehicle.count()]]) {
        const response = await fetch(`${base}/${endpoint}?limit=2&offset=1`, { headers });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get('cache-control'), 'no-store');
        const body = await response.json();
        assert.equal(body.total, total); assert.equal(body.items.length, 2);
        assert.equal((await fetch(`${base}/${endpoint}?limit=51`, { headers })).status, 400);
        assert.equal((await fetch(`${base}/${endpoint}`, { method: 'POST', headers })).status, 404);
      }
      const demo = await (await fetch(`${base}/demo-day`, { headers })).json();
      assert.equal(demo.orders.length, 5); assert.equal(demo.trips.length, 1);
      assert.equal(demo.source, 'DEMO');
      await fetch(base + '/auth/logout', { method:'POST',headers });
    } finally { await new Promise(resolve => server.close(resolve)); await app.locals.sessionStore.close(); }
  });
});
