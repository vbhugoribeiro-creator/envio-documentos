// Cache simples da "casca" da app -- HTML/CSS/JS/ícones ficam disponíveis
// mesmo sem rede (a câmara e a partilha continuam a precisar do
// telemóvel em si, não da internet, por isso isto não é essencial para o
// funcionamento, só acelera o arranque e permite abrir a app já instalada
// sem rede momentaneamente indisponível).
const CACHE_NOME = "docs-cliente-v1";
const FICHEIROS_CASCA = [
  "./",
  "./index.html",
  "./app.js",
  "./jsQR.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(CACHE_NOME).then((cache) => cache.addAll(FICHEIROS_CASCA))
  );
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

self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;
  evento.respondWith(
    caches.match(evento.request).then((resposta) => resposta || fetch(evento.request))
  );
});
