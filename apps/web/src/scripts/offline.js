/* Durable Driver working copy. Projection is provisional UI, never authorization.
 * The only authoritative mutation rules remain in the Stage 7 server service. */
const driverOffline=(()=>{
  const db=new Dexie('relay-driver-v1');
  db.version(1).stores({vaults:'&userId',access:'&id'});
  const types={arrive:'ARRIVAL',exception:'DELIVERY_EXCEPTION',resolve:'EXCEPTION_RESOLUTION',pod:'DELIVERY_COMPLETE'};
  let access=null,data={trips:[],outbox:[],sequence:0},mode='Online',syncing=null,epoch=0,shellReady=false;
  const empty=()=>({trips:[],outbox:[],sequence:0,lastRefresh:null});
  const active=()=>access&&currentAccount()?.id===access.user.id&&currentAccount()?.role==='DRIVER';
  const bytes=hex=>new Uint8Array(hex.match(/../g).map(x=>parseInt(x,16)));
  const keyFor=grant=>crypto.subtle.importKey('raw',bytes(grant.key),'AES-GCM',false,['encrypt','decrypt']);
  async function decode(row,grant){
    if(!row)return empty();
    const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(row.iv),additionalData:new TextEncoder().encode(grant.user.id)},await keyFor(grant),new Uint8Array(row.ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  async function encode(value,grant){
    const iv=crypto.getRandomValues(new Uint8Array(12));
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(grant.user.id)},await keyFor(grant),new TextEncoder().encode(JSON.stringify(value)));
    return {userId:grant.user.id,iv:[...iv],ciphertext:[...new Uint8Array(encrypted)]};
  }
  async function change(fn){
    const grant=access,token=epoch;if(!grant)throw Error('Sign in again to access saved field work.');
    const updated=await db.transaction('rw',db.vaults,db.access,async()=>{
      const current=await db.access.get('active');
      if(current?.user.id!==grant.user.id||current.key!==grant.key)throw Error('Your account changed. Sign in again.');
      const value=await Dexie.waitFor(decode(await db.vaults.get(grant.user.id),grant));
      fn(value);await db.vaults.put(await Dexie.waitFor(encode(value,grant)));return value;
    });
    if(epoch===token)data=updated;
    return updated;
  }
  async function request(path,options={}){
    if(!navigator.onLine)throw new TypeError('Offline');
    const response=await fetch(path,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000),...options});
    const value=await response.json();
    if(!response.ok){const e=Error(value.error?.message||value.error||'Request unavailable');e.status=response.status;throw e;}
    return value;
  }
  const pick=(value,keys)=>Object.fromEntries(keys.filter(k=>value?.[k]!==undefined).map(k=>[k,value[k]]));
  // Explicit minimization: no user emails, hashes, full fleet capacity, planning
  // metrics, unrelated order history, or other roles' records in the field vault.
  function snapshot(t){return {...pick(t,['id','tripNumber','vehicleId','status','deliveryDate','plannedDepartureAt','baseVersion']),
    depot:pick(t.depot,['name']),vehicle:pick(t.vehicle,['temperature']),driver:pick(t.driver,['displayName']),
    stops:t.stops.map(s=>({...pick(s,['id','position','outletId','status','expectedAt','arrivedAt']),outlet:pick(s.outlet,['brand','district']),
      allocations:s.allocations.map(a=>({...pick(a,['id','orderId','tripStopId']),order:{...pick(a.order,['orderNumber','windowOpenTime','windowCloseTime']),items:a.order.items.map(i=>pick(i,['productCode','description','cartons','unitWeightKg','unitVolumeM3']))},
        loadingCheck:pick(a.loadingCheck,['status','loadedCartons']),loadingIssues:[],exceptions:a.exceptions.map(e=>pick(e,['id','type','details','status','resolution'])),events:a.events.map(e=>pick(e,['type'])),proof:a.proof?{...pick(a.proof,['recipient','deliveredCartons','deliveredAt','verified']),receipt:a.proof.receipt?{confirmedAt:a.proof.receipt.confirmedAt}:null}:null}))}))};}
  function views(){
    if(!active())return [];
    const trips=structuredClone(data.trips);
    const blocked=new Set(data.outbox.filter(m=>m.state==='NEEDS_ATTENTION').map(m=>m.tripId));
    for(const m of data.outbox){
      if(blocked.has(m.tripId))continue;
      const t=trips.find(t=>t.id===m.tripId),s=t?.stops.find(s=>s.allocations.some(a=>a.id===m.entityId)),a=s?.allocations.find(a=>a.id===m.entityId);
      if(!a)continue;
      if(m.type==='ARRIVAL')s.status='ARRIVED';
      if(m.type==='DELIVERY_EXCEPTION'){a.exceptions.push({id:m.id,type:m.payload.type,details:m.payload.details,status:'OPEN'});s.status='DEFERRED';}
      if(m.type==='EXCEPTION_RESOLUTION'){
        a.exceptions.forEach(e=>{if(e.id===m.payload.exceptionId&&e.status==='OPEN'){e.status='RESOLVED';e.resolution=m.payload.resolution;}});a.events.push({type:'REATTEMPTED'});
        if(s.allocations.every(x=>!x.exceptions.some(e=>e.status==='OPEN')))s.status='PENDING';
      }
      if(m.type==='DELIVERY_COMPLETE'){a.proof={recipient:m.payload.recipient,deliveredCartons:m.payload.cartons,verified:true,deliveredAt:m.payload.deliveredAt,pending:true};if(s.allocations.every(x=>x.proof))s.status='COMPLETED';}
      t.pending=true;
    }
    return trips;
  }
  async function lock(){epoch++;access=null;data=empty();mode='Needs attention';await db.access.delete('active');}
  async function activate(user){
    if(window.relayHistoricalFieldTest&&window.relayDevTools)return;
    if(user.role!=='DRIVER'){await lock();return;}
    const previous=access||await db.access.get('active');
    if(previous&&previous.user.id!==user.id)await lock();
    const token=epoch;
    const grant=await request('/api/driver/offline-access');
    if(token!==epoch)return;
    const next={id:'active',user:pick(user,['id','displayName','role','email']),key:grant.key,authorizedAt:Date.now()};
    if(grant.userId!==user.id)throw Error('Account mismatch. Please sign in again.');
    const saved=await decode(await db.vaults.get(user.id),next);
    await db.access.put(next);access=next;data=saved;mode='Online';
  }
  async function restore(){
    const grant=await db.access.get('active');
    if(!grant||grant.user.role!=='DRIVER'||Date.now()-grant.authorizedAt>8*60*60*1000)return null;
    access=grant;data=await decode(await db.vaults.get(grant.user.id),grant);mode='Offline';
    return grant.user;
  }
  async function expired(){await lock();authenticatedUser=null;resetFieldData();identityReady=true;sessionNotice='Sign in again to synchronize saved field work. Your pending deliveries are retained securely.';closeDialog();render();}
  async function pull(){
    const owner=access?.user.id,token=epoch;
    const response=await request('/api/operations/trips');
    if(token!==epoch||!active()||access.user.id!==owner)return;
    await change(value=>{value.trips=response.trips.map(snapshot);value.lastRefresh=new Date().toISOString();});mode='Online';
  }
  async function synchronize(retry=false){
    if(syncing)return syncing;
    if(!active())return;
    const owner=access.user.id,token=epoch;
    const work=async()=>{
      if(!active()||epoch!==token)return;
      mode='Syncing';render();
      try {
        const {user}=await request('/api/auth/me');
        if(user.id!==owner||user.role!=='DRIVER'){await expired();return;}
        if(epoch!==token)return;
        await change(value=>{if(retry)value.outbox.forEach(m=>{m.state='PENDING';m.lastError=null;});});
        const blocked=new Set();
        for(const m of [...data.outbox].sort((a,b)=>a.sequence-b.sequence)){
          if(epoch!==token||!active())return;
          if(blocked.has(m.tripId))continue;
          if(m.state==='NEEDS_ATTENTION'){blocked.add(m.tripId);continue;}
          const response=await request('/api/sync',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mutations:[pick(m,['idempotencyKey','tripId','entityId','type','occurredAt','baseVersion','payload'])]})});
          if(epoch!==token||!active())return;
          const ack=response.results.find(r=>r.idempotencyKey===m.idempotencyKey);
          if(!ack||(ack.state==='ACKNOWLEDGED'&&(!ack.acknowledgement?.ok||ack.acknowledgement.actionId!==m.idempotencyKey)))throw Error('No exact acknowledgement received. Retry when connected.');
          await change(value=>{
            if(ack.state==='ACKNOWLEDGED')value.outbox=value.outbox.filter(q=>q.id!==m.id);
            else {const q=value.outbox.find(q=>q.id===m.id);if(q){q.state=ack.state;q.lastError={code:ack.code,message:ack.message};}}
            value.trips=value.trips.filter(t=>t.id!==m.tripId).concat(response.trips.map(snapshot));
          });
          if(ack.state!=='ACKNOWLEDGED')blocked.add(m.tripId);
        }
        await pull();
        mode=data.outbox.length?'Needs attention':'Synced';
      }catch(e){if(epoch!==token)return;if(e.status===401||e.status===403){await expired();return;}mode=e.status&&e.status<500?'Needs attention':'Offline';}
      finally{if(epoch===token&&active()){fieldTrips=views();fieldOwner=owner;if(!selectedFieldTrip())fieldTripId=fieldTrips.find(t=>t.id===data.selectedTrip)?.id||fieldTrips[0]?.id||'';render();}}
    };
    syncing=(navigator.locks?navigator.locks.request('relay-driver-sync',work):work()).finally(()=>{syncing=null;});
    return syncing;
  }
  async function refresh(){
    if(!active())throw Error('Reconnect and sign in to prepare this device for field work.');
    try{if(data.outbox.length)await synchronize();else await pull();}
    catch(e){if(e.status===401||e.status===403){await expired();throw e;}if(e.status&&e.status<500)throw e;mode='Offline';}
    return {trips:views()};
  }
  async function mutate(trip,allocation,action,payload){
    if(!active()||!types[action])throw Error('This action needs an online connection.');
    if(!allocation)throw Error('Select a delivery first.');
    if(trip.status!=='IN_PROGRESS')throw Error('Start your ready route online before working offline.');
    if(action==='pod'&&(!payload.recipient.trim()||payload.recipient.trim().length<2||!payload.verified||!Number.isInteger(payload.cartons)||payload.cartons!==allocation.cartons||!allocation.arrived))throw Error('Record arrival, verify the expected cartons and enter the recipient. Report any quantity mismatch as a delivery issue.');
    if(action==='exception'&&!payload.details.trim())throw Error('Describe the delivery issue before saving.');
    if(action==='resolve'&&payload.resolution.trim().length<2)throw Error('Describe what changed before retrying.');
    if(action==='resolve'){
      const target=trip.stops.flatMap(s=>s.allocations).find(a=>a.id===allocation.id)?.exceptions.find(e=>e.status==='OPEN');
      if(!target)throw Error('Refresh and select the delivery issue to resolve.');
      payload={...payload,exceptionId:target.id};
    }
    const id=crypto.randomUUID(),when=new Date().toISOString();
    await change(value=>{
      if(value.outbox.some(m=>m.tripId===trip.id&&m.state==='NEEDS_ATTENTION'))throw Error('This trip needs attention. Review saved actions before continuing.');
      value.outbox.push({id,idempotencyKey:id,userId:access.user.id,tripId:trip.id,entityId:allocation.id,type:types[action],occurredAt:when,baseVersion:trip.baseVersion,payload,state:'PENDING',lastError:null,createdAt:when,sequence:++value.sequence});
    });
    mode='Pending sync';
    if(navigator.onLine)await synchronize();
    return {ok:true};
  }
  function banner(){
    if(!active())return '';
    const pending=data.outbox.length,attention=data.outbox.some(m=>m.state==='NEEDS_ATTENTION');
    const label=mode==='Syncing'?'Syncing':attention?'Needs attention':mode==='Offline'?`Offline — ${pending} update${pending===1?'':'s'} waiting to sync`:pending?`${pending} updates pending sync`:data.lastRefresh?'Synced — all updates saved':'Online';
    return `<section class="connection-status ${attention||mode==='Offline'?'needs-attention':''}" aria-label="Connection and saved deliveries" role="status"><div><b>${esc(label)}</b>${shellReady&&data.lastRefresh?'<small>Trip saved for offline use.</small>':''}${attention?`${data.outbox.filter(m=>m.lastError).map(m=>`<p>${esc(m.lastError.message)}</p>`).join('')}<p>Contact dispatch if the issue remains. Saved work is retained.</p>`:''}</div><button class="${pending||attention?'btn':'mini-btn'}" data-action="driver-sync" ${mode==='Syncing'||!navigator.onLine?'disabled':''}>${attention?'Retry sync':'Sync now'}</button></section>`;
  }
  async function maySignOut(){
    if(!active())return true;
    await change(()=>{});
    if(data.outbox.length||syncing){toast('Sync or resolve your saved deliveries before signing out. Nothing has been discarded.');return false;}
    return true;
  }
  async function clear(){
    // A second tab could save after the pre-logout check. Never delete that
    // work: retain its encrypted vault even if server logout already succeeded.
    const grant=access;let retained=false;
    if(grant)await db.transaction('rw',db.vaults,async()=>{
      const value=await Dexie.waitFor(decode(await db.vaults.get(grant.user.id),grant));
      retained=value.outbox.length>0;if(!retained)await db.vaults.delete(grant.user.id);
    });
    await lock();return retained;
  }
  function details(){return active()?{mode,pending:data.outbox.length,entries:structuredClone(data.outbox),lastRefresh:data.lastRefresh,shellReady}:{mode:'Locked',pending:0,entries:[]};}
  async function register(){
    if(!('serviceWorker' in navigator)||!isSecureContext||window.relayDevTools)return;
    try{await navigator.serviceWorker.register('/sw.js',{scope:'/'});await navigator.serviceWorker.ready;shellReady=true;if(active())render();}catch{/* Vite development has no built shell. No false offline-ready claim. */}
  }
  window.addEventListener('offline',()=>{mode='Offline';if(active())render();});
  window.addEventListener('online',()=>{if(active())synchronize();else refreshIdentity();});
  // Cross-tab ownership changes immediately lock the in-memory presentation.
  const channel=typeof BroadcastChannel==='function'?new BroadcastChannel('relay-driver-identity'):null;
  channel?.addEventListener('message',()=>{epoch++;access=null;data=empty();authenticatedUser=null;resetFieldData();render();});
  function notifyIdentity(){channel?.postMessage('changed');}
  window.addEventListener('load',register);
  return {activate,restore,lock,clear,maySignOut,refresh,mutate,synchronize,banner,details,views,notifyIdentity,selectedTrip:()=>active()?data.selectedTrip:null,remember:tripId=>active()?change(value=>{value.selectedTrip=tripId;}):Promise.resolve(),supports:action=>!!types[action],unreachable:()=>mode==='Offline'};
})();
