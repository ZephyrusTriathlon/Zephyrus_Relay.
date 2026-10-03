/* Store orders are fetched from PostgreSQL through the scoped API. Drafts are memory-only. */
let stockFilter = 'all';
let storeData = null, storeOwner = null, storeError = '', storeLoading = false;
let storeTemperature = 'AMBIENT', storeDate = '', storeOffset = 0, storeSubmitting = false;
let storeGeneration = 0;
let storeReadSequence = 0;
let storeReadPromise = null;
function resetStoreData() {
  storeGeneration++; storeData = null; storeOwner = null; storeError = ''; storeLoading = false;
  storeDate = ''; storeOffset = 0; storeTemperature = 'AMBIENT'; stockFilter = 'all'; productQuery = ''; quantities = products.map(() => 0);
}
async function storeRequest(path = '', body) {
  const response = await fetch('/api/orders' + path, { credentials: 'same-origin', cache: 'no-store',
    ...(body ? {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)} : {}) });
  const data = await response.json();
  if (!response.ok) { if (response.status === 401) await refreshIdentity(); throw new Error(data.error?.message || 'Orders unavailable'); }
  return data;
}
async function loadStoreOrders() {
  if (currentAccount()?.workspace !== 'store') return;
  const owner = currentAccount().id, generation = storeGeneration;
  const sequence = ++storeReadSequence;
  storeLoading = true; storeError = '';
  const read = (async()=>{
  try {
    const [context, listing] = await Promise.all([storeRequest('/context'), storeRequest(`?limit=20&offset=${storeOffset}`)]);
    if (sequence !== storeReadSequence || generation !== storeGeneration || currentAccount()?.id !== owner) return;
    storeData = {...context, ...listing}; storeOwner = owner;
    if (!storeDate) storeDate = context.ordering.earliestDeliveryDate ?? '';
  } catch (error) { if (sequence === storeReadSequence && generation === storeGeneration) storeError = error.message; }
  finally { if (sequence === storeReadSequence && generation === storeGeneration) { storeLoading = false; if (currentAccount()?.workspace === 'store') render(); } }
  })();
  storeReadPromise=read;
  // A post-create refresh must not return while a newer focus/refresh read is
  // still in flight. The latest read owns the view; await that actual work.
  let pending=read;
  while(pending){
    await pending;
    if(generation!==storeGeneration||currentAccount()?.id!==owner||storeReadPromise===pending)return;
    pending=storeReadPromise;
  }
}
function storeOwnOrders() { return storeOwner === currentAccount()?.id ? storeData?.orders || [] : []; }
function storeStock(p) { return {stock:p.stock, incoming:0, suggested:p.recommend, health:p.health, cover:'Demo stock estimate'}; }
function storeFilteredProducts() {
  return products.map((p,i) => ({p,i,s:storeStock(p)})).filter(({p,s}) => p.temp.toUpperCase() === storeTemperature &&
    `${p.name} ${p.code}`.toLowerCase().includes(productQuery.toLowerCase()) &&
    (stockFilter === 'all' || stockFilter === 'attention' && s.health !== 'Healthy' || stockFilter === 'healthy' && s.health === 'Healthy'));
}
function storeView() {
  if (storeOwner !== currentAccount().id && !storeLoading && !storeError) queueMicrotask(loadStoreOrders);
  const outlet = storeData?.outlet;
  return `${heading(outlet ? `${esc(outlet.brand)} · ${esc(outlet.id)} · ${esc(outlet.district)}` : 'Store operations', 'Keep your shelves ready.', 'Place next-day orders before 16:00 Asia/Colombo and follow their status.')}
    ${storeError ? `<div class="notice" role="alert">${esc(storeError)} <button class="btn" data-action="store-refresh">Retry</button></div>` : ''}
    ${!outlet ? '<p role="status">Loading your outlet and orders...</p>' : `
    <section class="store-overview"><div class="store-stock-signal"><span class="store-signal-icon">${icon('box')}</span><div><b>${storeData.total} orders saved</b><p>${esc(outlet.id)} &middot; ${esc(outlet.depot.name)}<br>Track confirmation, scheduling and deferrals.</p></div></div><div class="store-delivery-signal"><div><span class="store-meta">Next-day planning queue</span><h2>${storeData.ordering.nextDayOpen ? 'Open until 16:00' : 'Closed for tomorrow'}</h2><p>${storeData.ordering.nextDayOpen ? 'Orders are confirmed for planning. Scheduling follows later.' : 'Choose a later date. The server rejects next-day orders at and after 16:00.'}</p></div><button class="btn" data-action="store-refresh">Refresh status</button></div></section>
    <div class="toolbar store-toolbar"><div class="tabs"><button data-action="store-replenish" class="${tab === 'replenishment' ? 'active' : ''}">Replenishment</button><button data-action="store-orders" class="${tab === 'orders' ? 'active' : ''}">Order tracking <span class="badge">${storeData.total}</span></button></div></div>
    ${tab === 'orders' ? storeOrders(storeOwnOrders()) : `<div class="store-layout"><section class="store-inventory">
    <div class="store-section-heading"><div><h2>Your inventory</h2><p class="store-meta">Demo product catalogue and stock suggestions · quantities are cartons.</p></div><button class="btn" data-action="recommended">Use suggestions</button></div>
    <div class="store-filters"><label>Temperature <select id="store-temperature" class="filter-select"><option ${storeTemperature === 'AMBIENT' ? 'selected' : ''}>AMBIENT</option><option ${storeTemperature === 'CHILLED' ? 'selected' : ''}>CHILLED</option></select></label><label>Requested delivery <input id="store-date" class="input" type="date" value="${esc(storeDate)}" min="${storeData.ordering.earliestDeliveryDate ?? ''}"></label></div>
    ${storeData.ordering.earliestDeliveryDate ? '' : '<p class="helper" role="status">No open operating date is available in the shared calendar. Contact your operations administrator.</p>'}
    <p class="helper">Ambient and chilled baskets create separate orders, even for the same date.</p>
    <div class="store-filters"><label class="search">${icon('search')}<input id="product-search" value="${esc(productQuery)}" aria-label="Search products" placeholder="Search product or SKU"></label><select id="stock-filter" class="filter-select" aria-label="Filter stock health"><option value="all" ${stockFilter==='all'?'selected':''}>All stock</option><option value="attention" ${stockFilter==='attention'?'selected':''}>Needs attention</option><option value="healthy" ${stockFilter==='healthy'?'selected':''}>Healthy stock</option></select></div>
    <div class="store-table table-wrap"><table><thead><tr><th>Product</th><th>On hand</th><th>Stock health</th><th>Order quantity</th></tr></thead><tbody id="product-rows">${productRows()}</tbody></table></div>
    </section><aside class="summary store-summary"><div class="store-summary-intro"><span class="eyebrow">Draft replenishment</span><h2>Your order</h2><p>${esc(outlet.brand)} · ${esc(outlet.id)}<br>${esc(outlet.depot.name)}</p></div><div id="basket-summary">${basketSummary()}</div></aside></div>`}`}`;
}
function basketSummary() {
  const units = quantities.reduce((n,q) => n+q,0);
  const weight = quantities.reduce((n,q,i) => n+q*products[i].weight,0);
  return `<div class="store-basket-totals"><div class="big">${units}<span>cartons</span></div><p>${weight} kg · ${storeTemperature.toLowerCase()}</p></div><div class="store-basket-details"><div class="detail-row"><span>Requested delivery</span><b>${esc(storeDate)}</b></div><div class="detail-row"><span>Cutoff</span><b>16:00 Asia/Colombo</b></div></div><div class="store-desktop-review"><button class="btn primary wide" data-action="create-order" ${!units || storeSubmitting ? 'disabled' : ''}>Review order ${icon('arrow')}</button><p class="helper">Online submission required. Confirmation means accepted for planning.</p></div><div class="store-mobile-action"><div class="store-mobile-total"><b>${units} <span>cartons</span></b><small>${weight} kg &middot; ${storeTemperature.toLowerCase()}</small></div><button class="btn primary" data-action="create-order" ${!units || storeSubmitting ? 'disabled' : ''}>Review order ${icon('arrow')}</button></div>`;
}
const storeStatusLabel = status => ({CONFIRMED:'Confirmed',PLANNED:'Scheduled',DEFERRED:'Deferred',RELEASED:'Released',IN_DELIVERY:'In delivery',DELIVERED:'Delivered',RECEIVED:'Received',CANCELLED:'Cancelled'})[status] || status;
function storeStatusDetails(o) {
  const a = o.allocation;
  return `<p class="store-status-copy">${o.status === 'CONFIRMED' ? 'Confirmed for planning. Awaiting scheduling.' : esc(storeStatusLabel(o.status))}</p>
    ${a ? `<div class="store-arrival-details"><div class="detail-row"><span>Scheduled trip</span><b>${esc(a.trip.tripNumber)}</b></div><div class="detail-row"><span>Vehicle</span><b>${esc(a.trip.vehicleId)}</b></div><div class="detail-row"><span>Expected arrival</span><b>${a.tripStop.expectedAt ? esc(new Date(a.tripStop.expectedAt).toLocaleString('en-GB',{timeZone:'Asia/Colombo'})) + ' Colombo' : 'Pending'}</b></div></div>` : ''}
    ${storeReceiptSummary(o)}
    ${o.deferrals.map(d => `<div class="notice"><span><b>${esc(d.reason)}</b> · ${esc(d.explanation)}<br>${esc(d.impact)}${d.nextEligibleDate ? `<br>Next eligible date: ${esc(d.nextEligibleDate.slice(0,10))}` : ''}${d.resolvedAt ? ' · Resolved' : ''}</span></div>`).join('')}`;
}
function storeReceiptSummary(o) {
  const a=o.allocation,p=a?.proof;
  const issues=[...(a?.loadingIssues||[]),...(a?.exceptions||[])].filter(i=>i.status==='OPEN');
  return `${a?`<p>Trip status: ${esc(a.trip.status)}</p>`:''}${issues.map(i=>`<p class="notice">${esc(i.type.replaceAll('_',' '))}: ${esc(i.details)}</p>`).join('')}${p?`<p>${p.deliveredCartons} cartons delivered to ${esc(p.recipient)} · ${esc(fieldTime(p.deliveredAt))}</p><button class="btn" data-action="store-receipt" data-id="${esc(o.id)}">View receipt</button> ${p.receipt?badge('Received'):badge(issues.length?'Receipt issue':'Awaiting receipt')}`:''}`;
}
async function showStoreReceipt(id) {
  const owner=currentAccount()?.id;
  try {
    const {order:o}=await storeRequest('/'+encodeURIComponent(id));if(owner!==currentAccount()?.id)return;
    const a=o.allocation,p=a?.proof;if(!p)return;
    const issues=a.exceptions.filter(i=>i.status==='OPEN');
    openDialog(`<div class="eyebrow">${esc(o.orderNumber)}</div><h2>Delivery receipt</h2><p>${p.deliveredCartons} cartons · ${esc(p.recipient)}<br>${esc(fieldTime(p.deliveredAt))} Colombo<br>${p.verified?'Carton count verified':'Unverified'}</p>${issues.map(i=>`<p class="notice">${esc(i.type)} · ${esc(i.details)}</p>`).join('')}${p.receipt?`<p>Receipt confirmed · ${esc(fieldTime(p.receipt.confirmedAt))}</p>`:`<label class="form-label" for="receipt-note">Issue / resolution details</label><textarea class="input" id="receipt-note" maxlength="500"></textarea><label class="form-label" for="receipt-type">Issue type</label><select class="input" id="receipt-type"><option value="PARTIAL_DELIVERY">Quantity mismatch</option><option value="DAMAGED_GOODS">Damaged goods</option></select><div class="dialog-actions"><button class="btn" data-action="store-receipt-issue" data-id="${esc(o.id)}">Report an issue</button><button class="btn primary" data-action="${issues.length?'store-resolve-receipt':'store-confirm-receipt'}" data-id="${esc(o.id)}">${issues.length?'Resolve issue':'Confirm receipt'}</button></div>`}`);
  }catch(e){toast(e.message);}
}
async function mutateStoreReceipt(action,button) {
  button.disabled=true;const owner=currentAccount()?.id;
  try {
    const {order:o}=await storeRequest('/'+encodeURIComponent(button.dataset.id));if(owner!==currentAccount()?.id)return;
    const a=o.allocation,operation=action==='store-confirm-receipt'?'receipt':action==='store-resolve-receipt'?'resolve-receipt':'receipt-issue';
    const body=operation==='receipt'?{cartons:a.proof.deliveredCartons}:operation==='resolve-receipt'?{resolution:document.querySelector('#receipt-note').value}:{type:document.querySelector('#receipt-type').value,details:document.querySelector('#receipt-note').value};
    await operationRequest(`/trips/${encodeURIComponent(a.tripId)}/allocations/${encodeURIComponent(a.id)}/${operation}`,body);
    if(owner!==currentAccount()?.id)return;await loadStoreOrders();await showStoreReceipt(o.id);
  }catch(e){fieldFormError(e.message);}finally{button.disabled=false;}
}
function storeOrders(orders) {
  return `<section class="store-orders"><h2>Every order, every handoff</h2>${orders.length ? orders.map(o => `<article class="store-tracking-card"><header><div><span class="store-meta">${esc(o.brand)} · ${esc(o.temperatureRequirement)}</span><h3>${esc(o.orderNumber)}</h3></div>${badge(storeStatusLabel(o.status))}</header><div class="store-tracking-facts"><span>${o.units} cartons · ${o.weightKg} kg · ${o.volumeM3} m³</span><span>Requested delivery: ${esc(o.deliveryDate)}</span></div>${storeStatusDetails(o)}<footer><span class="store-meta">${esc(new Date(o.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Colombo'}))} Colombo</span><button class="btn" data-action="order-detail" data-id="${esc(o.id)}">Order details</button></footer></article>`).join('') : '<p>No orders on this page. Place your first replenishment.</p>'}
    <button class="btn" data-action="store-prev" ${storeOffset === 0 ? 'disabled' : ''}>Previous</button> <button class="btn" data-action="store-next" ${storeOffset+20 >= storeData.total ? 'disabled' : ''}>Next</button></section>`;
}
function productRows() {
  const list = storeFilteredProducts();
  return list.length ? list.map(({ p, i, s }) => `<tr class="store-product-row ${quantities[i] ? 'is-selected' : ''}" data-product-row="${i}">
    <td class="store-product-cell"><div class="product"><span class="product-symbol">${icon('box')}</span><div class="stack"><b>${p.name}</b><small>${p.size}</small><span class="store-sku">${p.code}</span></div></div></td>
    <td class="store-stock-cell"><span class="store-mobile-label">On hand</span><b>${s.stock}</b> <span class="store-meta">ctn</span>${s.incoming ? `<span class="store-on-order">${s.incoming} on order</span>` : '<span class="store-mobile-availability">Demo stock snapshot</span>'}</td>
    <td class="store-health-cell">${badge(s.health)}<span class="store-cover">${s.cover}</span></td>
    <td class="store-quantity-cell"><div class="store-quantity-caption"><span class="store-mobile-label">Order cartons</span><span class="store-suggestion">Suggested <b>${s.suggested}</b></span></div><div class="store-stepper"><button type="button" data-action="store-step" data-product="${i}" data-delta="-1" aria-label="Remove one carton of ${p.name}" ${!quantities[i] ? 'disabled' : ''}>−</button><input class="qty" type="number" inputmode="numeric" min="0" max="50" step="1" value="${quantities[i]}" data-qty="${i}" aria-label="Cartons of ${p.name}"><button type="button" data-action="store-step" data-product="${i}" data-delta="1" aria-label="Add one carton of ${p.name}" ${quantities[i] >= 50 ? 'disabled' : ''}>+</button></div></td>
  </tr>`).join('') : `<tr class="store-empty-row"><td colspan="4"><div class="store-search-empty">${icon('search')}<h3>No matching products</h3><p>Try another product name, SKU or stock filter.</p><button class="btn" data-action="store-clear-filter">Clear search & filters</button></div></td></tr>`;
}

function bindStoreInputs() {
  document.querySelector('#store-date')?.addEventListener('change', e => { storeDate=e.target.value; storeQuantityChanged(); });
  document.querySelector('#store-temperature')?.addEventListener('change', e => { storeTemperature=e.target.value; quantities=products.map(() => 0); render(); });
  document.querySelector('#stock-filter')?.addEventListener('change', e => {
    stockFilter = e.target.value;
    updateStoreResults();
  });
  document.querySelector('#product-search')?.addEventListener('input', e => {
    productQuery = e.target.value;
    updateStoreResults();
  });
  document.querySelector('#product-rows')?.addEventListener('focusout', e => {
    if (e.target.matches('[data-qty]')) e.target.value = quantities[Number(e.target.dataset.qty)];
  });
}

function updateStoreResults() {
  const rows = document.querySelector('#product-rows');
  if (rows) rows.innerHTML = productRows();
  const result = document.querySelector('#product-result');
  if (result) result.textContent = `${storeFilteredProducts().length} of ${products.length} products`;
}

function storeQuantityChanged() {
  const summary = document.querySelector('#basket-summary');
  if (summary) summary.innerHTML = basketSummary();
  document.querySelectorAll('[data-product-row]').forEach(row => {
    const i = Number(row.dataset.productRow);
    row.classList.toggle('is-selected', quantities[i] > 0);
    row.querySelector('[data-delta="-1"]').disabled = !quantities[i];
    row.querySelector('[data-delta="1"]').disabled = quantities[i] >= 50;
    const input = row.querySelector('[data-qty]');
    if (document.activeElement !== input) input.value = quantities[i];
  });
}


async function submitStoreOrder(button) {
  if (storeSubmitting) return;
  storeSubmitting = true; button.disabled = true;
  const owner = currentAccount()?.id, generation = storeGeneration;
  try {
    const {order} = await storeRequest('', {deliveryDate:storeDate, temperatureRequirement:storeTemperature,
      items:products.flatMap((p,i) => quantities[i] ? [{productCode:p.code,description:p.name,units:quantities[i],unitWeightKg:p.weight,unitVolumeM3:p.volume}] : [])});
    if (generation !== storeGeneration || currentAccount()?.id !== owner) return;
    quantities = products.map(() => 0); tab = 'orders'; storeOffset = 0;
    await loadStoreOrders();
    if (generation !== storeGeneration || currentAccount()?.id !== owner) return;
    openDialog(`<div class="success-mark" data-order-id="${esc(order.id)}">${icon('check')}</div><h2>Order confirmed for planning.</h2><p>${esc(order.orderNumber)}<br>${order.units} cartons · ${esc(order.temperatureRequirement)}<br>Requested delivery: ${esc(order.deliveryDate)}</p><p>Saved to the server. Scheduling is pending.</p>${dialogFooter('Track order')}`);
  } catch (error) { if (generation === storeGeneration) { const message = document.querySelector('#store-submit-error'); if (message) message.textContent = error.message; else toast(error.message); } }
  finally {
    storeSubmitting = false; button.disabled = false;
    if (generation === storeGeneration && currentAccount()?.id === owner) storeQuantityChanged();
  }
}
async function showStoreOrder(id) {
  const owner = currentAccount()?.id, generation = storeGeneration;
  try {
    const {order:o} = await storeRequest('/' + encodeURIComponent(id));
    if (generation !== storeGeneration || currentAccount()?.id !== owner) return;
    openDialog(`<div class="eyebrow">${esc(o.orderNumber)}</div><h2>${esc(o.outletId)} · ${storeStatusLabel(o.status)}</h2><p>Requested delivery: ${esc(o.deliveryDate)} · ${esc(o.temperatureRequirement)}</p>${storeStatusDetails(o)}<div class="store-review-lines">${o.items.map(i => `<div class="store-review-line"><div><b>${esc(i.description)}</b><small>${esc(i.productCode)}</small></div><strong>${i.units} cartons</strong></div>`).join('')}</div><h3>Status history</h3>${o.history.map(h => `<p>${esc(storeStatusLabel(h.status))} · ${esc(new Date(h.occurredAt).toLocaleString('en-GB',{timeZone:'Asia/Colombo'}))} Colombo<br>${esc(h.note)}</p>`).join('')}${dialogFooter()}`);
  } catch (error) { toast(error.message); }
}
function handleStoreAction(action, button) {
  if (role !== 'store') return false;
  if(action==='store-receipt'){showStoreReceipt(button.dataset.id);return true;}
  if(['store-confirm-receipt','store-receipt-issue','store-resolve-receipt'].includes(action)){mutateStoreReceipt(action,button);return true;}
  if (action === 'store-refresh') { loadStoreOrders(); return true; }
  if (action === 'store-orders' || action === 'store-replenish') { tab = action === 'store-orders' ? 'orders' : 'replenishment'; render(); if (tab === 'orders') loadStoreOrders(); return true; }
  if (action === 'store-next' || action === 'store-prev') { storeOffset = Math.max(0,storeOffset+(action === 'store-next' ? 20 : -20)); loadStoreOrders(); return true; }
  if (action === 'store-step') { const i = Number(button.dataset.product); quantities[i] = Math.min(50,Math.max(0,quantities[i]+Number(button.dataset.delta))); storeQuantityChanged(); return true; }
  if (action === 'store-clear-filter') { productQuery=''; stockFilter='all'; render(); return true; }
  if (action === 'recommended') { quantities = products.map(p => p.temp.toUpperCase() === storeTemperature ? p.recommend : 0); updateStoreResults(); storeQuantityChanged(); return true; }
  if (action === 'create-order') {
    if (!quantities.some(Boolean)) return true;
    openDialog(`<div class="eyebrow">Review replenishment</div><h2>${esc(storeData.outlet.id)} · ${storeTemperature.toLowerCase()}</h2><p>Requested delivery: ${esc(storeDate)}<br>Next-day orders close at 16:00 Asia/Colombo.</p><div class="store-review-lines">${products.map((p,i) => quantities[i] ? `<div class="store-review-line"><b>${esc(p.name)}</b><strong>${quantities[i]} cartons</strong></div>` : '').join('')}</div><p id="store-submit-error" class="form-error" role="alert"></p><div class="dialog-actions"><button class="btn" data-action="close">Keep editing</button><button class="btn primary" data-action="place-order">Place order</button></div>`); return true;
  }
  if (action === 'place-order') { submitStoreOrder(button); return true; }
  if (action === 'order-detail') { showStoreOrder(button.dataset.id); return true; }
  if (action === 'activity') { tab='orders'; render(); loadStoreOrders(); return true; }
  // No local operational mutations or simulated offline receipts for this role.
  return true;
}
