// Shared presentation patterns. Operational state lives in script.js.
function badge(text) {
  const tone = /Delivered|Ready|Confirmed|Loaded|Resolved|Available|Healthy/.test(text) ? 'green' : /Issue|Missing|Damaged|mismatch/.test(text) ? 'red' : /Pending|Loading|Low stock|Reorder|Priority|Deferred/.test(text) ? 'amber' : '';
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

function lifecycle(order) {
  const status = order.status === 'Issue' ? order.previousStatus : order.status;
  const step = status === 'Delivered' ? 4 : status === 'In transit' ? 3 : ['Loading','Ready'].includes(status) ? 2 : order.route ? 1 : 0;
  return `<ol class="lifecycle" aria-label="Order progress">${['Ordered','Planned','Loading','In transit','Delivered'].map((label,i) => `<li class="${i < step ? 'done' : i === step ? 'current' : 'future'}" ${i === step ? 'aria-current="step"' : ''}><span class="lifecycle-dot" aria-hidden="true">${i < step ? '✓' : i + 1}</span><span>${label}</span></li>`).join('')}</ol>`;
}

function flow() {
  const current = {store:0,dispatch:1,loader:2,delivery:3}[role];
  const completed = state.started && assigned().length && assigned().every(o => o.status === 'Delivered');
  return `<nav class="flow" aria-label="Demo journey"><span class="flow-label">Connected workflow</span>${['Order','Plan','Load','Deliver'].map((label,i) => `<button class="flow-step ${current === i ? 'current' : ''}" data-role="${['store','dispatch','loader','delivery'][i]}" ${current === i ? 'aria-current="step"' : ''}><span class="flow-num">${i+1}</span>${label}</button>${i<3?'<span class="flow-line" aria-hidden="true"></span>':''}`).join('')}<span class="flow-end ${completed?'green':''}">${icon(completed?'check':'route')}${completed?'Journey complete':'One shared order'}</span></nav>`;
}

function offlineBanner() {
  const field=['loader','delivery'].includes(role);
  return state.offline ? `<section class="offline-banner" aria-label="Degradation scenario: connection lost">${icon('wifi')}<div><b>${field?'Degradation: connection lost':'Offline'} · ${state.pending.length} update${state.pending.length === 1 ? '' : 's'} waiting to sync</b><small>Last synced ${state.lastSync}. Loading, exceptions and receipts stay usable on this device. Records reconcile when coverage returns; route changes remain protected.</small></div>${field?'':'<button class="mini-btn" data-action="offline">Reconnect</button>'}</section>` : '';
}

function render() {
  const r = role === 'delivery' ? {...roles.delivery, user:activeVehicle().driver, initials:activeVehicle().driver.split(' ').map(name=>name[0]).join('')} : roles[role];
  document.body.dataset.role = caseStudyOpen?'case-study':role;
  document.body.dataset.hasAction = String((role === 'store' && tab === 'replenishment') || (role === 'delivery' && state.ready && assigned().some(o => o.status !== 'Delivered')));
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#dispatch" aria-label="Relay dispatch home"><span class="brand-mark">⇄</span><span>relay<span class="brand-dot">.</span></span></a>
      <div class="workspace-label">Demo · switch persona</div>
      <nav class="nav" aria-label="Switch demo persona">${Object.entries(roles).map(([key,v]) => `<button data-role="${key}" class="${role === key ? 'active' : ''}" ${role === key ? 'aria-current="page"' : ''} title="${v.name}">${icon(v.icon)}<span>${key === 'loader' ? 'Warehouse' : v.short}</span>${key === 'dispatch' ? `<span class="count">${state.orders.filter(o => !o.route).length}</span>` : ''}</button>`).join('')}</nav>
      <div class="sidebar-bottom"><button class="btn ghost wide" data-action="case-study">${icon('help')} Design case study</button><div class="demo-note"><b>Waypoint Group delivery network</b><span>Peliyagoda distribution centre</span><span>Colombo, Sri Lanka</span><span class="demo-label">DESIGNATHON PROTOTYPE</span></div><div class="profile"><span class="avatar">${r.initials}</span><div class="stack"><b>${r.user}</b><small>${r.title}</small></div></div></div>
    </aside>
    <div class="shell">
      <header class="topbar"><div class="breadcrumb"><span>${caseStudyOpen?'Submission':'Operations'}</span>${icon('chevron')}<b>${caseStudyOpen?'Design case study':r.name}</b></div><div class="row"><span class="online"><span class="dot ${state.offline?'offline':''}"></span>${state.offline ? 'Offline · saved locally' : 'Source-aligned prototype'}</span><button class="btn ghost icon-btn" data-action="case-study" aria-label="Open design case study">${icon('help')}</button><button class="btn ghost icon-btn" data-action="activity" aria-label="Open activity feed">${icon('bell')}${state.pending.length?'<span class="notification-dot"></span>':''}</button><span class="avatar">${r.initials}</span></div></header>
      <main id="main" tabindex="-1" class="view-${caseStudyOpen?'case-study':role}">${caseStudyOpen?caseStudyView():role === 'dispatch' ? dispatchView() : role === 'store' ? storeView() : role === 'loader' ? loaderView() : deliveryView()}</main>
    </div>`;
  bindInputs();
  if (typeof bindStoreInputs === 'function') bindStoreInputs();
  if (typeof bindFieldInputs === 'function') bindFieldInputs();
  if (typeof bindDispatchInputs === 'function') bindDispatchInputs();
}

let dialogReturnFocus;
function openDialog(html) {
  const dialog = document.querySelector('#dialog');
  if (!dialog.open) {
    const active = document.activeElement;
    dialogReturnFocus = active?.dataset.action ? `[data-action="${active.dataset.action}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ''}` : active?.id ? `#${active.id}` : null;
  }
  dialog.className = '';
  dialog.innerHTML = `<button class="dialog-close btn ghost icon-btn" data-action="close" aria-label="Close dialog">${icon('close')}</button><div class="dialog-body">${html}</div>`;
  const actions = dialog.querySelector('.dialog-actions');
  if (actions) dialog.append(actions);
  const title = dialog.querySelector('h2');
  if (title) { title.id = 'dialog-title'; title.tabIndex = -1; dialog.setAttribute('aria-labelledby','dialog-title'); }
  if (!dialog.open) dialog.showModal();
  title?.focus({preventScroll:true});
}

function closeDialog() { document.querySelector('#dialog').close(); }

document.querySelector('#dialog').addEventListener('keydown',event=>{
  if(event.key!=='Tab')return;
  const dialog=event.currentTarget;
  const controls=[...dialog.querySelectorAll('button,a[href],input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
  if(!controls.length){event.preventDefault();return;}
  const first=controls[0],last=controls.at(-1),active=document.activeElement;
  if(event.shiftKey&&(active===first||!controls.includes(active))){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&(active===last||!controls.includes(active))){event.preventDefault();first.focus();}
});
document.querySelector('#dialog').addEventListener('close',()=>{
  const target=dialogReturnFocus&&[...document.querySelectorAll(dialogReturnFocus)].find(el=>el.getClientRects().length&&!el.disabled);
  (target||document.querySelector('#main'))?.focus({preventScroll:true});
});
