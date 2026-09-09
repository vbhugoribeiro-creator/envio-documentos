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

const telas = {
  inicio: document.getElementById("tela-inicio"),
  camara: document.getElementById("tela-camara"),
  revisao: document.getElementById("tela-revisao"),
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
const erroTexto = document.getElementById("erro-texto");

let streamAtual = null;
let intervaloDeteccao = null;
let etapaAtual = "qr"; // "qr" | "documento"
let fotoQrBlob = null;
let fotoDocBlob = null;
let qrDetetadoNaFoto = false;

function mostrarTela(nome) {
  Object.values(telas).forEach((t) => t.classList.remove("ativa"));
  telas[nome].classList.add("ativa");
  // Esconde o cabeçalho de marca durante a câmara -- não serve nenhum
  // propósito ali e o espaço que ocupa é precioso: em telemóveis mais
  // baixos era preciso deslizar o ecrã para alcançar o botão de captura.
  // Reportado pelo utilizador em teste real, 2026-09-09.
  document.body.classList.toggle("camara-ativa", nome === "camara");
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
    passoIndicador.textContent = "Passo 2 de 2 — Documento completo";
    dicaPasso.textContent = "Agora afasta-te um pouco e apanha o documento completo.";
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
    const resultado = jsQR(dados.data, dados.width, dados.height);
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
    // Leitura final em resolução completa -- mais fiável do que a
    // deteção em contínuo (que usa uma versão reduzida só para feedback
    // rápido).
    const dados = ctx.getImageData(0, 0, w, h);
    qrDetetadoNaFoto = !!jsQR(dados.data, dados.width, dados.height);
    pararCamara();
    canvasCaptura.toBlob(
      (blob) => {
        fotoQrBlob = blob;
        fotoPreviewQr.src = URL.createObjectURL(blob);
        etapaAtual = "documento";
        abrirCamara();
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
        mostrarResultadoQr(qrDetetadoNaFoto);
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

async function construirPdfDocumento(blobDoc, blobQr) {
  const { jsPDF } = window.jspdf;
  const imgDoc = await carregarImagem(blobDoc);
  const imgQr = await carregarImagem(blobQr);

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

  doc.addPage(
    [pxParaMm(imgQr.naturalWidth), pxParaMm(imgQr.naturalHeight)],
    imgQr.naturalWidth > imgQr.naturalHeight ? "landscape" : "portrait"
  );
  doc.addImage(imgQr, "JPEG", 0, 0, pxParaMm(imgQr.naturalWidth), pxParaMm(imgQr.naturalHeight));

  return doc.output("blob");
}

document.getElementById("btn-partilhar").addEventListener("click", async () => {
  if (!fotoQrBlob || !fotoDocBlob) return;
  const btn = document.getElementById("btn-partilhar");
  const textoOriginal = btn.textContent;
  btn.textContent = "A preparar...";
  btn.disabled = true;

  let pdfBlob;
  try {
    pdfBlob = await construirPdfDocumento(fotoDocBlob, fotoQrBlob);
  } catch (e) {
    console.error("Erro a construir o PDF:", e);
    btn.textContent = textoOriginal;
    btn.disabled = false;
    alert("Não consegui juntar as fotos num PDF. Tenta outra vez.");
    return;
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const ficheiroPdf = new File([pdfBlob], `documento_${hoje}.pdf`, { type: "application/pdf" });

  // Por agora, o envio é só por email, sempre para o mesmo destinatário
  // fixo (pedido explícito do utilizador, 2026-09-09 -- já está
  // configurado no automatismo de leitura de email do escritório, ver
  // _config_email.json). O Web Share API não tem forma de pré-preencher
  // o campo "Para" de um email (só existe "mailto:" para isso, que por
  // sua vez não permite anexar ficheiros) -- por isso aqui faz as duas
  // coisas em separado: descarrega o PDF e abre logo o email já com o
  // destinatário e assunto preenchidos, só falta o cliente anexar o
  // ficheiro (feito automaticamente pelo Gmail/Mail se o ficheiro
  // acabado de descarregar ainda aparecer na lista de anexos recentes,
  // caso contrário o cliente escolhe-o da pasta de transferências).
  const EMAIL_DESTINO = "vb.hugo.ribeiro@gmail.com";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(ficheiroPdf);
  a.download = ficheiroPdf.name;
  document.body.appendChild(a);
  a.click();
  a.remove();

  const assunto = encodeURIComponent("Documento para a contabilidade");
  const corpo = encodeURIComponent(
    `Documento em anexo (${ficheiroPdf.name}).\n\nEnviado pela app "Enviar Documentos".`
  );
  // Pequeno atraso -- dá tempo ao telemóvel de mostrar a notificação de
  // "ficheiro transferido" antes de mudar de app para o email, evita a
  // sensação de que nada aconteceu com a transferência.
  setTimeout(() => {
    window.location.href = `mailto:${EMAIL_DESTINO}?subject=${assunto}&body=${corpo}`;
  }, 400);

  btn.textContent = textoOriginal;
  btn.disabled = false;
});

// ---------------------------------------------------------------------
// Início / erro
// ---------------------------------------------------------------------
document.getElementById("btn-iniciar").addEventListener("click", () => {
  etapaAtual = "qr";
  fotoQrBlob = null;
  fotoDocBlob = null;
  abrirCamara();
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
