/* Store workspace. Shares the local order lifecycle with dispatch and field teams. */
let stockFilter = 'all';

function storeOwnOrders() {
  return state.orders.filter(o => o.area === 'Nugegoda' && o.store.startsWith('Keells'));
}

function storeStock(p, index) {
  const received = storeOwnOrders().filter(o => o.status === 'Delivered').reduce((sum, o) => sum + (o.items[index] || 0), 0);
  const incoming = storeOwnOrders().filter(o => o.status !== 'Delivered').reduce((sum, o) => sum + (o.items[index] || 0), 0);
  const suggested = Math.max(0, p.recommend - received - incoming);
  return {
    stock: p.stock + received,
    incoming,
    suggested,
    health: received >= p.recommend ? 'Healthy' : p.health,
    cover: received >= p.recommend || index > 2 ? '7+ days cover' : index < 2 ? '~2 days cover' : '~4 days cover'
  };
}

function storeWindowLabel(o) {
  return o?.nextRun ? 'Next run · window pending' : `Today, ${o?.window || '10:00 – 11:30'}`;
}

function storeFilteredProducts() {
  return products.map((p, i) => ({ p, i, s: storeStock(p, i) })).filter(({ p, s }) =>
    `${p.name} ${p.code}`.toLowerCase().includes(productQuery.toLowerCase()) &&
    (stockFilter === 'all' || stockFilter === 'attention' && s.health !== 'Healthy' || stockFilter === 'healthy' && s.health === 'Healthy')
  );
}

function storeView() {
  const mine = storeOwnOrders();
  const latest = [...mine].sort((a, b) => Number(b.id.slice(4)) - Number(a.id.slice(4)))[0];
  const low = products.filter((p, i) => storeStock(p, i).health === 'Low stock').length;
  const attention = products.filter((p, i) => storeStock(p, i).health !== 'Healthy').length;
  const vehicle = latest?.route ? vehicleForOrder(latest) : null;
  const delivered = latest?.status === 'Delivered';
  const deliveryTitle = latest ? `${latest.id} · ${latest.nextRun ? 'Queued for next run' : latest.status}` : state.confirmed ? 'Morning dispatch has closed' : 'Today, 10:00 – 11:30';
  const deliveryNote = !latest ? state.confirmed ? 'New orders join the next run. The delivery window is not yet confirmed.' : 'Order by 08:50 · Morning replenishment' : delivered ? `${latest.cartons} cartons received by ${esc(latest.recipient || 'the store team')} at ${esc(latest.deliveredAt || 'the recorded time')}.` : latest.issue ? 'An exception needs attention. Your team is reviewing the next step.' : latest.nextRun ? 'Saved for the next dispatch run. Your delivery window is awaiting confirmation.' : latest.route ? `${latest.route} · ${vehicle.id} · Requested window ${latest.window}` : 'Your order is with dispatch. We’ll show the route here once assigned.';
  return `${heading('Keells · Nugegoda', 'Keep your shelves ready.', 'A clear view of your stock, replenishment and next delivery.')}
    ${flow()}${offlineBanner()}
    <section class="store-overview" aria-label="Store overview">
      <div class="store-stock-signal"><span class="store-signal-icon ${attention ? 'attention' : ''}">${icon(attention ? 'warning' : 'check')}</span><div><b>${attention ? `${attention} product${attention === 1 ? '' : 's'} need${attention === 1 ? 's' : ''} attention` : 'Your essentials are well stocked'}</b><p>${low ? `${low} running low · about 2 days of stock remaining` : attention ? 'Replenish soon to cover the coming week' : 'Enough stock for the coming week'}</p></div></div>
      <div class="store-delivery-signal"><div><span class="store-meta">${latest ? delivered ? 'Latest delivery' : 'Latest replenishment' : 'Next delivery window'}</span><h2>${deliveryTitle}</h2><p>${deliveryNote}</p></div>${latest ? `<button class="btn ghost store-track-button" data-action="store-orders">Track order ${icon('arrow')}</button>` : badge(state.confirmed ? 'Next run only' : 'Orders open')}</div>
    </section>
    <div class="toolbar store-toolbar"><div class="tabs" aria-label="Store views"><button data-action="store-replenish" class="${tab === 'replenishment' ? 'active' : ''}" aria-current="${tab === 'replenishment' ? 'page' : 'false'}">Replenishment</button><button data-action="store-orders" class="${tab === 'orders' ? 'active' : ''}" aria-current="${tab === 'orders' ? 'page' : 'false'}">Order tracking <span class="badge">${mine.length}</span></button></div><span class="store-updated">Stock snapshot · today, 08:30</span></div>
    ${tab === 'orders' ? storeOrders(mine) : `<div class="store-layout">
      <section class="store-inventory" aria-labelledby="inventory-title">
        <div class="store-section-heading"><div><h2 id="inventory-title">Your inventory</h2><p class="store-meta">Order in full cartons. Adjust any suggestion.</p></div><button class="btn store-recommend" data-action="recommended" aria-label="Use recommended quantities" ${products.every((p, i) => storeStock(p, i).suggested === 0) ? 'disabled' : ''}>${icon('plus')}<span class="store-recommend-full">Use recommended quantities</span><span class="store-recommend-short">Use suggestions</span></button></div>
        <div class="store-filters"><label class="search">${icon('search')}<input id="product-search" value="${esc(productQuery)}" aria-label="Search products" placeholder="Search product or SKU"></label><select id="stock-filter" class="filter-select" aria-label="Filter stock health"><option value="all" ${stockFilter === 'all' ? 'selected' : ''}>All stock</option><option value="attention" ${stockFilter === 'attention' ? 'selected' : ''}>Needs attention</option><option value="healthy" ${stockFilter === 'healthy' ? 'selected' : ''}>Healthy stock</option></select></div>
        <div class="store-table table-wrap"><table><caption class="store-sr">Inventory, stock health and replenishment quantities</caption><thead><tr><th scope="col">Product</th><th scope="col">On hand</th><th scope="col">Stock health</th><th scope="col">Order quantity</th></tr></thead><tbody id="product-rows">${productRows()}</tbody></table></div>
        <div class="store-inventory-footer"><span id="product-result" aria-live="polite">${storeFilteredProducts().length} of ${products.length} products</span><span class="store-availability">${icon('check')} Available at Peliyagoda</span></div>
        <div class="store-rationale"><span>${icon('help')}</span><div><b>Why these quantities?</b><p>Suggestions cover around 7 days of demand, based on recent sales, current stock and cartons already on order. Adjust for promotions or busier days.</p><small>Demand and availability are simulated for this demo.</small></div></div>
      </section>
      <aside class="summary store-summary" aria-labelledby="basket-title"><div class="store-summary-intro"><span class="eyebrow">Draft replenishment</span><h2 id="basket-title">Your order</h2><p>Keells · Nugegoda<br><span>138, High Level Road</span></p></div><div id="basket-summary">${basketSummary()}</div></aside>
    </div>`}`;
}

function productRows() {
  const list = storeFilteredProducts();
  return list.length ? list.map(({ p, i, s }) => `<tr class="store-product-row ${quantities[i] ? 'is-selected' : ''}" data-product-row="${i}">
    <td class="store-product-cell"><div class="product"><span class="product-symbol">${icon('box')}</span><div class="stack"><b>${p.name}</b><small>${p.size}</small><span class="store-sku">${p.code}</span></div></div></td>
    <td class="store-stock-cell"><span class="store-mobile-label">On hand</span><b>${s.stock}</b> <span class="store-meta">ctn</span>${s.incoming ? `<span class="store-on-order">${s.incoming} on order</span>` : '<span class="store-mobile-availability">Warehouse available</span>'}</td>
    <td class="store-health-cell">${badge(s.health)}<span class="store-cover">${s.cover}</span></td>
    <td class="store-quantity-cell"><div class="store-quantity-caption"><span class="store-mobile-label">Order cartons</span><span class="store-suggestion">Suggested <b>${s.suggested}</b></span></div><div class="store-stepper"><button type="button" data-action="store-step" data-product="${i}" data-delta="-1" aria-label="Remove one carton of ${p.name}" ${!quantities[i] ? 'disabled' : ''}>−</button><input class="qty" type="number" inputmode="numeric" min="0" max="50" step="1" value="${quantities[i]}" data-qty="${i}" aria-label="Cartons of ${p.name}"><button type="button" data-action="store-step" data-product="${i}" data-delta="1" aria-label="Add one carton of ${p.name}" ${quantities[i] >= 50 ? 'disabled' : ''}>+</button></div></td>
  </tr>`).join('') : `<tr class="store-empty-row"><td colspan="4"><div class="store-search-empty">${icon('search')}<h3>No matching products</h3><p>Try another product name, SKU or stock filter.</p><button class="btn" data-action="store-clear-filter">Clear search & filters</button></div></td></tr>`;
}

function basketSummary() {
  const qty = quantities.reduce((a, b) => a + b, 0);
  const weight = quantities.reduce((n, q, i) => n + q * products[i].weight, 0);
  const lines = quantities.filter(Boolean).length;
  return `<div class="store-basket-totals"><div class="big">${qty}<span>cartons</span></div><p>${lines} product${lines !== 1 ? 's' : ''} <span>·</span> ${weight} kg</p></div>
    <div class="store-basket-details"><div class="detail-row"><span>Requested delivery</span><b>${state.confirmed ? 'Next run' : 'Today'}</b></div><div class="detail-row"><span>Delivery window</span><b>${state.confirmed ? 'To be confirmed' : '10:00 – 11:30'}</b></div><div class="detail-row"><span>Warehouse</span><b>Peliyagoda</b></div></div>
    <div class="store-desktop-review"><button class="btn primary wide" data-action="create-order" ${!qty ? 'disabled' : ''}>Review order ${icon('arrow')}</button><p class="helper">${state.confirmed ? 'Morning dispatch is closed. New orders join the next run.' : qty ? 'Review quantities before you place your order.' : 'Add quantities or use our suggestions to get started.'}</p>${qty ? '<button class="mini-btn store-clear" data-action="store-clear-basket">Clear quantities</button>' : ''}</div>
    <div class="store-mobile-action" aria-label="Order summary"><div class="store-mobile-total"><b>${qty} <span>cartons</span></b><small>${lines} products · ${weight} kg</small></div><button class="btn primary" data-action="create-order" ${!qty ? 'disabled' : ''}>Review order ${icon('arrow')}</button></div>`;
}

function storeStatusDescription(o) {
  if (o.issue) return 'Your team is working through an exception. Details are recorded below.';
  if (o.status === 'Delivered') return 'Delivery complete. Your stock position now includes the received cartons.';
  if (o.arrived) return 'The driver has arrived. Your receiving team can verify the delivery.';
  if (o.status === 'In transit') return 'Your replenishment is on the road. Please keep your receiving area ready.';
  if (o.status === 'Ready') return 'All cartons are checked and loaded. Your vehicle is ready to depart.';
  if (o.status === 'Loading' || o.status === 'Ready to load') return 'The warehouse is preparing and checking your cartons for departure.';
  if (o.route) return 'Your order has a route. Dispatch is reviewing the delivery plan.';
  if (o.nextRun) return 'Queued for the next run. Morning dispatch has closed; the next delivery window is awaiting confirmation.';
  return 'Order received. Dispatch will assign a vehicle and confirm the delivery plan.';
}

function storeOrders(mine) {
  if (!mine.length) return `<section class="store-orders-empty"><span class="store-empty-symbol">${icon('box')}</span><span class="eyebrow">From order to shelf</span><h2>Your first replenishment starts here.</h2><p>Choose the quantities your store needs. Follow the same order through planning, loading and delivery.</p><div class="store-empty-steps"><span>Order</span>${icon('chevron')}<span>Track</span>${icon('chevron')}<span>Receive</span></div><button class="btn primary" data-action="store-replenish">Start replenishment ${icon('arrow')}</button></section>`;
  return `<section class="store-orders" aria-label="Your replenishment orders"><div class="store-section-heading"><div><h2>Every order, every handoff</h2><p class="store-meta">Updates from dispatch, warehouse and delivery in one place.</p></div><span class="store-meta">${mine.filter(o => o.status !== 'Delivered').length} active · ${mine.filter(o => o.status === 'Delivered').length} delivered</span></div>${[...mine].sort((a, b) => Number(b.id.slice(4)) - Number(a.id.slice(4))).map(o => {
    const vehicle = o.route ? vehicleForOrder(o) : null;
    return `<article class="store-tracking-card"><header><div><span class="store-meta">Replenishment order</span><h3>${o.id}</h3></div>${badge(o.status)}</header><div class="store-tracking-facts"><span>${icon('box')}<b>${o.cartons}</b> cartons · ${o.weight} kg</span><span>${icon('clock')} ${storeWindowLabel(o)}</span>${vehicle ? `<span>${icon('truck')} ${o.route} · ${vehicle.id}</span>` : ''}</div>${lifecycle(o)}<p class="store-status-copy">${storeStatusDescription(o)}</p>${o.issue ? `<div class="notice store-tracking-issue">${icon('warning')}<span>${esc(o.issue)}</span></div>` : ''}${o.status === 'Delivered' ? `<div class="store-delivery-receipt">${icon('check')}<div><b>Received by ${esc(o.recipient || 'store recipient')}</b><p>${o.cartons} cartons verified · ${esc(o.deliveredAt || '')}<span>Proof of delivery saved</span></p></div></div>` : ''}<footer><span class="store-meta">${vehicle ? `${vehicle.driver} · Delivery partner` : 'Awaiting route assignment'}</span><button class="btn" data-action="order-detail" data-id="${o.id}">${o.status === 'Delivered' ? 'View receipt' : 'Order details'} ${icon('arrow')}</button></footer></article>`;
  }).join('')}</section>`;
}

function bindStoreInputs() {
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

function handleStoreAction(action, button, o) {
  if (action === 'store-step') {
    const i = Number(button.dataset.product);
    quantities[i] = Math.min(50, Math.max(0, quantities[i] + Number(button.dataset.delta)));
    storeQuantityChanged();
    return true;
  }
  if (action === 'store-clear-filter') {
    stockFilter = 'all'; productQuery = ''; render();
    document.querySelector('#product-search')?.focus();
    return true;
  }
  if (action === 'store-clear-basket') {
    quantities = products.map(() => 0); updateStoreResults(); storeQuantityChanged();
    toast('Draft quantities cleared.');
    return true;
  }
  if (action === 'recommended') {
    quantities = products.map((p, i) => storeStock(p, i).suggested);
    updateStoreResults(); storeQuantityChanged();
    toast('Recommended quantities added. Adjust any carton count.');
    return true;
  }
  if (action === 'create-order') {
    const count = quantities.reduce((a, b) => a + b, 0);
    if (!count) return true;
    const weight = quantities.reduce((sum, q, i) => sum + q * products[i].weight, 0);
    openDialog(`<div class="eyebrow">Review replenishment</div><h2>Everything your store needs.</h2><p>Keells · Nugegoda<br>138, High Level Road, Nugegoda</p><div class="store-review-window">${icon('clock')}<div><b>${state.confirmed ? 'Next dispatch run' : 'Today, 10:00 – 11:30'}</b><small>${state.confirmed ? 'Morning run closed · delivery window awaiting confirmation' : 'Requested window · confirmed after route planning'}</small></div></div><div class="store-review-lines">${products.map((p, i) => quantities[i] ? `<div class="store-review-line"><div><b>${p.name}</b><small>${p.size}</small></div><strong>${quantities[i]} <span>ctn</span></strong></div>` : '').join('')}</div><div class="store-review-total"><b>${count} cartons</b><span>${quantities.filter(Boolean).length} products · ${weight} kg</span></div>${state.offline ? '<p class="helper">Your order will be saved on this device and queued until you reconnect.</p>' : ''}<div class="dialog-actions"><button class="btn" data-action="close">Keep editing</button><button class="btn primary" data-action="place-order">Place order ${icon('arrow')}</button></div>`);
    return true;
  }
  if (action === 'place-order' && state.confirmed) {
    const count = quantities.reduce((sum, q) => sum + q, 0);
    if (!count) return true;
    const id = `ORD-${Math.max(...state.orders.map(order => Number(order.id.slice(4)))) + 1}`;
    state.orders.push({ id, store: 'Keells · Nugegoda', area: 'Nugegoda', address: '138, High Level Road, Nugegoda', window: 'To be confirmed', requestedDay: 'Next run', nextRun: true, weight: quantities.reduce((sum, q, i) => sum + q * products[i].weight, 0), cartons: count, items: [...quantities], status: 'Pending', route: null, loaded: false, issue: '' });
    record(`${id} requested by Keells · Nugegoda for the next dispatch run`);
    quantities = products.map(() => 0); tab = 'orders'; render();
    openDialog(`<div class="success-mark">${icon('check')}</div><h2>Your next-run request is saved.</h2><p>${id} · ${count} cartons<br>The morning run has closed. This order is queued for a future run; its delivery window is not yet confirmed.</p><div class="notice green">Your request is visible in the dispatch queue. This demo releases one route per run.</div><div class="dialog-actions"><button class="btn primary" data-action="close">Track order ${icon('arrow')}</button></div>`);
    return true;
  }
  if (action === 'order-detail' && role === 'store' && o) {
    const vehicle = o.route ? vehicleForOrder(o) : null;
    openDialog(`<div class="eyebrow">${o.status === 'Delivered' ? 'Delivery receipt' : 'Replenishment order'} · ${o.id}</div><h2>Keells · Nugegoda</h2><p>${o.address}<br>Requested delivery · ${storeWindowLabel(o)}</p>${lifecycle(o)}<div class="store-review-lines">${o.items.map((q, i) => q ? `<div class="store-review-line"><div><b>${products[i].name}</b><small>${products[i].size}</small></div><strong>${q} <span>ctn</span></strong></div>` : '').join('')}</div><div class="store-review-total"><b>${o.cartons} cartons</b><span>${o.weight} kg</span></div>${o.status === 'Delivered' ? `<div class="store-delivery-receipt">${icon('check')}<div><b>Received by ${esc(o.recipient || 'store recipient')}</b><p>Cartons verified at ${esc(o.deliveredAt || '')}<span>Proof of delivery saved</span></p></div></div>` : `<p class="helper">${storeStatusDescription(o)}</p>`}${vehicle ? `<p class="helper">${o.route} · ${vehicle.id} · ${vehicle.driver}</p>` : ''}<div class="dialog-actions"><button class="btn primary" data-action="close">Done</button></div>`);
    return true;
  }
  return false;
}
