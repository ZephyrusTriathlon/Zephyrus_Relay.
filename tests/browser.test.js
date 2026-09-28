const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connect } = require('./cdp');

test('Relay: connected order, planning constraints, field exceptions and responsive views', { timeout: 120000 }, async t => {
  const browser = await connect();
  const { run, send, click, input, key, viewport, screenshot, waitFor } = browser;
  let previousStorage;
  t.after(async () => {
    if (previousStorage !== undefined) {
      await run(previousStorage === null
        ? "localStorage.removeItem('relay-v1')"
        : `localStorage.setItem('relay-v1', ${JSON.stringify(previousStorage)})`).catch(() => {});
    }
    await browser.close();
  });
  await viewport(1440);
  await browser.navigate('#dispatch');
  previousStorage = await run("localStorage.getItem('relay-v1')");
  const unrelatedStorage = await run("Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'relay-v1'))");
  await run("state=seed(); save(); role='dispatch'; render()");

  const mainText = () => run("document.querySelector('#main').innerText");
  const order = () => run("state.orders.find(order => order.id === 'ORD-2847')");
  let workflowFailed = false;
  const stage = (name, callback) => t.test(name, async subtest => {
    if (workflowFailed) return subtest.skip('An earlier workflow stage failed.');
    try { await callback(); } catch (error) { workflowFailed = true; throw error; }
  });
  const capture = async (roleName, width, height) => {
    await viewport(width, height);
    await run(`role=${JSON.stringify(roleName)}; render(); window.scrollTo(0, 0)`);
    await screenshot(`${roleName}-${width}`);
    if (width < 500) await screenshot(`${roleName}-${width}-viewport`, false);
  };

  await t.test('showcase outlets and Colombo route calculations match the supplied scenario', async () => {
    assert.deepEqual(await run("state.orders.filter(o=>['OUT001','OUT004','OUT005','OUT011','OUT014'].includes(o.outletId)).map(o=>[o.outletId,o.dockType,o.parkingConstraint,o.window])"),[
      ['OUT004','street','normal','05:30 – 08:00'],['OUT005','rear_dock','normal','04:00 – 07:45'],['OUT001','street','van_only','05:00 – 07:30'],['OUT011','rear_dock','normal','03:00 – 08:00'],['OUT014','street','normal','05:30 – 08:00']
    ]);
    assert.match(await run("document.querySelector('.page-heading .eyebrow').textContent"),/Monday, 25 May · planning Tuesday, 26 May · Peliyagoda/);
    assert.match(await run("document.querySelector('.page-heading .subtitle').textContent"),/Operating day · Festival ramp 0\.6 · Monsoon/);
    assert.deepEqual(await run('({km:routeMetrics().km,minutes:routeMetrics().minutes,etas:routeMetrics().etas.map(clockTime),fuel:routeMetrics().km/activeVehicle().kmPerL})'),{km:28,minutes:63,etas:['05:30','05:54'],fuel:28/4.7});
    assert.match(await mainText(),/28 km est\./);
    assert.match(await mainText(),/63 \/ 270 min/);
    assert.equal(await run("planChecks().find(check=>check[0]==='Delivery windows')[2]"),true);
    try {
      await run("activeVehicle().fuelUsed=475;render()");
      assert.equal(await run("vehicleBlockers(activeVehicle()).includes('weekly fuel quota would be exceeded')"),true);
      assert.equal(await run("planChecks().find(check=>check[0]==='Fuel quota')[2]"),false);
    } finally { await run("activeVehicle().fuelUsed=312;render()"); }
    const original=await run("assigned()[1].window");
    try {
      await run("assigned()[1].window='04:00 – 05:45';render()");
      assert.match(await mainText(),/OUT005 projected 05:54 · window closes 05:45/);
      assert.equal(await run("vehicleBlockers(activeVehicle()).some(reason=>reason.includes('OUT005 projected'))"),true);
      await click('[data-action="confirm-dispatch"]');
      assert.equal(await run("document.querySelector('#dialog').open"),false);
      await run("handleDispatchAction('release',{},null)");
      assert.equal(await run('state.confirmed'),false);
    } finally { await run(`assigned()[1].window=${JSON.stringify(original)};render()`); }
  });

  await stage('route progress and capacity remain accurate with stale preparation flags', async () => {
    await run("state.ready=true;state.confirmed=true;state.started=true;assigned()[0].status='Delivered';assigned()[0].deliveredAt='09:25';assigned()[0].recipient='Store manager';assigned()[1].status='In transit';render()");
    assert.match(await mainText(),/Partially completed/);
    assert.match(await mainText(),/1 of 2 stops delivered/);
    assert.equal(await run("document.querySelector('.capacity-track').getAttribute('aria-valuenow')"),'362');
    assert.match(await run("document.querySelector('.dispatch-pulse').innerText"),/2\.9 \/ 26\.4 m³/);
    assert.doesNotMatch(await mainText(),/Ready for the road|Ready to dispatch/);
    await screenshot('dispatch-partial-1440');
    await run("assigned()[1].issue='Store closed';assigned()[1].status='Issue';assigned()[1].deferred=true;render()");
    assert.match(await mainText(),/Exception/);
    assert.match(await mainText(),/1 outstanding/);
    await screenshot('dispatch-exception-1440');
    await run("state=seed();state.orders.forEach(o=>{o.route=null;o.status='Pending'});render()");
    assert.equal(await run("document.querySelector('[data-action=confirm-dispatch]').disabled"),true);
    assert.doesNotMatch(await mainText(),/Route completed/);
    await run("state=seed();render()");
  });

  await stage('queue search, filtering and mobile planning keyboard tabs', async () => {
    await input('#queue-search', 'no-matching-order');
    assert.equal(await run("document.querySelectorAll('#queue-list [data-action=assign]').length"), 0);
    assert.match(await mainText(), /no .*orders|no .*matches|no .*results/i);
    await input('#queue-search', 'ORD-2846');
    assert.equal(await run("document.querySelectorAll('#queue-list [data-action=assign]').length"), 1);
    await input('#queue-search', '');
    await input('#queue-filter', 'priority', 'change');
    assert.ok(await run("document.querySelectorAll('#queue-list [data-action=assign]').length < state.orders.filter(o => !o.route).length"));
    await input('#queue-filter', 'all', 'change');
    await capture('dispatch', 1440);
    await viewport(1440, 900);
    await screenshot('dispatch-1440-900');
    await capture('dispatch', 1280, 900);
    await capture('dispatch', 1024);
    await click('#plan-tab-route');
    await screenshot('dispatch-1024-route');
    await click('#plan-tab-vehicle');
    await screenshot('dispatch-1024-vehicle');
    await click('#plan-tab-queue');
    await capture('dispatch', 390);
    await click('#plan-tab-route');
    assert.equal(await run('dispatchPanel'), 'route');
    await screenshot('dispatch-390-route');
    await key('ArrowRight');
    assert.equal(await run('dispatchPanel'), 'vehicle');
    assert.equal(await run('document.activeElement.id'), 'plan-tab-vehicle');
    await key('Home');
    assert.equal(await run('dispatchPanel'), 'queue');
    await viewport(1440);
  });

  await stage('store search, quantities, keyboard review and order submission', async () => {
    await run("queueQuery='stale search hiding all orders';queueFilter='priority';dispatchPanel='vehicle'");
    await click('[data-role="store"]');
    assert.equal(await run("document.querySelector('[data-action=create-order]').disabled"), true);
    await input('#product-search', 'no-matching-product');
    assert.equal(await run("document.querySelectorAll('[data-qty]').length"), 0);
    assert.match(await mainText(), /no .*products|no .*matches|no .*results/i);
    await input('#product-search', 'Fresh milk');
    assert.equal(await run("document.querySelectorAll('[data-qty]').length"), 1);
    await input('#product-search', '');
    await input('#stock-filter', 'attention', 'change');
    assert.equal(await run("document.querySelectorAll('[data-qty]').length"), 3);
    await input('#stock-filter', 'healthy', 'change');
    assert.equal(await run("document.querySelectorAll('[data-qty]').length"), 2);
    await input('#stock-filter', 'all', 'change');
    await click('[data-action="store-step"][data-product="0"][data-delta="1"]');
    assert.equal(await run('quantities[0]'), 1);
    await click('[data-action="store-step"][data-product="0"][data-delta="-1"]');
    assert.equal(await run('quantities[0]'), 0);
    await input('[data-qty="0"]', '-7');
    assert.equal(await run('quantities[0]'), 0);
    await input('[data-qty="0"]', '999');
    assert.ok(await run('quantities[0] <= 50'), 'Excessive quantities are capped.');
    await click('[data-action="recommended"]');
    assert.deepEqual(await run('quantities'), [12, 10, 8, 6, 4]);
    await capture('store', 1440);
    await capture('store', 430);
    await capture('store', 390);
    await viewport(1440);
    await click('[data-action="create-order"]');
    assert.equal(await run("document.querySelector('#dialog').open"), true);
    assert.match(await run("document.querySelector('#dialog').innerText"), /40 cartons/);
    for (let i = 0; i < 8; i++) {
      await key('Tab');
      assert.equal(await run("document.querySelector('#dialog').contains(document.activeElement)"), true, 'Tab focus stays within the review dialog.');
    }
    await key('Escape');
    assert.equal(await run("document.querySelector('#dialog').open"), false);
    await click('[data-action="create-order"]');
    await click('[data-action="place-order"]');
    assert.deepEqual((await order()).items, [12, 10, 8, 6, 4]);
    assert.equal((await order()).cartons, 40);
    assert.equal((await order()).weight, 376);
    assert.equal((await order()).tempRequirement, 'chilled');
    assert.ok((await order()).volume > 0);
    assert.equal((await order()).dockType, 'street');
    assert.match(await run("document.querySelector('#dialog').innerText"), /ORD-2847/);
    assert.doesNotMatch(await run("document.querySelector('.store-tracking-card').innerText"),/Expected arrival/,'Unassigned orders have no planned ETA.');
  });

  await stage('dispatch protects capacity, selects vehicles and releases the same order', async () => {
    await click('[data-action="go-dispatch"]');
    await waitFor("document.activeElement?.dataset.id === 'ORD-2847'", 'new order receives focus');
    assert.deepEqual(await run('({panel:dispatchPanel,query:queueQuery,filter:queueFilter,selected:selectedOrderId})'), {panel:'queue',query:'',filter:'all',selected:'ORD-2847'});
    assert.equal(await run("document.querySelector('#queue-list .order-card [data-action=select-order]').dataset.id"), 'ORD-2847');
    assert.equal(await run("document.querySelector('[data-action=select-order][data-id=ORD-2847]').getAttribute('aria-pressed')"), 'true');
    await screenshot('dispatch-new-order');
    await click('[data-action="fleet"]');
    await click('[data-action="select-vehicle"][data-id="VEH036"]');
    assert.equal(await run('activeVehicle().capacity'), 1040);
    assert.equal(await run('assigned().every(order => order.vehicle === "VEH036")'), true);
    await click('[data-action="fleet"]');
    await click('[data-action="select-vehicle"][data-id="VEH003"]');
    assert.equal(await run('activeVehicle().driver'), 'Amal Perera');
    // Exercise maximum-capacity failure without changing the normal demo scenario.
    await run("state.orders.push({...state.orders[0], id:'ORD-CAPACITY', route:null, status:'Pending', weight:6000, volume:30, cartons:150, items:[150,0,0,0,0]}); render()");
    const capacityButtonDisabled = await run("document.querySelector('[data-action=assign][data-id=ORD-CAPACITY]')?.disabled");
    if (!capacityButtonDisabled) await click('[data-action="assign"][data-id="ORD-CAPACITY"]');
    assert.equal(await run("state.orders.find(o=>o.id==='ORD-CAPACITY').route"), null, 'Over-capacity orders stay unassigned.');
    assert.match(await run("document.querySelector('#dialog').innerText"), /over weight limit|constraint/i);
    await click('#dialog [data-action="close"]');
    await run("state.orders=state.orders.filter(o=>o.id!=='ORD-CAPACITY'); render()");
    await click('[data-action="assign"][data-id="ORD-2847"]');
    assert.equal((await order()).route, 'R-07');
    assert.equal((await order()).cartons, 40);
    assert.deepEqual(await run('({km:routeMetrics().km,minutes:routeMetrics().minutes,etas:routeMetrics().etas.map(clockTime),fuel:routeMetrics().km/activeVehicle().kmPerL})'),{km:32,minutes:87,etas:['05:09','05:33','05:56'],fuel:32/4.7});
    assert.match(await mainText(),/32 km est\./);
    assert.match(await mainText(),/87 \/ 270 min/);
    const dispatchEta=await run("routeEta(assigned().indexOf(state.orders.find(o=>o.id==='ORD-2847')))");
    await click('[data-role="store"]');
    await click('[data-action="store-orders"]');
    assert.match(await run("document.querySelector('.store-tracking-card').innerText"),new RegExp(`Expected arrival\\s+${dispatchEta}`));
    assert.match(await run("document.querySelector('.store-tracking-card').innerText"),/Delivery window\s+03:00 – 08:00[\s\S]*Route\s+R-07[\s\S]*Vehicle\s+VEH003/);
    await click('[data-action="order-detail"][data-id="ORD-2847"]');
    assert.match(await run("document.querySelector('#dialog').innerText"),new RegExp(`Expected arrival\\s+${dispatchEta}`));
    await key('Escape');
    await click('[data-role="dispatch"]');
    await click('[data-action="confirm-dispatch"]');
    assert.match(await run("document.querySelector('#dialog').innerText"), /VEH003/);
    await click('[data-action="release"]');
    assert.equal(await run('state.confirmed'), true);
    assert.equal((await order()).status, 'Ready to load');
    await click('[data-role="store"]');
    assert.match(await run("document.querySelector('.store-tracking-card').innerText"),new RegExp(`Expected arrival\\s+${dispatchEta}`));
    await click('[data-role="loader"]');
    assert.match(await mainText(), /ORD-2847/);
  });

  await stage('warehouse validates resolution and preserves offline progress after refresh', async () => {
    await click('[data-action="offline"]');
    assert.equal(await run('state.offline'), true);
    await click('[data-action="issue"]');
    await click('[data-action="save-issue"]');
    assert.equal(await run('assigned().filter(order => order.issue).length'), 1);
    await click('[data-action="resolve"]');
    await click('[data-action="resolved"]');
    assert.equal(await run("document.querySelector('#dialog').open"), true, 'A missing resolution note blocks confirmation.');
    await input('#resolution', 'Located and counted the missing cartons.');
    await click('[data-action="resolved"]');
    await click('[data-action="loaded"]:not([disabled])');
    assert.equal(await run('assigned().at(-1).loaded'), true, 'The final delivery stop loads first.');
    const pendingCount = await run('state.pending.length');
    assert.ok(pendingCount > 0);
    await capture('loader', 834, 1112);
    await capture('loader', 768, 1024);
    await run("location.hash='loader'");
    await send('Page.reload');
    await waitFor("typeof render === 'function' && document.querySelector('#main')");
    assert.equal(await run('state.offline'), true);
    assert.equal(await run('state.pending.length'), pendingCount);
    assert.equal(await run('assigned().at(-1).loaded'), true);
    await viewport(834, 1112);
    for (let count = 0; await run('assigned().some(order => !order.loaded)'); count++) {
      assert.ok(count < 10, 'Loading must make progress.');
      await click('[data-action="loaded"]:not([disabled])');
    }
    await click('[data-action="complete-loading"]');
    assert.equal(await run('state.ready'), true);
  });

  await stage('delivery defers exceptions, validates proof and connects receipts back to Store', async () => {
    await click('[data-role="delivery"]');
    await click('[data-action="start-route"]');
    await capture('delivery', 390, 844);
    await capture('delivery', 360, 800);
    await capture('delivery', 430, 932);
    for (const width of [360, 390, 430]) {
      await viewport(width, 844);
      await run("toast('Progress saved on this device.'); window.scrollTo(0,0)");
      await browser.pause(250);
      const geometry = await run(`(() => {
        const rect = selector => { const b = document.querySelector(selector).getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; };
        return { dock: rect('.driver-action-dock'), nav: rect('.sidebar'), toast: rect('#toast'), overflow: document.documentElement.scrollWidth > innerWidth };
      })()`);
      assert.equal(geometry.overflow, false, `Active Delivery overflows at ${width}.`);
      assert.ok(geometry.dock.bottom <= geometry.nav.top + 1, `Delivery action overlaps navigation at ${width}.`);
      assert.ok(geometry.toast.bottom <= geometry.dock.top + 1, `Toast overlaps Delivery action at ${width}.`);
    }
    await viewport(390, 844);
    // Pending stops must never be mistaken for a successfully completed route.
    for (let count = 0; await run('Boolean(nextDelivery())'); count++) {
      assert.ok(count < 10, 'Deferring a stop advances to the next available stop.');
      await click('[data-action="issue"]');
      await input('#issue-type', count === 0 ? 'Store closed' : 'Access delayed', 'change');
      await input('#issue-note', 'Receiving desk requested a later visit. Cartons remain on the vehicle.');
      await click('[data-action="save-issue"]');
    }
    assert.equal(await run("assigned().some(order => order.status === 'Delivered')"), false);
    assert.match(await mainText(), /route is still open/i);
    assert.equal(await run("document.querySelector('.delivery-finished') === null"), true);
    await screenshot('delivery-return-stops');
    let delivered = 0;
    while (await run("assigned().some(order => order.status !== 'Delivered')")) {
      assert.ok(delivered++ < 10, 'Every confirmation advances to the next stop.');
      if (!await run('Boolean(nextDelivery())')) {
        const retryId = await run('assigned().find(order => order.deferred).id');
        await click(`[data-action="retry-stop"][data-id="${retryId}"]`);
        await click('[data-action="resolved"]');
        assert.equal(await run("document.querySelector('#dialog').open"), true);
        await input('#resolution', 'Store reopened. The receiving team confirmed access.');
        await click('[data-action="resolved"]');
        assert.equal(await run('nextDelivery().id'), retryId);
      }
      await click('[data-action="arrived"]');
      await click('[data-action="verify-delivery"]');
      const confirmDisabled = await run("document.querySelector('[data-action=delivered]').disabled");
      if (!confirmDisabled) await click('[data-action="delivered"]');
      assert.equal(await run("document.querySelector('#dialog').open"), true, 'Proof needs a recipient and carton verification.');
      await input('#recipient', 'Nimasha Perera');
      await run("(() => {const check=document.querySelector('#verified');check.checked=true;check.dispatchEvent(new Event('change',{bubbles:true}))})()");
      if (delivered === 1) {
        const expectedCartons = await run('nextDelivery().cartons');
        await input('#verified-cartons', String(expectedCartons - 1));
        await click('[data-action="delivered"]');
        assert.equal(await run("document.querySelector('#verified-cartons').getAttribute('aria-invalid')"), 'true');
        await input('#verified-cartons', String(expectedCartons));
        await input('#delivery-time', '');
        await click('[data-action="delivered"]');
        assert.equal(await run("document.querySelector('#delivery-time').getAttribute('aria-invalid')"), 'true');
        await input('#delivery-time', '10:25');
      }
      await click('[data-action="delivered"]');
    }
    assert.equal((await order()).status, 'Delivered');
    assert.equal((await order()).recipient, 'Nimasha Perera');
    assert.equal((await order()).receiptConfirmed, false, 'Driver POD does not confirm Store receipt.');
    assert.match((await order()).deliveredAt, /^\d\d:\d\d$/);
    assert.match(await mainText(), /all delivered|route complete|route completed/i);
    await screenshot('delivery-complete');
    assert.ok(await run('state.pending.length > 0'));
    await click('[data-action="offline"]');
    assert.equal(await run('state.pending.length'), 0);
    await click('[data-role="store"]');
    await click('[data-action="store-orders"]');
    assert.match(await mainText(), /ORD-2847/);
    assert.match(await mainText(), /Delivered/);
    await click('[data-action="store-replenish"]');
    assert.match(await run("document.querySelector('[data-product-row=\"0\"] .store-stock-cell').innerText"),/8\s+ctn[\s\S]*12 on order/,'Driver POD leaves cartons pending.');
    await click('[data-action="store-orders"]');
    await click('[data-action="order-detail"][data-id="ORD-2847"]');
    assert.match(await run("document.querySelector('#dialog').innerText"), /Nimasha Perera/);
    await key('Escape');
    await click('[data-action="store-report-issue"][data-id="ORD-2847"]');
    await input('#store-issue-type','Damaged goods','change');
    await click('[data-action="save-store-issue"]');
    assert.equal((await order()).receiptIssueType,undefined);
    await input('#store-issue-details','Two milk cartons were damaged on arrival.');
    await click('[data-action="save-store-issue"]');
    assert.equal((await order()).receiptIssueType,'Damaged goods');
    assert.equal(await run('storeStock(products[0],0).stock'),8,'Reporting an issue does not receive stock.');
    await click('[data-action="store-confirm-receipt"][data-id="ORD-2847"]');
    await click('[data-action="save-store-receipt"]');
    assert.equal((await order()).receiptConfirmed,false);
    await run("document.querySelector('#store-receipt-checked').checked=true");
    await click('[data-action="save-store-receipt"]');
    assert.equal((await order()).receiptConfirmed,true);
    assert.equal((await order()).receiptConfirmedBy,'Nimasha Perera');
    assert.equal((await order()).receiptIssueType,'Damaged goods','Confirming later preserves the Store issue.');
    assert.match(await mainText(),/Store receipt confirmed/);
    await click('[data-action="store-replenish"]');
    assert.match(await run("document.querySelector('[data-product-row=\"0\"] .store-stock-cell').innerText"),/20\s+ctn/,'Store confirmation adds received cartons.');
    assert.doesNotMatch(await run("document.querySelector('[data-product-row=\"0\"] .store-stock-cell').innerText"),/on order/);
    await click('[data-action="store-orders"]');
    await click('[data-role="dispatch"]');
    assert.equal(await run('dispatchRouteState().key'),'completed','Store issue does not reopen delivery.');
    assert.match(await mainText(),/receipt follow-up/i);
    await click('#plan-tab-route');
    assert.match(await mainText(),/ORD-2847 · OUT006 · Damaged goods: Two milk cartons were damaged on arrival/);
    assert.doesNotMatch(await mainText(),/No outstanding exceptions/);
    await click('[data-role="store"]');
    await click('[data-action="store-orders"]');
    assert.match(await mainText(),/Store receipt issue · Damaged goods/);
    await click('[data-action="store-replenish"]');
    assert.match(await run("document.querySelector('[data-product-row=\"0\"] .store-stock-cell').innerText"),/20\s+ctn/);
    await click('[data-role="dispatch"]');
    await run("dispatchPanel='route';render()");
    await click('[data-action="select-stop"][data-id="ORD-2847"]');
    assert.match(await run("document.querySelector('#dialog').innerText"),/Store receipt confirmed by Nimasha Perera/);
    assert.match(await run("document.querySelector('#dialog').innerText"),/Store receipt issue: Damaged goods/);
    await key('Escape');
    await click('[data-role="store"]');
    await screenshot('store-delivered');
  });

  await stage('completed route is consistent across dispatcher, vehicle and receipts', async () => {
    await click('[data-role="dispatch"]');
    assert.equal(await run('dispatchRouteState().key'), 'completed');
    assert.equal(await run('dispatchRouteState().delivered'), 3);
    for (const width of [1440,1280,1024]) {
      await viewport(width,900);
      if(width<=1100) await click('#plan-tab-route');
      const text=await mainText();
      assert.match(text,/Route completed at/);
      assert.match(text,/3 of 3 stops delivered/);
      assert.doesNotMatch(text,/Ready for the road|Ready to dispatch|Ready to load/);
      await screenshot(`dispatch-completed-${width}`);
      if(width<=1100){
        await click('#plan-tab-vehicle');
        assert.match(await mainText(),/Completed/);
        assert.match(await mainText(),/Receipt follow-up/);
        assert.doesNotMatch(await mainText(),/No outstanding exceptions/);
        await click('#plan-tab-route');
      }
    }
    await click('[data-action="route-review"]');
    assert.match(await run("document.querySelector('#dialog').innerText"),/Route completed at/);
    assert.match(await run("document.querySelector('#dialog').innerText"),/Nimasha Perera/);
    assert.doesNotMatch(await run("document.querySelector('#dialog').innerText"),/Ready for the road/);
    await key('Escape');
    for(const width of [1440,1280,1024]) {
      await viewport(width,900);
      await run("dispatchPanel='route';render();window.scrollTo(0,document.documentElement.scrollHeight)");
      const layout=await run(`(() => {
        const heading=document.querySelector('.view-dispatch>.page-heading').getBoundingClientRect();
        const tabs=document.querySelector('.planning-tabs');
        const scrollers=[...document.querySelectorAll('#main *')].filter(el=>['auto','scroll'].includes(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1);
        return {headingTop:heading.top,headingBottom:heading.bottom,tabsTop:tabs.getBoundingClientRect().top,scrollers:scrollers.map(el=>el.className)};
      })()`);
      assert.deepEqual(layout.scrollers,[],`Dispatcher has no competing panel scrollbars at ${width}.`);
      assert.ok(layout.headingTop>=0,'Primary actions remain visible while scrolling.');
      if(width===1024)assert.ok(layout.tabsTop>=layout.headingBottom-1,'Planning tabs do not overlap the sticky actions.');
    }
  });

  await stage('sidebar and hash handoffs reveal new orders without resetting the route', async () => {
    const completedState=await run('JSON.stringify(state)');
    try {
      for (const navigation of ['sidebar','hash']) {
        await viewport(navigation==='sidebar'?390:1024,900);
        await run("state=seed();save();pendingDispatchOrderId=null;revealedDispatchOrderId=null;queueQuery='hidden';queueFilter='priority';dispatchPanel='vehicle';role='store';tab='replenishment';location.hash='store';render()");
        await click('[data-action="recommended"]');
        await click('[data-action="create-order"]');
        await click('[data-action="place-order"]');
        await click('#dialog .dialog-actions [data-action="close"]');
        if(navigation==='sidebar')await click('.nav [data-role="dispatch"]');
        else await run("location.hash='dispatch'");
        await waitFor("role==='dispatch' && document.activeElement?.dataset.id==='ORD-2847'");
        const visible=await run(`(() => {const el=document.querySelector('#queue-list .order-card');const r=el.getBoundingClientRect();return {id:el.querySelector('[data-action=select-order]').dataset.id,top:r.top,bottom:r.bottom};})()`);
        assert.equal(visible.id,'ORD-2847');
        assert.ok(visible.top>=0&&visible.bottom<=900-(navigation==='sidebar'?72:0),'New order card is visible without searching or scrolling.');
        assert.equal(await run('assigned().length'),2,'The existing route is preserved.');
        assert.equal(await run('state.confirmed'),false);
        assert.equal(await run('state.offline'),false);
        await screenshot(`dispatch-handoff-${navigation}`);
      }
      // A post-release Store request must also appear, while the completed route stays intact.
      await run(`state=JSON.parse(${JSON.stringify(completedState)});save();queueQuery='hidden';queueFilter='priority';dispatchPanel='vehicle';role='store';tab='replenishment';render()`);
      await click('[data-action="store-step"][data-product="0"][data-delta="1"]');
      await click('[data-action="create-order"]');await click('[data-action="place-order"]');
      await click('#dialog .dialog-actions [data-action="close"]');
      await click('.nav [data-role="dispatch"]');
      await waitFor("document.activeElement?.dataset.id==='ORD-2848'");
      assert.equal(await run('dispatchRouteState().key'),'completed');
      assert.equal(await run("state.orders.find(o=>o.id==='ORD-2848').nextRun"),true);
      assert.match(await mainText(),/Next run · window pending/);
    } finally {
      await run(`state=JSON.parse(${JSON.stringify(completedState)});save();pendingDispatchOrderId=null;revealedDispatchOrderId=null;role='dispatch';render()`);
    }
  });

  await t.test('field sheets, long notes and route focus remain accessible', async () => {
    const savedState = await run('JSON.stringify(state)');
    try {
      await run("state=seed();role='delivery';fieldRouteOpen=false;state.confirmed=state.ready=state.started=true;assigned().forEach(o=>{o.loaded=true;o.status='In transit';o.arrived=true});render()");
      assert.equal(await run("document.querySelectorAll('#main h1').length"), 1);
      for (const [width,height] of [[360,640],[390,844],[430,932],[768,900],[1440,900]]) {
        await viewport(width,height);
        await click('[data-action="verify-delivery"]');
        const sheet = await run(`(() => {
          const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
          return {dialog:rect('#dialog'),body:rect('.dialog-body'),footer:rect('.dialog-actions'),close:rect('.dialog-close')};
        })()`);
        assert.ok(sheet.dialog.top>=0 && sheet.dialog.bottom<=height, 'The sheet stays inside the viewport.');
        assert.ok(sheet.body.bottom<=sheet.footer.top+1, 'The footer has its own space below the scrolling form.');
        assert.ok(sheet.close.right>=sheet.dialog.right-16 && sheet.close.top<sheet.dialog.top+16, 'Close remains at the top right.');
        for (const selector of ['#verified-cartons','#verified','#recipient','#delivery-time']) {
          const field=await run(`(() => {const el=document.querySelector('${selector}');el.focus();return el.getBoundingClientRect().toJSON()})()`);
          assert.ok(field.top>=sheet.body.top && field.bottom<=sheet.footer.top+1, `${selector} can be reached without footer overlap at ${width}.`);
        }
        await click('[data-action="delivered"]');
        assert.equal(await run("!!document.querySelector('.dialog-body #field-form-error')"),true);
        await screenshot(`final-proof-${width}`,false);
        await key('Escape');
      }
      await viewport(360,740);
      await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
      await run("window.qaScrollOptions=[];window.qaOriginalScroll=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(options){qaScrollOptions.push(options);return qaOriginalScroll.call(this,options)}");
      await click('[data-action="field-route-toggle"]');
      assert.equal(await run("document.activeElement.matches('#driver-route-overview h2')"),true);
      assert.equal(await run('qaScrollOptions.at(-1).behavior'),'instant');
      await click('.driver-route-close');
      assert.equal(await run("document.activeElement.matches('.driver-progress-label [data-action=field-route-toggle]')"),true);
      await run("Element.prototype.scrollIntoView=qaOriginalScroll;delete window.qaOriginalScroll;delete window.qaScrollOptions;role='loader';state.ready=false;assigned().forEach(o=>o.loaded=false);assigned()[1].issue='Damaged carton: '+ 'X'.repeat(200);assigned()[1].issueType='Damaged cartons';render()");
      const note=await run("(() => {const el=document.querySelector('.shipment-exception p');const card=el.closest('.shipment').getBoundingClientRect();const r=el.getBoundingClientRect();return {right:r.right,cardRight:card.right,client:el.clientWidth,scroll:el.scrollWidth}})()");
      assert.ok(note.right<=note.cardRight && note.scroll<=note.client+1,'Long exception notes wrap inside the shipment.');
      await run("role='store';tab='orders';assigned()[0].outletId='OUT006';assigned()[0].store='Waypoint Fresh · Colombo 06';assigned()[0].area='Colombo 06';assigned()[0].status='Delivered';assigned()[0].recipient='A'.repeat(80);assigned()[0].deliveredAt='06:25';render()");
      await click('[data-action="order-detail"]');
      assert.equal(await run("document.querySelector('.dialog-body').scrollWidth<=document.querySelector('.dialog-body').clientWidth"),true,'Long recipient names fit the receipt.');
      await key('Escape');
    } finally {
      await run(`if(window.qaOriginalScroll)Element.prototype.scrollIntoView=qaOriginalScroll;document.querySelector('#dialog').close();state=JSON.parse(${JSON.stringify(savedState)});role='dispatch';fieldRouteOpen=false;render()`);
      await send('Emulation.setEmulatedMedia',{features:[]});
    }
  });

  await t.test('Designathon evidence and named degradation scenario are available in the prototype', async () => {
    const savedState = await run('JSON.stringify(state)');
    try {
      await viewport(1440, 1000);
      await run("caseStudyOpen=true;role='dispatch';render();window.scrollTo(0,0)");
      const caseText = await mainText();
      assert.equal(await run("document.querySelectorAll('.persona-card').length"), 4);
      assert.equal(await run("document.querySelectorAll('.screen-flow>li').length"), 12);
      assert.match(caseText, /Order tracking & ETA/);
      assert.match(caseText, /Receipt check/);
      assert.match(caseText, /Delivery & receipt follow-up/);
      assert.match(caseText, /Connection lost during delivery/);
      assert.match(caseText, /Reconnected state/);
      assert.match(caseText, /Explainability before invisible automation/);
      assert.match(caseText, /AI tool disclosure/i);
      await screenshot('case-study-1440');
      await viewport(390, 844);
      await screenshot('case-study-390');
      await click('[data-action="show-degradation"]');
      assert.equal(await run('state.offline'), true);
      assert.equal(await run('state.pending.length'), 3);
      assert.match(await mainText(), /Degradation: connection lost/);
      await screenshot('delivery-degradation-390', false);
    } finally {
      await run(`state=JSON.parse(${JSON.stringify(savedState)});save();caseStudyOpen=false;role='dispatch';location.hash='dispatch';render()`);
    }
  });

  await t.test('source-aligned constraints, explainable deferral and capacity outlook are interactive', async () => {
    const savedState = await run('JSON.stringify(state)');
    try {
      await viewport(1440, 1000);
      await run("state=seed();caseStudyOpen=false;role='dispatch';dispatchPanel='queue';render()");
      assert.equal(await run("document.querySelectorAll('.constraint-check').length"), 7);
      assert.equal(await run("planChecks().every(check=>check[2])"), true);
      await click('[data-action="assign"][data-id="ORD-2846"]');
      assert.match(await run("document.querySelector('#dialog').innerText"), /van-only outlet requires a van/);
      await key('Escape');
      await click('[data-action="defer-order"][data-id="ORD-2843"]');
      await click('[data-action="confirm-defer"]');
      assert.equal(await run("document.querySelector('#dialog').open"), true, 'A reason and impact are required.');
      await input('#deferral-reason', 'Delivery window cannot be met', 'change');
      await input('#deferral-note', 'Protect this repeat skip on the first compatible trip tomorrow.');
      await click('[data-action="confirm-defer"]');
      assert.equal(await run("state.orders.find(o=>o.id==='ORD-2843').decision"), 'deferred');
      assert.match(await mainText(), /1 deferred/);
      await click('[data-action="capacity-outlook"]');
      assert.match(await run("document.querySelector('#dialog').innerText"), /10-week demand outlook/i);
      assert.match(await run("document.querySelector('#dialog').innerText"), /reefer vehicles and drivers on standby/);
      await key('Escape');
    } finally {
      await run(`state=JSON.parse(${JSON.stringify(savedState)});save();caseStudyOpen=false;role='dispatch';render()`);
    }
  });

  await t.test('all roles fit every requested viewport and pages have meaningful labels', async () => {
    await run("document.querySelector('#dialog').close()");
    for (const width of [360, 390, 430, 768, 834, 1024, 1280, 1440]) {
      await viewport(width, 1000);
      for (const persona of ['store', 'dispatch', 'loader', 'delivery']) {
        await run(`role=${JSON.stringify(persona)}; tab='replenishment'; render()`);
        const overflow = await run('({ viewport: innerWidth, document: document.documentElement.scrollWidth })');
        assert.ok(overflow.document <= overflow.viewport, `${persona} overflows at ${width}: ${JSON.stringify(overflow)}`);
        assert.equal(await run("document.querySelectorAll('#main h1').length > 0"), true);
        assert.deepEqual(await run(`Array.from(document.querySelectorAll('button')).filter(button =>
          button.getClientRects().length && !button.textContent.trim() && !button.getAttribute('aria-label') && !button.getAttribute('title')
        ).map(button => button.outerHTML)`), [], `${persona} has unlabeled buttons.`);
      }
    }
    assert.deepEqual(browser.errors, [], 'The complete workflow produces no uncaught browser exceptions.');
    assert.deepEqual(await run("Object.fromEntries(Object.entries(localStorage).filter(([key]) => key !== 'relay-v1'))"), unrelatedStorage);
  });
});
