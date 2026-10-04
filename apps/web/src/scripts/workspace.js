// Shared presentation patterns. Operational state lives in script.js.
let authenticatedUser = null;
let identityReady = false;
let identityGeneration = 0;
let sessionNotice = "";
let judgeScenario = null;
const currentAccount = () => authenticatedUser;
const accountRole = account => ({STORE_MANAGER:'Store Manager',DISPATCHER:'Dispatcher',LOADER:'Loader',DRIVER:'Driver'})[account.role];
async function authRequest(path, body) {
  if(path==='login'&&typeof driverOffline!=='undefined'){await driverOffline.lock();driverOffline.notifyIdentity();}
  if(body !== undefined) identityGeneration++;
  if(!navigator.onLine)throw new TypeError('Offline');
  const response = await fetch('/api/auth/' + path, { credentials: 'same-origin', cache: 'no-store',signal:AbortSignal.timeout(8000),
    ...(body !== undefined ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {}) });
  // Also invalidate checks started while login/logout was in flight. They may
  // have observed the old session before the server committed the change.
  if(body !== undefined) identityGeneration++;
  if (!response.ok) {
    const error = new Error((await response.json()).error || 'Authentication unavailable');
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
async function refreshIdentity() {
  const previous = JSON.stringify(authenticatedUser);
  const wasReady = identityReady;
  const previousNotice = sessionNotice;
  const generation = identityGeneration;
  try {
    const {user} = await authRequest('me');
    const scenarioResponse=await fetch('/api/scenario',{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(8000)}).catch(()=>null);
    const scenarioData=scenarioResponse?.ok?await scenarioResponse.json():null;
    if(generation===identityGeneration)judgeScenario=scenarioData?.scenario??null;
    if(generation !== identityGeneration)return;
    sessionNotice = '';
    authenticatedUser = {...user, name:user.displayName, workspace:({DISPATCHER:'dispatch',STORE_MANAGER:'store',LOADER:'loader',DRIVER:'delivery'})[user.role]};
    await driverOffline.activate(user);
  } catch (error) {
    if(generation !== identityGeneration)return;
    const offlineUser=(!error.status||error.status>=500)?await driverOffline.restore().catch(()=>null):null;
    if(offlineUser){authenticatedUser={...offlineUser,name:offlineUser.displayName,workspace:'delivery'};sessionNotice='';}
    else {
    if(error.status===401||error.status===403)await driverOffline.lock();
    if(authenticatedUser)sessionNotice = error.status === 401 ? 'Your session has expired. Please sign in again.' : 'Unable to verify your session. Please try signing in again.';
    else if(error.status !== 401)sessionNotice = 'Authentication service unavailable. Please try again.';
    authenticatedUser = null;
    closeDialog();
    }
  }
  identityReady = true;
  if(!wasReady || previous !== JSON.stringify(authenticatedUser) || previousNotice !== sessionNotice) { resetStoreData(); resetPlanningData(); resetFieldData(); closeDialog(); render(); }
  else if(authenticatedUser?.workspace === 'store') loadStoreOrders();
  else if(['loader','delivery'].includes(authenticatedUser?.workspace)) loadFieldTrips();
}
async function signOut() {
  try {
    if(!await driverOffline.maySignOut())return;
    await authRequest('logout', {});const retained=await driverOffline.clear();driverOffline.notifyIdentity();sessionNotice=retained?'Saved deliveries were retained securely. Sign in again to synchronize.':''; authenticatedUser=null; resetStoreData(); resetPlanningData(); resetFieldData(); closeDialog(); render(); document.querySelector('#login-id').focus();
  } catch { toast(navigator.onLine?'Sign out failed. Please retry.':'Reconnect to sign out safely. Saved deliveries are retained.'); }
}
window.addEventListener('focus', () => { if (identityReady) refreshIdentity(); });
setInterval(() => { if (authenticatedUser) refreshIdentity(); }, 60000);
function loginView() {
  document.body.dataset.role='login';document.body.dataset.hasAction='false';
  history.replaceState(null,'','#login');
  document.querySelector('#app').innerHTML=`<main id="main" class="login-page" tabindex="-1"><section class="login-card" aria-labelledby="login-title"><div class="brand"><span class="brand-mark">&#8644;</span><span>relay<span class="brand-dot">.</span></span></div><p class="eyebrow">Waypoint delivery operations</p><h1 id="login-title">Welcome back.</h1><p class="subtitle">Sign in to your assigned workspace.</p><form id="login-form" novalidate><label class="form-label" for="login-id">Employee ID / Email</label><input class="input" id="login-id" name="identifier" autocomplete="username" autocapitalize="none" spellcheck="false" aria-describedby="login-error"><label class="form-label" for="login-password">Password</label><input class="input" id="login-password" name="password" type="password" autocomplete="current-password" aria-describedby="login-error"><p id="login-error" class="form-error" role="alert"></p><button class="btn primary wide" type="submit">Sign in ${icon('arrow')}</button></form><p class="helper">Need access? Contact your operations administrator.</p></section></main>`;
  document.querySelector('#login-error').textContent=sessionNotice;
  document.querySelector('#login-form').addEventListener('submit',async event=>{
    event.preventDefault();
    const identifier=document.querySelector('#login-id'),password=document.querySelector('#login-password');
    const error=!identifier.value.trim()?'Enter your employee ID or email.':!password.value?'Enter your password.':'';
    const message=document.querySelector('#login-error');
    message.textContent=error;
    identifier.setAttribute('aria-invalid',String(!identifier.value.trim()));password.setAttribute('aria-invalid',String(!password.value));
    if(error){(!identifier.value.trim()?identifier:password).focus();return;}
    const button=event.currentTarget.querySelector('[type="submit"]');button.disabled=true;
    try {
      await authRequest('login',{identifier:identifier.value,password:password.value});
      await refreshIdentity();
      const reveal=role==='dispatch' && pendingDispatchOrderId && dispatchHandoff(pendingDispatchOrderId);
      if(reveal){render();finishDispatchHandoff();}
    } catch(error) {message.textContent=userFacingError(error,'Unable to sign in. Check your connection and try again.');}
    finally {button.disabled=false;}
  });
}

function badge(text) {
  const tone = /Delivered|Ready|Confirmed|Loaded|Resolved|Available|Healthy|Completed|Received|Receipt confirmed|Synced/.test(text) ? 'green' : /Issue|Missing|Damaged|mismatch/.test(text) ? 'red' : /Pending|Loading|Low stock|Reorder|Priority|Deferred/.test(text) ? 'amber' : '';
  return `<span class="badge ${tone}">${esc(text)}</span>`;
}

function operationalLabel(value) {
  return ({DRAFT:'Draft',CONFIRMED:'Confirmed',PLANNED:'Scheduled',RELEASED:'Released',LOADING:'Loading',READY:'Ready',IN_PROGRESS:'In progress',IN_DELIVERY:'In transit',ARRIVED:'Arrived',DELIVERED:'Delivered',RECEIVED:'Receipt confirmed',COMPLETED:'Completed',DEFERRED:'Deferred',PENDING:'Pending',LOADED:'Loaded',OPEN:'Open',RESOLVED:'Resolved',CANCELLED:'Cancelled',AMBIENT:'Ambient',CHILLED:'Chilled',REEFER:'Refrigerated',TRUCK:'Truck',VAN:'Van',NORMAL:'Standard access',VAN_ONLY:'Van only',MALL_DOCK:'Mall dock',CAPACITY:'Capacity',TEMPERATURE:'Temperature',ACCESS:'Access',DELIVERY_WINDOW:'Delivery window',FUEL:'Fuel quota'})[value] || String(value).toLowerCase().replaceAll('_',' ').replace(/^./, c=>c.toUpperCase());
}
const userFacingError=(error,fallback)=>error instanceof TypeError||['TimeoutError','AbortError'].includes(error.name)?fallback:error.message;
function deferralExplanation(decision) {
  const summary=decision.explanation.split(' Candidate rejection codes:')[0];
  const messages=[...new Set((decision.planningContext?.rejections||[]).flatMap(candidate=>candidate.violations.map(v=>v.message)))];
  return [summary,...messages.slice(0,3)].join(' ');
}
function lifecycle(order) {
  const status = order.status === 'Issue' ? order.previousStatus : order.status;
  const step = status === 'Delivered' ? 4 : status === 'In transit' ? 3 : ['Loading','Ready'].includes(status) ? 2 : order.route ? 1 : 0;
  return `<ol class="lifecycle" aria-label="Order progress">${['Ordered','Planned','Loading','In transit','Delivered'].map((label,i) => `<li class="${i < step ? 'done' : i === step ? 'current' : 'future'}" ${i === step ? 'aria-current="step"' : ''}><span class="lifecycle-dot" aria-hidden="true">${i < step ? '✓' : i + 1}</span><span>${label}</span></li>`).join('')}</ol>`;
}

function offlineBanner() {
  const field=['loader','delivery'].includes(role);
  return state.offline ? `<section class="offline-banner" aria-label="Degradation scenario: connection lost">${icon('wifi')}<div><b>${field?'Degradation: connection lost':'Offline'} · ${state.pending.length} update${state.pending.length === 1 ? '' : 's'} waiting to sync</b><small>Last synced ${state.lastSync}. Loading, exceptions and receipts stay usable on this device. Records reconcile when coverage returns; route changes remain protected.</small></div>${field?'':'<button class="mini-btn" data-action="offline">Reconnect</button>'}</section>` : '';
}

function render() {
  if(!identityReady){document.querySelector('#app').innerHTML='<main class="login-page"><p role="status">Checking your session…</p></main>';return;}
  const account=currentAccount();
  if(!account){loginView();return;}
  role=account.workspace;
  if(location.hash!==`#${role}`)history.replaceState(null,'',`#${role}`);
  const r={...roles[role],user:esc(account.name),initials:account.name.split(' ').map(name=>name[0]).join(''),title:accountRole(account)};
  document.body.dataset.role = role;
  document.body.dataset.hasAction = String((role === 'store' && tab === 'replenishment') || (role === 'delivery' && state.ready && assigned().some(o => o.status !== 'Delivered')));
  document.querySelector('#app').innerHTML = `
    <aside class="sidebar">
      <a class="brand" href="#${role}" aria-label="Relay workspace home"><span class="brand-mark">⇄</span><span>relay<span class="brand-dot">.</span></span></a>
      <div class="workspace-label">Your workspace</div>
      <nav class="nav" aria-label="Workspace navigation"><button data-action="workspace-home" class="active" aria-current="page" title="${r.name}">${icon(r.icon)}<span>${r.short}</span></button><button data-action="account" title="Your account">${icon('grid')}<span>Account</span></button><button data-action="activity" title="Activity" aria-label="Open activity feed"><span class="notification-icon">${icon('bell')}</span><span>Activity</span></button></nav>
      <div class="sidebar-bottom"><div class="demo-note"><b>Waypoint Group delivery network</b><span>Delivery operations · Sri Lanka</span></div><div class="profile"><span class="avatar">${esc(r.initials)}</span><div class="stack"><b>${r.user}</b><small>${r.title}</small></div></div></div>
    </aside>
    <div class="shell">
      <main id="main" tabindex="-1" class="view-${role}">${judgeScenario?`<p class="notice" role="status">${esc(judgeScenario.message)}</p>`:''}${role === 'dispatch' ? dispatchView() : role === 'store' ? storeView() : role === 'loader' ? loaderView() : deliveryView()}</main>
    </div>`;
  document.querySelectorAll('#main [data-role]').forEach(button=>button.remove());
  if(!window.relayDevTools)document.querySelectorAll('[data-action="offline"],[data-action="reset-confirm"]').forEach(button=>button.remove());
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
