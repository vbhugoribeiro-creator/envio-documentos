// Cache da "casca" da ContaClick PC -- HTML/CSS/JS/ícones ficam
// disponíveis mesmo sem rede momentânea. À parte da app do telemóvel
// (scope /pc/, cache com nome próprio) -- as duas não se pisam.
//
// IMPORTANTE: subir este número sempre que se publicar uma alteração --
// é o que faz o browser trocar para o service worker novo. Sem isto,
// quem já tinha a app aberta continuava a ver a versão antiga em cache.
const CACHE_NOME = "contaclick-pc-v2";
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
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        const copia = resposta.clone();
        caches.open(CACHE_NOME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});
