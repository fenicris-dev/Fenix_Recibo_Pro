// ══════════════════════════════════════════════════════════════
// Fênix Recibos Pro — Service Worker
//
// Publique este arquivo NA MESMA PASTA do recibo.html no GitHub
// Pages (ex.: junto de index.html, se você renomear o HTML).
// O app registra este arquivo passando a versão atual como query
// string (?v=X.Y), então o nome do cache muda sozinho a cada nova
// versão publicada — não precisa editar este arquivo manualmente
// a cada release, só mantê-lo publicado ao lado do HTML.
// ══════════════════════════════════════════════════════════════

const params = new URL(self.location).searchParams;
const CACHE = 'fenix-recibos-' + (params.get('v') || 'v0');

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Estratégia: network-first, com fallback para cache quando offline.
// Cada requisição bem-sucedida (o próprio HTML, fontes, CDN scripts,
// chamadas ao Firestore que passarem por aqui) fica salva no cache,
// então na próxima vez sem internet o app ainda abre.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
