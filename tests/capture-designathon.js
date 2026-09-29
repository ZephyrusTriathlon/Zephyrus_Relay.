const fs = require('node:fs');
const path = require('node:path');
const { connect } = require('./cdp');

const outputDirectory = path.resolve(__dirname, '../docs/designathon/screenshots');
fs.mkdirSync(outputDirectory, { recursive: true });

async function main() {
  const browser = await connect();
  const { run, send, click, input, viewport, navigate, pause } = browser;
  let previousStorage;
  let previousSession;

  const capture = async (name, width, height, { fullPage = true, preserveToast = false } = {}) => {
    await viewport(width, height);
    await run(`window.scrollTo(0,0);${preserveToast ? '' : "document.querySelector('#toast')?.classList.remove('show');"}`);
    await pause(260);
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, fromSurface: true });
    const filename = path.join(outputDirectory, `${name}.png`);
    fs.writeFileSync(filename, Buffer.from(data, 'base64'));
    process.stdout.write(`${path.basename(filename)}\n`);
  };

  const resetUi = () => run(`(() => {
    if (document.querySelector('#dialog').open) document.querySelector('#dialog').close();
    state=seed();
    quantities=products.map(()=>0);
    tab='replenishment';
    stockFilter='all';
    productQuery='';
    queueFilter='all';
    queueQuery='';
    dispatchPanel='queue';
    selectedOrderId='ORD-2846';
    selectedStopId=null;
    fieldRouteOpen=false;
    pendingDispatchOrderId=null;
    revealedDispatchOrderId=null;
  })()`);

  const setWorkspace = (workspace, extra = '') => run(`(() => {
    const account=demoAccounts.find(account=>account.workspace===${JSON.stringify(workspace)});
    localStorage.setItem('relay_session',account.id);
    role=account.workspace;
    location.hash=role;
    ${extra}
    render();
    window.scrollTo(0,0);
  })()`);

  const addStoreOrder = (extra = '') => run(`(() => {
    const order=hydrateOrder({...orderDefaults,id:'ORD-2847',outletId:'OUT006',store:'Waypoint Fresh · Colombo 06',area:'Colombo 06',address:'Synthetic outlet OUT006 · Colombo',window:'03:00 – 08:00',dockType:'street',items:[12,10,8,6,4],status:'Planning',route:'R-07',vehicle:'VEH003',loaded:false,issue:''});
    ${extra}
    state.orders.push(order);
  })()`);

  try {
    await navigate('#dispatch');
    previousStorage = await run("localStorage.getItem('relay-v1')");
    previousSession = await run("localStorage.getItem('relay_session')");

    await resetUi();
    await setWorkspace('store');
    await click('[data-action="recommended"]');
    await capture('store_order_replenishment', 1440, 1000);

    await resetUi();
    await addStoreOrder();
    await setWorkspace('store', "tab='orders';");
    await capture('store_order_tracking_eta', 1440, 1000);

    await resetUi();
    await addStoreOrder("order.status='Delivered';order.loaded=true;order.arrived=true;order.recipient='Nimasha Perera';order.deliveredAt='06:18';order.receiptConfirmed=false;");
    await run("state.confirmed=true;state.ready=true;state.started=true;assigned().forEach(o=>{o.status='Delivered';o.loaded=true;o.arrived=true;o.recipient=o.recipient||'Store receiving team';o.deliveredAt=o.deliveredAt||'06:12';});");
    await setWorkspace('store', "tab='orders';");
    await capture('store_receipt_check', 1440, 1000);

    await resetUi();
    await setWorkspace('dispatch', "dispatchPanel='queue';selectedOrderId='ORD-2843';");
    await capture('dispatcher_order_queue', 1440, 1000);

    await resetUi();
    await setWorkspace('dispatch', "dispatchPanel='route';");
    await capture('dispatcher_plan_validate', 1440, 1000);

    await resetUi();
    await setWorkspace('dispatch', "dispatchPanel='queue';selectedOrderId='ORD-2843';");
    await click('[data-action="defer-order"][data-id="ORD-2843"]');
    await input('#deferral-reason', 'Delivery window cannot be met', 'change');
    await input('#deferral-note', 'Protect this repeat skip on the first compatible trip tomorrow.');
    await capture('dispatcher_deferral', 1440, 1000, { fullPage: false });

    await resetUi();
    await addStoreOrder("order.status='Delivered';order.loaded=true;order.arrived=true;order.recipient='Nimasha Perera';order.deliveredAt='06:18';order.receiptConfirmed=true;order.receiptConfirmedBy='Nimasha Perera';order.receiptConfirmedAt='06:24';order.receiptIssueType='Damaged goods';order.receiptIssueDetails='Two milk cartons were damaged on arrival.';");
    await run("state.confirmed=true;state.ready=true;state.started=true;assigned().forEach((o,i)=>{o.status='Delivered';o.loaded=true;o.arrived=true;o.recipient=o.recipient||'Store receiving team';o.deliveredAt=o.deliveredAt||['05:30','05:54'][i]||'06:18';});");
    await setWorkspace('dispatch', "dispatchPanel='route';");
    await capture('dispatcher_followup', 1440, 1000);

    await resetUi();
    await run("state.confirmed=true;assigned().forEach(o=>{o.status='Ready to load';o.loaded=false;});");
    await setWorkspace('loader');
    await capture('loader_manifest', 834, 1112);

    await resetUi();
    await run("state.confirmed=true;assigned().forEach(o=>{o.status='Ready to load';o.loaded=false;});");
    await setWorkspace('loader');
    await click('[data-action="issue"]');
    await input('#issue-type', 'Missing cartons', 'change');
    await input('#issue-note', 'Two chilled cartons are not at the pick location.');
    await capture('loader_exception', 834, 1112, { fullPage: false });

    const prepareDriver = async () => {
      await resetUi();
      await run("state.confirmed=true;state.ready=true;state.started=true;assigned().forEach(o=>{o.status='In transit';o.loaded=true;o.arrived=false;o.deferred=false;o.issue='';o.issueType='';delete o.recipient;delete o.deliveredAt;});");
      await setWorkspace('delivery');
    };

    await prepareDriver();
    await capture('driver_next_stop', 390, 844, { fullPage: false });

    await prepareDriver();
    await click('[data-action="issue"]');
    await input('#issue-type', 'Store closed', 'change');
    await input('#issue-note', 'Receiving desk requested a later visit. Cartons remain on the vehicle.');
    await capture('driver_exception', 390, 844, { fullPage: false });

    await prepareDriver();
    await run("nextDelivery().arrived=true;render();");
    await click('[data-action="verify-delivery"]');
    await input('#recipient', 'Nimasha Perera');
    await run("document.querySelector('#verified').checked=true;document.querySelector('#verified').dispatchEvent(new Event('change',{bubbles:true}));");
    await capture('driver_pod', 390, 844, { fullPage: false });

    await prepareDriver();
    await run("state.offline=true;state.pending=['Arrival saved','Exception saved','Receipt draft saved'];state.lastSync='05:42';render();");
    await capture('driver_offline', 390, 844, { fullPage: false });

    await click('[data-action="offline"]');
    await pause(120);
    await capture('driver_reconnected', 390, 844, { fullPage: false, preserveToast: true });

    if (browser.errors.length) throw new Error(`Runtime errors: ${browser.errors.join('\n')}`);
  } finally {
    if (previousStorage !== undefined) {
      await run(previousStorage === null
        ? "localStorage.removeItem('relay-v1')"
        : `localStorage.setItem('relay-v1', ${JSON.stringify(previousStorage)})`).catch(() => {});
    }
    if (previousSession !== undefined) {
      await run(previousSession === null
        ? "localStorage.removeItem('relay_session')"
        : `localStorage.setItem('relay_session', ${JSON.stringify(previousSession)})`).catch(() => {});
    }
    await browser.close().catch(() => {});
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
