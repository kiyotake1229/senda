// 閃打 Service Worker
// ページ本体（HTML）はネットワーク優先で最新版を取り、オフライン時だけキャッシュを使う。
// アイコン・フォントなどはキャッシュ優先。
const CACHE="senda-v2";
const ASSETS=["./","./index.html","./manifest.json","./icon.svg","./icon-192.png"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));self.skipWaiting();});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))));self.clients.claim();});
const put=(req,res)=>{if(res.ok){const cp=res.clone();caches.open(CACHE).then(c=>c.put(req,cp));}return res;};
self.addEventListener("fetch",e=>{
  const req=e.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  const same=url.origin===self.location.origin;
  if(!same&&!/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname))return;
  if(req.mode==="navigate"||(same&&/\.html?$|\/$/.test(url.pathname))){
    e.respondWith(fetch(req).then(res=>put(same?new Request(url.pathname):req,res)).catch(()=>caches.match(url.pathname).then(r=>r||caches.match("./index.html"))));
    return;
  }
  e.respondWith(caches.match(req).then(r=>r||fetch(req).then(res=>put(req,res))));
});
