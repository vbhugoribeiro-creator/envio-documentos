"use strict";

// ---------------------------------------------------------------------
// Estado e referências
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
const fotoPreview = document.getElementById("foto-preview");
const resultadoQr = document.getElementById("resultado-qr");
const erroTexto = document.getElementById("erro-texto");

let streamAtual = null;
let intervaloDeteccao = null;
let qrDetetadoAgora = false;
let ultimaFotoBlob = null;

function mostrarTela(nome) {
  Object.values(telas).forEach((t) => t.classList.remove("ativa"));
  telas[nome].classList.add("ativa");
}

// ---------------------------------------------------------------------
// Câmara
// ---------------------------------------------------------------------
async function abrirCamara() {
  mostrarTela("camara");
  pillTexto.textContent = "A abrir câmara...";
  pillEstado.classList.remove("ok");
  molduraQr.classList.remove("detetado");
  qrDetetadoAgora = false;

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
  pillTexto.textContent = "A procurar código QR...";
  iniciarDeteccaoContinua();
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
// Deteção de QR em contínuo (throttled) enquanto a câmara está ativa --
// só serve de feedback visual antes de capturar; a leitura que conta
// para o resultado final é feita sobre a própria foto capturada.
// ---------------------------------------------------------------------
function iniciarDeteccaoContinua() {
  const canvasDetecao = document.createElement("canvas");
  const ctxDetecao = canvasDetecao.getContext("2d", { willReadFrequently: true });

  intervaloDeteccao = setInterval(() => {
    if (!video.videoWidth) return;
    // A reduzir demasiado a resolução aqui, o código QR (normalmente uma
    // fração pequena da página inteira) ficava com poucos pixels a
    // menos de uns 10-15cm de distância -- obrigava a aproximar demasiado
    // o telemóvel do documento, perdendo o resto da página de vista.
    // Caso real, 2026-09-09. 960px de largura lê a distâncias normais de
    // fotografar uma página inteira, mantendo ainda boa fluidez.
    const escala = Math.min(1, 960 / video.videoWidth);
    canvasDetecao.width = Math.round(video.videoWidth * escala);
    canvasDetecao.height = Math.round(video.videoHeight * escala);
    ctxDetecao.drawImage(video, 0, 0, canvasDetecao.width, canvasDetecao.height);
    const dados = ctxDetecao.getImageData(0, 0, canvasDetecao.width, canvasDetecao.height);
    const resultado = jsQR(dados.data, dados.width, dados.height);
    qrDetetadoAgora = !!resultado;
    if (qrDetetadoAgora) {
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
// Capturar foto
// ---------------------------------------------------------------------
document.getElementById("btn-capturar").addEventListener("click", capturarFoto);

function capturarFoto() {
  const w = video.videoWidth;
  const h = video.videoHeight;
  canvasCaptura.width = w;
  canvasCaptura.height = h;
  const ctx = canvasCaptura.getContext("2d");
  ctx.drawImage(video, 0, 0, w, h);

  // Leitura final do QR sobre a foto em resolução completa -- mais fiável
  // do que a deteção em contínuo (que usa uma versão reduzida só para
  // feedback rápido).
  const dados = ctx.getImageData(0, 0, w, h);
  const resultadoFinal = jsQR(dados.data, dados.width, dados.height);

  pararCamara();

  canvasCaptura.toBlob(
    (blob) => {
      ultimaFotoBlob = blob;
      fotoPreview.src = URL.createObjectURL(blob);
      mostrarResultadoQr(!!resultadoFinal);
      mostrarTela("revisao");
    },
    "image/jpeg",
    0.92
  );
}

function mostrarResultadoQr(detetado) {
  if (detetado) {
    resultadoQr.className = "resultado-qr ok";
    resultadoQr.innerHTML = "✓ Código QR lido com sucesso<small>O documento deve ficar bem identificado.</small>";
  } else {
    resultadoQr.className = "resultado-qr duvida";
    resultadoQr.innerHTML = "⚠ Não consegui ler nenhum código QR<small>Se o documento tiver QR, tenta repetir com mais luz e mais perto. Se não tiver, podes enviar à mesma.</small>";
  }
}

// ---------------------------------------------------------------------
// Partilhar / repetir
// ---------------------------------------------------------------------
document.getElementById("btn-repetir").addEventListener("click", abrirCamara);

document.getElementById("btn-partilhar").addEventListener("click", async () => {
  if (!ultimaFotoBlob) return;
  const nomeFicheiro = `documento_${new Date().toISOString().slice(0, 10)}.jpg`;
  const ficheiro = new File([ultimaFotoBlob], nomeFicheiro, { type: "image/jpeg" });

  if (navigator.canShare && navigator.canShare({ files: [ficheiro] })) {
    try {
      await navigator.share({
        files: [ficheiro],
        title: "Documento",
        text: "Documento para a contabilidade.",
      });
    } catch (e) {
      // utilizador cancelou a partilha -- não é um erro a reportar
      if (e && e.name !== "AbortError") console.error("Erro a partilhar:", e);
    }
  } else {
    // Sem suporte a partilha de ficheiros (ex: alguns browsers de
    // computador) -- oferece a foto como download em vez de bloquear.
    const a = document.createElement("a");
    a.href = URL.createObjectURL(ficheiro);
    a.download = nomeFicheiro;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
});

document.getElementById("btn-iniciar").addEventListener("click", abrirCamara);
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
