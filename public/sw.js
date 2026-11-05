/* Mi Tienda POS - Web Windows - cache offline de prueba, v1
 * Guardar documentos/scripts bajo el MISMO origen. No almacenar autorizados.json.
 */
const CACHE = 'mitienda-windows-web-prueba-v1';
const CORE = [
  './', './index.html', './fullv.html', './fullv_demo.html',
  './reporte.html', './gencodigo.html',
  './js/acceso.js', './js/guardFullv.js', './js/fp.min.js',
  './offline_estado.html'
];
const LICENSE_RE = /(?:^|\/)autorizados\.json$/i;
const CACHEABLE = /\.(?:html|js|css|png|svg|jpe?g|webp|ico|woff2?)$/i;
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fallar instalación si falta un archivo esencial, en vez de decir que está listo.
    await cache.addAll(CORE);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('mitienda-windows-web-prueba-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Revocación: solo red. Si no hay red, guardFullv usa su licencia local.
  if (LICENSE_RE.test(url.pathname)) {
    event.respondWith(fetch(req, {cache:'no-store'}));
    return;
  }
  if (req.mode !== 'navigate' && !CACHEABLE.test(url.pathname)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Red primero para tomar cambios de la aplicación. Caché si falla la red.
    try {
      const response = await fetch(req);
      if (response.ok && response.type === 'basic') {
        // Solo cachear nuestros recursos; nunca respuestas de error ni licencias.
        await cache.put(req, response.clone()).catch(() => {});
      }
      return response;
    } catch (error) {
      const cached = await cache.match(req, {ignoreSearch:true});
      if (cached) return cached;
      // Nunca presentar la versión gratuita como si fuese fullv.
      if (req.mode === 'navigate') return new Response(
        '<!doctype html><html lang="es"><meta charset="utf-8"><title>Archivo no disponible</title><body><h2>Esta pantalla no está disponible sin conexión</h2><p>Conéctate para cargarla por primera vez y vuelve a probar.</p><a href="./index.html">Volver a Mi Tienda</a></body></html>',
        {status:503, headers:{'Content-Type':'text/html; charset=utf-8'}});
      throw error;
    }
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CHECK_OFFLINE') return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const entries = await Promise.all(CORE.map(async path => ({path, ready:!!(await cache.match(new URL(path, self.registration.scope)))})));
    event.source?.postMessage({type:'OFFLINE_STATUS', cache:CACHE, entries});
  })());
});
