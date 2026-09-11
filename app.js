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

// ---------------------------------------------------------------------
// Idioma (PT predefinido / EN) -- ver i18n.js para a tabela de textos.
// A escolha fica guardada no telemóvel; à primeira vez arranca na língua
// do próprio telemóvel (inglês se o sistema estiver em inglês, senão
// português). Pedido explícito do utilizador, 2026-09-10.
// ---------------------------------------------------------------------
let idioma = "pt";
(function definirIdiomaInicial() {
  let guardado = null;
  try {
    guardado = localStorage.getItem("contaclick_idioma");
  } catch (e) {
    /* localStorage pode estar bloqueado (janela privada, etc.) -- sem
       problema, fica na deteção automática abaixo. */
  }
  if (guardado === "pt" || guardado === "en") {
    idioma = guardado;
    return;
  }
  const nav = (navigator.language || "pt").toLowerCase();
  idioma = nav.startsWith("en") ? "en" : "pt";
})();

// t("chave") ou t("chave", { n: 3 }) para os {marcadores} do texto.
function t(chave, params) {
  const tabela = TRADUCOES[idioma] || TRADUCOES.pt;
  let texto = tabela[chave];
  if (texto == null) texto = TRADUCOES.pt[chave] != null ? TRADUCOES.pt[chave] : chave;
  if (params) {
    for (const k in params) {
      texto = texto.replace(new RegExp("\\{" + k + "\\}", "g"), params[k]);
    }
  }
  return texto;
}

// "1 documento" / "3 documentos" (já traduzido) -- usado no meio de outras frases.
function fragDocs(n) {
  return n === 1 ? t("doc_singular") : t("doc_plural", { n });
}

const telas = {
  inicio: document.getElementById("tela-inicio"),
  camara: document.getElementById("tela-camara"),
  revisao: document.getElementById("tela-revisao"),
  lote: document.getElementById("tela-lote"),
  confirmar: document.getElementById("tela-confirmar"),
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
const enderecoEnvioConfirmar = document.getElementById("endereco-envio-confirmar");
enderecoEnvioConfirmar.textContent = EMAIL_DESTINO;
const confirmarPassos = document.getElementById("confirmar-passos");
const confirmarTextoShare = document.getElementById("confirmar-texto-share");
const confirmarTitulo = document.getElementById("confirmar-titulo");
const confirmarNota = document.getElementById("confirmar-nota");
const blocoAbrirEmail = document.getElementById("bloco-abrir-email");

// Qual a chave de texto de erro da câmara atualmente mostrada -- guardada
// para que, se o cliente trocar de língua no ecrã de erro, o texto mude também.
let ultimoErroKey = "erro_texto_inicial";

function ligarCopiar(idBotao) {
  document.getElementById(idBotao).addEventListener("click", async (evento) => {
    try {
      await navigator.clipboard.writeText(EMAIL_DESTINO);
      const btn = evento.currentTarget;
      btn.textContent = t("btn_copiado");
      setTimeout(() => (btn.textContent = t("btn_copiar")), 1500);
    } catch (e) {
      console.error("Não consegui copiar:", e);
    }
  });
}
ligarCopiar("btn-copiar-endereco");
ligarCopiar("btn-copiar-endereco-confirmar");

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
// Traduções -- aplicar aos textos fixos do HTML (data-i18n*) e refrescar
// os textos que são construídos em runtime no ecrã que está visível.
// ---------------------------------------------------------------------
function aplicarTraducoesEstaticas() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll("[data-i18n-html]").forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    el.setAttribute("aria-label", t(el.dataset.i18nAria));
  });
  document.querySelectorAll("[data-i18n-alt]").forEach((el) => {
    el.setAttribute("alt", t(el.dataset.i18nAlt));
  });
}

function refrescarEcraDinamico() {
  const ativa = document.querySelector(".tela.ativa");
  if (!ativa) return;
  if (ativa.id === "tela-inicio") {
    atualizarTextoInicio();
  } else if (ativa.id === "tela-lote") {
    renderizarLote();
  } else if (ativa.id === "tela-revisao" && temQr && !cartaoQr.classList.contains("oculto")) {
    mostrarResultadoQr(qrDetetadoNaFoto);
  } else if (ativa.id === "tela-erro") {
    erroTexto.textContent = t(ultimoErroKey);
  } else if (ativa.id === "tela-confirmar") {
    aplicarTextoConfirmar();
  }
  // O ecrã da câmara não é acessível ao seletor de língua (o cabeçalho
  // está escondido durante a câmara), por isso não precisa de refresco aqui.
}

function definirIdioma(novo) {
  idioma = novo === "en" ? "en" : "pt";
  try {
    localStorage.setItem("contaclick_idioma", idioma);
  } catch (e) {
    /* sem persistência -- a escolha vale só para esta sessão */
  }
  document.documentElement.lang = idioma === "en" ? "en" : "pt-PT";
  document.querySelectorAll(".selector-idioma button").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.idioma === idioma);
  });
  aplicarTraducoesEstaticas();
  refrescarEcraDinamico();
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
    passoIndicador.textContent = t("passo_1");
    dicaPasso.textContent = t("dica_qr");
    molduraQr.classList.add("pequena");
    pillTexto.textContent = t("cam_abrir");
    pillEstado.classList.remove("oculto");
  } else {
    passoIndicador.textContent = temQr ? t("passo_2") : t("passo_doc");
    dicaPasso.textContent = t("dica_doc");
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
    pillTexto.textContent = t("cam_procurar_qr");
    iniciarDeteccaoContinua();
  }
}

function mostrarErroCamara(e) {
  console.error("Erro a abrir câmara:", e);
  if (e && (e.name === "NotAllowedError" || e.name === "PermissionDeniedError")) {
    ultimoErroKey = "erro_perm";
  } else if (e && e.name === "NotFoundError") {
    ultimoErroKey = "erro_sem_camara";
  } else {
    ultimoErroKey = "erro_generico";
  }
  erroTexto.textContent = t(ultimoErroKey);
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
      pillTexto.textContent = t("cam_qr_encontrado");
      pillEstado.classList.add("ok");
      molduraQr.classList.add("detetado");
    } else {
      pillTexto.textContent = t("cam_procurar_qr");
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
    resultadoQr.innerHTML = t("qr_lido_html");
  } else {
    resultadoQr.className = "resultado-qr duvida";
    resultadoQr.innerHTML = t("qr_nao_lido_html");
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
  tituloLote.textContent =
    documentos.length === 1 ? t("lote_titulo_1") : t("lote_titulo_n", { n: documentos.length });
  listaLote.innerHTML = "";
  documentos.forEach((doc, indice) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-lote";

    const imgWrap = document.createElement("div");
    imgWrap.className = "cartao-lote-img";
    const img = document.createElement("img");
    img.src = URL.createObjectURL(doc.fotoDocBlob);
    img.alt = t("doc_item", { n: indice + 1 });
    imgWrap.appendChild(img);

    const info = document.createElement("div");
    info.className = "cartao-lote-info";
    const nome = document.createElement("span");
    nome.textContent = t("doc_item", { n: indice + 1 });
    const badge = document.createElement("span");
    if (!doc.temQr) {
      badge.className = "badge-qr sem";
      badge.textContent = t("badge_sem_qr");
    } else if (doc.qrDetetadoNaFoto) {
      badge.className = "badge-qr ok";
      badge.textContent = t("badge_qr_ok");
    } else {
      badge.className = "badge-qr duvida";
      badge.textContent = t("badge_qr_duvida");
    }
    info.append(nome, badge);

    const btnRemover = document.createElement("button");
    btnRemover.className = "btn-remover-lote";
    btnRemover.setAttribute("aria-label", t("remover_aria", { n: indice + 1 }));
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

// ---------------------------------------------------------------------
// Confirmar envio -- o mesmo bug que já existia aqui: navigator.share()
// resolve logo que a app de email/Gmail abre com os ficheiros anexados,
// não quando o cliente toca mesmo em "Enviar" lá dentro. Se ele voltar
// atrás sem enviar, esta app não tem forma de saber -- por isso nunca se
// assume "enviado" sem confirmação explícita aqui. Pedido explícito do
// utilizador, 2026-09-11 (mesmo problema já corrigido na versão PC).
// ---------------------------------------------------------------------
let modoConfirmarAtual = "manual"; // "manual" | "share"

function aplicarTextoConfirmar() {
  const ehShare = modoConfirmarAtual === "share";
  confirmarPassos.classList.toggle("oculto", ehShare);
  confirmarTextoShare.classList.toggle("oculto", !ehShare);
  confirmarTitulo.textContent = ehShare ? t("confirmar_titulo_share") : t("manual_titulo");
  confirmarNota.textContent = ehShare ? t("nota_confirmar_share") : t("nota_manual");
  // "Abrir o email" só faz sentido depois de ter descarregado ficheiros
  // (modo manual) -- em modo partilha nada foi descarregado.
  blocoAbrirEmail.classList.toggle("oculto", ehShare);
}

function mostrarConfirmar(modo) {
  modoConfirmarAtual = modo;
  aplicarTextoConfirmar();
  mostrarTela("confirmar");
}

document.getElementById("btn-confirmar-enviei").addEventListener("click", () => {
  documentos = [];
  mostrarTela("concluido");
});
document.getElementById("btn-confirmar-nao").addEventListener("click", () => {
  mostrarTela("lote"); // documentos continua intacto -- nada foi limpo
});
document.getElementById("btn-abrir-email").addEventListener("click", () => {
  const assunto = encodeURIComponent(t("email_assunto"));
  const corpo = encodeURIComponent(t("email_corpo"));
  window.location.href = `mailto:${EMAIL_DESTINO}?subject=${assunto}&body=${corpo}`;
});

const btnPartilhar = document.getElementById("btn-partilhar");

async function enviarLote() {
  if (documentos.length === 0) return;
  const textoOriginal = btnPartilhar.textContent;
  btnPartilhar.textContent = t("preparar");
  btnPartilhar.disabled = true;

  const hoje = new Date().toISOString().slice(0, 10);
  let ficheiros;
  try {
    ficheiros = await Promise.all(
      documentos.map(async (doc, indice) => {
        const pdfBlob = await construirPdfDocumento(doc.fotoDocBlob, doc.fotoQrBlob);
        const sufixo = documentos.length > 1 ? `_${indice + 1}` : "";
        return new File([pdfBlob], `${t("nome_ficheiro")}_${hoje}${sufixo}.pdf`, { type: "application/pdf" });
      })
    );
  } catch (e) {
    console.error("Erro a construir os PDFs:", e);
    btnPartilhar.textContent = textoOriginal;
    btnPartilhar.disabled = false;
    alert(t("erro_pdf"));
    return;
  }

  btnPartilhar.textContent = textoOriginal;
  btnPartilhar.disabled = false;

  // "mailto: + descarregar" (tentado antes, 2026-09-09) foi abandonado --
  // confirmado em teste real que os emails chegavam SEM anexo nenhum.
  // "mailto:" nunca anexa ficheiros, é uma limitação de segurança dos
  // browsers, não há como contornar. O Web Share API (navigator.share)
  // suporta vários ficheiros na mesma partilha -- todo o lote sai junto
  // numa única escolha de app, sem repetir o processo por documento.
  // IMPORTANTE: share() resolver só quer dizer que a app de email abriu
  // com os ficheiros anexados -- não que o cliente enviou mesmo a
  // mensagem lá dentro. Por isso não se assume "enviado" aqui, ver
  // mostrarConfirmar().
  if (navigator.canShare && navigator.canShare({ files: ficheiros })) {
    try {
      await navigator.share({
        files: ficheiros,
        title: t("share_title"),
        text: t("share_text", { email: EMAIL_DESTINO }),
      });
      mostrarConfirmar("share");
      return;
    } catch (e) {
      if (e && e.name === "AbortError") {
        return; // cancelou -- fica no ecrã de lote, com os documentos intactos.
      }
      console.error("Erro a partilhar:", e);
      // cai para o modo manual abaixo
    }
  }

  // Sem suporte a partilha de ficheiros (raro em telemóvel, comum em
  // browser de computador) -- descarrega os PDFs e mostra os passos.
  for (const ficheiro of ficheiros) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(ficheiro);
    a.download = ficheiro.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  mostrarConfirmar("manual");
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
    tituloInicio.textContent = t("inicio_titulo_mais");
    textoInicio.textContent = t("inicio_texto_mais", { docs: fragDocs(documentos.length) });
  } else {
    tituloInicio.textContent = t("inicio_titulo");
    textoInicio.textContent = t("inicio_texto");
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
// Seletor de língua (PT / EN) -- ver definirIdioma() e i18n.js.
// ---------------------------------------------------------------------
document.querySelectorAll(".selector-idioma button").forEach((b) => {
  b.addEventListener("click", () => definirIdioma(b.dataset.idioma));
});
definirIdioma(idioma); // aplica a língua inicial (guardada ou a do telemóvel)

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
