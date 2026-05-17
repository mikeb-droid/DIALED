// DIALED Service Worker
const CACHE='dialed-v1';
const SHELL=['/','/index.html','/manifest.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const url=new URL(e.request.url);
  if(url.hostname.includes('arcgisonline')||url.hostname.includes('arcgis')){
    e.respondWith(caches.open('dialed-tiles').then(async c=>{
      const cached=await c.match(e.request);
      if(cached)return cached;
      const resp=await fetch(e.request);
      if(resp.ok)c.put(e.request,resp.clone());
      return resp;
    }));
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));
});
