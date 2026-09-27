// Planning is a local decision-support simulation; route distances are illustrative.
const vehicles = [
  {id:'TRK-214',plate:'WP LY-4821',model:'Tata 407',capacity:1200,driver:'Amal Perera',bay:'03',available:'08:30'},
  {id:'TRK-218',plate:'WP LL-7932',model:'Isuzu Elf',capacity:1500,driver:'Nuwan Jayasinghe',bay:'05',available:'08:45'},
  {id:'VAN-106',plate:'WP PC-3210',model:'Toyota Hiace',capacity:800,driver:'Saman Kumara',bay:'02',available:'08:30'}
];
let dispatchPanel = 'queue', selectedOrderId = 'ORD-2846';
const activeVehicle = () => vehicles.find(v => v.id === state.vehicle) || vehicles[0];
const vehicleForOrder = order => vehicles.find(v => v.id === order.vehicle) || activeVehicle();
const routeEta = index => ['09:25','09:55','10:25','10:55','11:25','11:55'][index] || '12:15';

function dispatchView() {
  const pending = state.orders.filter(o => !o.route), v = activeVehicle(), weight = totalWeight();
  const attention = assigned().filter(o => o.issue).length;
  return `${heading('Sunday, 27 September · Morning operations','Every stop, considered.','A clear route from today’s orders to tomorrow’s full shelves.',`<button class="btn" data-action="manifest">${icon('list')} Manifest</button><button class="btn primary" data-action="confirm-dispatch" ${state.confirmed || state.offline ? 'disabled' : ''}>${icon('check')} ${state.confirmed ? 'Plan released' : 'Confirm plan'}</button>`)}
    ${flow()}${offlineBanner()}
    <section class="dispatch-pulse" aria-label="Dispatch overview">
      <div><span>Awaiting assignment</span><strong>${String(pending.length).padStart(2,'0')} <small>${pending.reduce((sum,o) => sum+o.cartons,0)} cartons</small></strong></div>
      <div><span>Planned on R-07</span><strong>${String(assigned().length).padStart(2,'0')} <small>delivery stops</small></strong></div>
      <div><span>Vehicle capacity</span><strong>${Math.round(weight/v.capacity*100)}<em>%</em> <small>${v.capacity-weight} kg free</small></strong></div>
      <div><span>Needs attention</span><strong class="amber">${String(attention+1).padStart(2,'0')} <small>${attention?'shipment issue'+(attention>1?'s':''):'road advisory'}</small></strong></div>
    </section>
    <div class="dispatch-runbar"><div><span class="eyebrow">TODAY’S RUNS</span><button class="run-active" data-action="active-run"><span class="dot"></span><b>R-07</b> Colombo East <small>09:00</small></button></div><button class="run-preview" data-action="preview-run" data-id="R-12"><b>R-12</b> Colombo North <small>10:30 · Scheduled</small>${icon('chevron')}</button><button class="run-preview" data-action="preview-run" data-id="R-15"><b>R-15</b> City express <small>11:00 · Scheduled</small>${icon('chevron')}</button></div>
    <div class="planning-tabs" role="tablist" aria-label="Planning workspace">${[['queue','Orders',pending.length],['route','Route',assigned().length],['vehicle','Vehicle','']].map(([key,label,count]) => `<button id="plan-tab-${key}" role="tab" aria-selected="${dispatchPanel===key}" aria-controls="planning-${key}" tabindex="${dispatchPanel===key?0:-1}" data-action="planning-panel" data-panel="${key}" class="${dispatchPanel===key?'active':''}">${label} ${count!==''?`<span>${count}</span>`:''}</button>`).join('')}</div>
    <section class="planning" data-panel="${dispatchPanel}" aria-label="Morning planning workspace">
      <aside class="queue" id="planning-queue"><div class="panel-title"><h2>Order queue <span class="badge">${pending.length}</span></h2><span class="live-note"><span class="dot"></span>Local demo</span></div><div class="queue-tools"><label class="search">${icon('search')}<input id="queue-search" value="${esc(queueQuery)}" placeholder="Store name or order ID" aria-label="Search planning queue"></label><div class="queue-filter-row"><span>Unassigned orders</span><select class="filter-select" id="queue-filter" aria-label="Filter planning queue"><option value="all" ${queueFilter==='all'?'selected':''}>All windows</option><option value="priority" ${queueFilter==='priority'?'selected':''}>Before 11:30</option></select></div></div><div class="queue-list" id="queue-list">${queueCards()}</div></aside>
      <div class="route-workspace" id="planning-route"><div class="route-heading"><div><div class="eyebrow">R-07 · Morning run</div><h2>Colombo East</h2><p class="route-caption">Peliyagoda → Rajagiriya → Nugegoda</p></div>${badge(state.ready?'Ready':state.confirmed?'Released':'Draft plan')}</div>${planningMap()}<div class="route-strip"><span><b>${assigned().length}</b> stops</span><span><b>${(18+assigned().length*4.2).toFixed(1)}</b> km est.</span><span><b>${assigned().reduce((sum,o)=>sum+o.cartons,0)}</b> cartons</span></div><div class="route-sequence-label"><span>DELIVERY SEQUENCE</span><span>ETA / WINDOW</span></div><div class="route-list">${routeStops(true)}</div>${!assigned().length?'<div class="empty"><h3>Build your first stop</h3><p>Assign an order from the queue.</p></div>':''}${!state.confirmed?'<button class="route-drop" data-action="planning-panel" data-panel="queue">＋ Add a stop from the order queue</button>':`<div class="notice green">${icon('check')} ${state.ready?'Manifest checked. Ready for the road.':'Released to warehouse. Loading can begin.'}<button class="mini-btn" data-role="${state.ready?'delivery':'loader'}">${state.ready?'Open delivery':'Open warehouse'} →</button></div>`}<div class="route-footer">${icon('clock')} Stop order follows delivery windows. Estimates include a 15-minute road allowance.</div></div>
      <aside class="context" id="planning-vehicle">${vehicleContext()}</aside>
    </section>
    <div class="bottom-note"><span class="row"><span class="dot"></span>${state.confirmed ? `Sent to Bay ${v.bay}` : 'Plan saved on this device'} · ${state.lastSync}</span><span>Route and recommendations are illustrative</span></div>`;
}

function queueCards() {
  const list = state.orders.filter(o => !o.route && `${o.id} ${o.store}`.toLowerCase().includes(queueQuery.toLowerCase()) && (queueFilter !== 'priority' || o.window < '11:00'));
  if (!list.length) return `<div class="empty">${icon(queueQuery?'search':'check')}<h3>${queueQuery || queueFilter!=='all' ? 'No matching orders' : 'Queue is clear'}</h3><p>${queueQuery || queueFilter!=='all' ? 'Try another store or delivery window.' : 'Every order has a place on the route.'}</p>${queueQuery || queueFilter!=='all' ? '<button class="mini-btn" data-action="clear-queue">Clear filters</button>' : '<button class="mini-btn" data-action="planning-panel" data-panel="route">Review your route →</button>'}</div>`;
  return list.map(o => `<article class="order-card ${o.id===selectedOrderId?'selected':''}"><div class="row between"><small>${o.id}</small>${badge(o.window<'11:00'?'Priority':'Standard')}</div><button class="order-title" data-action="select-order" data-id="${o.id}" aria-pressed="${o.id===selectedOrderId}">${o.store}</button><div class="order-meta"><span>${icon('clock')}${o.window}</span><span>${o.cartons} cartons <i>·</i> ${o.weight} kg <i>·</i> ${o.area}</span></div>${o.id===selectedOrderId?`<div class="fit-note">${icon('route')}<span>Suggested: R-07<br><small>${o.area==='Nugegoda'?'2.4 km from Stop 2':'Along the East corridor'} · window fits</small></span></div>`:''}<div class="order-bottom"><button class="mini-btn" data-action="order-detail" data-id="${o.id}">Details</button><button class="assign-btn" data-action="assign" data-id="${o.id}" ${state.confirmed||state.offline?'disabled':''}>Assign to R-07 ${icon('plus')}</button></div></article>`).join('');
}

function planningMap() {
  return `<div class="planning-map"><svg viewBox="0 0 500 130" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 500 55M0 96 500 90M35 0 85 130M175 0 200 130M375 0 330 130M475 0 410 130M0 130 500 0" stroke="#fff" stroke-width="10" fill="none"/><path d="M75 55 178 74 300 55 418 88" fill="none" stroke="#648461" stroke-width="3"/><circle cx="75" cy="55" r="7" fill="#28664f" stroke="#fff" stroke-width="3"/><circle cx="178" cy="74" r="5" fill="#28664f" stroke="#fff" stroke-width="2"/><circle cx="300" cy="55" r="5" fill="#28664f" stroke="#fff" stroke-width="2"/><circle cx="418" cy="88" r="6" fill="#28664f" stroke="#fff" stroke-width="2"/></svg><div class="map-places"><span>Peliyagoda</span><span>Rajagiriya</span><span>Nugegoda</span></div><span class="map-caption">East corridor · schematic</span></div>`;
}

function routeStops(editable=false) {
  const v=activeVehicle();
  return `<div class="stop depot"><span class="stop-number">${icon('box')}</span><div><h3>Peliyagoda depot</h3><small>Bay ${v.bay} · ${v.id}</small></div><div class="stop-time">09:00<small>Departure</small></div></div>${assigned().map((o,i)=>`<div class="stop ${o.store==='Keells · Nugegoda'?'new':''}"><span class="stop-number">${o.status==='Delivered'?'✓':i+1}</span><div><h3>${o.store}</h3><small>${o.id} · ${o.cartons} cartons</small><div class="stop-status">${badge(o.status)}${o.issue?'<span class="amber">Needs attention</span>':''}</div></div><div class="stop-time ${routeEta(i)>o.window.split(' – ')[1]?'amber':''}">${routeEta(i)}<small>${o.window}</small>${editable&&!state.confirmed?`<button class="mini-btn" data-action="unassign" data-id="${o.id}" ${state.offline?'disabled':''} aria-label="Remove ${o.id} from route">Remove</button>`:''}</div></div>`).join('')}`;
}

function vehicleContext() {
  const v=activeVehicle(),weight=totalWeight(),percent=Math.round(weight/v.capacity*100);
  return `<div class="context-heading"><span class="eyebrow">VEHICLE & CAPACITY</span><button class="mini-btn" data-action="fleet" ${state.confirmed||state.offline?'disabled':''}>Change</button></div><div class="vehicle-visual"><svg viewBox="0 0 220 75" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M18 12h120v43H18zM138 26h29l22 20v9h-51M146 31h18l14 15h-32zM10 59h190M28 24h96M28 31h96M28 38h96M28 45h96"/><circle cx="48" cy="59" r="11" fill="#f7f9f3"/><circle cx="48" cy="59" r="5"/><circle cx="165" cy="59" r="11" fill="#f7f9f3"/><circle cx="165" cy="59" r="5"/></svg></div><div class="row between"><h2>${v.id}</h2>${badge(state.started?'On route':state.confirmed?'Reserved':'Available')}</div><p class="helper">${v.model} · ${v.plate}<br>Dry goods · ${v.capacity.toLocaleString()} kg</p><div class="driver-row"><span class="avatar">${v.driver.split(' ').map(n=>n[0]).join('')}</span><div class="stack"><b>${v.driver}</b><small>Assigned driver</small></div></div><div class="capacity"><div class="row between"><b>Load capacity</b><strong>${percent}%</strong></div><div class="capacity-track" role="meter" aria-label="Vehicle load capacity" aria-valuemin="0" aria-valuemax="${v.capacity}" aria-valuenow="${weight}">${Array.from({length:20},(_,i)=>`<span class="capacity-seg ${i<Math.ceil(percent/5)?'fill':''}"></span>`).join('')}</div><div class="row between"><small>${weight} kg planned</small><small>${v.capacity-weight} kg free</small></div></div><div class="vehicle-details"><div class="detail-row"><span>Loading bay</span><b>Bay ${v.bay}</b></div><div class="detail-row"><span>Departure</span><b>09:00</b></div><div class="detail-row"><span>Return estimate</span><b>11:45</b></div></div><div class="notice"><div class="row">${icon('warning')}<b>Nawala Road works</b></div><p>15 minutes added to travel estimates. Review later stops if you add orders.</p></div><button class="btn wide" data-action="route-review">Review route ${icon('arrow')}</button>`;
}

function handleDispatchAction(action,button,o) {
  const v=activeVehicle();
  switch(action) {
    case 'planning-panel': dispatchPanel=button.dataset.panel; render(); document.querySelector(`#plan-tab-${dispatchPanel}`)?.focus({preventScroll:true}); return true;
    case 'active-run': dispatchPanel='route';render();return true;
    case 'clear-queue':queueQuery='';queueFilter='all';render();return true;
    case 'select-order':selectedOrderId=o.id;render();document.querySelector(`[data-action="select-order"][data-id="${o.id}"]`)?.focus({preventScroll:true});return true;
    case 'assign': {
      if(!o||o.route||state.confirmed||state.offline)return true;
      if(totalWeight()+o.weight>v.capacity){openDialog(`<div class="eyebrow">Capacity constraint</div><h2>This order needs more room.</h2><p>${o.id} adds ${o.weight} kg. ${v.id} has ${v.capacity-totalWeight()} kg remaining.</p><div class="notice">${totalWeight()+o.weight-v.capacity} kg over the vehicle limit. Choose a larger vehicle or remove a stop before assigning.</div><div class="dialog-actions"><button class="btn" data-action="close">Back to plan</button><button class="btn primary" data-action="fleet">Choose vehicle</button></div>`);return true;}
      o.route='R-07';o.vehicle=v.id;o.status='Planning';state.orders.sort((a,b)=>a.window.localeCompare(b.window));record(`${o.id} assigned to R-07 / ${v.id}`);render();toast(`${o.id} assigned · ${assigned().length} stops on R-07.`);return true;
    }
    case 'unassign':if(!o||state.confirmed||state.offline)return true;o.route=null;o.vehicle=null;o.status='Pending';record(`${o.id} returned to the queue`);render();toast(`${o.id} returned to the queue.`);return true;
    case 'fleet':openDialog(`<div class="eyebrow">R-07 · Vehicle selection</div><h2>The right fit for this run.</h2><p>${totalWeight()} kg planned. All vehicles are available before the 09:00 departure.</p><div class="fleet-options">${vehicles.map(vehicle=>`<button class="fleet-option ${vehicle.id===v.id?'selected':''}" data-action="select-vehicle" data-id="${vehicle.id}" ${state.confirmed||state.offline||totalWeight()>vehicle.capacity?'disabled':''}><span class="row">${icon('truck')}<b>${vehicle.id}</b><span class="badge">${vehicle.capacity.toLocaleString()} kg</span></span><span>${vehicle.model} · ${vehicle.driver}</span><small>Bay ${vehicle.bay} · Ready ${vehicle.available} · ${totalWeight()>vehicle.capacity?'Capacity exceeded':vehicle.id===v.id?'Currently assigned':`${vehicle.capacity-totalWeight()} kg remaining`}</small></button>`).join('')}</div>${dialogFooter('Back to plan')}`);return true;
    case 'select-vehicle':{
      const selected=vehicles.find(vehicle=>vehicle.id===button.dataset.id);if(!selected||state.confirmed||state.offline||totalWeight()>selected.capacity)return true;
      state.vehicle=selected.id;assigned().forEach(order=>order.vehicle=selected.id);record(`${selected.id} / ${selected.driver} assigned to R-07`);closeDialog();render();toast(`${selected.id} assigned. Manifest and driver updated.`);return true;
    }
    case 'preview-run':{
      const north=button.dataset.id==='R-12';openDialog(`<div class="eyebrow">${button.dataset.id} · Scheduled run</div><h2>${north?'Colombo North':'City express'}</h2><p>${north?'Peliyagoda → Wattala → Kandana':'Peliyagoda → Fort → Kollupitiya'}</p><div class="detail-row"><span>Departure</span><b>${north?'10:30':'11:00'}</b></div><div class="detail-row"><span>Receiving window</span><b>${north?'11:00 – 13:30':'11:30 – 14:00'}</b></div><div class="detail-row"><span>Suggested vehicle class</span><b>${north?'1,500 kg truck':'800 kg van'}</b></div><div class="notice green">Upcoming-run preview. This demo follows one complete morning run on R-07. Fleet allocation for later runs is still open.</div>${dialogFooter('Return to R-07')}`);return true;
    }
    case 'confirm-dispatch':{
      if(state.confirmed||state.offline)return true;if(!assigned().length){toast('Assign at least one order before confirming.');return true;}
      openDialog(`<div class="eyebrow">Dispatch review · R-07</div><h2>Ready for the warehouse?</h2><p>${assigned().length} stops · ${assigned().reduce((n,order)=>n+order.cartons,0)} cartons · ${totalWeight()} kg</p><div class="review-route"><div class="detail-row"><span>Vehicle & driver</span><b>${v.id}</b></div><p>${v.driver} · Bay ${v.bay} · Departure 09:00</p><div class="detail-row"><span>Capacity remaining</span><b>${v.capacity-totalWeight()} kg</b></div></div><div class="notice">Nawala Road: allow 15 extra minutes. Confirming locks this plan and releases the loading manifest.</div><div class="dialog-actions"><button class="btn" data-action="close">Back to plan</button><button class="btn primary" data-action="release">Confirm & release</button></div>`);return true;
    }
    case 'release':if(state.offline||state.confirmed||!assigned().length||totalWeight()>v.capacity)return true;state.confirmed=true;assigned().forEach(order=>{order.status='Ready to load';order.vehicle=v.id;});record(`R-07 / ${v.id} released to Bay ${v.bay}`);closeDialog();dispatchPanel='route';render();toast(`Plan released. Bay ${v.bay} can begin loading.`);return true;
    case 'manifest':case 'route-review':openDialog(`<div class="eyebrow">R-07 · Colombo East</div><h2>${action==='manifest'?'Dispatch manifest':'Route review'}</h2><p>${v.id} · ${v.driver}<br>Bay ${v.bay} · 09:00 departure · ${totalWeight()} kg</p><div class="route-list dialog-route">${routeStops()}</div><div class="notice green">${assigned().length} stops · ${assigned().reduce((n,order)=>n+order.cartons,0)} cartons. Route estimates are simulated.</div>${dialogFooter()}`);return true;
    case 'order-detail':if(!o)return true;openDialog(`<div class="eyebrow">${o.id}</div><h2>${o.store}</h2><p>${o.address}<br>Delivery ${o.window}</p>${lifecycle(o)}${o.items.map((q,i)=>q?`<div class="detail-row"><span>${products[i].name}</span><b>${q} ctn</b></div>`:'').join('')}<div class="divider"></div><div class="row between"><b>${o.cartons} cartons · ${o.weight} kg</b>${badge(o.status)}</div>${o.route?`<p class="helper">R-07 · ${vehicleForOrder(o).id} · ${vehicleForOrder(o).driver}</p>`:''}${o.issue?`<div class="notice">${esc(o.issue)}</div>`:''}${o.recipient?`<p class="receipt">Received by ${esc(o.recipient)} · ${o.deliveredAt}</p>`:''}${dialogFooter()}`);return true;
    case 'reset':dispatchPanel='queue';selectedOrderId='ORD-2846';queueFilter='all';queueQuery='';productQuery='';return false;
    default:return false;
  }
}

function bindDispatchInputs() {
  document.querySelector('.planning-tabs')?.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const tabs=['queue','route','vehicle'];let index=tabs.indexOf(dispatchPanel);
    index=event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowRight'?1:2))%3;
    dispatchPanel=tabs[index];render();document.querySelector(`#plan-tab-${dispatchPanel}`).focus();
  });
}
