const CACHE='myportfolio-v7-quote-rate-limit';
const FILES=['./','index.html','styles.css','core.js','quotes.js','app.js','manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES))));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil(Promise.all([caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('myportfolio-')&&k!==CACHE).map(k=>caches.delete(k)))),self.clients.claim()])));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
 const path=url.pathname.slice(new URL(self.registration.scope).pathname.length);
 if(path!==''&&!FILES.includes(path))return;
 // オンラインでは毎回再検証。オフライン時だけこのアプリ専用キャッシュへ戻る。
 event.respondWith((async()=>{
  const cache=await caches.open(CACHE),key=event.request.mode==='navigate'?new URL('index.html',self.registration.scope).href:new URL(path,self.registration.scope).href;
  try {const r=await fetch(event.request,{cache:'no-cache'});if(r.ok)await cache.put(key,r.clone());return r;}
  catch(error){const cached=await cache.match(key);if(cached)return cached;throw error;}
 })());
});
