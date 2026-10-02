const { test } = require('node:test');
const assert = require('node:assert/strict');
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');

test('Colombo cutoff is exclusive at 16:00 across host zones and date boundaries', async () => {
  const { orderingWindow, orderDateError } = await import('../packages/domain/src/orders.js');
  const original = process.env.TZ;
  try {
    for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = zone;
      for (const [time, open] of [['15:59:00',true],['15:59:59.999',true],['16:00:00',false],['16:00:00.001',false],['23:59:59',false]]) {
        const now = new Date(`2026-12-31T${time}+05:30`);
        assert.equal(orderingWindow(now).nextDayOpen, open);
        assert.equal(orderDateError('2027-01-01', now)?.code || null, open ? null : 'ORDER_CUTOFF');
        assert.equal(orderDateError('2027-01-02', now), null);
        assert.equal(orderDateError('2026-12-31', now).code, 'INVALID_DELIVERY_DATE');
      }
      assert.equal(orderingWindow(new Date('2026-12-31T18:30:00Z')).today, '2027-01-01');
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});

test('PostgreSQL order creation, scope, audit history and API restart persistence', {timeout:60000}, async t => {
  const {createApp} = await import('../apps/api/src/app.js');
  const {createDatabase} = await import('../apps/api/src/db.js');
  let db = createDatabase(), now = new Date('2025-01-03T15:59:00+05:30'), demoClock;
  const instances = [], ids = [], cookies = [];
  const calendarFixtures = [];
  let instance;
  async function start() {
    const app = createApp({database:() => db,sessionSecret:'stage-four-order-test-secret-32-characters',orderClock:() => demoClock ? demoClock() : now});
    const server = app.listen(0,'127.0.0.1');
    await new Promise(resolve => server.once('listening',resolve));
    instance = {app,server,base:`http://127.0.0.1:${server.address().port}/api`}; instances.push(instance);
  }
  const request = (path, cookie, body) => fetch(instance.base+path,{headers:{...(cookie ? {cookie} : {}),...(body !== undefined ? {'Content-Type':'application/json'} : {})},...(body !== undefined ? {method:'POST',body:JSON.stringify(body)} : {})});
  async function login(identifier) { const r=await request('/auth/login',null,{identifier,password:'RelayDemo!26'});assert.equal(r.status,200);const cookie=r.headers.get('set-cookie').split(';')[0];cookies.push(cookie);return cookie; }
  t.after(async () => {
    // Only remove records created by this test; no demo or user history is replaced.
    if (instance.server.listening) for (const cookie of cookies) await request('/auth/logout',cookie,{});
    for (const {app,server} of instances) { if(server.listening) await new Promise(resolve=>server.close(resolve)); await app.locals.sessionStore.close(); }
    await db.orderStatusEvent.deleteMany({where:{orderId:{in:ids}}});
    await db.orderItem.deleteMany({where:{orderId:{in:ids}}});
    await db.order.deleteMany({where:{id:{in:ids}}});
    await db.calendarDay.deleteMany({where:{date:{in:calendarFixtures}}});
    await db.$disconnect();
  });
  await start();
  const cookie=await login('store'), dispatcher=await login('dispatcher');
  const {user}=await (await request('/auth/me',cookie)).json();
  const payload={deliveryDate:'2025-01-04',temperatureRequirement:'AMBIENT',items:[{productCode:'STAGE4-TEST',description:'Test cartons',units:3,unitWeightKg:2.125,unitVolumeM3:0.035}]};
  async function create(body=payload) { const r=await request('/orders',cookie,body);assert.equal(r.status,201,JSON.stringify(await r.clone().json()));const {order}=await r.json();ids.push(order.id);return order; }
  await t.test('explicit judge clock validates supplied coverage and controls context and acceptance only on the server', async () => {
    const { configuredOrderClock } = await import('../apps/api/src/order-clock.js');
    const configure = (timestamp, extra = {}) => configuredOrderClock({ env: { RELAY_DEMO_ORDER_NOW: timestamp, ...extra }, database: () => db });
    assert.equal(await configuredOrderClock({ env: {}, database: () => { throw new Error('Normal startup must not query demo coverage'); } }), undefined);
    const realApp = createApp({ database: () => db, sessionSecret: 'stage-four-order-test-secret-32-characters', orderClock: await configuredOrderClock({ env: {} }) });
    const realServer = realApp.listen(0, '127.0.0.1');
    await new Promise(resolve => realServer.once('listening', resolve));
    try {
      const { orderingWindow } = await import('../packages/domain/src/orders.js');
      const before = orderingWindow(new Date());
      const { ordering } = await (await fetch(`http://127.0.0.1:${realServer.address().port}/api/orders/context`, { headers: { cookie } })).json();
      const after = orderingWindow(new Date());
      assert.ok([before.today, after.today].includes(ordering.today), 'Unconfigured API uses the real server business date');
      assert.ok([before.nextDayOpen, after.nextDayOpen].includes(ordering.nextDayOpen));
    } finally { await new Promise(resolve => realServer.close(resolve)); await realApp.locals.sessionStore.close(); }
    await assert.rejects(configure('2025-01-03T15:59:00+05:30', { NODE_ENV: 'production' }), /forbidden/);
    await assert.rejects(configure('2026-10-02T15:59:00+05:30'), /supplied CalendarDay/);
    await assert.rejects(configure('2025-01-03T15:59:00'), /./);
    try {
      // UTC Jan 2 is already Jan 3 in Colombo: startup validates the business date.
      demoClock = await configure('2025-01-02T20:00:00Z');
      assert.equal((await (await request('/orders/context', cookie)).json()).ordering.today, '2025-01-03');
      for (const [time, expected, open] of [['15:59:59.999','2025-01-04',true],['16:00:00','2025-01-06',false]]) {
        demoClock = await configure(`2025-01-03T${time}+05:30`);
        const context = await (await request('/orders/context?now=2030-01-01', cookie)).json();
        assert.equal(context.ordering.today, '2025-01-03');
        assert.equal(context.ordering.timeZone, 'Asia/Colombo');
        assert.equal(context.ordering.earliestDeliveryDate, expected);
        assert.equal(context.ordering.nextDayOpen, open);
        assert.equal(context.ordering.cutoff, '2025-01-03T16:00:00+05:30');
        if (open) await create();
        else assert.equal((await (await request('/orders', cookie, payload)).json()).error.code, 'ORDER_CUTOFF');
      }
      assert.equal((await request('/orders', cookie, { ...payload, now: '2025-01-03T10:00:00+05:30' })).status, 400);
      for (const route of ['/orders/clock', '/orders/context', '/clock']) assert.equal((await request(route, cookie, { now: '2025-01-03T10:00:00+05:30' })).status, 404);
      assert.equal((await (await request('/orders/context', cookie)).json()).ordering.nextDayOpen, false);
      demoClock().setFullYear(2030);
      assert.equal(demoClock().toISOString(), '2025-01-03T10:30:00.000Z');
    } finally { demoClock = undefined; }
  });
  await t.test('shared calendar rejects closed and unlisted dates without order, item or history writes',async()=>{
    for (const deliveryDate of ['2025-01-05','9999-12-31']) {
      const where={deliveryDate:new Date(`${deliveryDate}T00:00:00Z`)};
      const counts=async()=>Promise.all([db.order.count({where}),db.orderItem.count({where:{order:where}}),db.orderStatusEvent.count({where:{order:where}})]);
      const before=await counts();
      const response=await request('/orders',cookie,{...payload,deliveryDate});
      assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_DELIVERY_DATE');
      assert.deepEqual(await counts(),before);
    }
    assert.equal((await request('/orders',cookie,{...payload,isOperating:true})).status,400);
  });
  await t.test('default date skips shared-calendar closures, respects cutoff and is host-timezone independent',async()=>{
    const original=process.env.TZ, originalNow=now;
    try {
      for(const zone of ['UTC','America/Los_Angeles','Asia/Tokyo']) {
        process.env.TZ=zone;
        for(const [instant,expected] of [
          ['2025-01-03T15:59:00+05:30','2025-01-04'],
          ['2025-01-03T16:00:00+05:30','2025-01-06'],
          ['2025-01-04T15:59:00+05:30','2025-01-06'],
          ['2025-01-04T16:01:00+05:30','2025-01-06'],
          ['9999-12-20T16:01:00+05:30',null]
        ]) {
          now=new Date(instant);
          const response=await request('/orders/context',cookie);assert.equal(response.status,200);
          assert.equal((await response.json()).ordering.earliestDeliveryDate,expected);
        }
      }
    } finally {now=originalNow;if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
  });
  await t.test('an explicit weekday closure overrides weekday assumptions',async()=>{
    // Outside the supplied range; create only owned fixtures, never overwrite imported rows.
    const originalNow=now;
    try {
      for(const [date,dayOfWeek,dayName,isOperating] of [['2023-01-02',0,'Mon',false],['2023-01-03',1,'Tue',true]]) {
        const row=await db.calendarDay.create({data:{date:new Date(`${date}T00:00:00Z`),dayOfWeek,dayName,isOperating,isWeekend:false,isoYear:2023,isoWeek:1,isPayday:false,festivalRamp:1,isHoliday:!isOperating,monsoon:false,source:'APPLICATION'}});
        calendarFixtures.push(row.date);
      }
      now=new Date('2023-01-01T15:59:00+05:30');
      const context=await (await request('/orders/context',cookie)).json();
      assert.equal(context.ordering.earliestDeliveryDate,'2023-01-03');
      const response=await request('/orders',cookie,{...payload,deliveryDate:'2023-01-02'});
      assert.equal(response.status,400);assert.equal((await response.json()).error.code,'INVALID_DELIVERY_DATE');
      assert.equal(await db.order.count({where:{deliveryDate:new Date('2023-01-02T00:00:00Z')}}),0);
    } finally {now=originalNow;}
  });
  await t.test('authentication and role rejection use consistent errors',async()=>{
    for (const [auth,status] of [[null,401],[dispatcher,403]]) for (const body of [undefined,payload]) {
      const r=await request('/orders',auth,body);assert.equal(r.status,status);const {error}=await r.json();assert.equal(typeof error.code,'string');assert.equal(typeof error.message,'string');
    }
  });
  let ambient,chilled;
  await t.test('Fresh ambient, chilled and repeated outlet/date orders retain separate IDs and quantities',async()=>{
    ambient=await create();chilled=await create({...payload,temperatureRequirement:'CHILLED'});const repeated=await create();
    assert.equal(new Set([ambient.id,chilled.id,repeated.id]).size,3);
    assert.equal(ambient.brand,'FRESH');assert.equal(chilled.brand,'FRESH');assert.equal(ambient.temperatureRequirement,'AMBIENT');assert.equal(chilled.temperatureRequirement,'CHILLED');
    assert.equal(ambient.units,3);assert.equal(ambient.weightKg,6.375);assert.equal(ambient.volumeM3,0.105);
    assert.equal(ambient.status,'CONFIRMED');assert.equal(ambient.createdById,user.id);
    assert.equal(ambient.history.length,1);assert.equal(ambient.history[0].status,'CONFIRMED');
    const persisted=await db.order.findUnique({where:{id:ambient.id},include:{items:true}});assert.equal(persisted.outletId,user.outletId);assert.equal(persisted.items[0].cartons,3);
  });
  await t.test('other outlet IDs cannot access orders or change ownership',async()=>{
    const other=await db.order.findFirst({where:{outletId:{not:user.outletId}}});assert.ok(other);
    assert.equal((await request('/orders',cookie,{...payload,outletId:other.outletId})).status,403);
    assert.equal((await request('/orders?outletId='+other.outletId,cookie)).status,403);
    for(const suffix of ['', '/history']) assert.equal((await request('/orders/'+other.id+suffix,cookie)).status,404);
  });
  await t.test('invalid payloads, dates, mixed item fields and forged status fail validation',async()=>{
    for(const body of [{}, {...payload,deliveryDate:'2026-02-30'}, {...payload,status:'PLANNED'}, {...payload,items:[]}, {...payload,items:[{...payload.items[0],units:0}]}, {...payload,items:[{...payload.items[0],units:1.5}]}, {...payload,items:[{...payload.items[0],unitWeightKg:-1}]}, {...payload,items:[{...payload.items[0],unitVolumeM3:0.0001}]}, {...payload,items:[{...payload.items[0],unitWeightKg:1e-12}]}, {...payload,items:[{...payload.items[0],temperatureRequirement:'CHILLED'}]}, {...payload,deliveryDate:'2025-01-03'}]) assert.equal((await request('/orders',cookie,body)).status,400);
    const malformed=await fetch(instance.base+'/orders',{method:'POST',headers:{cookie,'Content-Type':'application/json'},body:'{'});assert.equal(malformed.status,400);assert.equal((await malformed.json()).error.code,'INVALID_JSON');
  });
  await t.test('API accepts 15:59 and rejects exactly 16:00 and after; later dates stay open',async()=>{
    for(const time of ['16:00:00','16:01:00','23:59:59']) {now=new Date(`2025-01-03T${time}+05:30`);const r=await request('/orders',cookie,payload);assert.equal(r.status,409);assert.equal((await r.json()).error.code,'ORDER_CUTOFF');}
    await create({...payload,deliveryDate:'2025-01-06'});
  });
  await t.test('scoped pagination, detail and non-destructive status history',async()=>{
    const listing=await (await request('/orders?limit=2',cookie)).json();assert.equal(listing.orders.length,2);assert.ok(listing.orders.every(o=>o.outletId===user.outletId));assert.ok(listing.total>=ids.length);
    assert.equal((await request('/orders?limit=101',cookie)).status,400);
    await db.order.update({where:{id:ambient.id},data:{status:'DEFERRED'}});
    const history=await (await request('/orders/'+ambient.id+'/history',cookie)).json();assert.equal(history.status,'DEFERRED');assert.deepEqual(history.history.map(h=>h.status),['CONFIRMED','DEFERRED']);
  });
  await t.test('orders and session survive closing the API and database client and starting fresh',async()=>{
    await new Promise(resolve=>instance.server.close(resolve));await db.$disconnect();db=createDatabase();await start();
    const r=await request('/orders/'+chilled.id,cookie);assert.equal(r.status,200);const {order}=await r.json();assert.deepEqual(order,chilled);
    const listing=await (await request('/orders?limit=100',cookie)).json();assert.ok(ids.every(id=>listing.orders.some(o=>o.id===id)));
  });
});
