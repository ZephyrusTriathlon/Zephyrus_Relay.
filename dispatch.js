// Planning is a local decision-support simulation; route distances are illustrative.
const vehicles = [
  {id:'VEH003',plate:'Synthetic fleet record',model:'Reefer truck',type:'truck',temp:'reefer',capacity:5510,volumeCap:26.4,kmPerL:4.7,fuelQuota:480,fuelUsed:312,driver:'Amal Perera',bay:'03',available:'03:30',depot:'Peliyagoda'},
  {id:'VEH008',plate:'Synthetic fleet record',model:'Ambient truck',type:'truck',temp:'ambient',capacity:3800,volumeCap:22,kmPerL:7.1,fuelQuota:460,fuelUsed:295,driver:'Nuwan Jayasinghe',bay:'05',available:'03:30',depot:'Peliyagoda'},
  {id:'VEH036',plate:'Synthetic fleet record',model:'Reefer van',type:'van',temp:'reefer',capacity:1040,volumeCap:7,kmPerL:10.3,fuelQuota:480,fuelUsed:264,driver:'Saman Kumara',bay:'02',available:'03:30',depot:'Peliyagoda'}
];
let dispatchPanel = 'queue', selectedOrderId = 'ORD-2846';
let pendingDispatchOrderId = null, revealedDispatchOrderId = null, selectedStopId = null;
const activeVehicle = () => vehicles.find(v => v.id === state.vehicle) || vehicles[0];
const vehicleForOrder = order => vehicles.find(v => v.id === order.vehicle) || activeVehicle();
const routeEta = index => ['05:20','05:48','06:20','06:52','07:18','07:40'][index] || '07:50';
const totalVolume=()=>Number(assigned().reduce((n,o)=>n+(o.volume||0),0).toFixed(2));
function vehicleBlockers(vehicle,orders=assigned()) {
  const blockers=[];
  const weight=orders.reduce((n,o)=>n+o.weight,0),volume=orders.reduce((n,o)=>n+(o.volume||0),0);
  if(weight>vehicle.capacity)blockers.push(`${Math.ceil(weight-vehicle.capacity)} kg over weight limit`);
  if(volume>vehicle.volumeCap)blockers.push(`${(volume-vehicle.volumeCap).toFixed(2)} m³ over volume limit`);
  if(orders.some(o=>o.tempRequirement==='chilled')&&vehicle.temp!=='reefer')blockers.push('chilled goods require a reefer');
  if(orders.some(o=>o.parkingConstraint==='van_only')&&vehicle.type!=='van')blockers.push('van-only outlet requires a van');
  if(orders.some(o=>o.depot!==vehicle.depot))blockers.push(`vehicle is based at ${vehicle.depot}`);
  if(new Set(orders.map(o=>o.brand)).size>1)blockers.push('one brand is allowed per trip');
  if(new Set(orders.map(o=>o.district)).size>1)blockers.push('one district is allowed per trip');
  if(vehicle.fuelUsed+Math.ceil((24+Math.max(0,orders.length-1)*8)*2/vehicle.kmPerL)>vehicle.fuelQuota)blockers.push('weekly fuel quota would be exceeded');
  return blockers;
}
const planChecks=()=>{
  const v=activeVehicle(),orders=assigned(),weight=totalWeight(),volume=totalVolume();
  return [
    ['Weight',`${weight.toLocaleString()} / ${v.capacity.toLocaleString()} kg`,weight<=v.capacity],
    ['Volume',`${volume.toFixed(2)} / ${v.volumeCap.toFixed(1)} m³`,volume<=v.volumeCap],
    ['Temperature',orders.some(o=>o.tempRequirement==='chilled')?`${v.temp==='reefer'?'Reefer':'Ambient'} · chilled load`:'Ambient load',!orders.some(o=>o.tempRequirement==='chilled')||v.temp==='reefer'],
    ['Outlet access',orders.some(o=>o.parkingConstraint==='van_only')?`${v.type==='van'?'Van':'Truck'} · van-only stop`:`${v.type} · normal access`,!orders.some(o=>o.parkingConstraint==='van_only')||v.type==='van'],
    ['Fuel quota',`${v.fuelUsed} / ${v.fuelQuota} L used`,v.fuelUsed<v.fuelQuota],
    ['Trips & time','Trip 1 of 2 · 182 / 270 min',true]
  ];
};

// Derive presentation from the actual shipments, rather than a stale ready flag.
function dispatchRouteState() {
  const orders=assigned(), delivered=orders.filter(o=>o.status==='Delivered').length;
  const issues=orders.filter(o=>o.issue||o.deferred||o.status==='Issue');
  const completed=orders.length>0&&delivered===orders.length&&issues.length===0;
  const completedAt=completed?orders.map(o=>o.deliveredAt).filter(time=>/^\d{2}:\d{2}$/.test(time||'')).sort().at(-1):null;
  const key=issues.length?'exception':completed?'completed':delivered?'partial':state.started||orders.some(o=>o.status==='In transit')?'transit':state.ready?'ready':orders.some(o=>o.loaded||o.status==='Loading')?'loading':state.confirmed?'released':'planning';
  const labels={exception:'Exception',completed:'Completed',partial:'Partially completed',transit:'In transit',ready:'Ready to dispatch',loading:'Loading',released:'Ready to load',planning:'Planning'};
  return {key,label:labels[key],delivered,total:orders.length,issues,completedAt,completed};
}

function dispatchStatus(route=dispatchRouteState()) {
  return `<span class="badge route-state ${route.key==='exception'?'red':['completed','ready'].includes(route.key)?'green':['partial','loading'].includes(route.key)?'amber':''}" data-route-state="${route.key}">${route.label}</span>`;
}

function dispatchHandoff(orderId) {
  const order=state.orders.find(o=>o.id===orderId);
  if(!order)return false;
  queueQuery='';queueFilter='all';dispatchPanel=order.route?'route':'queue';
  selectedOrderId=order.id;revealedDispatchOrderId=order.id;selectedStopId=order.route?order.id:null;
  pendingDispatchOrderId=null;
  return true;
}

function finishDispatchHandoff() {
  requestAnimationFrame(()=>{
    const target=document.querySelector(`[data-action="select-order"][data-id="${revealedDispatchOrderId}"]`)||document.querySelector(`[data-action="select-stop"][data-id="${revealedDispatchOrderId}"]`);
    if(!target)return;
    target.focus({preventScroll:true});
    const rect=target.closest('.order-card,.stop').getBoundingClientRect();
    if(rect.top<0||rect.bottom>innerHeight-(innerWidth<=760?80:16))target.scrollIntoView({block:'center',behavior:'instant'});
  });
}

function routeSummary(route=dispatchRouteState()) {
  const v=activeVehicle();
  if(route.completed)return `<section class="route-outcome completed" aria-label="Route completion"><span class="outcome-icon">${icon('check')}</span><div><h3>Route completed${route.completedAt?` at ${esc(route.completedAt)}`:''}</h3><p>${route.delivered} of ${route.total} stops delivered · ${assigned().reduce((n,o)=>n+o.cartons,0)} cartons received</p><small>${v.id} · ${v.driver} · No outstanding exceptions</small></div></section>`;
  if(route.issues.length)return `<section class="route-outcome exception" aria-label="Route exceptions"><span class="outcome-icon">${icon('warning')}</span><div><h3>${route.issues.length} shipment${route.issues.length===1?' needs':'s need'} attention</h3><p>${route.delivered} of ${route.total} delivered · ${route.total-route.delivered} outstanding</p><small>${route.issues.map(o=>`${o.id}: ${esc(o.issueType||o.issue||'Return visit required')}`).join('<br>')}</small></div></section>`;
  const content={planning:['Review the plan, then release to the warehouse.','Assign an order from the queue to add a stop.'],released:[`Released to Bay ${v.bay}.`,'The warehouse can start checking and loading shipments.'],loading:['Loading is in progress.',`${assigned().filter(o=>o.loaded).length} of ${route.total} shipments checked at Bay ${v.bay}.`],ready:['Manifest checked. Ready to dispatch.',`${v.driver} can start the route.`],transit:['Vehicle is in transit.',`${route.total} stops on the route. Delivery receipts will appear here.`],partial:[`${route.delivered} of ${route.total} stops delivered.`,`${route.total-route.delivered} remaining · The route is still in progress.`]}[route.key];
  return `<div class="route-guidance"><span>${icon(route.key==='planning'?'route':route.key==='transit'||route.key==='partial'?'truck':'check')}</span><div><b>${content[0]}</b><p>${content[1]}</p></div></div>`;
}

function dispatchPrimaryAction(route) {
  if(route.key==='planning')return `<button class="btn primary" data-action="confirm-dispatch" ${state.offline||!route.total?'disabled':''}>${icon('check')} Confirm plan</button>`;
  if(route.completed)return `<button class="btn primary" data-action="route-review">${icon('check')} View receipts</button>`;
  const field=state.started||state.ready||route.key==='transit'||route.key==='partial';
  return `<button class="btn primary" data-role="${field?'delivery':'loader'}">${icon(route.issues.length?'warning':field?'truck':'box')} ${route.issues.length?'Review exceptions':field?'Open delivery':'Open warehouse'}</button>`;
}

function dispatchView() {
  const pending = state.orders.filter(o => !o.route), v = activeVehicle(), weight = totalWeight();
  const carriedWeight=assigned().filter(o=>o.status!=='Delivered').reduce((sum,o)=>sum+o.weight,0);
  const route=dispatchRouteState(), attention=route.issues.length+(route.completed?0:1);
  const deferred=state.orders.filter(o=>o.decision==='deferred');
  return `${heading('Monday, 28 September · planning Tuesday · Peliyagoda','Next-day dispatch','Orders closed at 16:00. Allocate the confirmed queue and explain every deferral.',`<button class="btn" data-action="capacity-outlook">${icon('grid')} Capacity outlook</button><button class="btn" data-action="manifest">${icon('list')} Manifest</button>${dispatchPrimaryAction(route)}`)}
    ${offlineBanner()}
    <section class="dispatch-pulse" aria-label="Dispatch overview">
      <div><span>${state.confirmed?'Waiting for next run':'Awaiting decision'}</span><strong>${String(pending.length).padStart(2,'0')} <small>${deferred.length} deferred · ${pending.reduce((sum,o) => sum+o.cartons,0)} cartons</small></strong></div>
      <div><span>${state.started||route.delivered?'Delivered on R-07':'Planned on R-07'}</span><strong>${state.started||route.delivered?`${route.delivered} / ${route.total}`:String(route.total).padStart(2,'0')} <small>stops</small></strong></div>
      <div><span>${route.completed?'Delivered load':'Weight / volume'}</span><strong>${route.completed?weight:Math.round(carriedWeight/v.capacity*100)}<em>${route.completed?' kg':'%'}</em> <small>${route.completed?'received':`${totalVolume().toFixed(1)} / ${v.volumeCap} m³`}</small></strong></div>
      <div><span>${route.completed?'Exceptions':'Needs attention'}</span><strong class="${attention?'amber':'green'}">${String(attention).padStart(2,'0')} <small>${route.completed?'all clear':route.issues.length?'issues + advisory':'road advisory'}</small></strong></div>
    </section>
    <div class="dispatch-runbar"><button class="run-active" data-action="active-run" aria-current="true"><span class="dot"></span><span><b>R-07 · Fresh · Colombo</b><small>Selected trip · ${route.key==='planning'?'04:45 departure':route.label}</small></span></button><button class="run-preview" data-action="preview-run" data-id="R-12"><span><b>R-12 · Style · Colombo</b><small>10:30 · Mall windows</small></span>${icon('chevron')}</button><button class="run-preview" data-action="preview-run" data-id="R-15"><span><b>R-15 · Tech · Colombo</b><small>11:00 · Fragile load</small></span>${icon('chevron')}</button></div>
    <div class="planning-tabs" role="tablist" aria-label="Planning workspace">${[['queue','Orders',pending.length],['route','Route',assigned().length],['vehicle','Vehicle','']].map(([key,label,count]) => `<button id="plan-tab-${key}" role="tab" aria-selected="${dispatchPanel===key}" aria-controls="planning-${key}" tabindex="${dispatchPanel===key?0:-1}" data-action="planning-panel" data-panel="${key}" class="${dispatchPanel===key?'active':''}">${label} ${count!==''?`<span>${count}</span>`:''}</button>`).join('')}</div>
    <section class="planning" data-panel="${dispatchPanel}" aria-label="Morning planning workspace">
      <aside class="queue" id="planning-queue"><div class="panel-title"><h2>Order queue <span class="badge">${pending.length}</span></h2></div><div class="queue-tools"><label class="search">${icon('search')}<input id="queue-search" value="${esc(queueQuery)}" placeholder="Outlet or order ID" aria-label="Search planning queue"></label><div class="queue-filter-row"><span>${state.confirmed?'Next-run orders':'Awaiting decision'}</span><select class="filter-select" id="queue-filter" aria-label="Filter planning queue"><option value="all" ${queueFilter==='all'?'selected':''}>All orders</option><option value="priority" ${queueFilter==='priority'?'selected':''}>Service risk</option></select></div></div><div class="queue-list" id="queue-list">${queueCards()}</div></aside>
      <div class="route-workspace" id="planning-route"><div class="route-heading"><div><div class="eyebrow">R-07 · Trip 1 · Fresh</div><h2>Colombo</h2></div>${dispatchStatus(route)}</div>${route.completed||route.issues.length?routeSummary(route):planningMap()}<div class="route-strip"><span><b>${route.total}</b> stops</span><span><b>${(18+route.total*4.2).toFixed(1)}</b> km est.</span><span><b>${assigned().reduce((sum,o)=>sum+o.cartons,0)}</b> cartons</span><span><b>${totalVolume().toFixed(2)}</b> m³</span></div><div class="constraint-grid" aria-label="Operating constraint checks">${planChecks().map(([label,value,pass])=>`<div class="constraint-check ${pass?'pass':'fail'}"><span>${icon(pass?'check':'warning')}</span><div><b>${label}</b><small>${value}</small></div></div>`).join('')}</div><div class="route-sequence-label"><span>${route.completed?'DELIVERY RECEIPTS':'STOP SEQUENCE'}</span><span>${route.completed?'DELIVERED AT':'ETA / WINDOW'}</span></div><div class="route-list">${routeStops(true)}</div>${!route.total?'<div class="empty"><h3>Build your first stop</h3><p>Assign an order from the queue.</p></div>':''}${!state.confirmed?'<button class="route-drop" data-action="planning-panel" data-panel="queue">＋ Add an order from the queue</button>':''}${!route.completed&&!route.issues.length?routeSummary(route):''}</div>
      <aside class="context" id="planning-vehicle">${vehicleContext()}</aside>
    </section>
    <div class="bottom-note"><span class="row"><span class="dot"></span>R-07 · ${route.label}${route.completedAt?` at ${esc(route.completedAt)}`:''} · Saved ${state.lastSync}</span><span>Source-aligned synthetic records · Planning estimates are illustrative</span></div>`;
}

function queueCards() {
  const list = state.orders.filter(o => !o.route && `${o.id} ${o.outletId||''} ${o.store}`.toLowerCase().includes(queueQuery.toLowerCase()) && (queueFilter !== 'priority' || o.deferredYesterday || o.parkingConstraint==='van_only')).sort((a,b)=>Number(b.id===revealedDispatchOrderId)-Number(a.id===revealedDispatchOrderId));
  if (!list.length) return `<div class="empty">${icon(queueQuery?'search':'check')}<h3>${queueQuery || queueFilter!=='all' ? 'No matching orders' : 'Queue is clear'}</h3><p>${queueQuery || queueFilter!=='all' ? 'Try another store or delivery window.' : 'Every order has a place on the route.'}</p>${queueQuery || queueFilter!=='all' ? '<button class="mini-btn" data-action="clear-queue">Clear filters</button>' : '<button class="mini-btn" data-action="planning-panel" data-panel="route">Review your route →</button>'}</div>`;
  return list.map(o => {const trial=[...assigned(),o],blockers=vehicleBlockers(activeVehicle(),trial);return `<article class="order-card ${o.id===selectedOrderId?'selected':''} ${o.id===revealedDispatchOrderId?'new-order':''}"><div class="row between"><small>${o.id} · ${o.outletId}</small>${o.id===revealedDispatchOrderId?'<span class="badge green">New order</span>':badge(o.decision==='deferred'?'Deferred':o.deferredYesterday?'Skipped yesterday':o.nextRun?'Next run':'Confirmed')}</div><button class="order-title" data-action="select-order" data-id="${o.id}" aria-pressed="${o.id===selectedOrderId}">${o.store}</button><div class="order-meta"><span>${icon('clock')}${o.nextRun?'Next run · window pending':o.window}</span><span>${o.cartons} ctn · ${o.weight} kg · ${(o.volume||0).toFixed(2)} m³</span><span>${o.tempRequirement} · ${o.parkingConstraint.replace('_',' ')}</span></div>${o.id===selectedOrderId?`<div class="fit-note">${icon(blockers.length?'warning':'route')}<span>${o.decision==='deferred'?`Deferred: ${esc(o.deferralReason)}`:blockers.length?'Constraint needs action':'Fits R-07'}<small>${o.decision==='deferred'?'Decision recorded for the next run.':blockers.length?esc(blockers.join(' · ')):`${o.daysSinceLastServed} day${o.daysSinceLastServed===1?'':'s'} since last served${o.deferredYesterday?' · protect from repeat skip':''}`}</small></span></div>`:''}<div class="order-bottom"><button class="mini-btn" data-action="order-detail" data-id="${o.id}">Details</button>${state.confirmed?'<span class="queue-waiting">Awaiting next run</span>':`<span class="order-decision-actions"><button class="mini-btn" data-action="defer-order" data-id="${o.id}" ${state.offline?'disabled':''}>Defer</button><button class="assign-btn" data-action="assign" data-id="${o.id}" ${state.offline||o.decision==='deferred'?'disabled':''}>Assign ${icon('plus')}</button></span>`}</div></article>`}).join('');
}

function planningMap() {
  return `<div class="planning-map"><svg viewBox="0 0 500 130" preserveAspectRatio="none" aria-hidden="true"><path d="M0 20 500 55M0 96 500 90M35 0 85 130M175 0 200 130M375 0 330 130M475 0 410 130M0 130 500 0" stroke="#fff" stroke-width="10" fill="none"/><path d="M75 55 178 74 300 55 418 88" fill="none" stroke="#648461" stroke-width="3"/><circle cx="75" cy="55" r="7" fill="#28664f" stroke="#fff" stroke-width="3"/><circle cx="178" cy="74" r="5" fill="#28664f" stroke="#fff" stroke-width="2"/><circle cx="300" cy="55" r="5" fill="#28664f" stroke="#fff" stroke-width="2"/><circle cx="418" cy="88" r="6" fill="#28664f" stroke="#fff" stroke-width="2"/></svg><div class="map-places"><span>Peliyagoda</span><span>OUT005</span><span>OUT004</span></div><span class="map-caption">Colombo district · schematic, not navigation</span></div>`;
}

function routeStops(editable=false) {
  const v=activeVehicle();
  return `<div class="stop depot"><span class="stop-number">${icon('box')}</span><div><h3>Peliyagoda depot</h3><small>Bay ${v.bay} · ${v.id} · Trip 1</small></div><div class="stop-time">04:45<small>${state.started?'Scheduled departure':'Departure'}</small></div></div>${assigned().map((o,i)=>{
    const late=o.status!=='Delivered'&&routeEta(i)>o.window.split(' – ')[1];
    return `<div class="stop ${o.id===selectedStopId?'is-selected':''} ${o.status==='Delivered'?'is-delivered':''}"><span class="stop-number">${o.status==='Delivered'?'✓':i+1}</span><div>${editable?`<button class="stop-select" data-action="select-stop" data-id="${o.id}" aria-pressed="${o.id===selectedStopId}" aria-label="${o.store}, ${o.id}, view ${o.status==='Delivered'?'receipt':'stop details'}">${o.store}</button>`:`<h3>${o.store}</h3>`}<small>${o.id} · ${o.cartons} cartons</small><div class="stop-status">${badge(o.status)}${late?'<span class="window-risk">Window at risk</span>':''}</div>${o.status==='Delivered'?`<small class="stop-recipient">Received by ${esc(o.recipient||'store team')}</small>`:''}</div><div class="stop-time ${late?'amber':''}">${o.status==='Delivered'?esc(o.deliveredAt||'Recorded'):routeEta(i)}<small>${o.status==='Delivered'?'Delivered':o.window}</small>${editable&&!state.confirmed?`<button class="mini-btn" data-action="unassign" data-id="${o.id}" ${state.offline?'disabled':''} aria-label="Remove ${o.id} from route">Remove</button>`:''}</div></div>`;
  }).join('')}`;
}

function vehicleContext() {
  const v=activeVehicle(),route=dispatchRouteState();
  const weight=assigned().filter(o=>o.status!=='Delivered').reduce((n,o)=>n+o.weight,0),percent=Math.round(weight/v.capacity*100);
  const volume=assigned().filter(o=>o.status!=='Delivered').reduce((n,o)=>n+(o.volume||0),0);
  return `<div class="context-heading"><span class="eyebrow">SELECTED VEHICLE</span>${!state.confirmed?`<button class="mini-btn" data-action="fleet" ${state.offline?'disabled':''}>Change</button>`:''}</div><div class="vehicle-identity"><span class="vehicle-symbol">${icon('truck')}</span><div><h2>${v.id}</h2><small>${v.model} · ${v.temp}</small></div></div><div class="vehicle-route-status">${dispatchStatus(route)}<small>${v.depot} · ${v.type}</small></div><div class="driver-row"><span class="avatar">${v.driver.split(' ').map(n=>n[0]).join('')}</span><div class="stack"><b>${v.driver}</b><small>Assigned driver</small></div></div><div class="capacity"><div class="row between"><b>${state.started||route.completed?'Load remaining':'Planned weight'}</b><strong>${percent}%</strong></div><div class="capacity-track" role="meter" aria-label="Vehicle weight capacity" aria-valuemin="0" aria-valuemax="${v.capacity}" aria-valuenow="${weight}">${Array.from({length:20},(_,i)=>`<span class="capacity-seg ${i<Math.ceil(percent/5)?'fill':''}"></span>`).join('')}</div><dl class="capacity-facts"><div><dt>Weight</dt><dd>${weight.toLocaleString()} / ${v.capacity.toLocaleString()} kg</dd></div><div><dt>Volume</dt><dd>${volume.toFixed(2)} / ${v.volumeCap} m³</dd></div><div><dt>Fuel this week</dt><dd>${v.fuelUsed} / ${v.fuelQuota} L</dd></div></dl></div><div class="vehicle-details"><div class="detail-row"><span>Loading bay</span><b>Bay ${v.bay}</b></div><div class="detail-row"><span>${route.completed?'Completed at':'Scheduled departure'}</span><b>${route.completed?esc(route.completedAt||'Time not recorded'):'04:45'}</b></div><div class="detail-row"><span>Trip allowance</span><b>1 of 2</b></div></div>${route.completed?'<div class="notice green"><div class="row">'+icon('check')+'<b>Every stop delivered</b></div><p>All receipts recorded. No outstanding exceptions on R-07.</p></div>':route.issues.length?`<div class="notice dispatch-exception"><div class="row">${icon('warning')}<b>${route.issues.length} open exception${route.issues.length===1?'':'s'}</b></div><p>${route.total-route.delivered} stop${route.total-route.delivered===1?' remains':'s remain'} outstanding. Review the shipment before closing the route.</p></div>`:`<div class="notice"><div class="row">${icon('warning')}<b>Road disruption advisory</b></div><p>Allow 15 extra minutes. ${state.started?'Monitor the remaining delivery windows.':'Review the 08:00 Fresh windows before release.'}</p></div>`}<button class="btn wide" data-action="route-review">${route.completed?'View delivery receipts':'Review route'} ${icon('arrow')}</button>`;
}

function handleDispatchAction(action,button,o) {
  const v=activeVehicle();
  switch(action) {
    case 'planning-panel': dispatchPanel=button.dataset.panel; render(); if(innerWidth<=1100)document.querySelector(`#plan-tab-${dispatchPanel}`)?.focus({preventScroll:true});else document.querySelector(dispatchPanel==='queue'?'#queue-search':'#planning-route')?.focus({preventScroll:true});return true;
    case 'active-run': dispatchPanel='route';render();if(innerWidth<=1100)document.querySelector('#plan-tab-route')?.focus({preventScroll:true});return true;
    case 'clear-queue':queueQuery='';queueFilter='all';render();return true;
    case 'select-order':selectedOrderId=o.id;render();document.querySelector(`[data-action="select-order"][data-id="${o.id}"]`)?.focus({preventScroll:true});return true;
    case 'select-stop':if(!o)return true;selectedStopId=o.id;render();document.querySelector(`[data-action="select-stop"][data-id="${o.id}"]`)?.focus({preventScroll:true});return handleDispatchAction('order-detail',button,o);
    case 'assign': {
      if(!o||o.route||state.confirmed||state.offline)return true;
      const blockers=vehicleBlockers(v,[...assigned(),o]);
      if(blockers.length){openDialog(`<div class="eyebrow">Operating constraint</div><h2>${o.id} cannot use ${v.id} yet.</h2><p>${o.outletId} · ${o.tempRequirement} · ${o.parkingConstraint.replace('_',' ')}</p><div class="notice">${blockers.map(item=>`• ${esc(item)}`).join('<br>')}</div><p class="helper">Choose a compatible vehicle, adjust the trip, or record a deferral with a reason.</p><div class="dialog-actions"><button class="btn" data-action="close">Back to plan</button><button class="btn primary" data-action="fleet">Choose vehicle</button></div>`);return true;}
      o.route='R-07';o.vehicle=v.id;o.status='Planning';selectedStopId=o.id;state.orders.sort((a,b)=>a.window.localeCompare(b.window));record(`${o.id} assigned to R-07 / ${v.id}`);render();toast(`${o.id} assigned · ${assigned().length} stops on R-07.`);return true;
    }
    case 'unassign':if(!o||state.confirmed||state.offline)return true;o.route=null;o.vehicle=null;o.status='Pending';record(`${o.id} returned to the queue`);render();toast(`${o.id} returned to the queue.`);return true;
    case 'defer-order':if(!o||o.route||state.confirmed||state.offline)return true;openDialog(`<div class="eyebrow">Explainable deferral · ${o.id}</div><h2>Record why ${o.outletId} moves to the next run.</h2><p>${o.store} · ${o.window}<br>${o.deferredYesterday?'This outlet was skipped yesterday. Repeating the deferral needs a strong reason.':`${o.daysSinceLastServed} day${o.daysSinceLastServed===1?'':'s'} since last served.`}</p><label class="form-label" for="deferral-reason">Reason</label><select class="input" id="deferral-reason"><option value="">Choose a reason</option><option>Reefer capacity reserved for higher-risk chilled orders</option><option>Van capacity unavailable for restricted access</option><option>Delivery window cannot be met</option><option>Weight or volume capacity exhausted</option></select><label class="form-label" for="deferral-note">Impact and next action</label><textarea class="input" id="deferral-note" maxlength="240" placeholder="Example: protect on the next run; store has 2 days of cover"></textarea><div class="dialog-actions"><button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="confirm-defer" data-id="${o.id}">Record deferral</button></div>`);return true;
    case 'confirm-defer':if(!o)return true;{const reason=document.querySelector('#deferral-reason')?.value,note=document.querySelector('#deferral-note')?.value.trim();if(!reason||!note){toast('Choose a reason and record the impact.');return true;}o.decision='deferred';o.deferralReason=`${reason}. ${note}`;o.status='Deferred';o.nextRun=true;record(`${o.id} deferred: ${o.deferralReason}`);closeDialog();render();toast('Deferral recorded and visible to the store.');return true;}
    case 'capacity-outlook':openDialog(`<div class="eyebrow">10-week demand outlook · planning aid</div><h2>Plan capacity before demand peaks.</h2><p>Illustrative forecast derived from the competition’s depot × brand × ISO-week structure. Values demonstrate the dispatcher decision, not a submitted Datathon model.</p><div class="outlook-list"><div><span>Fresh · Peliyagoda</span><b>412.7 m³</b><small>151.3 m³ chilled · add 2 reefer shifts</small></div><div><span>Style · Peliyagoda</span><b>96.4 m³</b><small>Seasonal rise · protect mall-window capacity</small></div><div><span>Tech · Peliyagoda</span><b>44.8 m³</b><small>Weight-led demand · reserve fragile handling</small></div></div><div class="notice green">Recommended: keep two reefer vehicles and drivers on standby for the festival ramp; confirm availability one week ahead.</div>${dialogFooter('Back to dispatch')}`);return true;
    case 'fleet':openDialog(`<div class="eyebrow">R-07 · Vehicle selection</div><h2>Choose a vehicle that satisfies every rule.</h2><p>${totalWeight()} kg · ${totalVolume().toFixed(2)} m³ planned · ${assigned().some(order=>order.tempRequirement==='chilled')?'chilled goods included':'ambient goods'}</p><div class="fleet-options">${vehicles.map(vehicle=>{const blockers=vehicleBlockers(vehicle);return `<button class="fleet-option ${vehicle.id===v.id?'selected':''}" aria-pressed="${vehicle.id===v.id}" data-action="select-vehicle" data-id="${vehicle.id}" ${state.confirmed||state.offline||blockers.length?'disabled':''}><span class="row">${icon('truck')}<b>${vehicle.id}</b><span class="badge">${vehicle.type} · ${vehicle.temp}</span></span><span>${vehicle.model} · ${vehicle.driver}</span><small>${vehicle.capacity.toLocaleString()} kg · ${vehicle.volumeCap} m³ · ${blockers.length?blockers.join(' · '):vehicle.id===v.id?'Compatible · currently assigned':'Compatible with this trip'}</small></button>`}).join('')}</div>${dialogFooter('Back to plan')}`);return true;
    case 'select-vehicle':{
      const selected=vehicles.find(vehicle=>vehicle.id===button.dataset.id);if(!selected||state.confirmed||state.offline||vehicleBlockers(selected).length)return true;
      state.vehicle=selected.id;assigned().forEach(order=>order.vehicle=selected.id);record(`${selected.id} / ${selected.driver} assigned to R-07`);closeDialog();render();toast(`${selected.id} assigned. Manifest and driver updated.`);return true;
    }
    case 'preview-run':{
      const style=button.dataset.id==='R-12';openDialog(`<div class="eyebrow">${button.dataset.id} · Scheduled trip</div><h2>${style?'Waypoint Style · Colombo':'Waypoint Tech · Colombo'}</h2><p>${style?'Mall delivery windows and volume-led garment loads.':'High-value, fragile appliances with weight-led capacity.'}</p><div class="detail-row"><span>Departure</span><b>${style?'10:30':'11:00'}</b></div><div class="detail-row"><span>Primary constraint</span><b>${style?'Mall access window':'Weight & handling'}</b></div><div class="detail-row"><span>Temperature</span><b>Ambient</b></div><div class="notice green">Scope decision: the high-fidelity walkthrough follows Fresh R-07 end to end. These previews show how the same constraint model supports the other two brands.</div>${dialogFooter('Return to R-07')}`);return true;
    }
    case 'confirm-dispatch':{
      if(state.confirmed||state.offline)return true;if(!assigned().length){toast('Assign at least one order before confirming.');return true;}const blockers=vehicleBlockers(v);if(blockers.length){toast('Resolve the operating constraints before release.');return true;}
      openDialog(`<div class="eyebrow">Dispatch review · R-07</div><h2>Feasible and ready for the warehouse.</h2><p>${assigned().length} stops · ${assigned().reduce((n,order)=>n+order.cartons,0)} cartons · ${totalWeight()} kg · ${totalVolume().toFixed(2)} m³</p><div class="review-route"><div class="detail-row"><span>Vehicle & driver</span><b>${v.id} · ${v.temp}</b></div><p>${v.driver} · Bay ${v.bay} · Departure 04:45</p><div class="detail-row"><span>Trip budget</span><b>182 / 270 min</b></div><div class="detail-row"><span>Deferred orders</span><b>${state.orders.filter(order=>order.decision==='deferred').length} recorded</b></div></div><div class="notice green">Weight, volume, temperature, outlet access, depot, time and fuel checks pass. Confirming locks this plan and releases the loading manifest.</div><div class="dialog-actions"><button class="btn" data-action="close">Back to plan</button><button class="btn primary" data-action="release">Confirm & release</button></div>`);return true;
    }
    case 'release':if(state.offline||state.confirmed||!assigned().length||vehicleBlockers(v).length)return true;state.confirmed=true;assigned().forEach(order=>{order.status='Ready to load';order.vehicle=v.id;});record(`R-07 / ${v.id} released to Bay ${v.bay}; all operating checks passed`);closeDialog();dispatchPanel='route';render();toast(`Plan released. Bay ${v.bay} can begin loading.`);return true;
    case 'manifest':case 'route-review':{
      const route=dispatchRouteState();
      openDialog(`<div class="eyebrow">R-07 · Fresh · Colombo</div><h2>${action==='manifest'?'Dispatch manifest':route.completed?'Delivery receipts':'Route review'}</h2><p>${v.id} · ${v.driver}<br>Bay ${v.bay} · ${totalWeight()} kg · ${totalVolume().toFixed(2)} m³ · Trip 1</p>${dispatchStatus(route)}${routeSummary(route)}<div class="route-list dialog-route">${routeStops()}</div>${dialogFooter()}`);return true;
    }
    case 'order-detail':if(!o)return true;openDialog(`<div class="eyebrow">${o.id} · ${o.outletId}</div><h2>${o.store}</h2><p>${o.address}<br>Delivery ${o.window}</p><div class="domain-facts"><span>${o.brand}</span><span>${o.district} · ${o.depot}</span><span>${o.tempRequirement}</span><span>${o.dockType.replace('_',' ')}</span><span>${o.parkingConstraint.replace('_',' ')}</span></div>${lifecycle(o)}${o.items.map((q,i)=>q?`<div class="detail-row"><span>${products[i].name}</span><b>${q} ctn</b></div>`:'').join('')}<div class="divider"></div><div class="row between"><b>${o.cartons} cartons · ${o.weight} kg · ${(o.volume||0).toFixed(2)} m³</b>${badge(o.status)}</div>${o.deferredYesterday?'<div class="notice">Service protection: this outlet was deferred yesterday.</div>':''}${o.deferralReason?`<div class="notice">Deferred: ${esc(o.deferralReason)}</div>`:''}${o.route?`<p class="helper">R-07 · Trip ${o.tripId} · ${vehicleForOrder(o).id} · ${vehicleForOrder(o).driver}</p>`:''}${o.issue?`<div class="notice">${esc(o.issue)}</div>`:''}${o.recipient?`<p class="receipt">Received by ${esc(o.recipient)} · ${o.deliveredAt}</p>`:''}${dialogFooter()}`);return true;
    case 'reset':dispatchPanel='queue';selectedOrderId='ORD-2846';selectedStopId=null;pendingDispatchOrderId=null;revealedDispatchOrderId=null;queueFilter='all';queueQuery='';productQuery='';return false;
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
