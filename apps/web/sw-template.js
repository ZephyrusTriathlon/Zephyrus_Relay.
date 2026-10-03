/* Generated at build time. Only explicitly listed public shell files are cached. */
const CACHE='relay-shell-__CACHE_VERSION__';
const SHELL=__SHELL_FILES__;
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(SHELL.map(path=>new Request(path,{cache:'reload',credentials:'omit'})));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('relay-shell-')&&name!==CACHE)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||url.search)return;
  const path=url.pathname==='/'?'/index.html':url.pathname;
  if(!SHELL.includes(path))return; // /api, /data, auth and arbitrary URLs NEVER cached.
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    return (await cache.match(path))||fetch(event.request);
  })());
});
