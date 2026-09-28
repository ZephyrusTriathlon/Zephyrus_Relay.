// Shared presentation patterns. Operational state lives in script.js.
// Fictional, local-only accounts. This models access; it is not authentication security.
const demoAccounts = Object.freeze([
  {id:'store', email:'store@relay.demo', name:'Nimasha Perera', role:'STORE_MANAGER', workspace:'store', password:'RelayDemo!26'},
  {id:'dispatcher', email:'dispatcher@relay.demo', name:'Dinuka Fernando', role:'DISPATCHER', workspace:'dispatch', password:'RelayDemo!26'},
  {id:'loader', email:'loader@relay.demo', name:'Kasun Silva', role:'LOADER', workspace:'loader', password:'RelayDemo!26'},
  {id:'driver', email:'driver@relay.demo', name:'Amal Perera', role:'DRIVER', workspace:'delivery', password:'RelayDemo!26'}
].map(Object.freeze));
const sessionKey = 'relay_session';
const currentAccount = () => demoAccounts.find(account => account.id === localStorage.getItem(sessionKey));
const accountRole = account => ({STORE_MANAGER:'Store Manager',DISPATCHER:'Dispatcher',LOADER:'Loader',DRIVER:'Driver'})[account.role];
function enterAccount(id) {
  const account = demoAccounts.find(account => account.id === id);
  if (!account) return;
  closeDialog();
  localStorage.removeItem(sessionKey);
  localStorage.setItem(sessionKey, account.id);
  caseStudyOpen=false;role=account.workspace;
  const reveal=role==='dispatch' && pendingDispatchOrderId && dispatchHandoff(pendingDispatchOrderId);
  history.replaceState(null,'',`#${role}`);render();window.scrollTo(0,0);
  if(reveal)finishDispatchHandoff();else document.querySelector('#main')?.focus({preventScroll:true});
}
function switchDemoAccount() {
  openDialog(`<div class="eyebrow">Judge walkthrough only</div><h2>Switch demo account</h2><p>Sign in as a different fictional employee. Each account has a fixed role. Shared orders and route progress are preserved.</p><div class="demo-accounts">${demoAccounts.map(account=>`<button class="btn demo-account" data-action="demo-sign-in" data-account="${account.id}"><span><b>${account.name}</b><small>${accountRole(account)} &middot; ${account.email}</small></span>${currentAccount()?.id===account.id?'<small>Signed in</small>':icon('arrow')}</button>`).join('')}</div>`);
}
function loginView() {
  document.body.dataset.role='login';document.body.dataset.hasAction='false';
  history.replaceState(null,'','#login');
  document.querySelector('#app').innerHTML=`<main id="main" class="login-page" tabindex="-1"><section class="login-card" aria-labelledby="login-title"><div class="brand"><span class="brand-mark">&#8644;</span><span>relay<span class="brand-dot">.</span></span></div><p class="eyebrow">Waypoint delivery operations</p><h1 id="login-title">Welcome back.</h1><p class="subtitle">Sign in to your assigned workspace.</p><form id="login-form" novalidate><label class="form-label" for="login-id">Employee ID / Email</label><input class="input" id="login-id" name="identifier" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="login-error"><label class="form-label" for="login-password">Password</label><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" aria-describedby="login-error"><p id="login-error" class="form-error" role="alert"></p><button class="btn primary wide" type="submit">Sign in ${icon('arrow')}</button></form><p class="helper">Need access? Contact your operations administrator.</p><div class="login-demo"><span class="eyebrow">Designathon prototype</span><p>Simulated sign-in on this device. Fictional demo accounts only.</p><button class="mini-btn" data-action="switch-account">Switch demo account</button></div></section></main>`;
  document.querySelector('#login-form').addEventListener('submit',event=>{
    event.preventDefault();
    const identifier=document.querySelector('#login-id'),password=document.querySelector('#login-password');
    const value=identifier.value.trim().toLowerCase();
    const account=demoAccounts.find(account=>(account.email===value||account.id===value)&&account.password===password.value);
    const error=!value?'Enter your employee ID or email.':!password.value?'Enter your password.':!account?'Email or password is incorrect.':'';
    document.querySelector('#login-error').textContent=error;
    identifier.setAttribute('aria-invalid',String(!value||(!account&&!!password.value)));
    password.setAttribute('aria-invalid',String(!!value&&!account));
    if(error){(!value?identifier:password).focus();return;}
    enterAccount(account.id);
  });
}

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
  return `<nav class="flow" aria-label="Demo journey"><span class="flow-label">Connected workflow</span>${['Order','Plan','Load','Deliver'].map((label,i) => `<span class="flow-step ${current === i ? 'current' : ''}" ${current === i ? 'aria-current="step"' : ''}><span class="flow-num">${i+1}</span>${label}</span>${i<3?'<span class="flow-line" aria-hidden="true"></span>':''}`).join('')}<span class="flow-end ${completed?'green':''}">${icon(completed?'check':'route')}${completed?'Journey complete':'One shared order'}</span></nav>`;
}

function offlineBanner() {
  const field=['loader','delivery'].includes(role);
  return state.offline ? `<section class="offline-banner" aria-label="Degradation scenario: connection lost">${icon('wifi')}<div><b>${field?'Degradation: connection lost':'Offline'} · ${state.pending.length} update${state.pending.length === 1 ? '' : 's'} waiting to sync</b><small>Last synced ${state.lastSync}. Loading, exceptions and receipts stay usable on this device. Records reconcile when coverage returns; route changes remain protected.</small></div>${field?'':'<button class="mini-btn" data-action="offline">Reconnect</button>'}</section>` : '';
}

function render() {
  const account=currentAccount();
  if(!account){loginView();return;}
  role=account.workspace;
  if(!caseStudyOpen && location.hash!==`#${role}`)history.replaceState(null,'',`#${role}`);
  const r={...roles[role],user:account.name,initials:account.name.split(' ').map(name=>name[0]).join(''),title:accountRole(account)};
  document.body.dataset.role = caseStudyOpen?'case-study':role;
  document.body.dataset.hasAction = String((role === 'store' && tab === 'replenishment') || (role === 'delivery' && state.ready && assigned().some(o => o.status !== 'Delivered')));
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#${role}" aria-label="Relay workspace home"><span class="brand-mark">⇄</span><span>relay<span class="brand-dot">.</span></span></a>
      <div class="workspace-label">Your workspace</div>
      <nav class="nav" aria-label="Workspace navigation"><button data-action="workspace-home" class="active" aria-current="page" title="${r.name}">${icon(r.icon)}<span>${r.short}</span></button><button data-action="account" title="Your account">${icon('grid')}<span>Account</span></button></nav>
      <div class="sidebar-bottom"><button class="btn ghost wide" data-action="case-study">${icon('help')} Design case study</button><div class="demo-note"><b>Waypoint Group delivery network</b><span>Peliyagoda distribution centre</span><span>Colombo, Sri Lanka</span><span class="demo-label">DESIGNATHON PROTOTYPE</span></div><div class="profile"><span class="avatar">${r.initials}</span><div class="stack"><b>${r.user}</b><small>${r.title}</small></div></div></div>
    </aside>
    <div class="shell">
      <header class="topbar"><div class="breadcrumb"><span>${caseStudyOpen?'Submission':'Operations'}</span>${icon('chevron')}<b>${caseStudyOpen?'Design case study':r.name}</b></div><div class="row"><span class="online"><span class="dot ${state.offline?'offline':''}"></span>${state.offline ? 'Offline · saved locally' : 'Source-aligned prototype'}</span><button class="btn ghost icon-btn" data-action="case-study" aria-label="Open design case study">${icon('help')}</button><button class="btn ghost icon-btn" data-action="activity" aria-label="Open activity feed">${icon('bell')}${state.pending.length?'<span class="notification-dot"></span>':''}</button><button class="btn ghost" data-action="account" aria-label="Your account: ${r.user}">Account</button></div></header>
      <main id="main" tabindex="-1" class="view-${caseStudyOpen?'case-study':role}">${caseStudyOpen?caseStudyView():role === 'dispatch' ? dispatchView() : role === 'store' ? storeView() : role === 'loader' ? loaderView() : deliveryView()}</main>
    </div>`;
  // Legacy workflow handoffs become explicit judge conveniences, never employee navigation.
  document.querySelectorAll('#main [data-role]').forEach(button=>{
    button.removeAttribute('data-role');button.dataset.action='switch-account';
    button.classList.remove('primary');button.classList.add('demo-handoff');
    button.textContent='Switch demo account';
  });
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
