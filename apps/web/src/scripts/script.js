const icons={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',route:'M6 5a2 2 0 1 0 0 .1 M18 19a2 2 0 1 0 0 .1 M8 5h7a4 4 0 0 1 0 8H9a4 4 0 0 0 0 8h7',box:'m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4',truck:'M3 6h11v12H3z M14 10h4l3 4v4h-7 M5 18a2 2 0 1 0 4 0 M16 18a2 2 0 1 0 4 0',search:'m21 21-5-5 M18 10a8 8 0 1 0-16 0 8 8 0 0 0 16 0',arrow:'M4 12h16m-6-6 6 6-6 6',check:'m5 12 4 4L19 6',chevron:'m9 5 7 7-7 7',clock:'M12 8v5l3 2 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0 M15 10a3 3 0 1 0-6 0 3 3 0 0 0 6 0',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4',plus:'M12 5v14M5 12h14',wifi:'M2 8a17 17 0 0 1 20 0 M5 12a12 12 0 0 1 14 0 M8 16a7 7 0 0 1 8 0 M12 20h.01',warning:'m12 3 10 18H2L12 3Zm0 6v5m0 3h.01',phone:'M5 3h4l2 5-3 2a15 15 0 0 0 6 6l2-3 5 2v4c0 2-2 3-4 2C9 19 5 15 3 7c-1-2 0-4 2-4Z',navigate:'m21 3-7 18-3-8-8-3 18-7Z',refresh:'M20 7V3l-4 4 M20 7a9 9 0 1 0 1 9',close:'m6 6 12 12M6 18 18 6',store:'M3 9h18l-2-6H5L3 9Zm2 0v12h14V9M9 21v-7h6v7',list:'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',help:'M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5 M12 17h.01 M22 12a10 10 0 1 0-20 0 10 10 0 0 0 20 0'};
const icon=n=>`<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="${icons[n]||icons.box}"/></svg>`;
let products=[
  {name:'Fresh milk · chilled',size:'1 L · 12 packs / carton',stock:8,recommend:12,weight:13,volume:.032,code:'WPF-MILK-1L',health:'Low stock',temp:'chilled'},
  {name:'Fresh produce crate',size:'Mixed produce · 1 crate / carton',stock:5,recommend:10,weight:9,volume:.055,code:'WPF-PROD-MIX',health:'Low stock',temp:'chilled'},
  {name:'Dry grocery essentials',size:'24 packs / carton',stock:14,recommend:8,weight:6,volume:.041,code:'WPF-DRY-24',health:'Reorder soon',temp:'ambient'},
  {name:'Household care pack',size:'12 packs / carton',stock:23,recommend:6,weight:7,volume:.046,code:'WPF-HOME-12',health:'Healthy',temp:'ambient'},
  {name:'Bottled water',size:'1.5 L · 6 bottles / carton',stock:17,recommend:4,weight:10,volume:.038,code:'WPF-WATER-6',health:'Healthy',temp:'ambient'}
];
const orderDefaults={brand:'Fresh',district:'Colombo',depot:'Peliyagoda',dockType:'rear_dock',parkingConstraint:'normal',tempRequirement:'ambient',tripId:1,deferredYesterday:0,daysSinceLastServed:1,receiptConfirmed:false};
const rawSeed=()=>({orders:[
  {...orderDefaults,id:'ORD-2844',outletId:'OUT004',store:'Waypoint Fresh · Colombo 04',area:'Colombo 04',address:'Synthetic outlet OUT004 · Colombo',window:'05:30 – 08:00',dockType:'street',status:'Planning',route:'R-07',loaded:false,issue:'',items:[0,0,12,10,8]},
  {...orderDefaults,id:'ORD-2845',outletId:'OUT005',store:'Waypoint Fresh · Colombo 05',area:'Colombo 05',address:'Synthetic outlet OUT005 · Colombo',window:'04:00 – 07:45',tempRequirement:'chilled',status:'Planning',route:'R-07',loaded:false,issue:'',items:[12,10,8,4,4]},
  {...orderDefaults,id:'ORD-2846',outletId:'OUT001',store:'Waypoint Fresh · Colombo 01',area:'Colombo 01',address:'Synthetic outlet OUT001 · Colombo',window:'05:00 – 07:30',dockType:'street',parkingConstraint:'van_only',status:'Pending',route:null,loaded:false,issue:'',items:[8,6,4,4,2]},
  {...orderDefaults,id:'ORD-2843',outletId:'OUT011',store:'Waypoint Fresh · Colombo 11',area:'Colombo 11',address:'Synthetic outlet OUT011 · Colombo',window:'03:00 – 08:00',deferredYesterday:1,daysSinceLastServed:3,status:'Pending',route:null,loaded:false,issue:'',items:[10,8,4,4,2]},
  {...orderDefaults,id:'ORD-2842',outletId:'OUT014',store:'Waypoint Fresh · Colombo 14',area:'Colombo 14',address:'Synthetic outlet OUT014 · Colombo',window:'05:30 – 08:00',dockType:'street',daysSinceLastServed:2,status:'Pending',route:null,loaded:false,issue:'',items:[6,6,4,2,2]}
],confirmed:false,ready:false,started:false,offline:false,pending:[],lastSync:'15:42',history:[],vehicle:'VEH003'});
const hydrateOrder=o=>{o.weight=o.items.reduce((n,q,i)=>n+q*products[i].weight,0);o.volume=Number(o.items.reduce((n,q,i)=>n+q*products[i].volume,0).toFixed(2));o.cartons=o.items.reduce((n,q)=>n+q,0);if(o.items.some((q,i)=>q&&products[i].temp==='chilled'))o.tempRequirement='chilled';return o};
const seed=()=>{const data=rawSeed();data.orders.forEach(hydrateOrder);return data};
// Historical developer simulation only; online workspaces never consume these orders.
let state;try{state=JSON.parse(localStorage.getItem('relay-v1'))||seed()}catch{state=seed()}
state.orders?.forEach(o=>{if(o.outletId==='OUT004'||o.outletId==='OUT006')o.dockType='street'});
let role=['dispatch','store','loader','delivery'].includes(location.hash.slice(1))?location.hash.slice(1):'dispatch',tab='replenishment',queueFilter='all',queueQuery='',productQuery='',quantities=products.map(()=>0),toastTimer;
const roles={store:{name:'Store operations',short:'Store',icon:'store',user:'Nimasha Perera',initials:'NP',title:'Store manager · OUT006'},dispatch:{name:'Dispatch planning',short:'Dispatch',icon:'route',user:'Dinuka Fernando',initials:'DF',title:'Dispatcher · Peliyagoda'},loader:{name:'Warehouse loading',short:'Loading',icon:'box',user:'Kasun Silva',initials:'KS',title:'Loader · Bay 03'},delivery:{name:'Delivery route',short:'Delivery',icon:'truck',user:'Amal Perera',initials:'AP',title:'Driver · VEH003'}};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const assigned=()=>['loader','delivery'].includes(role)&&usesOnlineField()?fieldOrders:state.orders.filter(o=>o.route==='R-07');
const totalWeight=()=>assigned().reduce((n,o)=>n+o.weight,0);
const save=()=>{if(window.relayDevTools&&!(['loader','delivery'].includes(role)&&usesOnlineField()))localStorage.setItem('relay-v1',JSON.stringify(state));};
function record(message){state.history.unshift({message,time:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})});if(state.offline)state.pending.push(message);else state.lastSync=new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});save()}
function toast(message){const t=document.querySelector('#toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),3800)}
function heading(eyebrow,title,subtitle,actions=''){return `<div class="page-heading"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div><div class="row">${actions}</div></div>`}
const dialogFooter=(label='Done',action='close')=>`<div class="dialog-actions"><button class="btn primary" data-action="${action}">${label}</button></div>`;
function bindInputs(){document.querySelector('#queue-search')?.addEventListener('input',e=>{queueQuery=e.target.value;document.querySelector('#queue-list').innerHTML=queueCards()});document.querySelector('#queue-filter')?.addEventListener('change',e=>{queueFilter=e.target.value;document.querySelector('#queue-list').innerHTML=queueCards()});}
function quantityChange(e){quantities[Number(e.target.dataset.qty)]=Math.max(0,Math.min(50,Math.floor(Number(e.target.value)||0)));storeQuantityChanged()}
document.addEventListener('input',e=>{if(e.target.matches('[data-qty]'))quantityChange(e)});
document.addEventListener('click',e=>{const button=e.target.closest('[data-role],[data-action]');if(!button||button.disabled)return;if(button.dataset.role)return;const sessionAction=button.dataset.action;
if(sessionAction==='close'){closeDialog();return;}
if(!currentAccount())return;
if(sessionAction==='sign-out'){signOut();return;}
if(sessionAction==='account'){const account=currentAccount();openDialog(`<h2>${esc(account.name)}</h2><p>${accountRole(account)}</p><button class="btn wide" data-action="sign-out">Sign out</button>`);return;}
if(sessionAction==='workspace-home'){render();return;}
const action=button.dataset.action,o=state.orders.find(o=>o.id===button.dataset.id);if(handleStoreAction(action,button,o)||handleFieldAction(action,button,o)||handleDispatchAction(action,button,o))return;switch(action){
case 'store-orders':tab='orders';render();break;
case 'store-replenish':tab='replenishment';render();break;
case 'offline':if(!window.relayDevTools)break;state.offline=!state.offline;if(!state.offline){const n=state.pending.length;state.pending=[];record(`${n} queued updates synced in workspace`);toast(`${n} updates synced. Your team is up to date.`)}else{save();toast('Offline simulation enabled. Progress will save on this device.')}render();break;
case 'contact':openDialog(`<h2>Contact ${o.store}</h2><p>Store receiving desk<br>Ask for the duty manager and quote ${o.id}.</p><div class="notice">Sample contact: +94 11 234 5678. This is sample data; no call is placed by the prototype.</div>${dialogFooter()}`);break;
case 'activity':openDialog(`<div class="eyebrow">Shared activity</div><h2>Every handoff, connected.</h2>${state.history.length?`<div class="activity-list">${state.history.map(h=>`<div class="history-entry"><small>${h.time}</small><p style="margin:5px 0 0;color:var(--text)">${esc(h.message)}</p></div>`).join('')}</div>`:'<p>Your order, loading and delivery updates will appear here.</p>'}${dialogFooter()}`);break;
}});
window.addEventListener('hashchange',()=>{
  closeDialog();render();window.scrollTo(0,0);
});

document.querySelector('#dialog').addEventListener('click',e=>{if(e.target===e.currentTarget){const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog()}});
render();
refreshIdentity();
