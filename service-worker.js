const CACHE='pila-evidence-stk-v26';
const BASE=new URL('./',self.location).href;
const FILES=[
 './','index.html','local-store.js?v=15','parts-module.css?v=4',
 'barcode-128.js?v=1','part-code-sync.js?v=1','parts-module.js?v=7',
 'spz-ocr.js?v=4','vehicle-catalog.js?v=18','document-scanner.js?v=10',
 'vehicle-catalog.json?v=16','vendor/supabase-2.117.3.js',
 'cloud-config.js?v=6','sync-model.js?v=6','cloud-sync.js?v=15',
 'brand-logos/manitou.png','brand-logos/john-deere.svg',
 'brand-logos/jawa.png','brand-logos/thule.svg','brand-logos/pronar.png',
 'brand-logos/zetor.png','brand-logos/agados.png','manufacturer-sources.json',
 'logo.png','manifest.webmanifest?v=2','icons/central-192.png','icons/central-512.png'
];

self.addEventListener('install',event=>{
 event.waitUntil(caches.open(CACHE)
  .then(cache=>cache.addAll(FILES.map(file=>new Request(new URL(file,BASE),{cache:'reload'}))))
  .then(()=>self.skipWaiting()));
});
self.addEventListener('message',event=>{
 if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys()
  .then(keys=>Promise.all(keys.filter(key=>key.startsWith('pila-evidence-stk-')&&key!==CACHE).map(key=>caches.delete(key))))
  .then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 event.respondWith(fetch(event.request,event.request.mode==='navigate'?{cache:'no-store'}:undefined)
  .then(response=>{
   if(response.ok){const copy=response.clone();caches.open(CACHE).then(cache=>cache.put(event.request,copy));}
   return response;
  })
  .catch(()=>caches.open(CACHE).then(cache=>cache.match(event.request)
   .then(cached=>cached||(event.request.mode==='navigate'
    ?cache.match(new URL('index.html',BASE).href):Response.error())))));
});
