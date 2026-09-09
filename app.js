"use strict";

// ---------------------------------------------------------------------
// Fluxo em 2 fotos por documento -- a câmara de vídeo do browser (usada
// para o preview em direto e para capturar) tem uma resolução muito mais
// baixa do que o modo fotografia nativo do telemóvel (tipicamente
// 1920x1080, contra 12+ megapixéis). Um código QR, que ocupa só uma
// fração pequena de uma página inteira, fica sem pixels suficientes para
// ler quando se tenta apanhar a página toda numa única foto -- obrigava o
// cliente a aproximar-se tanto que deixava de ver o documento. Reportado
// em teste real por um cliente, 2026-09-09.
//
// Solução: cada foto só tem de fazer bem uma coisa.
//   Passo 1 -- código QR bem perto (boa leitura garantida).
//   Passo 2 -- documento completo (legibilidade humana, não precisa de
//              ler nada automaticamente).
// As duas seguem juntas na mesma partilha -- o QR bem legível do Passo 1
// também ajuda a extração automática de dados lá no escritório, mesmo
// que o QR não saia legível na foto do documento completo.
// ---------------------------------------------------------------------

// Destinatário fixo por agora (pedido explícito do utilizador,
// 2026-09-09) -- já configurado no automatismo de leitura de email do
// escritório, ver _config_email.json.
const EMAIL_DESTINO = "vb.hugo.ribeiro@gmail.com";

const telas = {
  inicio: document.getElementById("tela-inicio"),
  camara: document.getElementById("tela-camara"),
  revisao: document.getElementById("tela-revisao"),
  lote: document.getElementById("tela-lote"),
  concluido: document.getElementById("tela-concluido"),
  erro: document.getElementById("tela-erro"),
};

const video = document.getElementById("video");
const canvasCaptura = document.getElementById("canvas-captura");
const molduraQr = document.getElementById("moldura-qr");
const pillEstado = document.getElementById("pill-estado");
const pillTexto = document.getElementById("pill-texto");
const passoIndicador = document.getElementById("passo-indicador");
const dicaPasso = document.getElementById("dica-passo");
const fotoPreviewQr = document.getElementById("foto-preview-qr");
const fotoPreviewDoc = document.getElementById("foto-preview-doc");
const resultadoQr = document.getElementById("resultado-qr");
const cartaoQr = document.getElementById("cartao-qr");
const erroTexto = document.getElementById("erro-texto");
const enderecoEnvio = document.getElementById("endereco-envio");
enderecoEnvio.textContent = EMAIL_DESTINO;
const tituloInicio = document.getElementById("titulo-inicio");
const textoInicio = document.getElementById("texto-inicio");
const tituloLote = document.getElementById("titulo-lote");
const listaLote = document.getElementById("lista-lote");

document.getElementById("btn-copiar-endereco").addEventListener("click", async (evento) => {
  try {
    await navigator.clipboard.writeText(EMAIL_DESTINO);
    const btn = evento.currentTarget;
    const original = btn.textContent;
    btn.textContent = "Copiado!";
    setTimeout(() => (btn.textContent = original), 1500);
  } catch (e) {
    console.error("Não consegui copiar:", e);
  }
});

let streamAtual = null;
let intervaloDeteccao = null;
let etapaAtual = "qr"; // "qr" | "documento"
let temQr = true; // false = documento sem código QR, só 1 foto (ex: guia
  // da AT) -- pedido explícito do utilizador, 2026-09-09.
let fotoQrBlob = null;
let fotoDocBlob = null;
let qrDetetadoNaFoto = false;
let repetirApenasQr = false; // true quando "Repetir esta foto" (QR) foi
  // acionado a partir da revisão -- só volta a capturar essa foto, sem
  // forçar a repetir também a do documento.

// Lote (grupo) de documentos prontos a enviar juntos -- pedido explícito
// do utilizador, 2026-09-09: "deveria existir a opção de poder tirar
// foto a um conjunto de documentos [...] e enviar tudo de uma vez". Cada
// item é {temQr, fotoQrBlob, fotoDocBlob, qrDetetadoNaFoto}, uma cópia
// congelada do documento em edição no momento em que foi adicionado.
let documentos = [];

function mostrarTela(nome) {
  Object.values(telas).forEach((t) => t.classList.remove("ativa"));
  telas[nome].classList.add("ativa");
  // Esconde o cabeçalho de marca durante a câmara -- não serve nenhum
  // propósito ali e o espaço que ocupa é precioso: em telemóveis mais
  // baixos era preciso deslizar o ecrã para alcançar o botão de captura.
  // Reportado pelo utilizador em teste real, 2026-09-09.
  document.body.classList.toggle("camara-ativa", nome === "camara");
  if (nome === "inicio") atualizarTextoInicio();
}

// ---------------------------------------------------------------------
// Câmara -- reaproveitada para os 2 passos, configurada de forma
// diferente consoante etapaAtual.
// ---------------------------------------------------------------------
async function abrirCamara() {
  mostrarTela("camara");
  pillEstado.classList.remove("ok");
  molduraQr.classList.remove("detetado");

  if (etapaAtual === "qr") {
    passoIndicador.textContent = "Passo 1 de 2 — Código QR";
    dicaPasso.textContent = "Aproxima bem o telemóvel até o código QR ficar dentro do quadrado.";
    molduraQr.classList.add("pequena");
    pillTexto.textContent = "A abrir câmara...";
    pillEstado.classList.remove("oculto");
  } else {
    passoIndicador.textContent = temQr ? "Passo 2 de 2 — Documento completo" : "Documento";
    dicaPasso.textContent = "Afasta-te o suficiente para apanhar o documento completo.";
    molduraQr.classList.remove("pequena");
    pillEstado.classList.add("oculto");
  }

  try {
    streamAtual = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false,
    });
  } catch (e) {
    mostrarErroCamara(e);
    return;
  }

  video.srcObject = streamAtual;
  await video.play();

  if (etapaAtual === "qr") {
    pillTexto.textContent = "A procurar código QR...";
    iniciarDeteccaoContinua();
  }
}

function mostrarErroCamara(e) {
  console.error("Erro a abrir câmara:", e);
  if (e && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError")) {
    erroTexto.textContent = "Precisamos de acesso à câmara para tirar a foto. Verifica as permissões deste site nas definições do telemóvel.";
  } else if (e && e.name === "NotFoundError") {
    erroTexto.textContent = "Não encontrei nenhuma câmara neste aparelho.";
  } else {
    erroTexto.textContent = "Não foi possível abrir a câmara. Tenta outra vez.";
  }
  mostrarTela("erro");
}

function pararCamara() {
  if (intervaloDeteccao) {
    clearInterval(intervaloDeteccao);
    intervaloDeteccao = null;
  }
  if (streamAtual) {
    streamAtual.getTracks().forEach((t) => t.stop());
    streamAtual = null;
  }
}

// ---------------------------------------------------------------------
// Realce de contraste (esticamento linear do histograma de luminância) --
// os talões térmicos são o caso mais difícil: fundo acinzentado, tinta
// desbotada, pouco contraste entre os módulos do QR e o fundo. É
// exatamente o mesmo problema que já se resolveu no leitor do GaveConta
// (binarização do zbar, 2026-08-26) -- aqui aplica-se o equivalente antes
// de entregar a imagem ao jsQR. Devolve uma nova ImageData, não mexe na
// original.
// ---------------------------------------------------------------------
function realcarContraste(imageData) {
  const d = imageData.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const amplitude = max - min;
  if (amplitude < 12) return imageData; // já é quase só uma cor, não há o que esticar
  const saida = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const valor = Math.round(((lum - min) / amplitude) * 255);
    saida[i] = saida[i + 1] = saida[i + 2] = valor;
    saida[i + 3] = 255;
  }
  return new ImageData(saida, imageData.width, imageData.height);
}

// Tenta ler o QR na imagem tal como está e, se falhar, na versão com
// contraste realçado -- cobre tanto os casos normais (mais rápido, não
// precisa do realce) como os talões térmicos de baixo contraste.
function tentarDecodificarQr(imageData) {
  if (jsQR(imageData.data, imageData.width, imageData.height)) return true;
  const realcada = realcarContraste(imageData);
  return !!jsQR(realcada.data, realcada.width, realcada.height);
}

// ---------------------------------------------------------------------
// Deteção de QR em contínuo (throttled), só corre no Passo 1 -- serve de
// feedback visual antes de capturar; a leitura que conta para o
// resultado final é feita sobre a própria foto capturada, em resolução
// completa.
// ---------------------------------------------------------------------
function iniciarDeteccaoContinua() {
  const canvasDetecao = document.createElement("canvas");
  const ctxDetecao = canvasDetecao.getContext("2d", { willReadFrequently: true });

  intervaloDeteccao = setInterval(() => {
    if (!video.videoWidth) return;
    const escala = Math.min(1, 960 / video.videoWidth);
    canvasDetecao.width = Math.round(video.videoWidth * escala);
    canvasDetecao.height = Math.round(video.videoHeight * escala);
    ctxDetecao.drawImage(video, 0, 0, canvasDetecao.width, canvasDetecao.height);
    const dados = ctxDetecao.getImageData(0, 0, canvasDetecao.width, canvasDetecao.height);
    const resultado = tentarDecodificarQr(dados);
    if (resultado) {
      pillTexto.textContent = "Código QR encontrado";
      pillEstado.classList.add("ok");
      molduraQr.classList.add("detetado");
    } else {
      pillTexto.textContent = "A procurar código QR...";
      pillEstado.classList.remove("ok");
      molduraQr.classList.remove("detetado");
    }
  }, 450);
}

// ---------------------------------------------------------------------
// Decidir se a foto capturada tem QR legível -- experimenta a imagem em
// resolução completa (com e sem realce de contraste) e, se falhar,
// também a mesma escala reduzida usada na deteção ao vivo. Contra-
// intuitivo, mas real: um código QR nem sempre lê melhor em resolução
// total (ruído do sensor, padrões de moiré) do que numa versão
// ligeiramente reduzida -- por isso o indicador ao vivo podia mostrar
// "encontrado" e a foto capturada, um instante depois, falhar na leitura
// em resolução completa. Reportado pelo utilizador em teste real,
// 2026-09-09.
// ---------------------------------------------------------------------
function decodificarQrComReserva(ctx, w, h) {
  const dadosCompletos = ctx.getImageData(0, 0, w, h);
  if (tentarDecodificarQr(dadosCompletos)) return true;

  const escala = Math.min(1, 960 / w);
  if (escala >= 1) return false; // já era a resolução mais baixa possível
  const canvasReduzido = document.createElement("canvas");
  canvasReduzido.width = Math.round(w * escala);
  canvasReduzido.height = Math.round(h * escala);
  const ctxReduzido = canvasReduzido.getContext("2d");
  ctxReduzido.drawImage(canvasCaptura, 0, 0, canvasReduzido.width, canvasReduzido.height);
  const dadosReduzidos = ctxReduzido.getImageData(0, 0, canvasReduzido.width, canvasReduzido.height);
  return tentarDecodificarQr(dadosReduzidos);
}

// ---------------------------------------------------------------------
// Capturar foto -- comportamento diferente consoante o passo.
// ---------------------------------------------------------------------
document.getElementById("btn-capturar").addEventListener("click", capturarFoto);

function capturarFoto() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  canvasCaptura.width = w;
  canvasCaptura.height = h;
  const ctx = canvasCaptura.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  if (etapaAtual === "qr") {
    qrDetetadoNaFoto = decodificarQrComReserva(ctx, w, h);
    pararCamara();
    canvasCaptura.toBlob(
      (blob) => {
        fotoQrBlob = blob;
        fotoPreviewQr.src = URL.createObjectURL(blob);
        if (repetirApenasQr) {
          // "Repetir esta foto" a partir da revisão -- só esta foto
          // mudou, a do documento mantém-se, volta direto à revisão.
          repetirApenasQr = false;
          mostrarResultadoQr(qrDetetadoNaFoto);
          mostrarTela("revisao");
        } else {
          etapaAtual = "documento";
          abrirCamara();
        }
      },
      "image/jpeg",
      0.92
    );
  } else {
    pararCamara();
    canvasCaptura.toBlob(
      (blob) => {
        fotoDocBlob = blob;
        fotoPreviewDoc.src = URL.createObjectURL(blob);
        cartaoQr.classList.toggle("oculto", !temQr);
        if (temQr) mostrarResultadoQr(qrDetetadoNaFoto);
        mostrarTela("revisao");
      },
      "image/jpeg",
      0.92
    );
  }
}

function mostrarResultadoQr(detetado) {
  if (detetado) {
    resultadoQr.className = "resultado-qr ok";
    resultadoQr.innerHTML = "✓ Código QR lido<small>Ficou bem identificado.</small>";
  } else {
    resultadoQr.className = "resultado-qr duvida";
    resultadoQr.innerHTML = "⚠ QR não lido<small>Repete a 1ª foto mais perto, ou envia à mesma.</small>";
  }
}

// ---------------------------------------------------------------------
// Repetir uma das duas fotos
// ---------------------------------------------------------------------
document.getElementById("btn-repetir-qr").addEventListener("click", () => {
  etapaAtual = "qr";
  repetirApenasQr = true;
  abrirCamara();
});

document.getElementById("btn-repetir-doc").addEventListener("click", () => {
  etapaAtual = "documento";
  abrirCamara();
});

// ---------------------------------------------------------------------
// Juntar as 2 fotos num único PDF (pedido explícito do utilizador,
// 2026-09-09 -- mais simples de receber e já no formato que o
// escritório usa para todos os documentos) -- página 1 é o documento
// completo, página 2 é o close-up do QR (fica disponível para quem for
// processar o documento, mesmo que o QR não saia legível na página 1).
// ---------------------------------------------------------------------
function carregarImagem(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

// blobQr é opcional -- null/undefined para um documento sem código QR
// (1 página só). Pedido explícito do utilizador, 2026-09-09.
async function construirPdfDocumento(blobDoc, blobQr) {
  const { jsPDF } = window.jspdf;
  const imgDoc = await carregarImagem(blobDoc);

  // Tamanho de página em mm a partir dos pixels da foto, a ~150dpi --
  // legível, sem gerar um PDF desnecessariamente pesado para enviar por
  // WhatsApp/email.
  const pxParaMm = (px) => (px / 150) * 25.4;

  const doc = new jsPDF({
    orientation: imgDoc.naturalWidth > imgDoc.naturalHeight ? "landscape" : "portrait",
    unit: "mm",
    format: [pxParaMm(imgDoc.naturalWidth), pxParaMm(imgDoc.naturalHeight)],
  });
  doc.addImage(imgDoc, "JPEG", 0, 0, pxParaMm(imgDoc.naturalWidth), pxParaMm(imgDoc.naturalHeight));

  if (blobQr) {
    const imgQr = await carregarImagem(blobQr);
    doc.addPage(
      [pxParaMm(imgQr.naturalWidth), pxParaMm(imgQr.naturalHeight)],
      imgQr.naturalWidth > imgQr.naturalHeight ? "landscape" : "portrait"
    );
    doc.addImage(imgQr, "JPEG", 0, 0, pxParaMm(imgQr.naturalWidth), pxParaMm(imgQr.naturalHeight));
  }

  return doc.output("blob");
}

// ---------------------------------------------------------------------
// Lote -- adicionar o documento em edição à lista, mostrar a lista,
// remover itens, e enviar tudo junto no fim. Pedido explícito do
// utilizador, 2026-09-09.
// ---------------------------------------------------------------------
function renderizarLote() {
  tituloLote.textContent = documentos.length === 1 ? "1 documento pronto" : `${documentos.length} documentos prontos`;
  listaLote.innerHTML = "";
  documentos.forEach((doc, indice) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-lote";

    const imgWrap = document.createElement("div");
    imgWrap.className = "cartao-lote-img";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(doc.fotoDocBlob);
    img.alt = `Documento ${indice + 1}`;
    imgWrap.appendChild(img);

    const info = document.createElement("div");
    info.className = "cartao-lote-info";
    const nome = document.createElement("span");
    nome.textContent = `Documento ${indice + 1}`;
    const badge = document.createElement("span");
    if (!doc.temQr) {
      badge.className = "badge-qr sem";
      badge.textContent = "Sem código QR";
    } else if (doc.qrDetetadoNaFoto) {
      badge.className = "badge-qr ok";
      badge.textContent = "✓ QR lido";
    } else {
      badge.className = "badge-qr duvida";
      badge.textContent = "⚠ QR não lido";
    }
    info.append(nome, badge);

    const btnRemover = document.createElement("button");
    btnRemover.className = "btn-remover-lote";
    btnRemover.setAttribute("aria-label", `Remover documento ${indice + 1}`);
    btnRemover.textContent = "✕";
    btnRemover.addEventListener("click", () => {
      documentos.splice(indice, 1);
      if (documentos.length === 0) {
        mostrarTela("inicio");
      } else {
        renderizarLote();
      }
    });

    cartao.append(imgWrap, info, btnRemover);
    listaLote.appendChild(cartao);
  });
}

document.getElementById("btn-adicionar-lote").addEventListener("click", () => {
  documentos.push({ temQr, fotoQrBlob, fotoDocBlob, qrDetetadoNaFoto });
  fotoQrBlob = null;
  fotoDocBlob = null;
  renderizarLote();
  mostrarTela("lote");
});

document.getElementById("btn-adicionar-outro").addEventListener("click", () => {
  mostrarTela("inicio");
});

const btnPartilhar = document.getElementById("btn-partilhar");

async function enviarLote() {
  if (documentos.length === 0) return;
  const textoOriginal = btnPartilhar.textContent;
  btnPartilhar.textContent = "A preparar...";
  btnPartilhar.disabled = true;

  const hoje = new Date().toISOString().slice(0, 10);
  let ficheiros;
  try {
    ficheiros = await Promise.all(
      documentos.map(async (doc, indice) => {
        const pdfBlob = await construirPdfDocumento(doc.fotoDocBlob, doc.fotoQrBlob);
        const sufixo = documentos.length > 1 ? `_${indice + 1}` : "";
        return new File([pdfBlob], `documento_${hoje}${sufixo}.pdf`, { type: "application/pdf" });
      })
    );
  } catch (e) {
    console.error("Erro a construir os PDFs:", e);
    btnPartilhar.textContent = textoOriginal;
    btnPartilhar.disabled = false;
    alert("Não consegui juntar as fotos em PDF. Tenta outra vez.");
    return;
  }

  // "mailto: + descarregar" (tentado antes, 2026-09-09) foi abandonado --
  // confirmado em teste real que os emails chegavam SEM anexo nenhum.
  // "mailto:" nunca anexa ficheiros, é uma limitação de segurança dos
  // browsers, não há como contornar. O Web Share API (navigator.share)
  // suporta vários ficheiros na mesma partilha -- todo o lote sai junto
  // numa única escolha de app, sem repetir o processo por documento.
  if (navigator.canShare && navigator.canShare({ files: ficheiros })) {
    try {
      await navigator.share({
        files: ficheiros,
        title: "Documentos",
        text: `Documentos para a contabilidade (enviar para ${EMAIL_DESTINO}).`,
      });
    } catch (e) {
      if (e && e.name !== "AbortError") console.error("Erro a partilhar:", e);
    }
  } else {
    // Sem suporte a partilha de ficheiros (raro em telemóvel, comum em
    // browser de computador) -- oferece os PDFs como download.
    for (const ficheiro of ficheiros) {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(ficheiro);
      a.download = ficheiro.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  btnPartilhar.textContent = textoOriginal;
  btnPartilhar.disabled = false;
  documentos = [];

  // Depois de enviado, o ecrã de lote não faz sentido continuar visível
  // -- passa para um ecrã de conclusão com as opções que fazem sentido a
  // seguir (novo documento, ou terminar). Pedido explícito do
  // utilizador, 2026-09-09.
  mostrarTela("concluido");
}

btnPartilhar.addEventListener("click", enviarLote);

// ---------------------------------------------------------------------
// Início / novo documento / terminar / erro
// ---------------------------------------------------------------------
function iniciarNovoDocumento(comQr) {
  temQr = comQr;
  etapaAtual = comQr ? "qr" : "documento";
  repetirApenasQr = false;
  fotoQrBlob = null;
  fotoDocBlob = null;
  abrirCamara();
}

document.getElementById("btn-iniciar-com-qr").addEventListener("click", () => iniciarNovoDocumento(true));
document.getElementById("btn-iniciar-sem-qr").addEventListener("click", () => iniciarNovoDocumento(false));

// O texto do ecrã inicial muda consoante já haja (ou não) documentos no
// lote à espera -- ver mostrarTela().
function atualizarTextoInicio() {
  if (documentos.length > 0) {
    tituloInicio.textContent = "Adicionar mais um documento";
    textoInicio.textContent = `Já tens ${documentos.length === 1 ? "1 documento" : documentos.length + " documentos"} no envio. Este novo tem código QR ou não?`;
  } else {
    tituloInicio.textContent = "ContaClick";
    textoInicio.textContent = "O documento tem código QR (fatura, recibo...) ou não (guia da AT, outro papel qualquer)?";
  }
}

document.getElementById("btn-novo-documento").addEventListener("click", () => {
  fotoQrBlob = null;
  fotoDocBlob = null;
  mostrarTela("inicio");
});
document.getElementById("btn-terminar").addEventListener("click", () => {
  documentos = [];
  fotoQrBlob = null;
  fotoDocBlob = null;
  mostrarTela("inicio");
});

document.getElementById("btn-tentar-de-novo").addEventListener("click", abrirCamara);

// ---------------------------------------------------------------------
// Service worker (instalação da PWA / cache básica)
// ---------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((e) => {
      console.error("Falha ao registar service worker:", e);
    });
  });
}

// ---------------------------------------------------------------------
// "Fixar app no ecrã principal" -- pedido explícito do utilizador,
// 2026-09-09, para não depender do cliente encontrar isto sozinho no
// menu do browser.
//
// Android/Chrome: o browser dispara "beforeinstallprompt" quando a app
// cumpre os requisitos de instalação (manifest válido, HTTPS, service
// worker) -- guarda esse evento e usa-o quando o cliente tocar no botão.
// iOS/Safari nunca dispara este evento (Apple não expõe esta API por
// código nenhum) -- nesse caso mostra-se antes o texto com os passos
// manuais ("Partilhar" -> "Adicionar ao Ecrã Principal").
// Se a app já estiver a correr instalada (modo standalone), não faz
// sentido mostrar nenhum dos dois.
// ---------------------------------------------------------------------
const btnInstalar = document.getElementById("btn-instalar");
const notaInstalarIos = document.getElementById("nota-instalar-ios");
let promptInstalacaoDiferido = null;

function aCorrerInstalada() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true // Safari iOS
  );
}

const ehIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

if (!aCorrerInstalada()) {
  if (ehIos) {
    notaInstalarIos.classList.remove("oculto");
  } else {
    window.addEventListener("beforeinstallprompt", (evento) => {
      evento.preventDefault();
      promptInstalacaoDiferido = evento;
      btnInstalar.classList.remove("oculto");
    });
  }
}

btnInstalar.addEventListener("click", async () => {
  if (!promptInstalacaoDiferido) return;
  promptInstalacaoDiferido.prompt();
  await promptInstalacaoDiferido.userChoice;
  promptInstalacaoDiferido = null;
  btnInstalar.classList.add("oculto");
});

window.addEventListener("appinstalled", () => {
  btnInstalar.classList.add("oculto");
});
