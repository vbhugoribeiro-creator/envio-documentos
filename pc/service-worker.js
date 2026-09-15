// Cache da "casca" da ContaClick PC -- HTML/CSS/JS/ícones ficam
// disponíveis mesmo sem rede momentânea. À parte da app do telemóvel
// (scope /pc/, cache com nome próprio) -- as duas não se pisam.
//
// IMPORTANTE: subir este número sempre que se publicar uma alteração --
// é o que faz o browser trocar para o service worker novo. Sem isto,
// quem já tinha a app aberta continuava a ver a versão antiga em cache.
const CACHE_NOME = "contaclick-pc-v15";
const FICHEIROS_CASCA = [
  "./",
  "./index.html",
  "./app.js",
  "./i18n.js",
  "./minizip.js",
  "./jspdf.umd.min.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./favicon-32.png",
  "./icon-apple-touch.png",
  "./logo_vanessa_branco.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(CACHE_NOME).then((cache) => cache.addAll(FICHEIROS_CASCA)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys().then((nomes) =>
      Promise.all(nomes.filter((n) => n !== CACHE_NOME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

// Rede primeiro, cache como reserva -- uma alteração publicada chega
// logo a quem já tem a app aberta; só cai para o cache se a rede falhar.
// "cache: no-store" é essencial aqui (2026-09-14, bug real): sem isto, o
// PRÓPRIO fetch() do browser podia devolver uma cópia do HTTP cache
// normal (não a Cache API do service worker, a cache nativa do browser)
// em vez de ir mesmo à rede -- alterações publicadas ficavam invisíveis
// para quem já tinha a app aberta, mesmo com este "network first" e
// mesmo depois de fechar/reabrir a app, só um Ctrl+F5 forçava a
// atualizar. "no-store" ignora sempre esse cache HTTP normal.
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    fetch(evento.request, { cache: "no-store" })
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
