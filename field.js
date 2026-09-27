/* Field operations: a shared manifest, tablet loading and mobile delivery. */
let fieldRouteOpen = false;

function fieldVehicle() {
  const vehicle=typeof activeVehicle === 'function' ? activeVehicle() : {id:'TRK-214',driver:'Amal Perera',capacity:1200,bay:'03',plate:'WP LY-4821'};
  return {...vehicle,bay:/^bay\b/i.test(vehicle.bay)?vehicle.bay:`Bay ${vehicle.bay}`};
}
function nextDelivery() {
  const remaining = assigned().filter(o => o.status !== 'Delivered' && !o.deferred);
  return remaining.find(o => o.returnRequested) || remaining[0];
}
function fieldItems(o, compact=false) {
  return `<div class="field-item-list ${compact?'compact':''}">${o.items.map((q,i)=>q?`<div class="field-item-line"><span>${esc(products[i].name)}<small>${esc(products[i].code)}</small></span><b>${q}<small>cartons</small></b></div>`:'').join('')}</div>`;
}
function loaderView() {
  const list = assigned().slice().reverse(), done = list.filter(o=>o.loaded).length, next = list.find(o=>!o.loaded), v=fieldVehicle();
  const cartons=list.reduce((sum,o)=>sum+o.cartons,0), loadedCartons=list.filter(o=>o.loaded).reduce((sum,o)=>sum+o.cartons,0), allDelivered=list.length>0&&list.every(o=>o.status==='Delivered');
  return `${heading(`Peliyagoda · ${esc(v.bay)}`,'Every carton. In the right order.','Load the last delivery first. Keep the first stop ready at the door.',`<button class="btn" data-action="offline">${icon('wifi')} ${state.offline?'Reconnect':'Simulate offline'}</button>`)}${flow()}${offlineBanner()}
  <section class="warehouse-manifest" aria-label="Loading manifest">
    ${!state.confirmed?`<div class="warehouse-awaiting"><span class="field-state-icon">${icon('list')}</span><div class="eyebrow">Waiting for dispatch</div><h2>Your next manifest is being prepared.</h2><p>R-07 has ${list.length} planned stops. The confirmed stop order and carton counts will appear here when dispatch releases the route.</p><button class="btn primary" data-role="dispatch">Review the dispatch plan ${icon('arrow')}</button><div class="helper">${esc(v.id)} · ${esc(v.bay)} · Planned departure 09:00</div></div>`:`
    <header class="warehouse-header">
      <div><div class="warehouse-kicker">R-07 / Colombo East</div><h2>${esc(v.id)} <span>${esc(v.bay)}</span></h2><p>${esc(v.driver)} <span>·</span> ${esc(v.plate)}</p></div>
      <div class="warehouse-departure"><small>${state.ready?'Manifest checked':'Departure deadline'}</small><b>${allDelivered?'Complete':state.started?'Dispatched':state.ready?'Ready':'09:00'}</b><span>${allDelivered?'All stops delivered':state.started?'Loading complete':state.ready?'Cleared for departure':'Morning dispatch'}</span></div>
      <div class="warehouse-progress-head"><span><b>${done} of ${list.length}</b> shipments loaded</span><span>${loadedCartons} / ${cartons} cartons</span></div>
      <div class="warehouse-progress" role="progressbar" aria-label="Loading progress" aria-valuemin="0" aria-valuemax="${list.length}" aria-valuenow="${done}"><span style="width:${list.length?done/list.length*100:0}%"></span></div>
    </header>
    ${state.ready?`<div class="warehouse-complete"><span class="field-state-icon">${icon('check')}</span><div><h2>${allDelivered?'Loading complete. Every stop delivered.':state.started?'Loading complete. Out for delivery.':'Vehicle ready. Team in sync.'}</h2><p>${cartons} cartons checked · ${totalWeight()} kg secured · Manifest complete</p></div><button class="btn primary" data-role="delivery">${allDelivered?'View completed route':'Open driver’s route'} ${icon('arrow')}</button></div>`:`<div class="cargo-guide"><div><span class="eyebrow">Load direction</span><p><b>Deepest in the vehicle</b> to <b>nearest the door</b></p></div><div class="cargo-sequence" aria-label="Reverse delivery order">${list.map((o,i)=>`<span class="cargo-position ${o.loaded?'is-loaded':o===next?'is-next':''}"><small>Stop</small><b>${list.length-i}</b>${o.loaded?icon('check'):''}</span>`).join('<span class="cargo-arrow">→</span>')}<span class="cargo-door">${icon('truck')}<small>Door</small></span></div></div>`}
    <div class="warehouse-section-heading"><h2>${state.ready?'Checked manifest':'Your loading sequence'}</h2><span>${state.ready?`${cartons} cartons verified`:`${list.length-done} shipment${list.length-done!==1?'s':''} remaining`}</span></div>
    <div class="shipment-list">${list.map((o,i)=>`<article class="shipment ${o.loaded?'is-loaded':''} ${o===next?'is-active':''} ${o.issue?'has-issue':''}">
      <div class="shipment-number" aria-label="Load position ${i+1}">${o.loaded?icon('check'):String(i+1).padStart(2,'0')}</div>
      <div class="shipment-info"><div class="shipment-kicker">Delivery stop ${list.length-i} <span>·</span> ${esc(o.id)}</div><h3>${esc(o.store)}</h3><div class="shipment-quantity"><b>${o.cartons} cartons</b><span>${o.weight} kg</span>${o.loaded?'<span class="field-status success">Loaded</span>':o.issue?'<span class="field-status exception">Needs attention</span>':o===next?'<span class="field-status current">Load now</span>':'<span class="field-status">Up next</span>'}</div>
      ${o.issue?`<div class="shipment-exception">${icon('warning')}<div><b>${esc(o.issueType||'Loading issue')}</b><p>${esc(o.issue)}</p></div></div>`:o.resolution?`<div class="shipment-resolved">${icon('check')} Resolved · ${esc(o.resolution)}</div>`:''}
      <details class="shipment-checklist" ${o===next&&!o.issue?'open':''}><summary>Item checklist <span>${o.items.filter(Boolean).length} products</span>${icon('chevron')}</summary>${fieldItems(o,true)}</details></div>
      <div class="shipment-actions">${o.loaded?`<span class="shipment-loaded">${icon('check')} Count confirmed</span>`:o.issue?`<button class="btn" data-action="resolve" data-id="${o.id}">Resolve issue</button>`:`<button class="btn primary" data-action="loaded" data-id="${o.id}" ${o!==next?'disabled':''}>${icon('check')} Confirm loaded</button><button class="btn ghost danger" data-action="issue" data-id="${o.id}" ${o!==next?'disabled':''}>Report an issue</button>`}</div>
    </article>`).join('')}</div>
    <footer class="warehouse-footer"><div>${icon(state.ready?'check':'box')}<p><b>${state.ready?'Loading complete':'Check, count, then confirm.'}</b><span>${allDelivered?'All delivery receipts saved.':state.started?'The vehicle has left the warehouse.':state.ready?'The driver can start R-07.':done===list.length?'All shipments checked. Release the vehicle to the driver.':'Confirm carton quantities before moving to the next shipment.'}</span></p></div><button class="btn primary" data-action="complete-loading" ${state.ready||done!==list.length||!list.length||list.some(o=>o.issue)?'disabled':''}>${icon('check')} ${state.ready?'Manifest checked':'Complete loading'}</button></footer>`}
  </section>`;
}

function mapView() {
  return `<div class="field-map"><svg viewBox="0 0 560 180" role="img" aria-label="Illustrative Colombo East route, not a navigation map"><rect width="560" height="180" fill="#eef0e7"/><path d="M0 45 560 68M0 130 560 100M55 0 100 180M220 0 185 180M353 0 320 180M460 0 510 180" stroke="#fafbf8" stroke-width="15" fill="none"/><path d="M0 20 105 60 160 0M398 180 455 113 560 142" stroke="#dfe5d6" stroke-width="4" fill="none"/><path d="m64 118 85-12 82-37 115 12 118-36" fill="none" stroke="#789570" stroke-width="4" stroke-dasharray="6 5"/><circle cx="64" cy="118" r="10" fill="#fff" stroke="#789570" stroke-width="3"/><circle cx="231" cy="69" r="12" fill="#28664f" stroke="#fff" stroke-width="4"/><circle cx="464" cy="45" r="10" fill="#fff" stroke="#789570" stroke-width="3"/><text x="344" y="155" fill="#6d7867" font-size="12" font-family="sans-serif" letter-spacing="1">COLOMBO EAST</text></svg><span>Route schematic · illustrative</span></div>`;
}

function fieldRouteList(list, next) {
  return `<ol class="field-route-list">${list.map((o,i)=>`<li class="${o.status==='Delivered'?'is-delivered':o.deferred?'is-deferred':o===next?'is-current':''}"><span class="field-route-number">${o.status==='Delivered'?icon('check'):i+1}</span><div><h3>${esc(o.store)}</h3><p>${o.status==='Delivered'?`Received by ${esc(o.recipient||'store team')} · ${esc(o.deliveredAt||'')}`:o.deferred?esc(o.issueType||'Return later'):`${esc(o.window)} · ${o.cartons} cartons`}</p><small>${esc(o.id)}</small></div>${o.deferred?`<button class="mini-btn" data-action="retry-stop" data-id="${o.id}">Retry</button>`:o===next?'<span class="field-route-now">Now</span>':o.status==='Delivered'?'<span class="field-route-now">Done</span>':''}</li>`).join('')}</ol>`;
}

function deliveryView() {
  const list=assigned(), done=list.filter(o=>o.status==='Delivered').length, next=nextDelivery(), deferred=list.filter(o=>o.status!=='Delivered'&&o.deferred), v=fieldVehicle();
  const complete=state.ready&&list.length>0&&done===list.length, stop=next?list.indexOf(next)+1:0;
  const action=!state.started?'start-route':next?.issue?'resolve':next?.arrived?'verify-delivery':'arrived';
  const label=!state.started?'Start route':next?.issue?'Resolve before delivery':next?.arrived?'Verify & confirm delivery':'I’ve arrived';
  return `${heading(`${esc(v.driver)} · ${esc(v.id)}`,'Morning route','One route. A clear next step at every stop.',`<button class="btn field-offline-toggle" data-action="offline">${icon('wifi')} ${state.offline?'Reconnect':'Simulate offline'}</button>`)}${flow()}${offlineBanner()}
  <div class="driver-workspace ${fieldRouteOpen?'route-open':''}">
  <section class="driver-focus" aria-label="Current delivery">
    <header class="driver-route-header"><div class="driver-route-top"><div><span class="eyebrow">R-07 · Morning run</span><h2>Colombo East</h2></div><span class="field-status ${complete?'success':''}">${complete?'Complete':state.started?'On the road':state.ready?'Ready to depart':'Preparing'}</span></div><div class="driver-progress-label"><span><b>${done}</b> / ${list.length} delivered</span><button class="mini-btn" data-action="field-route-toggle" aria-expanded="${fieldRouteOpen}" aria-controls="driver-route-overview">${fieldRouteOpen?'Hide route':'View route'} ${icon('chevron')}</button></div><div class="driver-progress" role="progressbar" aria-label="Deliveries completed" aria-valuemin="0" aria-valuemax="${list.length||1}" aria-valuenow="${done}">${list.map(o=>`<span class="${o.status==='Delivered'?'complete':o.deferred?'deferred':''}"></span>`).join('')}</div></header>
    ${!state.ready?`<div class="driver-empty"><span class="field-state-icon">${icon('box')}</span><div class="eyebrow">Getting you road-ready</div><h2>Your route is being prepared.</h2><p>The warehouse is checking and loading your shipments. You can depart once the manifest is complete.</p><div class="driver-preparation"><div><span>Dispatch</span><b>${state.confirmed?'Released':'Planning'}</b></div><div><span>Shipments loaded</span><b>${list.filter(o=>o.loaded).length} / ${list.length}</b></div><div><span>Departure</span><b>09:00 · ${esc(v.bay)}</b></div></div><button class="btn primary wide" data-role="loader">Check loading progress ${icon('arrow')}</button></div>`:complete?`<div class="driver-empty delivery-finished"><span class="field-state-icon">${icon('check')}</span><div class="eyebrow">Route complete</div><h2>A good run.<br>Every store replenished.</h2><p>${list.length} successful stops. ${list.reduce((n,o)=>n+o.cartons,0)} cartons delivered across Colombo East.</p><div class="completion-receipt"><span>${icon(state.pending.length?'wifi':'check')}</span><div><b>${state.pending.length?'Receipts saved on this device':'All delivery receipts saved'}</b><p>${state.pending.length?`${state.pending.length} updates waiting to sync. Reconnect to complete the handoff.`:'The store and dispatch views now show every completed delivery.'}</p></div></div><button class="btn wide" data-action="activity">View delivery receipts ${icon('arrow')}</button></div>`:!next?`<div class="driver-empty"><span class="field-state-icon is-amber">${icon('clock')}</span><div class="eyebrow">${deferred.length} stop${deferred.length!==1?'s':''} to revisit</div><h2>Your route is still open.</h2><p>${done} of ${list.length} delivered. Review the stops below and retry when the store is ready. These deliveries are still outstanding.</p>${deferred.map(o=>`<div class="return-stop"><div><b>${esc(o.store)}</b><p>${esc(o.issueType||'Delivery issue')}</p><small>Shipment awaiting reconciliation</small></div><button class="btn" data-action="retry-stop" data-id="${o.id}">Retry stop ${icon('refresh')}</button></div>`).join('')}</div>`:`
    <div class="driver-stop"><div class="driver-stop-eyebrow"><span class="eyebrow">${next.returnRequested?'Return visit':next.arrived?'At your stop':state.started?'Next stop':'First stop'} · ${stop} of ${list.length}</span>${next.arrived?'<span class="arrival-mark">'+icon('check')+' Arrived</span>':''}</div><h1>${esc(next.store).replace(' · ','<span>')}${next.store.includes(' · ')?'</span>':''}</h1><p class="driver-address">${icon('pin')}<span>${esc(next.address)}</span></p><div class="driver-window"><span>${icon('clock')} Delivery window</span><b>${esc(next.window)}</b></div>
    <div class="driver-navigation"><a class="btn" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(next.address+', Sri Lanka')}" target="_blank" rel="noopener">${icon('navigate')} Navigate</a><button class="btn" data-action="contact" data-id="${next.id}">${icon('phone')} Contact store</button></div>
    <div class="driver-shipment"><div><span class="eyebrow">${esc(next.id)}</span><b>${next.cartons} <span>cartons</span></b></div><div><small>${next.items.filter(Boolean).length} products · ${next.weight} kg</small><button class="mini-btn" data-action="order-detail" data-id="${next.id}">View items ${icon('chevron')}</button></div></div>
    ${next.resolution&&next.returnRequested?`<div class="driver-return-note">${icon('check')} Return visit · ${esc(next.resolution)}</div>`:''}${next.issue?`<div class="notice">${icon('warning')} ${esc(next.issue)}</div>`:''}
    ${next.arrived?`<p class="driver-next-guidance">${icon('box')} Count the cartons with the recipient, then record the delivery receipt.</p>`:''}
    <div class="driver-action-dock"><div class="driver-dock-context"><b>${next.arrived?'Ready to hand over':state.started?'Next up':'Manifest checked'}</b><span>${next.cartons} cartons · ${esc(next.area)}</span></div><button class="btn primary wide" data-action="${action}" data-id="${next.id}">${icon(!state.started?'truck':next.arrived?'check':'pin')} ${label}</button></div>
    ${state.started?`<button class="btn ghost wide driver-report" data-action="issue" data-id="${next.id}">${icon('warning')} Report a delivery issue</button>`:`<p class="driver-next-guidance">${icon('check')} ${list.length} stops loaded. Start your route when you leave the warehouse.</p>`}
    ${deferred.length?`<button class="deferred-reminder" data-action="field-return-list">${icon('clock')}<span><b>${deferred.length} stop${deferred.length!==1?'s':''} saved for later</b><small>Return visit needed · still outstanding</small></span>${icon('chevron')}</button>`:''}
    <p class="driver-sync-note">${icon(state.offline?'wifi':'check')}${state.offline?'Saved here. Updates sync when you reconnect.':'Progress shared in this demo workspace.'}</p></div>`}
  </section>
  <aside class="driver-route-overview" id="driver-route-overview" aria-label="Route overview"><div class="driver-overview-heading"><div><div class="eyebrow">The route ahead</div><h2>${list.length} stops. One connected journey.</h2></div><button class="btn ghost driver-route-close" data-action="field-route-toggle" aria-label="Close route overview">${icon('close')}</button></div>${mapView()}<div class="driver-depot">${icon('box')}<div><b>Peliyagoda distribution centre</b><small>${esc(v.bay)} · ${esc(v.id)} · Departure 09:00</small></div></div>${fieldRouteList(list,next)}<div class="driver-route-note">${icon('wifi')}<p><b>Ready for the road, even offline.</b><span>Your confirmations stay on this device until you reconnect. Synchronization is simulated.</span></p></div></aside>
  </div>`;
}

function fieldFormError(message, field) {
  document.querySelectorAll('#dialog [aria-invalid="true"]').forEach(input=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');});
  let error=document.querySelector('#field-form-error');
  if(!error){error=document.createElement('p');error.id='field-form-error';error.className='field-form-error';error.setAttribute('role','alert');document.querySelector('#dialog .dialog-actions')?.before(error);}
  error.textContent=message;
  if(field){field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby','field-form-error');field.focus();}
  toast(message);
}
function fieldResolution(o,retry=false) {
  openDialog(`<div class="eyebrow">${esc(o.id)} · ${retry?'Return visit':'Issue resolution'}</div><h2>${retry?'Ready to try this stop again?':'Resolve this shipment.'}</h2><p>${esc(o.issue)}</p><label class="form-label" for="resolution">${retry?'What changed?':'What was done to resolve it?'}</label><input class="input" id="resolution" placeholder="${retry?'e.g. Store reopened; recipient is available':'e.g. Missing cartons located and counted'}" maxlength="240"><p class="helper">${retry?'This stop will become your next delivery. Verify the carton count when you arrive.':'The resolution is saved in the shared activity log.'}</p><div class="dialog-actions"><button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="resolved" data-id="${o.id}" ${retry?'data-retry="true"':''}>${retry?'Retry this stop':'Confirm resolution'}</button></div>`);
}
function handleFieldAction(action,button,o) {
  switch(action) {
    case 'field-route-toggle': fieldRouteOpen=!fieldRouteOpen;render();if(fieldRouteOpen&&innerWidth<=760)document.querySelector('#driver-route-overview')?.scrollIntoView({behavior:'smooth',block:'start'});return true;
    case 'field-return-list': openDialog(`<div class="eyebrow">Return later</div><h2>Still on your route.</h2><p>These shipments still need reconciliation. Retry a stop when the issue has been resolved.</p>${assigned().filter(o=>o.deferred&&o.status!=='Delivered').map(o=>`<div class="return-stop"><div><b>${esc(o.store)}</b><p>${esc(o.issue)}</p></div><button class="btn" data-action="retry-stop" data-id="${o.id}">Retry</button></div>`).join('')}${dialogFooter()}`);return true;
    case 'loaded': {
      const next=assigned().slice().reverse().find(item=>!item.loaded);
      if(!o||!state.confirmed||state.ready||o.issue||o!==next)return true;
      o.loaded=true;o.status='Loading';record(`${o.id}: ${o.cartons} cartons checked and loaded onto ${fieldVehicle().id}`);render();toast(`${o.id} loaded. ${state.offline?'Saved on this device.':'Manifest updated.'}`);return true;
    }
    case 'complete-loading': if(!state.confirmed||state.ready||!assigned().length||!assigned().every(o=>o.loaded&&!o.issue))return true;state.ready=true;assigned().forEach(o=>o.status='Ready');record(`${fieldVehicle().id}: manifest checked, loading complete, ready for departure`);render();toast('Loading complete. The driver can start R-07.');return true;
    case 'issue': {
      if(!o)return true;const delivery=role==='delivery';
      const options=delivery?['Store closed','Recipient unavailable','Damaged goods','Partial delivery','Delivery refused','Access delayed']:['Missing cartons','Quantity mismatch','Damaged goods'];
      openDialog(`<div class="eyebrow">${esc(o.id)} · ${delivery?'Delivery exception':'Loading exception'}</div><h2>${delivery?'A delay. A clear next step.':'Flag it before it leaves.'}</h2><p>${delivery?'Record the problem and retain any outstanding cartons. Continue to your next stop; this delivery stays open.':'This shipment pauses until the issue is resolved. The next load stays in sequence.'}</p><label class="form-label" for="issue-type">What happened?</label><select class="input" id="issue-type">${options.map(s=>`<option>${s}</option>`).join('')}</select><div class="field-issue-advice" id="issue-advice">${delivery?'Contact the receiving desk before leaving. Plan a return visit when the store reopens.':'Check the pick location and count the remaining cartons with your supervisor.'}</div><label class="form-label" for="issue-note">Details <span class="muted">(optional)</span></label><textarea class="input" id="issue-note" maxlength="500" placeholder="${delivery?'Contact attempts, quantities or a suitable return time…':'Affected product, carton count or condition…'}"></textarea>${delivery?'<p class="helper">Partial or damaged shipments remain open for reconciliation. No receipt is marked complete.</p>':''}<div class="dialog-actions"><button class="btn" data-action="close">Cancel</button><button class="btn primary" data-action="save-issue" data-id="${o.id}" data-field-context="${delivery?'delivery':'loader'}">${delivery?'Save & return later':'Save issue'}</button></div>`);
      document.querySelector('#issue-type')?.addEventListener('change',e=>{const advice={'Store closed':'Contact the receiving desk before leaving. Plan a return visit when the store reopens.','Recipient unavailable':'Contact the duty manager. Keep the shipment on board until an authorized recipient can accept it.','Damaged goods':'Separate affected cartons and record the product and quantity. Keep the shipment open for reconciliation.','Partial delivery':'Record accepted and outstanding quantities below. The order stays open until the remaining cartons are reconciled.','Delivery refused':'Record the reason for refusal and hold the shipment for a return visit or dispatch review.','Access delayed':'Ask the receiving desk for an access time, then continue to your next available stop.','Missing cartons':'Check the pick location and count the remaining cartons with your supervisor.','Quantity mismatch':'Recount the affected product against the manifest before confirming the load.'};document.querySelector('#issue-advice').textContent=advice[e.target.value]||'';});return true;
    }
    case 'save-issue': {
      if(!o)return true;const type=document.querySelector('#issue-type')?.value,note=document.querySelector('#issue-note')?.value.trim()||'';if(!type)return true;
      o.previousStatus=o.status==='Issue'?o.previousStatus:o.status;o.issueType=type;o.issue=type+(note?': '+note:'');o.status='Issue';o.issueContext=button.dataset.fieldContext||role;
      if(o.issueContext==='delivery'){o.deferred=true;o.returnRequested=false;}
      record(`${o.id}: ${o.issue}${o.deferred?' · return visit required; shipment remains outstanding':''}`);closeDialog();render();toast(o.deferred?'Stop saved for later. Continue your route; this delivery remains open.':'Issue recorded. Resolve it to continue loading.');return true;
    }
    case 'retry-stop': if(!o||o.status==='Delivered')return true;fieldResolution(o,true);return true;
    case 'resolve': if(!o)return true;fieldResolution(o,Boolean(o.deferred));return true;
    case 'resolved': {
      if(!o)return true;const input=document.querySelector('#resolution'),note=input?.value.trim();if(!note){fieldFormError('Add a resolution note to continue.',input);return true;}
      const retry=button.dataset.retry==='true'||o.deferred;o.issue='';o.issueType='';o.resolution=note;o.deferred=false;o.returnRequested=retry;
      if(retry){o.arrived=false;o.status=state.started?'In transit':'Ready';}else{o.status=o.previousStatus||(state.ready?'Ready':'Ready to load');}
      record(`${o.id} issue resolved: ${note}${retry?' · return visit scheduled next':''}`);closeDialog();render();toast(retry?'Return visit ready. Navigate to the store, then record your arrival.':'Issue resolved. You can continue.');return true;
    }
    case 'start-route': if(!state.ready||state.started)return true;state.started=true;assigned().forEach(o=>{if(o.status!=='Delivered'&&!o.issue)o.status='In transit';});record(`${fieldVehicle().driver} departed Peliyagoda on R-07`);render();toast('Route started. Your first stop is ready.');return true;
    case 'arrived': if(!o||!state.started||o.status==='Delivered'||o.issue||o.deferred||o!==nextDelivery())return true;o.arrived=true;record(`Driver arrived at ${o.store}`);render();toast('Arrival recorded. Verify the cartons with the recipient.');return true;
    case 'verify-delivery': {
      if(!o||!o.arrived||o.issue||o.deferred||o.status==='Delivered')return true;
      const time=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false});
      openDialog(`<div class="eyebrow">Proof of delivery · ${esc(o.id)}</div><h2>One final check. Then delivered.</h2><p>${esc(o.store)}<br>Verify the cartons together and record who received them.</p><div class="proof-summary"><span>${o.items.filter(Boolean).length} product lines</span><b>${o.cartons} cartons expected</b></div><label class="form-label" for="verified-cartons">Cartons handed over</label><input class="input" id="verified-cartons" type="number" inputmode="numeric" min="0" max="${o.cartons}" step="1" value="${o.cartons}"><label class="check-row proof-check"><input type="checkbox" id="verified"> <span>All items and carton counts verified with the recipient</span></label><label class="form-label" for="recipient">Received by <span aria-hidden="true">*</span></label><input class="input" id="recipient" autocomplete="name" maxlength="80" placeholder="Recipient’s full name" required><label class="form-label" for="delivery-time">Delivery time <span aria-hidden="true">*</span></label><input class="input" id="delivery-time" type="time" value="${time}" required><p class="helper">${state.offline?'Receipt saved on this device. It will queue for sync when you reconnect.':'This receipt updates the store, dispatch and your route in this demo.'}</p><div class="dialog-actions"><button class="btn" data-action="close">Back</button><button class="btn primary" data-action="delivered" data-id="${o.id}">Confirm delivery ${icon('check')}</button></div>`);return true;
    }
    case 'delivered': {
      if(!o||!o.arrived||o.issue||o.deferred||o.status==='Delivered')return true;
      const cartons=document.querySelector('#verified-cartons'),verified=document.querySelector('#verified'),recipient=document.querySelector('#recipient'),time=document.querySelector('#delivery-time');
      if(!cartons||cartons.value.trim()===''||Number(cartons.value)!==o.cartons){fieldFormError(`Confirm all ${o.cartons} cartons, or report a partial delivery.`,cartons);return true;}
      if(!verified?.checked){fieldFormError('Verify the items and carton count with the recipient.',verified);return true;}
      if(!recipient?.value.trim()||recipient.value.trim().length<2){fieldFormError('Enter the recipient’s name to save the receipt.',recipient);return true;}
      if(!time?.value||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time.value)){fieldFormError('Enter a valid delivery time.',time);return true;}
      o.status='Delivered';o.recipient=recipient.value.trim();o.deliveredAt=time.value;o.deliveredCartons=Number(cartons.value);o.deferred=false;o.returnRequested=false;
      record(`${o.id}: ${o.cartons} cartons delivered to ${o.recipient} at ${o.deliveredAt} · ${o.store}`);closeDialog();render();toast(assigned().every(item=>item.status==='Delivered')?'Route complete. Every receipt is saved.':'Delivery complete. Your next step is ready.');window.scrollTo({top:0,behavior:'smooth'});return true;
    }
    default:return false;
  }
}
function bindFieldInputs() {}
document.addEventListener('input',event=>{
  if(event.target.matches('#dialog [aria-invalid="true"]')){
    event.target.removeAttribute('aria-invalid');event.target.removeAttribute('aria-describedby');
    document.querySelector('#field-form-error')?.remove();
  }
});
