// Cache simples da "casca" da app -- HTML/CSS/JS/ícones ficam disponíveis
// mesmo sem rede (a câmara e a partilha continuam a precisar do
// telemóvel em si, não da internet, por isso isto não é essencial para o
// funcionamento, só acelera o arranque e permite abrir a app já instalada
// sem rede momentaneamente indisponível).
//
// IMPORTANTE: subir este número sempre que se publicar uma alteração --
// é o que faz o browser perceber que há um service worker novo e trocar
// para ele. Sem isto, quem já tinha a app aberta/instalada continuava a
// ver a versão antiga em cache, mesmo depois de publicada a correção.
// Bug real, visto em teste, 2026-09-09.
const CACHE_NOME = "docs-cliente-v12";
const FICHEIROS_CASCA = [
  "./",
  "./index.html",
  "./app.js",
  "./i18n.js",
  "./jsQR.js",
  "./jspdf.umd.min.js",
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

// Rede primeiro, cache como reserva -- ao contrário do costume ("cache
// primeiro") para uma app que está em desenvolvimento ativo: com
// "cache primeiro", uma alteração publicada podia nunca chegar a quem já
// tinha a app aberta, mesmo com o código novo já no GitHub Pages. Só cai
// para o cache se a rede genuinamente falhar (por exemplo, sem rede).
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
