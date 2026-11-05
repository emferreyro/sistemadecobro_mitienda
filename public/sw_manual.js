/* Mi Tienda Windows offline opt-in; no automatic installation from the POS. */
'use strict';
const VERSION = 'manual-v1';
const ACTIVE = 'mitienda-manual-offline-' + VERSION;
const PREFIX = 'mitienda-manual-offline-';
const EXCLUDED = new Set(['/autorizados.json']);
function excluded(url){return EXCLUDED.has(url.pathname.toLowerCase()) || url.pathname.toLowerCase().endsWith('/autorizados.json');}
self.addEventListener('install', evt=>evt.waitUntil(self.skipWaiting()));
self.addEventListener('activate', evt=>evt.waitUntil((async()=>{await self.clients.claim();})()));
self.addEventListener('message', evt=>{
  if(evt.data?.type==='OFFLINE_VERSION' && evt.ports?.[0])evt.ports[0].postMessage({version:VERSION, cache:ACTIVE});
});
self.addEventListener('fetch',evt=>{
  const req=evt.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin || excluded(url))return; // NEVER cache license JSON.
  if(!['http:','https:'].includes(url.protocol))return;
  evt.respondWith((async()=>{
    const cache=await caches.open(ACTIVE);
    try {
      // Network-first; keeps online revocation and normal deployments fresh.
      const resp=await fetch(req);
      if(resp.ok && resp.type==='basic') {
        // Cache URL without query string only if not navigation? URLs with query cached separately.
        try{await cache.put(req,resp.clone());}catch(_){/* quota / permissions */}
      }
      return resp;
    }catch(err){
      const cached=await cache.match(req,{ignoreSearch:true});
      if(cached)return cached;
      if(req.mode==='navigate')return new Response('<!doctype html><html lang="es"><meta charset="utf-8"><title>Mi Tienda offline</title><body style="font:16px system-ui;padding:2rem"><h2>Esta pantalla no está descargada</h2><p>Conéctate a internet y ejecuta instalar_offline.html para guardarla.</p><a href="./index.html">Volver a Mi Tienda</a></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8'},status:503});
      throw err;
    }
  })());
});
