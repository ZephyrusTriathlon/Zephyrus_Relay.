const { test } = require('node:test');
const assert = require('node:assert/strict');
const { connect } = require('./cdp');

test('Relay: connected order, planning constraints, field exceptions and responsive views', { timeout: 240000 }, async t => {
  const createdOrderIds = [];
  const planningTripIds = [];
  // Serve the real UI/API with a fixed clock inside the supplied calendar range.
  if (require('node:fs').existsSync('.env')) process.loadEnvFile('.env');
  const {createApp}=await import('../apps/api/src/app.js');
  const {createDatabase}=await import('../apps/api/src/db.js');
  const {createServer}=await import('vite');
  const db=createDatabase();
  let orderNow=new Date('2025-01-03T15:59:00+05:30');
  const app=createApp({database:()=>db,orderClock:()=>orderNow});
  const api=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>api.once('listening',resolve));
  const previousUrl=process.env.RELAY_URL, previousDevTools=process.env.VITE_ENABLE_DEV_TOOLS;
  process.env.VITE_ENABLE_DEV_TOOLS='true';
  const web=await createServer({configFile:require('node:path').resolve('apps/web/vite.config.js'),server:{middlewareMode:true,hmr:false,proxy:{'/api':{target:`http://127.0.0.1:${api.address().port}`}}}});
  const webHttp=require('node:http').createServer(web.middlewares).listen(0,'127.0.0.1');
  await new Promise(resolve=>webHttp.once('listening',resolve));
  process.env.RELAY_URL=`http://127.0.0.1:${webHttp.address().port}`;
  const browser = await connect();
  const { send, input, key, viewport, screenshot, waitFor } = browser;
  const login = async id => {
    await browser.run(`(async()=>{await authRequest('logout',{});await authRequest('login',{identifier:${JSON.stringify(id)},password:'RelayDemo!26'});await refreshIdentity();serverPlanning=false;render();const reveal=role==='dispatch'&&pendingDispatchOrderId&&dispatchHandoff(pendingDispatchOrderId);if(reveal){render();finishDispatchHandoff();}})()`);
  };
  const run = browser.run;
  const click = async selector => { await browser.click(selector); if(selector.includes('sign-out'))await waitFor("!!document.querySelector('#login-form')"); };

  let previousStorage, previousSession;
  t.after(async () => {
    if (previousStorage !== undefined) {
      await run(previousStorage === null
        ? "localStorage.removeItem('relay-v1')"
        : `localStorage.setItem('relay-v1', ${JSON.stringify(previousStorage)})`).catch(() => {});
    }
    if(previousSession!==undefined)await run(previousSession===null?"localStorage.removeItem('relay_session')":`localStorage.setItem('relay_session',${JSON.stringify(previousSession)})`).catch(()=>{});
    await run("authRequest('logout',{})").catch(()=>{});
    await browser.close();
    if (createdOrderIds.length) {
      const allocations=await db.allocation.findMany({where:{orderId:{in:createdOrderIds}}});
      planningTripIds.push(...allocations.map(a=>a.tripId));
      await db.deferral.deleteMany({where:{orderId:{in:createdOrderIds}}});
      await db.allocation.deleteMany({where:{orderId:{in:createdOrderIds}}});
      await db.tripStop.deleteMany({where:{tripId:{in:planningTripIds}}});
      await db.trip.deleteMany({where:{id:{in:planningTripIds}}});
      await db.orderStatusEvent.deleteMany({where:{orderId:{in:createdOrderIds}}});
      await db.orderItem.deleteMany({where:{orderId:{in:createdOrderIds}}});
      await db.order.deleteMany({where:{id:{in:createdOrderIds}}});
    }
    await web.close();await new Promise(resolve=>webHttp.close(resolve));await new Promise(resolve=>api.close(resolve));await app.locals.sessionStore.close();await db.$disconnect();
    if(previousUrl===undefined)delete process.env.RELAY_URL;else process.env.RELAY_URL=previousUrl;
    if(previousDevTools===undefined)delete process.env.VITE_ENABLE_DEV_TOOLS;else process.env.VITE_ENABLE_DEV_TOOLS=previousDevTools;
  });
  await viewport(1440);
  await browser.navigate('#dispatch');
  previousSession = await run("localStorage.getItem('relay_session')");
  previousStorage = await run("localStorage.getItem('relay-v1')");
  const unrelatedStorage = await run("Object.fromEntries(Object.entries(localStorage).filter(([key]) => !['relay-v1','relay_session'].includes(key)))");
  await login('dispatcher');
  await run("state=seed(); save();role='dispatch'; render()");

  const switchAccount = async workspace => {
    if(await run('!!currentAccount()')) {
      if(await run("currentAccount().workspace==='store'")) await waitFor('!!storeData && !storeLoading');
      await run('closeDialog()');
      await click('.nav [data-action="account"]');
      await click('#dialog [data-action="sign-out"]');
    }
    const id={store:'store',dispatch:'dispatcher',loader:'loader',delivery:'driver'}[workspace];
    await input('#login-id',id);await input('#login-password','RelayDemo!26');
    await click('#login-form [type="submit"]');
    await waitFor(`currentAccount()?.workspace===${JSON.stringify(workspace)}`);
    assert.equal(await run('currentAccount().workspace'),workspace);
    if (workspace === 'store') await waitFor('!!storeData && !storeLoading');
    if (workspace === 'dispatch') await run('serverPlanning=false;render();finishDispatchHandoff()');
  };

  await t.test('server login, fixed roles, session isolation and responsive account access', async () => {
    const submitLogin=async()=>{await run("document.querySelector('#login-password').focus()");await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',windowsVirtualKeyCode:13,text:'\r'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',windowsVirtualKeyCode:13});await waitFor("!document.querySelector('#login-form') || !document.querySelector('#login-form [type=submit]').disabled");};
    await run('signOut()');
    assert.ok(await run("!!document.querySelector('#login-form')"));
    await click('#login-form [type="submit"]');
    assert.match(await run("document.querySelector('#login-error').textContent"),/employee ID/);
    await input('#login-id','store@relay.demo');
    await click('#login-form [type="submit"]');
    assert.match(await run("document.querySelector('#login-error').textContent"),/password/);
    await input('#login-password','incorrect');
    await submitLogin();
    assert.match(await run("document.querySelector('#login-error').textContent"),/incorrect/);
    for(const width of [1440,1024,430,390,360]){
      await viewport(width,844);
      assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));
      assert.ok(await run("document.querySelector('#login-form button').getBoundingClientRect().bottom<=innerHeight"));
      await screenshot(`login-${width}`);
    }
    const saved=await run('JSON.stringify(state)');
    for(const [id,workspace] of [['store','store'],['dispatcher','dispatch'],['loader','loader'],['driver','delivery']]){
      await input('#login-id',`${id}@relay.demo`);await input('#login-password','RelayDemo!26');await submitLogin();
      assert.equal(await run('role'),workspace);
      assert.equal(await run("document.querySelectorAll('#app [data-role]').length"),0);
      assert.equal(await run('currentAccount().email'),`${id}@relay.demo`);
      assert.equal(await run("document.querySelector('.topbar')"),null);
      assert.deepEqual(await run("[...document.querySelectorAll('.nav button')].map(button=>button.dataset.action)"),['workspace-home','account','activity']);
      await click('.nav [data-action="activity"]');
      if (workspace === 'store') { await waitFor('!!storeData && !storeLoading'); assert.match(await run("document.querySelector('#main').innerText"),/Every order, every handoff/); }
      else assert.match(await run("document.querySelector('#dialog').innerText"),/Every handoff, connected/);
      await key('Escape');
      for(const target of ['store','dispatch','loader','delivery']){
        await run(`location.hash=${JSON.stringify(target)}`);
        await waitFor(`location.hash==='#${workspace}'`);
        assert.equal(await run('document.body.dataset.role'),workspace);
      }
      await run('window.qaBeforeReload=true');await send('Page.reload');await waitFor(`!window.qaBeforeReload && !!document.querySelector('.view-${workspace}')`);
      assert.equal(await run('currentAccount().email'),`${id}@relay.demo`);
      await click('.nav [data-action="account"]');
      assert.match(await run("document.querySelector('#dialog').innerText"),new RegExp(await run('currentAccount().name')));
      await click('[data-action="sign-out"]');
      assert.ok(await run("!!document.querySelector('#login-form')"));
      assert.equal(await run('JSON.stringify(state)'),saved);
      assert.equal(await run("localStorage.getItem('relay_session')"),null);
    }
    await input('#login-id','store');await input('#login-password','RelayDemo!26');await submitLogin();
    await switchAccount('dispatch');assert.equal(await run('JSON.stringify(state)'),saved);
    await click('.nav [data-action="account"]');
    await key('Tab');assert.ok(await run("document.querySelector('#dialog').contains(document.activeElement)"));
    await key('Escape');await viewport(1440);
  });

  await t.test('server rejects forged local roles and expired sessions return to login', async () => {
    await switchAccount('store');
    await run("localStorage.setItem('relay_session','dispatcher');location.hash='dispatch'");
    await waitFor("location.hash==='#store'");
    assert.equal(await run("fetch('/api/dispatcher/scope').then(r=>r.status)"),403);
    assert.equal(await run("fetch('/api/driver/scope').then(r=>r.status)"),403);
    assert.equal(await run("document.querySelectorAll('[data-action=\"switch-account\"],[data-action=\"demo-sign-in\"]').length"),0);
    await run("(async()=>{await authRequest('logout',{});await refreshIdentity();})()");
    assert.match(await run("document.querySelector('#login-error').textContent"),/expired/);
    await run("localStorage.removeItem('relay_session')");
    await switchAccount('dispatch');
  });

  const mainText = () => run("document.querySelector('#main').innerText");
  const order = () => run("state.orders.find(order => order.id === 'ORD-2847')");
  let workflowFailed = false;
  const stage = (name, callback) => t.test(name, async subtest => {
    if (workflowFailed) return subtest.skip('An earlier workflow stage failed.');
    try { await callback(); } catch (error) { workflowFailed = true; throw error; }
  });
  const capture = async (roleName, width, height) => {
    await viewport(width, height);
    await login(({store:'store',dispatch:'dispatcher',loader:'loader',delivery:'driver'})[roleName]);
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

  await stage('Store API order review, persistence, separate temperatures and status visibility', async () => {
    await switchAccount('store');
    await click('[data-action="store-replenish"]');
    assert.equal(await run('storeDate'),'2025-01-04','Friday before cutoff suggests operating Saturday');
    assert.equal(await run("document.querySelector('[data-action=create-order]').disabled"),true);
    await input('#product-search','no-matching-product');
    assert.equal(await run("document.querySelectorAll('[data-qty]').length"),0);
    await input('#product-search','');
    await input('#stock-filter','healthy','change');
    assert.equal(await run("document.querySelectorAll('[data-qty]').length"),2);
    await input('#stock-filter','all','change');
    const prototypeBefore=await run('JSON.stringify(state)');
    for(const temperature of ['AMBIENT','CHILLED']) {
      await input('#store-temperature',temperature,'change');
      const i=temperature==='AMBIENT'?2:0;
      await input(`[data-qty="${i}"]`,'-7');assert.equal(await run(`quantities[${i}]`),0);
      await input(`[data-qty="${i}"]`,'999');assert.equal(await run(`quantities[${i}]`),50);
      await input(`[data-qty="${i}"]`,'3');
      await click('[data-action="create-order"]');
      assert.match(await run("document.querySelector('#dialog').innerText"),new RegExp(temperature.toLowerCase()));
      for(let n=0;n<6;n++){await key('Tab');assert.equal(await run("document.querySelector('#dialog').contains(document.activeElement)"),true);}
      await click('[data-action="place-order"]');
      await waitFor("document.querySelector('#dialog').innerText.includes('Order confirmed for planning.')");
      const createdId=await run("document.querySelector('.success-mark').dataset.orderId");createdOrderIds.push(createdId);
      const created=await run(`storeOwnOrders().find(o=>o.id===${JSON.stringify(createdId)})`);
      assert.ok(created,'Successful creation refreshes the list even when an earlier read was in flight');
      assert.equal(created.temperatureRequirement,temperature);assert.equal(created.units,3);assert.equal(created.status,'CONFIRMED');
      assert.equal(await run('JSON.stringify(state)'),prototypeBefore,'Store orders never mutate prototype/localStorage state');
      await click('#dialog .dialog-actions [data-action="close"]');
      await click(`[data-action="order-detail"][data-id="${created.id}"]`);
      await waitFor("document.querySelector('#dialog').innerText.includes('Status history')");
      assert.match(await run("document.querySelector('#dialog').innerText"),/Confirmed|Order created/);
      assert.equal(await run("document.querySelectorAll('[data-action=store-confirm-receipt]').length"),0);
      await key('Escape');
      await run('window.qaBeforeReload=true');await send('Page.reload');await waitFor('!window.qaBeforeReload && !!storeData && !storeLoading');
      assert.ok(await run(`storeOwnOrders().some(o=>o.id===${JSON.stringify(created.id)})`));
      await click('[data-action="store-replenish"]');
    }
    // A manually selected Sunday is rejected without rewriting the draft or losing quantities.
    await input('#store-date','2025-01-05','change');
    await run('quantities[2]=1;render()');
    await click('[data-action="create-order"]');await click('[data-action="place-order"]');
    await waitFor("!!document.querySelector('#store-submit-error')?.textContent");
    assert.match(await run("document.querySelector('#store-submit-error').textContent"),/not an operating date/);
    assert.equal(await run('storeDate'),'2025-01-05');assert.equal(await run('quantities[2]'),1);
    await key('Escape');
    orderNow=new Date('2025-01-04T16:01:00+05:30');
    await run('loadStoreOrders()');
    assert.equal(await run('storeDate'),'2025-01-05','Refresh preserves the explicit draft date');
    await run("storeDate='';loadStoreOrders()");
    assert.equal(await run('storeDate'),'2025-01-06','After cutoff, default skips closed Sunday');
    // Exercise visible cutoff rejection with a date that input constraints alone cannot protect.
    await run('storeDate=storeData.ordering.nextDayOpen ? storeData.ordering.today : storeData.ordering.nextDay;quantities[2]=1;render()');
    await click('[data-action="create-order"]');await click('[data-action="place-order"]');
    await waitFor("!!document.querySelector('#store-submit-error')?.textContent");
    assert.match(await run("document.querySelector('#store-submit-error').textContent"),/16:00|after today/);
    assert.equal(await run('quantities[2]'),1,'Rejected orders preserve draft quantities');
    await screenshot('stage04-order-rejection');await key('Escape');
    assert.equal(await run("document.querySelector('[data-action=create-order]').disabled"),false,'A rejected order can be reviewed again');
    orderNow=new Date('9999-12-20T16:01:00+05:30');
    await run("storeDate='';loadStoreOrders()");
    assert.equal(await run('storeDate'),'');
    assert.match(await mainText(),/No open operating date/);
    orderNow=new Date('2025-01-03T15:59:00+05:30');
    await run('loadStoreOrders()');
    await run('storeDate=storeData.ordering.earliestDeliveryDate;quantities=products.map(()=>0);render()');
    for(const width of [1440,430,390,360]) {await viewport(width,900);assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await screenshot(`stage04-store-${width}`);}
    await viewport(1440);
    await click('[data-action="store-orders"]');await waitFor('!storeLoading');
    assert.match(await mainText(),/Scheduled/);assert.match(await mainText(),/Deferred/);
    // Allocation/field stages still use explicit prototype fixtures until their own API stages.
    await run("state.orders.push(hydrateOrder({...orderDefaults,id:'ORD-2847',outletId:'OUT006',store:'Waypoint Fresh · Colombo 06',area:'Colombo 06',address:'Synthetic outlet OUT006 · Colombo',window:'03:00 – 08:00',dockType:'street',items:[12,10,8,6,4],status:'Pending',route:null,loaded:false,issue:''}));pendingDispatchOrderId='ORD-2847';save();queueQuery='stale';queueFilter='priority';dispatchPanel='vehicle'");
  });

  await stage('dispatch protects capacity, selects vehicles and releases the same order', async () => {
    await switchAccount('dispatch');
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
    await click('[data-action="confirm-dispatch"]');
    assert.match(await run("document.querySelector('#dialog').innerText"), /VEH003/);
    await click('[data-action="release"]');
    assert.equal(await run('state.confirmed'), true);
    assert.equal((await order()).status, 'Ready to load');
    await switchAccount('loader');
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
    // Page.reload can return while the old document still satisfies a render check.
    await run('window.qaBeforeReload=true');
    await send('Page.reload');
    await waitFor("!window.qaBeforeReload && typeof state !== 'undefined' && document.querySelector('.view-loader')", 'Warehouse to render in the new document');
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

  await stage('delivery defers exceptions and validates proof; receipt fixture supports later-stage prototype checks', async () => {
    await switchAccount('delivery');
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
    // Receipt operations belong to Stage 7. Fixture keeps existing dispatcher follow-up coverage.
    await run("const receiptFixture=state.orders.find(o=>o.id==='ORD-2847');Object.assign(receiptFixture,{receiptConfirmed:true,receiptConfirmedBy:'Nimasha Perera',receiptConfirmedAt:'10:30',receiptIssueType:'Damaged goods',receiptIssueDetails:'Two milk cartons were damaged on arrival.'});save()");
  });

  await stage('completed route is consistent across dispatcher, vehicle and receipts', async () => {
    await switchAccount('dispatch');
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

  await stage('Store reload and account handoffs preserve server orders without changing the prototype route', async () => {
    const completedState=await run('JSON.stringify(state)');
    await switchAccount('store');await click('[data-action="store-orders"]');await waitFor('!storeLoading');
    for(const id of createdOrderIds)assert.ok(await run(`storeOwnOrders().some(o=>o.id===${JSON.stringify(id)})`));
    await switchAccount('dispatch');assert.equal(await run('JSON.stringify(state)'),completedState);
    assert.equal(await run('dispatchRouteState().key'),'completed');
  });

  await t.test('field sheets, long notes and route focus remain accessible', async () => {
    const savedState = await run('JSON.stringify(state)');
    try {
      await login('driver');
      await run("state=seed();role='delivery';fieldRouteOpen=false;state.confirmed=state.ready=state.started=true;assigned().forEach(o=>{o.loaded=true;o.status='In transit';o.arrived=true});render()");
      assert.equal(await run("document.querySelectorAll('#main h1').length"), 1);
      for (const [width,height] of [[360,640],[390,844],[430,932],[768,900],[1440,900]]) {
        await viewport(width,height);
        await click('[data-action="verify-delivery"]');
        const sheet = await run(`(() => {
          const rect=selector=>document.querySelector(selector).getBoundingClientRect().toJSON();
          return {pixelRatio:devicePixelRatio,dialog:rect('#dialog'),body:rect('.dialog-body'),footer:rect('.dialog-actions'),close:rect('.dialog-close')};
        })()`);
        const devicePixel = value => Math.round(value * sheet.pixelRatio);
        assert.ok(devicePixel(sheet.dialog.top)>=0 && devicePixel(sheet.dialog.bottom)<=devicePixel(height), 'The sheet stays inside the viewport.');
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
      await login('loader');
      await run("Element.prototype.scrollIntoView=qaOriginalScroll;delete window.qaOriginalScroll;delete window.qaScrollOptions;role='loader';state.ready=false;assigned().forEach(o=>o.loaded=false);assigned()[1].issue='Damaged carton: '+ 'X'.repeat(200);assigned()[1].issueType='Damaged cartons';render()");
      const note=await run("(() => {const el=document.querySelector('.shipment-exception p');const card=el.closest('.shipment').getBoundingClientRect();const r=el.getBoundingClientRect();return {right:r.right,cardRight:card.right,client:el.clientWidth,scroll:el.scrollWidth}})()");
      assert.ok(note.right<=note.cardRight && note.scroll<=note.client+1,'Long exception notes wrap inside the shipment.');
      await login('store');
      await waitFor('!!storeData && !storeLoading');
      await click('[data-action="store-orders"]');await waitFor('!storeLoading');
      await click('[data-action="order-detail"]');
      await waitFor("document.querySelector('#dialog').innerText.includes('Status history')");
      assert.equal(await run("document.querySelector('.dialog-body').scrollWidth<=document.querySelector('.dialog-body').clientWidth"),true,'Persisted order details fit the sheet.');
      await key('Escape');
    } finally {
      await login('dispatcher');
      await run(`if(window.qaOriginalScroll)Element.prototype.scrollIntoView=qaOriginalScroll;document.querySelector('#dialog').close();state=JSON.parse(${JSON.stringify(savedState)});role='dispatch';fieldRouteOpen=false;render()`);
      await send('Emulation.setEmulatedMedia',{features:[]});
    }
  });

  await t.test('design case study is absent from the application', async () => {
    await login('dispatcher');
    await run("role='dispatch';render()");
    assert.equal(await run("document.querySelector('script[src=\"src/scripts/case-study.js\"],link[href=\"src/styles/case-study.css\"]')"),null);
    await click('.nav [data-action="account"]');
    assert.equal(await run("document.querySelector('#dialog [data-action=\"case-study\"]')"),null);
    await key('Escape');
    await run("location.hash='case-study'");
    await waitFor("location.hash==='#dispatch'");
    assert.equal(await run("document.querySelector('#main').className"),'view-dispatch');
  });

  await t.test('source-aligned constraints, explainable deferral and capacity outlook are interactive', async () => {
    const savedState = await run('JSON.stringify(state)');
    try {
      await viewport(1440, 1000);
      await login('dispatcher');
      await run("state=seed();role='dispatch';dispatchPanel='queue';render()");
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
      await login('dispatcher');
      await run(`state=JSON.parse(${JSON.stringify(savedState)});save();role='dispatch';render()`);
    }
  });

  await t.test('Dispatcher consumes central planning APIs, displays failures and saves mixed-brand drafts with deferrals',async()=>{
    await login('dispatcher');await viewport(1440,1000);
    const date='2024-02-08',deliveryDate=new Date(date+'T00:00:00Z');
    assert.equal(await db.order.count({where:{deliveryDate}}),0,'Use a dedicated database with the browser fixture date free');
    const fresh=await db.outlet.findFirst({where:{brand:'FRESH',parkingConstraint:'VAN_ONLY',district:'Colombo'},orderBy:{id:'asc'}});
    const style=await db.outlet.findFirst({where:{brand:'STYLE',district:fresh.district,depotId:fresh.depotId,dockType:'STREET'},orderBy:{id:'asc'}});
    const orders=[];
    for(const [outlet,temperature,weight] of [[fresh,'CHILLED',13],[style,'AMBIENT',13],[fresh,'AMBIENT',8000]]){
      const order=await db.order.create({data:{orderNumber:`BROWSER-PLANNING-${require('node:crypto').randomUUID()}`,deliveryDate,outletId:outlet.id,temperatureRequirement:temperature,windowOpenTime:outlet.windowOpenTime,windowCloseTime:outlet.windowCloseTime,items:{create:{lineNumber:1,productCode:'UI-PLANNING',description:'Server planning browser regression',cartons:1,unitWeightKg:weight,unitVolumeM3:0.032,temperatureRequirement:temperature}}}});
      createdOrderIds.push(order.id);orders.push(order);
    }
    const prototype=await run('JSON.stringify(state)');
    assert.match(await mainText(),/R-07 historical simulation/);
    await run('resetPlanningData();render()');
    assert.equal(await run('serverPlanning'),true);
    assert.match(await mainText(),/Dispatch planning/);
    await run('window.relayDevTools=false;serverPlanning=false;render()');
    assert.equal(await run("document.querySelector('[data-action=planning-prototype]')"),null);
    assert.match(await mainText(),/Dispatch planning/);
    await run('window.relayDevTools=true;serverPlanning=true;render()');
    await input('#planning-date',date,'change');await click('[data-action="planning-load"]');
    await waitFor('!!planningDay && !planningBusy');assert.equal(await run('planningDay.orders.length'),3);
    await viewport(360,844);assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'),'Saved planning panel fits a phone viewport');await viewport(1440,1000);
    await click(`[data-planning-order="${orders[0].id}"]`);
    const truck=await db.vehicle.findFirst({where:{depotId:fresh.depotId,type:'TRUCK',temperature:'AMBIENT'}});
    await input('#planning-vehicle',truck.id,'change');await click('[data-action="planning-validate"]');
    await waitFor('planningResult?.kind==="validation" && !planningBusy');
    assert.match(await mainText(),/REFRIGERATION_REQUIRED/);assert.match(await mainText(),/VAN_ACCESS_REQUIRED/);
    const van=await db.vehicle.findFirst({where:{depotId:fresh.depotId,type:'VAN',temperature:'REEFER'},orderBy:{id:'asc'}});
    await input('#planning-vehicle',van.id,'change');assert.equal(await run("document.querySelector('#planning-result')"),null,'Editing the candidate clears stale validation');await click(`[data-planning-order="${orders[1].id}"]`);
    await click('[data-action="planning-validate"]');await waitFor('planningResult?.kind==="validation" && !planningBusy');
    assert.equal(await run('planningResult.feasible'),true,'The UI allows server-approved mixed-brand candidates');
    assert.ok(await run('planningResult.metrics.returnMinute-planningResult.metrics.departureMinute>270'));
    await click('[data-action="planning-allocate"]');await waitFor('planningResult?.kind==="allocation" && !planningBusy');
    assert.equal(await run('planningResult.trips.length'),1);assert.equal(await run('planningResult.deferrals.length'),1);
    planningTripIds.push(...await run('planningResult.trips.map(t=>t.id)'));
    assert.match(await mainText(),/CAPACITY_WEIGHT/);assert.match(await mainText(),/DRAFT/);
    const allocations=await db.allocation.findMany({where:{orderId:{in:orders.map(o=>o.id)}},include:{trip:true}});
    assert.equal(allocations.length,2);assert.equal(new Set(allocations.map(a=>a.tripId)).size,1);assert.ok(allocations.every(a=>a.trip.status==='DRAFT'));
    await click('[data-action="planning-allocate"]');await waitFor('planningResult?.kind==="allocation" && !planningBusy');
    assert.equal(await run('planningResult.trips.length'),0);assert.equal(await run('planningResult.deferrals.length'),0);
    await click('#planning-retry');await click('[data-action="planning-allocate"]');await waitFor('planningResult?.kind==="allocation" && !planningBusy');
    assert.equal(await run('planningResult.deferrals[0].attempts'),2);
    const draft=await run('planningDay.trips.find(t=>t.status==="DRAFT")');
    await click(`[data-action="planning-review"][data-trip="${draft.id}"]`);
    assert.equal(await run("document.querySelector('[data-action=planning-release]').disabled"),true);
    await input('#edit-vehicle',truck.id,'change');await click('[data-action="planning-edit"]');
    await waitFor('planningResult?.accepted===false && !planningBusy');
    await input('#edit-vehicle',draft.vehicleId,'change');await click('[data-action="planning-edit"]');
    await waitFor('planningResult?.accepted===true && !planningBusy');
    await click('[data-action="planning-release"]');await waitFor('planningResult?.kind==="release" && !planningBusy');
    assert.equal(await run('planningDay.trips[0].status'),'RELEASED');
    await screenshot('stage06-released-plan');
    await viewport(360,844);assert.ok(await run('document.documentElement.scrollWidth<=innerWidth'));await screenshot('stage06-dispatch-360');await viewport(1440,1000);
    await input('#planning-date','2030-01-01','change');await click('[data-action="planning-load"]');await waitFor('!!planningError && !planningBusy');
    assert.match(await mainText(),/INVALID_PLANNING_DATE/);
    assert.equal(await run('JSON.stringify(state)'),prototype,'Saved planning actions do not mutate the R-07 simulation');
    await login('store');assert.equal(await run('planningDay'),null);assert.equal(await run('planningResult'),null);
    await login('dispatcher');assert.equal(await run('serverPlanning'),false);
  });

  await t.test('sign out preserves completed work', async () => {
    const completed=await run('JSON.stringify(state)');
    try {
      await switchAccount('store');
      await click('.nav [data-action="account"]');await click('[data-action="sign-out"]');
      assert.equal(await run("localStorage.getItem('relay-v1')"),completed);
      await switchAccount('store');
      assert.equal(await run('JSON.stringify(state)'),completed);
      assert.equal(await run('currentAccount().email'),'store@relay.demo');
      assert.equal(await run('role'),'store');
    } finally {
      await login('dispatcher');
      await run(`state=JSON.parse(${JSON.stringify(completed)});save();render()`);
    }
  });

  await t.test('all roles fit every requested viewport and pages have meaningful labels', async () => {
    await run("document.querySelector('#dialog').close()");
    for (const width of [360, 390, 430, 768, 834, 1024, 1280, 1440]) {
      await viewport(width, 1000);
      for (const persona of ['store', 'dispatch', 'loader', 'delivery']) {
        await login(({store:'store',dispatch:'dispatcher',loader:'loader',delivery:'driver'})[persona]);
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
    assert.deepEqual(await run("Object.fromEntries(Object.entries(localStorage).filter(([key]) => !['relay-v1','relay_session'].includes(key)))"), unrelatedStorage);
  });
});
