const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readFileSync}=require('node:fs');
const {createOperationalFixture,cleanupOperationalFixture}=require('./operational-fixture');
if(require('node:fs').existsSync('.env'))process.loadEnvFile('.env');

test('Stage 8 real network offline, durable reconciliation and account isolation',{timeout:240000},async t=>{
  const {createDatabase}=await import('../apps/api/src/db.js');
  const {createApp}=await import('../apps/api/src/app.js');
  const {operate,tripInclude,manifestVersion}=await import('../apps/api/src/operations.js');
  const db=createDatabase(),fixtures=[],cookies=[],browsers=[],users=[];
  const app=createApp({database:()=>db});let swRevision=1,syncRequests=0;
  const server=require('node:http').createServer((req,res)=>{
    if(req.url==='/api/sync')syncRequests++;
    if(req.url==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.setHeader('Cache-Control','no-cache');res.end(readFileSync('apps/web/dist/sw.js','utf8')+'\n// test update '+swRevision);}
    else app(req,res);
  }).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,cookie,body)=>{const r=await fetch(base+'/api'+path,{headers:{...(cookie?{cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','Idempotency-Key':randomUUID()})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})});return {status:r.status,data:r.status===204?null:await r.json()};};
  const login=async id=>{const r=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:id,password:'RelayDemo!26'})});assert.equal(r.status,200);const c=r.headers.get('set-cookie').split(';')[0];cookies.push(c);return c;};
  t.after(async()=>{for(const b of browsers)await b.close();for(const c of cookies)await request('/auth/logout',c,{});await new Promise(r=>server.close(r));await app.locals.sessionStore.close();for(const f of fixtures.reverse())await cleanupOperationalFixture(db,f);await db.user.deleteMany({where:{id:{in:users}}});await db.$disconnect();});
  const driver=await db.user.findUnique({where:{email:'driver@relay.demo'}}),loader=await db.user.findUnique({where:{email:'loader@relay.demo'}});
  const [dc,lc,sc,pc]=await Promise.all(['driver','loader','store','dispatcher'].map(login));
  // Most fixtures need Driver ownership only. Keep them out of OUT004's
  // bounded Store list used by the concurrent online Store walkthrough.
  // The explicit three-stop fixture still exercises real OUT004 receipt.
  const fixture=async(outlets=['OUT005'])=>{
    const f=await createOperationalFixture(db,{date:'2024-05-07',outletIds:outlets});fixtures.push(f);
    // Isolated Stage 7 release/ready preparation; no global seed mutation.
    await db.trip.update({where:{id:f.trip.id},data:{status:'RELEASED'}});
    for(const a of f.allocations)await operate(db,loader,f.trip.id,'load',a.id,{cartons:10});
    await operate(db,loader,f.trip.id,'complete-loading');return f;
  };
  const snap=f=>db.trip.findUnique({where:{id:f.trip.id},include:tripInclude});
  const mutation=async(f,type,entity=f.allocations[0],payload={})=>({idempotencyKey:randomUUID(),tripId:f.trip.id,entityId:entity.id,type,payload,occurredAt:new Date().toISOString(),baseVersion:manifestVersion(await snap(f))});
  const pod=()=>({recipient:'Offline Recipient',cartons:10,verified:true,deliveredAt:new Date().toISOString()});
  const sync=(ms,cookie=dc)=>request('/sync',cookie,{mutations:ms});
  const wait=async(b,expression)=>{for(let i=0;i<160;i++){try{if(await b.run(expression))return;}catch{}await b.pause(100);}const state=await b.run("({url:location.href,online:navigator.onLine,ready:typeof identityReady==='undefined'?null:identityReady,owner:typeof fieldOwner==='undefined'?null:fieldOwner,loading:typeof fieldLoading==='undefined'?null:fieldLoading,offline:typeof driverOffline==='undefined'?null:{mode:driverOffline.details().mode,pending:driverOffline.details().pending},text:document.body.textContent.slice(0,350)})").catch(()=>null);throw Error('Timed out: '+expression+'; state='+JSON.stringify(state));};
  let b,multi,replay,conflict,transportOffline=false,startupInterception=null;
  const uiLogin=async id=>{await b.input('#login-id',id);await b.input('#login-password','RelayDemo!26');await b.click('[type="submit"]');await wait(b,`currentAccount()?.email===${JSON.stringify(id.includes('@')?id:id+'@relay.demo')} && !document.querySelector('#login-form') && (currentAccount().role!=='DRIVER'||(!fieldLoading && fieldOwner===currentAccount().id))`);};
  const select=async f=>{await wait(b,`!fieldLoading && fieldTrips.some(t=>t.id===${JSON.stringify(f.trip.id)})`);await b.input('#field-trip',f.trip.id,'change');await wait(b,`selectedFieldTrip()?.id===${JSON.stringify(f.trip.id)} && driverOffline.selectedTrip()===${JSON.stringify(f.trip.id)}`);};
  const network=async offline=>{
    transportOffline=offline;
    await b.send('Network.enable');
    // Chrome can transiently restore reachability while replacing a renderer
    // during about:blank -> app navigation. Keep API transport blocked through
    // that transition as well as emulating the device's offline network state.
    await b.send('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:offline?0:-1,uploadThroughput:offline?0:-1});await wait(b,`navigator.onLine===${!offline}`);
  };
  // Page.reload returns before the old execution context disappears. Never let
  // a satisfied predicate in that old document stand in for restored state.
  const reload=async()=>{const token=randomUUID();await b.run(`window.reloadMarker=${JSON.stringify(token)}`);await b.send('Page.reload');await wait(b,`window.reloadMarker!==${JSON.stringify(token)} && typeof identityReady!=='undefined' && identityReady`);};
  const arrival=async()=>{await b.click('[data-action="arrived"]');await wait(b,'!fieldBusy && nextDelivery()?.arrived');};
  const proof=async()=>{const id=await b.run('nextDelivery().id');await b.click('[data-action="verify-delivery"]');await b.input('#recipient','Offline Recipient');await b.click('#verified');await b.click('[data-action="delivered"]');await wait(b,`!fieldBusy && fieldOrders.find(o=>o.id===${JSON.stringify(id)})?.proof`);};

  await t.test('Sync rejects unauthenticated, wrong-role, forged identity, unassigned and invalid lifecycle actions',async()=>{
    const f=await fixture(),m=await mutation(f,'ARRIVAL');
    assert.equal((await sync([m],null)).status,401);
    for(const c of [lc,sc,pc])assert.equal((await sync([m],c)).status,403);
    assert.equal((await sync([{...m,userId:driver.id}])).status,400);
    assert.equal((await sync([{...m,payload:{driverId:driver.id}}])).data.results[0].state,'NEEDS_ATTENTION');
    assert.equal((await sync([m])).data.results[0].state,'NEEDS_ATTENTION');
    await db.trip.update({where:{id:f.trip.id},data:{driverId:null}});
    assert.equal((await sync([m])).data.results[0].code,'NOT_ASSIGNED');
    assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id}}),0);
  });
  await t.test('Ordered partial batches, manifest conflicts and durable duplicate acknowledgements reuse Stage 7 transactions',async()=>{
    const f=await fixture(),g=await fixture();await operate(db,driver,f.trip.id,'start');await operate(db,driver,g.trip.id,'start');
    const arrive=await mutation(f,'ARRIVAL'),invalid=await mutation(g,'DELIVERY_COMPLETE',g.allocations[0],pod()),dependent=await mutation(g,'ARRIVAL');
    const response=await sync([arrive,invalid,dependent]);assert.equal(response.status,200);
    assert.deepEqual(response.data.results.map(r=>r.state),['ACKNOWLEDGED','NEEDS_ATTENTION','NEEDS_ATTENTION']);assert.equal(response.data.results[2].code,'DEPENDENCY_BLOCKED');
    assert.deepEqual((await sync([arrive])).data.results[0],response.data.results[0]);
    const mismatch=await mutation(g,'ARRIVAL');await db.orderItem.updateMany({where:{orderId:g.orders[0].id},data:{cartons:12}});
    assert.equal((await sync([mismatch])).data.results[0].code,'MANIFEST_CHANGED');
    const complete=await mutation(f,'DELIVERY_COMPLETE',f.allocations[0],pod());
    const first=(await sync([complete])).data.results[0];assert.equal(first.state,'ACKNOWLEDGED');assert.deepEqual((await sync([complete])).data.results[0],first);
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:f.allocations[0].id}}),1);assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id,type:'ARRIVED'}}),1);
    assert.equal((await sync([{...complete,payload:{...complete.payload,recipient:'Someone else'}}])).data.results[0].code,'ACTION_KEY_REUSED');
    const receipt=await db.syncMutation.findUnique({where:{deviceId_clientMutationId:{deviceId:'stage7-online',clientMutationId:complete.idempotencyKey}}});assert.equal(receipt.clientOccurredAt.toISOString(),complete.occurredAt);assert.ok(receipt.receivedAt&&receipt.appliedAt);
  });
  await t.test('new exception mutation is never falsely acknowledged when another exception is open',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');
    const first=await mutation(f,'DELIVERY_EXCEPTION',f.allocations[0],{type:'STORE_CLOSED',details:'Issue A'});
    const ack=(await sync([first])).data.results[0];assert.equal(ack.state,'ACKNOWLEDGED');
    assert.equal((await db.deliveryException.findUnique({where:{id:first.idempotencyKey}})).details,'Issue A');
    const second=await mutation(f,'DELIVERY_EXCEPTION',f.allocations[0],{type:'ACCESS_DELAYED',details:'Issue B'});
    const events=await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id}}),history=await db.orderStatusEvent.count({where:{orderId:f.orders[0].id}});
    const conflict=(await sync([second])).data.results[0];assert.equal(conflict.state,'NEEDS_ATTENTION');assert.equal(conflict.code,'EXCEPTION_ALREADY_OPEN');
    assert.equal(await db.syncMutation.count({where:{clientMutationId:second.idempotencyKey}}),0);
    assert.deepEqual((await sync([first])).data.results[0],ack);
    assert.equal(await db.deliveryException.count({where:{allocationId:f.allocations[0].id}}),1);
    assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id}}),events);
    assert.equal(await db.orderStatusEvent.count({where:{orderId:f.orders[0].id}}),history);
  });
  await t.test('stale queued resolution cannot resolve a newer exception',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');const a=f.allocations[0];
    const e1=await mutation(f,'DELIVERY_EXCEPTION',a,{type:'STORE_CLOSED',details:'Original E1'});await sync([e1]);
    const r1=await mutation(f,'EXCEPTION_RESOLUTION',a,{exceptionId:e1.idempotencyKey,resolution:'Offline intent for E1'});
    const accepted=await mutation(f,'EXCEPTION_RESOLUTION',a,{exceptionId:e1.idempotencyKey,resolution:'Online E1 resolution'});
    const original=(await sync([accepted])).data.results[0];assert.equal(original.state,'ACKNOWLEDGED');
    const e2=await mutation(f,'DELIVERY_EXCEPTION',a,{type:'DAMAGED_GOODS',details:'New E2'});await sync([e2]);
    const before=await db.deliveryEvent.count({where:{allocationId:a.id}});
    for(const attempt of [r1,r1,{...r1,idempotencyKey:randomUUID(),payload:{resolution:'Missing target'}},{...r1,idempotencyKey:randomUUID(),payload:{exceptionId:randomUUID(),resolution:'Wrong entity'}}]){
      const result=(await sync([attempt])).data.results[0];assert.equal(result.state,'NEEDS_ATTENTION');assert.ok(['STALE_EXCEPTION_TARGET','EXCEPTION_TARGET_REQUIRED'].includes(result.code));
    }
    assert.deepEqual((await sync([accepted])).data.results[0],original,'Delayed exact accepted retry replays, without touching E2');
    assert.equal((await db.deliveryException.findUnique({where:{id:e2.idempotencyKey}})).status,'OPEN');
    assert.equal((await db.deliveryException.findUnique({where:{id:e1.idempotencyKey}})).resolution,'Online E1 resolution');
    assert.equal(await db.deliveryEvent.count({where:{allocationId:a.id}}),before);
    const r2=await mutation(f,'EXCEPTION_RESOLUTION',a,{exceptionId:e2.idempotencyKey,resolution:'Resolve E2 explicitly'});
    assert.equal((await sync([r2])).data.results[0].state,'ACKNOWLEDGED');
    assert.equal((await db.deliveryException.findUnique({where:{id:e2.idempotencyKey}})).status,'RESOLVED');
    const e3=await mutation(f,'DELIVERY_EXCEPTION',a,{type:'ACCESS_DELAYED',details:'Genuinely new E3'});
    assert.equal((await sync([e3])).data.results[0].state,'ACKNOWLEDGED');assert.equal(await db.deliveryException.count({where:{allocationId:a.id}}),3);
  });
  await t.test('Built Service Worker caches only the shell and removes obsolete versioned caches on update',async()=>{
    multi=await fixture(['OUT004','OUT005','OUT011']);
    b=await require('./cdp').connect({isolated:true});browsers.push(b);
    b.on('Fetch.requestPaused',p=>{(async()=>{
      if(startupInterception&&p.request.url.endsWith(startupInterception.endpoint)){startupInterception.intercepted=true;await network(true);}
      await b.send(transportOffline?'Fetch.failRequest':'Fetch.continueRequest',{requestId:p.requestId,...(transportOffline?{errorReason:'InternetDisconnected'}:{})});
    })().catch(e=>b.errors.push(e.message));});
    await b.send('Fetch.enable',{patterns:[{urlPattern:base+'/api/*',requestStage:'Request'}]});
    await b.send('Page.navigate',{url:base});await wait(b,'identityReady');await uiLogin('driver');await select(multi);
    await wait(b,'navigator.serviceWorker.controller && driverOffline.details().shellReady');
    await b.run("caches.open('relay-shell-obsolete').then(c=>c.put('/obsolete',new Response('old')))");swRevision++;
    await b.run('navigator.serviceWorker.getRegistration().then(r=>r.update())');await wait(b,"caches.keys().then(keys=>!keys.includes('relay-shell-obsolete'))");
    const paths=await b.run("(async()=>{const result=[];for(const k of await caches.keys())for(const r of await (await caches.open(k)).keys())result.push(new URL(r.url).pathname);return result;})()");
    assert.ok(paths.includes('/index.html'));assert.ok(paths.includes('/assets/dexie.js'));assert.ok(paths.every(p=>p==='/index.html'||p.startsWith('/assets/')||p.startsWith('/src/scripts/')));
    for(const path of ['/api/auth/me','/api/operations/trips','/data/General%20Data/outlets.csv'])assert.equal(await b.run(`caches.match(${JSON.stringify(path)}).then(r=>!!r)`),false);
    await b.click('[data-action="start-route"]');await wait(b,"!fieldBusy && selectedFieldTrip().status==='IN_PROGRESS'");
  });
  await t.test('CDP network offline reload preserves assigned trip, exceptions, ordered arrivals/POD and pending work at 360/390/430',async()=>{
    const sentBefore=syncRequests;
    await network(true);await reload();await wait(b,"currentAccount()?.role==='DRIVER' && fieldTrips.length>0 && !fieldLoading");
    assert.equal(await b.run('selectedFieldTrip().id'),multi.trip.id);assert.equal(await b.run('navigator.onLine'),false);
    assert.equal(await b.run('selectedFieldTrip().stops.length'),3);
    for(const width of [360,390,430]){await b.viewport(width);assert.equal(await b.run('document.documentElement.scrollWidth<=innerWidth+1'),true);assert.ok((await b.run('document.body.textContent')).includes('Offline'));assert.ok(await b.run("!!document.querySelector('[data-action=arrived]')"));}
    await b.click('[data-action="issue"]');await b.input('#issue-note','Receiving desk closed offline');await b.click('[data-action="save-issue"]');await wait(b,'!fieldBusy && nextDelivery()?.position===2');
    await arrival();await proof();await arrival();await proof();
    await b.click(`[data-action="retry-stop"][data-id="${multi.allocations[0].id}"]`);await b.input('#resolution','Receiving desk reopened');await b.click('[data-action="resolved"]');await wait(b,'!fieldBusy && nextDelivery()?.returnRequested');await arrival();await proof();
    replay=await b.run('driverOffline.details().entries');assert.deepEqual(replay.map(m=>m.type),['DELIVERY_EXCEPTION','ARRIVAL','DELIVERY_COMPLETE','ARRIVAL','DELIVERY_COMPLETE','EXCEPTION_RESOLUTION','ARRIVAL','DELIVERY_COMPLETE']);
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:{in:multi.allocations.map(a=>a.id)}}}),0);
    await reload();await wait(b,'!fieldLoading && driverOffline.details().pending===8 && fieldTrips.length>0');
    assert.deepEqual((await b.run('driverOffline.details().entries')).map(m=>m.id),replay.map(m=>m.id));assert.equal(await b.run('selectedFieldTrip().id'),multi.trip.id);assert.ok((await b.run('document.body.textContent')).includes('Pending sync'));
    await b.send('Page.navigate',{url:'about:blank'});await wait(b,"location.href==='about:blank'");await b.send('Page.navigate',{url:base});await wait(b,'identityReady && !fieldLoading && fieldTrips.length>0 && driverOffline.details().pending===8');
    assert.deepEqual((await b.run('driverOffline.details().entries')).map(m=>m.id),replay.map(m=>m.id));assert.equal(await b.run('selectedFieldTrip().id'),multi.trip.id);
    assert.equal(syncRequests,sentBefore,'No mutation request may escape real CDP offline transport across application reopening');
    await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait(b,"document.querySelector('#toast').textContent.includes('Nothing has been discarded')");assert.equal(await b.run('currentAccount().id'),driver.id);assert.equal(await b.run('driverOffline.details().pending'),8);await b.click('[data-action="close"]');
    await b.screenshot('stage08-offline-pending-430');
  });
  await t.test('Reconnect acknowledges in order, refreshes PostgreSQL truth and continues Store receipt and Dispatcher state',async()=>{
    await network(false);await wait(b,"driverOffline.details().pending===0 && selectedFieldTrip()?.status==='COMPLETED' && driverOffline.details().mode==='Synced'");
    assert.equal((await snap(multi)).status,'COMPLETED');assert.equal(await db.proofOfDelivery.count({where:{allocationId:{in:multi.allocations.map(a=>a.id)}}}),3);
    const messages=replay.map(({idempotencyKey,tripId,entityId,type,occurredAt,baseVersion,payload})=>({idempotencyKey,tripId,entityId,type,occurredAt,baseVersion,payload}));
    const repeated=await sync(messages);assert.ok(repeated.data.results.every(r=>r.state==='ACKNOWLEDGED'));assert.equal(await db.deliveryException.count({where:{allocationId:multi.allocations[0].id}}),1);
    const allocation=multi.allocations[0];assert.equal((await request(`/operations/trips/${multi.trip.id}/allocations/${allocation.id}/receipt`,sc,{cartons:10})).status,200);
    const order=(await request('/orders/'+allocation.orderId,sc)).data.order;assert.equal(order.status,'RECEIVED');assert.deepEqual(order.history.map(h=>h.status),['CONFIRMED','PLANNED','IN_DELIVERY','DELIVERED','RECEIVED']);
    assert.equal((await request('/planning/day/2024-05-07',pc)).data.trips.find(t=>t.id===multi.trip.id).status,'COMPLETED');
    assert.ok((await b.run('document.body.textContent')).includes('Synced'));assert.deepEqual(b.errors,[]);
  });
  await t.test('offline startup network failure preserves previously authorized cached access',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');await b.click('[data-action="field-refresh"]');await select(f);
    const stored=()=>b.run("(async()=>{const d=new Dexie('relay-driver-v1');d.version(1).stores({vaults:'&userId',access:'&id'});const a=await d.access.get('active');d.close();return a?.user.id;})()");
    assert.equal(await stored(),driver.id);
    for(const endpoint of ['/api/driver/offline-access','/api/auth/me']){
      startupInterception={endpoint,intercepted:false};
      await reload();await wait(b,"!fieldLoading && fieldOwner===currentAccount()?.id && driverOffline.details().mode==='Offline'");
      assert.ok(startupInterception.intercepted);startupInterception=null;
      assert.equal(await stored(),driver.id);assert.equal(await b.run('selectedFieldTrip().id'),f.trip.id);
      if(endpoint.endsWith('offline-access'))await arrival();
      const ids=await b.run('driverOffline.details().entries.map(m=>m.id)');
      await reload();await wait(b,'!fieldLoading && fieldOwner===currentAccount()?.id');
      assert.deepEqual(await b.run('driverOffline.details().entries.map(m=>m.id)'),ids);assert.equal(await stored(),driver.id);
      await network(false);await wait(b,"driverOffline.details().pending===0 && driverOffline.details().mode==='Synced'");
    }
    assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id,type:'ARRIVED'}}),1);assert.deepEqual(b.errors,[]);
  });
  await t.test('outbox removes only exact authoritatively acknowledged mutations and blocks dependent actions',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');await b.click('[data-action="field-refresh"]');await select(f);
    await network(true);
    await b.run("driverOffline.mutate(selectedFieldTrip(),fieldOrders[0],'exception',{type:'STORE_CLOSED',details:'Offline B'})");await b.run('loadFieldTrips()');
    await b.run("driverOffline.mutate(selectedFieldTrip(),fieldOrders[0],'resolve',{resolution:'Resolve offline B'})");await b.run('loadFieldTrips()');await arrival();await proof();
    const queued=await b.run('driverOffline.details().entries'),ids=queued.map(m=>m.id);assert.equal(ids.length,4);assert.equal(queued[1].payload.exceptionId,ids[0]);
    const existing=await mutation(f,'DELIVERY_EXCEPTION',f.allocations[0],{type:'ACCESS_DELAYED',details:'Server A'});await sync([existing]);
    await network(false);await wait(b,"driverOffline.details().entries[0]?.state==='NEEDS_ATTENTION'");
    assert.deepEqual(await b.run('driverOffline.details().entries.map(m=>m.id)'),ids);
    assert.equal(await b.run('driverOffline.details().entries[0].lastError.code'),'EXCEPTION_ALREADY_OPEN');
    assert.equal(await db.syncMutation.count({where:{clientMutationId:{in:ids}}}),0);assert.equal(await db.proofOfDelivery.count({where:{allocationId:f.allocations[0].id}}),0);
    assert.ok(!(await b.run('driverOffline.details().mode')).includes('Synced'));
    await operate(db,driver,f.trip.id,'resolve',f.allocations[0].id,{exceptionId:existing.idempotencyKey,resolution:'Server A corrected'});
    await b.run('driverOffline.synchronize(true)');assert.equal(await b.run('driverOffline.details().pending'),0);
    assert.equal(await db.syncMutation.count({where:{clientMutationId:{in:ids}}}),4);assert.equal(await db.deliveryException.count({where:{allocationId:f.allocations[0].id}}),2);
    assert.equal((await snap(f)).status,'COMPLETED');
  });
  await t.test('lost responses for exception, resolution, arrival and POD replay stable acknowledgements',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');await b.click('[data-action="field-refresh"]');await select(f);
    const counts=async()=>({events:await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id}}),exceptions:await db.deliveryException.count({where:{allocationId:f.allocations[0].id}}),proofs:await db.proofOfDelivery.count({where:{allocationId:f.allocations[0].id}}),history:await db.orderStatusEvent.count({where:{orderId:f.orders[0].id}})});
    for(const [action,payload] of [['exception',{type:'STORE_CLOSED',details:'Lost response issue'}],['resolve',{resolution:'Receiving desk reopened'}],['arrive',{}],['pod',pod()]]){
      await b.run("window.savedFetch=window.fetch;window.lostAcks=[];window.fetch=async(...args)=>{const r=await savedFetch(...args);if(args[0]==='/api/sync'){lostAcks.push(await r.clone().json());throw new TypeError('Committed response lost');}return r;}");
      await b.run(`driverOffline.mutate(selectedFieldTrip(),fieldOrders[0],${JSON.stringify(action)},${JSON.stringify(payload)})`);
      const entry=(await b.run('driverOffline.details().entries')).find(m=>m.tripId===f.trip.id);assert.ok(entry);const before=await counts();
      const ack=await b.run('lostAcks[0].results[0]');assert.equal(ack.state,'ACKNOWLEDGED');
      const message=Object.fromEntries(['idempotencyKey','tripId','entityId','type','occurredAt','baseVersion','payload'].map(k=>[k,entry[k]]));
      assert.deepEqual((await sync([message])).data.results[0],ack);
      // A mismatched response must not remove the exact queued action.
      await b.run("window.fetch=async(...args)=>{const r=await savedFetch(...args);if(args[0]!=='/api/sync')return r;const value=await r.json();value.results[0].acknowledgement.actionId=crypto.randomUUID();return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});}");
      await b.run('driverOffline.synchronize()');assert.ok((await b.run('driverOffline.details().entries')).some(m=>m.id===entry.id));
      await b.run('window.fetch=window.savedFetch;driverOffline.synchronize()');
      assert.ok(!(await b.run('driverOffline.details().entries')).some(m=>m.id===entry.id));assert.deepEqual(await counts(),before);
    }
    assert.deepEqual(await counts(),{events:5,exceptions:1,proofs:1,history:4});assert.deepEqual(b.errors,[]);
  });
  await t.test('A lost acknowledgement keeps the action until retry and cannot duplicate an accepted event',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');await b.click('[data-action="field-refresh"]');await select(f);
    await b.run("window.originalFieldFetch=window.fetch;window.fetch=async(...args)=>{const r=await originalFieldFetch(...args);if(args[0]==='/api/sync')throw new TypeError('Test response loss');return r;}");
    await arrival();assert.equal(await b.run('driverOffline.details().pending'),1);assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id,type:'ARRIVED'}}),1);
    await b.run('window.fetch=window.originalFieldFetch');await b.click('[data-action="driver-sync"]');await wait(b,'driverOffline.details().pending===0');assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id,type:'ARRIVED'}}),1);
  });
  await t.test('Reassignment conflict stays visible, retains dependent actions and never reports all synced',async()=>{
    conflict=await fixture();await operate(db,driver,conflict.trip.id,'start');await b.click('[data-action="field-refresh"]');await select(conflict);
    await network(true);await arrival();await proof();await db.trip.update({where:{id:conflict.trip.id},data:{driverId:null}});
    await network(false);await wait(b,"driverOffline.details().entries.some(m=>m.state==='NEEDS_ATTENTION') && driverOffline.details().mode==='Needs attention' && document.body.textContent.includes('Needs attention')");assert.equal(await b.run('driverOffline.details().pending'),2);assert.ok((await b.run('document.body.textContent')).includes('Needs attention'));
    assert.equal(await db.proofOfDelivery.count({where:{allocationId:conflict.allocations[0].id}}),0);
  });
  await t.test('authoritative 401 locks sync without deleting pending field work; different Driver cannot use preserved offline access grant',async()=>{
    const originalIds=await b.run('driverOffline.details().entries.map(m=>m.id)');
    await b.run("authRequest('logout',{})");const sentBefore=syncRequests;await reload();await wait(b,"!!document.querySelector('#login-form')");
    assert.equal(syncRequests,sentBefore,'401 startup cannot submit field mutations');assert.equal(await b.run('currentAccount()'),null);
    assert.equal(await b.run('driverOffline.details().pending'),0);
    const atRest=await b.run("(async()=>{const d=new Dexie('relay-driver-v1');d.version(1).stores({vaults:'&userId',access:'&id'});const rows=await d.vaults.toArray();const active=await d.access.get('active');d.close();return {rows,active};})()");assert.equal(atRest.active,undefined);assert.ok(atRest.rows.every(r=>r.ciphertext&&!JSON.stringify(r).includes('Offline Recipient')));
    await uiLogin('store');assert.deepEqual(await b.run('driverOffline.views()'),[]);assert.equal(await b.run('driverOffline.details().entries.length'),0);
    assert.equal((await request('/driver/offline-access',sc)).status,403);
    await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait(b,"!!document.querySelector('#login-form')");
    const other=await db.user.create({data:{id:randomUUID(),email:`offline-${randomUUID()}@relay.demo`,displayName:'Other Driver',role:'DRIVER',passwordHash:driver.passwordHash}});users.push(other.id);
    await uiLogin(other.email);await wait(b,'!fieldLoading && fieldOwner===currentAccount()?.id');assert.deepEqual(await b.run('driverOffline.views()'),[]);assert.equal(await b.run('driverOffline.details().pending'),0);
    assert.equal(await b.run(`(async()=>{const d=new Dexie('relay-driver-v1');d.version(1).stores({vaults:'&userId',access:'&id'});const row=await d.vaults.get(${JSON.stringify(driver.id)}),grant=await d.access.get('active');d.close();const key=await crypto.subtle.importKey('raw',new Uint8Array(grant.key.match(/../g).map(x=>parseInt(x,16))),'AES-GCM',false,['decrypt']);try{await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(row.iv),additionalData:new TextEncoder().encode(row.userId)},key,new Uint8Array(row.ciphertext));return false;}catch{return true;}})()`),true,'Another Driver cannot decrypt the retained vault');
    const otherCookie=await login(other.email),ownKey=(await request('/driver/offline-access',dc)).data.key,otherKey=(await request('/driver/offline-access',otherCookie)).data.key;assert.notEqual(ownKey,otherKey);
    const denied=await sync([await mutation(conflict,'ARRIVAL')],otherCookie);assert.equal(denied.data.results[0].code,'NOT_ASSIGNED');
    await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait(b,"!!document.querySelector('#login-form')");await uiLogin('driver');await wait(b,'driverOffline.details().pending===2');assert.deepEqual(await b.run('driverOffline.details().entries.map(m=>m.id)'),originalIds);
    await db.trip.update({where:{id:conflict.trip.id},data:{driverId:driver.id}});await b.click('[data-action="driver-sync"]');await wait(b,'driverOffline.details().pending===0');assert.equal((await snap(conflict)).status,'COMPLETED');
    await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait(b,"!!document.querySelector('#login-form')");
    const remaining=await b.run("(async()=>{const d=new Dexie('relay-driver-v1');d.version(1).stores({vaults:'&userId',access:'&id'});const n=await d.vaults.count();d.close();return n;})()");assert.equal(remaining,0);assert.deepEqual(b.errors,[]);
  });
  await t.test('An action saved during logout is retained encrypted rather than deleted by the logout race',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');await uiLogin('driver');await select(f);
    await b.run("window.logoutRaceFetch=window.fetch;window.fetch=async(...args)=>{if(args[0]==='/api/sync')throw new TypeError('Test lost connection');if(args[0]==='/api/auth/logout'){await driverOffline.mutate(selectedFieldTrip(),fieldOrders[0],'arrive',{});}return logoutRaceFetch(...args);}");
    await b.click('[data-action="account"]');await b.click('[data-action="sign-out"]');await wait(b,"!!document.querySelector('#login-form')");
    assert.ok((await b.run('document.body.textContent')).includes('retained securely'));
    await b.run('window.fetch=window.logoutRaceFetch');await uiLogin('driver');await wait(b,'driverOffline.details().pending===0 && !fieldLoading');
    assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id,type:'ARRIVED'}}),1);assert.deepEqual(b.errors,[]);
  });
  await t.test('session checks started during logout cannot restore the old identity',async()=>{
    await b.run("window.boundaryFetch=window.fetch;window.meHeld=false;window.lateGrantRequests=0;window.fetch=async(...args)=>{if(args[0]==='/api/auth/logout')await new Promise(r=>window.releaseLogout=r);const response=await boundaryFetch(...args);if(args[0]==='/api/auth/me'&&!meHeld){meHeld=true;await new Promise(r=>window.releaseMe=r);}if(args[0]==='/api/driver/offline-access')lateGrantRequests++;return response;};window.logoutTask=signOut();void 0");
    await wait(b,"typeof releaseLogout==='function'");
    await b.run('window.identityTask=refreshIdentity();void 0');await wait(b,'meHeld');
    await b.run('releaseLogout();logoutTask');assert.equal(await b.run('currentAccount()'),null);
    await b.run('releaseMe();identityTask');assert.equal(await b.run('currentAccount()'),null);
    assert.equal(await b.run('lateGrantRequests'),0,'The obsolete identity response must be rejected before offline activation');
    await b.run('window.fetch=window.boundaryFetch');await uiLogin('driver');assert.deepEqual(b.errors,[]);
  });
  await t.test('stale resolution stays in the outbox and never mutates a newer exception',async()=>{
    const f=await fixture();await operate(db,driver,f.trip.id,'start');
    const e1=await mutation(f,'DELIVERY_EXCEPTION',f.allocations[0],{type:'STORE_CLOSED',details:'E1 for local cache'});await sync([e1]);
    await b.click('[data-action="field-refresh"]');await select(f);await network(true);
    await b.run("driverOffline.mutate(selectedFieldTrip(),fieldOrders[0],'resolve',{resolution:'Queued E1 resolution'})");
    const ids=await b.run('driverOffline.details().entries.map(m=>m.id)');
    await operate(db,driver,f.trip.id,'resolve',f.allocations[0].id,{exceptionId:e1.idempotencyKey,resolution:'Resolved elsewhere'});
    const e2=await mutation(f,'DELIVERY_EXCEPTION',f.allocations[0],{type:'ACCESS_DELAYED',details:'New E2'});await sync([e2]);
    const events=await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id}});
    await network(false);await wait(b,"driverOffline.details().entries[0]?.lastError?.code==='STALE_EXCEPTION_TARGET'");
    assert.deepEqual(await b.run('driverOffline.details().entries.map(m=>m.id)'),ids);
    assert.equal((await db.deliveryException.findUnique({where:{id:e2.idempotencyKey}})).status,'OPEN');
    assert.equal(await db.deliveryEvent.count({where:{allocationId:f.allocations[0].id}}),events);
  });
});
