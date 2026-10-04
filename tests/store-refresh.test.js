const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const vm=require('node:vm');

test('a superseded Store refresh waits for the authoritative latest read before confirming creation',async()=>{
  const requests=[];
  const context=vm.createContext({
    AbortSignal,userFacingError:(error)=>error.message,
    currentAccount:()=>({id:'owned-store',workspace:'store'}),render:()=>{},
    fetch:path=>new Promise(resolve=>requests.push({path,resolve})),
  });
  vm.runInContext(readFileSync('apps/web/src/scripts/store.js','utf8'),context);
  let firstDone=false;
  const first=vm.runInContext('loadStoreOrders()',context).then(()=>{firstDone=true;});
  const second=vm.runInContext('loadStoreOrders()',context);
  assert.equal(requests.length,4);
  const finish=(index,data)=>requests[index].resolve({ok:true,json:async()=>data});
  finish(0,{ordering:{earliestDeliveryDate:'2025-01-04'}});finish(1,{orders:[]});
  // Drain completed promises, not an arbitrary network/timing sleep.
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(firstDone,false,'An obsolete refresh cannot signal completion while its replacement is pending');
  finish(2,{ordering:{earliestDeliveryDate:'2025-01-04'}});finish(3,{orders:[{id:'newly-created-order'}]});
  await Promise.all([first,second]);
  assert.equal(vm.runInContext('storeOwnOrders()[0].id',context),'newly-created-order');
  assert.equal(vm.runInContext('storeLoading',context),false);
});
