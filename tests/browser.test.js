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

  await stage('route progress and capacity remain accurate with stale preparation flags', async () => {
    await run("state.ready=true;state.confirmed=true;state.started=true;assigned()[0].status='Delivered';assigned()[0].deliveredAt='09:25';assigned()[0].recipient='Store manager';assigned()[1].status='In transit';render()");
    assert.match(await mainText(),/Partially completed/);
    assert.match(await mainText(),/1 of 2 stops delivered/);
    assert.equal(await run("document.querySelector('.capacity-track').getAttribute('aria-valuenow')"),'270');
    assert.match(await run("document.querySelector('.dispatch-pulse').innerText"),/930 kg free/);
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
    await input('#product-search', 'Anchor');
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
    assert.equal((await order()).weight, 280);
    assert.match(await run("document.querySelector('#dialog').innerText"), /ORD-2847/);
  });

  await stage('dispatch protects capacity, selects vehicles and releases the same order', async () => {
    await click('[data-action="go-dispatch"]');
    await waitFor("document.activeElement?.dataset.id === 'ORD-2847'", 'new order receives focus');
    assert.deepEqual(await run('({panel:dispatchPanel,query:queueQuery,filter:queueFilter,selected:selectedOrderId})'), {panel:'queue',query:'',filter:'all',selected:'ORD-2847'});
    assert.equal(await run("document.querySelector('#queue-list .order-card [data-action=select-order]').dataset.id"), 'ORD-2847');
    assert.equal(await run("document.querySelector('[data-action=select-order][data-id=ORD-2847]').getAttribute('aria-pressed')"), 'true');
    await screenshot('dispatch-new-order');
    await click('[data-action="fleet"]');
    await click('[data-action="select-vehicle"][data-id="TRK-218"]');
    assert.equal(await run('activeVehicle().capacity'), 1500);
    assert.equal(await run('assigned().every(order => order.vehicle === "TRK-218")'), true);
    await click('[data-action="fleet"]');
    await click('[data-action="select-vehicle"][data-id="TRK-214"]');
    assert.equal(await run('activeVehicle().driver'), 'Amal Perera');
    // Exercise maximum-capacity failure without changing the normal demo scenario.
    await run("state.orders.push({...state.orders[0], id:'ORD-CAPACITY', route:null, status:'Pending', weight:1500, cartons:150, items:[150,0,0,0,0]}); render()");
    const capacityButtonDisabled = await run("document.querySelector('[data-action=assign][data-id=ORD-CAPACITY]')?.disabled");
    if (!capacityButtonDisabled) await click('[data-action="assign"][data-id="ORD-CAPACITY"]');
    assert.equal(await run("state.orders.find(o=>o.id==='ORD-CAPACITY').route"), null, 'Over-capacity orders stay unassigned.');
    assert.match(await run("document.querySelector('#dialog').innerText"), /over the vehicle limit|capacity/i);
    await click('#dialog [data-action="close"]');
    await run("state.orders=state.orders.filter(o=>o.id!=='ORD-CAPACITY'); render()");
    await click('[data-action="assign"][data-id="ORD-2847"]');
    assert.equal((await order()).route, 'R-07');
    assert.equal((await order()).cartons, 40);
    await click('[data-action="confirm-dispatch"]');
    assert.match(await run("document.querySelector('#dialog').innerText"), /TRK-214/);
    await click('[data-action="release"]');
    assert.equal(await run('state.confirmed'), true);
    assert.equal((await order()).status, 'Ready to load');
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
    assert.equal((await order()).loaded, true, 'The final delivery stop loads first.');
    const pendingCount = await run('state.pending.length');
    assert.ok(pendingCount > 0);
    await capture('loader', 834, 1112);
    await capture('loader', 768, 1024);
    await run("location.hash='loader'");
    await send('Page.reload');
    await waitFor("typeof render === 'function' && document.querySelector('#main')");
    assert.equal(await run('state.offline'), true);
    assert.equal(await run('state.pending.length'), pendingCount);
    assert.equal((await order()).loaded, true);
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
    await click('[data-action="order-detail"][data-id="ORD-2847"]');
    assert.match(await run("document.querySelector('#dialog').innerText"), /Nimasha Perera/);
    await key('Escape');
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
        assert.match(await mainText(),/No outstanding exceptions/);
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
      assert.match(await mainText(),/Queued for the next run/);
    } finally {
      await run(`state=JSON.parse(${JSON.stringify(completedState)});save();pendingDispatchOrderId=null;revealedDispatchOrderId=null;role='dispatch';render()`);
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
