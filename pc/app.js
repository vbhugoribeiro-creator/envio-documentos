"use strict";

// ---------------------------------------------------------------------
// ContaClick PC -- versão para computador. Mesma intenção da app do
// telemóvel (o cliente envia os documentos para a contabilidade), mas
// aqui NÃO se tira fotos: o cliente escolhe ficheiros que já tem no PC
// (faturas em PDF, scans, fotos passadas do telemóvel) e envia tudo de
// uma vez para o mesmo endereço do escritório.
//
// Sem verificação de código QR (decisão do utilizador, 2026-09-10): o QR
// é lido no sistema do escritório de qualquer forma, e no PC o cliente
// não pode melhorar o ficheiro na hora, por isso o badge não daria nada.
//
// Envio: navigator.share({files}) quando o browser suporta (Edge/Chrome
// no Windows suportam) -- todo o lote sai numa só escolha de app de
// email. Quando não suporta, descarrega os ficheiros e mostra os passos
// para o cliente anexar a um email novo (mailto: nunca anexa ficheiros,
// é limitação de segurança dos browsers -- mesma lição da app do
// telemóvel).
// ---------------------------------------------------------------------

// Destinatário fixo -- o mesmo já configurado no automatismo de leitura
// de email do escritório (ver _config_email.json no GaveConta).
const EMAIL_DESTINO = "vb.hugo.ribeiro@gmail.com";

const EXT_IMAGEM_CONVERTIVEL = /^image\/(jpeg|png|webp|gif|bmp)$/i;

// ---------------------------------------------------------------------
// Idioma (PT predefinido / EN) -- mesma chave localStorage da app do
// telemóvel, para o cliente que use as duas não ter de voltar a escolher.
// ---------------------------------------------------------------------
let idioma = "pt";
(function definirIdiomaInicial() {
  let guardado = null;
  try {
    guardado = localStorage.getItem("contaclick_idioma");
  } catch (e) {
    /* localStorage pode estar bloqueado -- deteção automática abaixo */
  }
  if (guardado === "pt" || guardado === "en") {
    idioma = guardado;
    return;
  }
  const nav = (navigator.language || "pt").toLowerCase();
  idioma = nav.startsWith("en") ? "en" : "pt";
})();

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

const telas = {
  inicio: document.getElementById("tela-inicio"),
  lote: document.getElementById("tela-lote"),
  confirmar: document.getElementById("tela-confirmar"),
  concluido: document.getElementById("tela-concluido"),
};

const dropZona = document.getElementById("drop-zona");
const inputFicheiros = document.getElementById("input-ficheiros");
const listaLote = document.getElementById("lista-lote");
const tituloLote = document.getElementById("titulo-lote");
const btnEnviar = document.getElementById("btn-enviar");
const chkZip = document.getElementById("chk-zip");
const confirmarPassos = document.getElementById("confirmar-passos");
const confirmarTextoShare = document.getElementById("confirmar-texto-share");
const confirmarTitulo = document.getElementById("confirmar-titulo");
const confirmarNota = document.getElementById("confirmar-nota");

document.getElementById("endereco-envio").textContent = EMAIL_DESTINO;
document.getElementById("endereco-envio-2").textContent = EMAIL_DESTINO;

// Cada item: { file: File original, nome, tipo: "pdf"|"convertido"|"outro" }
let documentos = [];

function mostrarTela(nome) {
  Object.values(telas).forEach((s) => s.classList.remove("ativa"));
  telas[nome].classList.add("ativa");
}

// ---------------------------------------------------------------------
// Traduções
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
}

let modoConfirmarAtual = "manual"; // "manual" | "share" -- ver mostrarConfirmar()

function refrescarEcraDinamico() {
  if (telas.lote.classList.contains("ativa")) renderizarLote();
  if (telas.confirmar.classList.contains("ativa")) aplicarTextoConfirmar();
}

function definirIdioma(novo) {
  idioma = novo === "en" ? "en" : "pt";
  try {
    localStorage.setItem("contaclick_idioma", idioma);
  } catch (e) {
    /* sem persistência -- vale para esta sessão */
  }
  document.documentElement.lang = idioma === "en" ? "en" : "pt-PT";
  document.querySelectorAll(".selector-idioma button").forEach((b) => {
    b.classList.toggle("ativo", b.dataset.idioma === idioma);
  });
  aplicarTraducoesEstaticas();
  refrescarEcraDinamico();
}

// ---------------------------------------------------------------------
// Escolher / arrastar ficheiros
// ---------------------------------------------------------------------
dropZona.addEventListener("click", () => inputFicheiros.click());
dropZona.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    inputFicheiros.click();
  }
});
inputFicheiros.addEventListener("change", () => {
  adicionarFicheiros(inputFicheiros.files);
  inputFicheiros.value = ""; // permite re-escolher o mesmo ficheiro
});

["dragenter", "dragover"].forEach((ev) =>
  dropZona.addEventListener(ev, (e) => {
    e.preventDefault();
    dropZona.classList.add("arrastando");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropZona.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "dragleave" && dropZona.contains(e.relatedTarget)) return;
    dropZona.classList.remove("arrastando");
  })
);
dropZona.addEventListener("drop", (e) => {
  if (e.dataTransfer && e.dataTransfer.files) adicionarFicheiros(e.dataTransfer.files);
});

// A página toda também aceita drop (mais tolerante do que só a zona) --
// evita o browser abrir o ficheiro se o cliente falhar a mira.
["dragover", "drop"].forEach((ev) =>
  window.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === "drop" && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
      adicionarFicheiros(e.dataTransfer.files);
    }
  })
);

function classificarFicheiro(file) {
  const nomePdf = /\.pdf$/i.test(file.name);
  if (file.type === "application/pdf" || nomePdf) return "pdf";
  if (EXT_IMAGEM_CONVERTIVEL.test(file.type)) return "convertido";
  return "outro"; // ex: HEIC -- segue tal como está
}

function adicionarFicheiros(fileList) {
  const novos = Array.from(fileList || []);
  if (!novos.length) return;
  for (const file of novos) {
    // evita duplicados exatos (mesmo nome + tamanho) no lote
    const jaLa = documentos.some(
      (d) => d.file.name === file.name && d.file.size === file.size
    );
    if (jaLa) continue;
    documentos.push({ file, nome: file.name, tipo: classificarFicheiro(file) });
  }
  renderizarLote();
  mostrarTela("lote");
}

// ---------------------------------------------------------------------
// Lote
// ---------------------------------------------------------------------
function formatarTamanho(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function renderizarLote() {
  tituloLote.textContent =
    documentos.length === 1 ? t("lote_titulo_1") : t("lote_titulo_n", { n: documentos.length });
  listaLote.innerHTML = "";
  documentos.forEach((doc, indice) => {
    const cartao = document.createElement("div");
    cartao.className = "cartao-lote";

    const ic = document.createElement("div");
    ic.className = "ic";
    ic.textContent = doc.tipo === "pdf" ? "📄" : doc.tipo === "convertido" ? "🖼️" : "📎";

    const info = document.createElement("div");
    info.className = "cartao-lote-info";
    const nome = document.createElement("span");
    nome.className = "nome";
    nome.textContent = doc.nome;
    const meta = document.createElement("span");
    const rotuloTipo =
      doc.tipo === "convertido" ? t("item_convertido") : doc.tipo === "pdf" ? t("item_pdf") : t("item_outro");
    meta.className = "meta" + (doc.tipo === "convertido" ? " convertido" : "");
    meta.textContent = `${formatarTamanho(doc.file.size)} · ${rotuloTipo}`;
    info.append(nome, meta);

    const btnRemover = document.createElement("button");
    btnRemover.className = "btn-remover-lote";
    btnRemover.setAttribute("aria-label", t("remover_aria", { nome: doc.nome }));
    btnRemover.textContent = "✕";
    btnRemover.addEventListener("click", () => {
      documentos.splice(indice, 1);
      if (documentos.length === 0) mostrarTela("inicio");
      else renderizarLote();
    });

    cartao.append(ic, info, btnRemover);
    listaLote.appendChild(cartao);
  });
}

document.getElementById("btn-adicionar-outro").addEventListener("click", () => inputFicheiros.click());

// ---------------------------------------------------------------------
// Confirmar envio -- nem a partilha nativa (navigator.share) nem o
// download resolvem sozinhos "foi mesmo enviado": o share() resolve só
// porque a app de email abriu com os ficheiros já anexados, não porque o
// cliente clicou em enviar lá dentro -- se ele fechar a mensagem sem
// enviar, esta app não tem forma de saber. Por isso nunca se assume
// sucesso: este ecrã pergunta sempre, e só limpa o lote se o cliente
// confirmar. "Ainda não" volta ao lote com os documentos intactos, para
// tentar outra vez. Pedido explícito do utilizador, 2026-09-11 (reportou
// o mesmo problema que já tinha acontecido na app do telemóvel).
// ---------------------------------------------------------------------
function aplicarTextoConfirmar() {
  const ehShare = modoConfirmarAtual === "share";
  confirmarPassos.classList.toggle("oculto", ehShare);
  confirmarTextoShare.classList.toggle("oculto", !ehShare);
  confirmarTitulo.textContent = ehShare ? t("confirmar_titulo_share") : t("manual_titulo");
  confirmarNota.textContent = ehShare ? t("nota_confirmar_share") : t("nota_manual");
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

// ---------------------------------------------------------------------
// Imagem -> PDF de 1 página (mesma abordagem da app do telemóvel:
// tamanho de página a partir dos pixels da imagem, a ~150dpi)
// ---------------------------------------------------------------------
function carregarImagem(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(blob);
  });
}

async function imagemParaPdf(file) {
  const { jsPDF } = window.jspdf;
  const img = await carregarImagem(file);
  const pxParaMm = (px) => (px / 150) * 25.4;
  const w = img.naturalWidth || 1240;
  const h = img.naturalHeight || 1754;
  const doc = new jsPDF({
    orientation: w > h ? "landscape" : "portrait",
    unit: "mm",
    format: [pxParaMm(w), pxParaMm(h)],
  });
  const formato = /png/i.test(file.type) ? "PNG" : "JPEG";
  doc.addImage(img, formato, 0, 0, pxParaMm(w), pxParaMm(h));
  return doc.output("blob");
}

function nomeSemColisao(nome, usados) {
  let candidato = nome;
  let n = 2;
  const ponto = nome.lastIndexOf(".");
  const base = ponto > 0 ? nome.slice(0, ponto) : nome;
  const ext = ponto > 0 ? nome.slice(ponto) : "";
  while (usados.has(candidato.toLowerCase())) {
    candidato = `${base}_${n}${ext}`;
    n++;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

async function prepararFicheiros() {
  const usados = new Set();
  return Promise.all(
    documentos.map(async (doc) => {
      if (doc.tipo === "convertido") {
        const blob = await imagemParaPdf(doc.file);
        const nome = nomeSemColisao(doc.nome.replace(/\.[^.]+$/, "") + ".pdf", usados);
        return new File([blob], nome, { type: "application/pdf" });
      }
      const nome = nomeSemColisao(doc.nome, usados);
      return new File([doc.file], nome, { type: doc.file.type || "application/octet-stream" });
    })
  );
}

// ---------------------------------------------------------------------
// Enviar
// ---------------------------------------------------------------------
let ficheirosPreparados = []; // guardado para o ecrã de envio manual

function nomeZipComData() {
  return `${t("nome_zip")}_${new Date().toISOString().slice(0, 10)}.zip`;
}

async function enviar() {
  if (documentos.length === 0) return;
  const textoOriginal = btnEnviar.textContent;
  btnEnviar.textContent = t("a_preparar");
  btnEnviar.disabled = true;

  try {
    ficheirosPreparados = await prepararFicheiros();
    if (chkZip.checked) {
      ficheirosPreparados = [await ficheirosParaZip(ficheirosPreparados, nomeZipComData())];
    }
  } catch (e) {
    console.error("Erro a preparar os ficheiros:", e);
    btnEnviar.textContent = textoOriginal;
    btnEnviar.disabled = false;
    alert(t("erro_pdf"));
    return;
  }

  btnEnviar.textContent = textoOriginal;
  btnEnviar.disabled = false;

  // 1) Partilha nativa de ficheiros, se o browser a suportar (Edge/Chrome
  //    no Windows suportam navigator.share com ficheiros). IMPORTANTE:
  //    share() resolver só quer dizer que a app de email abriu com os
  //    ficheiros anexados -- não que o cliente clicou mesmo em "Enviar"
  //    lá dentro. Por isso não se assume "enviado" aqui -- ver
  //    mostrarConfirmar().
  if (navigator.canShare && navigator.canShare({ files: ficheirosPreparados })) {
    try {
      await navigator.share({
        files: ficheirosPreparados,
        title: t("share_title"),
        text: t("share_text", { email: EMAIL_DESTINO }),
      });
      mostrarConfirmar("share");
      return;
    } catch (e) {
      if (e && e.name === "AbortError") return; // cancelou -- fica no lote, intacto
      console.error("Erro a partilhar:", e);
      // cai para o modo manual abaixo
    }
  }

  // 2) Sem partilha de ficheiros -- descarrega tudo e mostra os passos.
  for (const ficheiro of ficheirosPreparados) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(ficheiro);
    a.download = ficheiro.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  mostrarConfirmar("manual");
}

btnEnviar.addEventListener("click", enviar);

document.getElementById("btn-abrir-email").addEventListener("click", () => {
  const assunto = encodeURIComponent(t("email_assunto"));
  const corpo = encodeURIComponent(t("email_corpo"));
  window.location.href = `mailto:${EMAIL_DESTINO}?subject=${assunto}&body=${corpo}`;
});

// ---------------------------------------------------------------------
// Copiar endereço
// ---------------------------------------------------------------------
function ligarCopiar(idBotao) {
  const btn = document.getElementById(idBotao);
  btn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(EMAIL_DESTINO);
      btn.textContent = t("btn_copiado");
      setTimeout(() => (btn.textContent = t("btn_copiar")), 1500);
    } catch (e) {
      console.error("Não consegui copiar:", e);
    }
  });
}
ligarCopiar("btn-copiar-endereco");
ligarCopiar("btn-copiar-endereco-2");

// ---------------------------------------------------------------------
// Concluído
// ---------------------------------------------------------------------
document.getElementById("btn-novo").addEventListener("click", () => mostrarTela("inicio"));
document.getElementById("btn-terminar").addEventListener("click", () => mostrarTela("inicio"));

// ---------------------------------------------------------------------
// Seletor de língua
// ---------------------------------------------------------------------
document.querySelectorAll(".selector-idioma button").forEach((b) => {
  b.addEventListener("click", () => definirIdioma(b.dataset.idioma));
});
definirIdioma(idioma);

// ---------------------------------------------------------------------
// Service worker (arranque offline / instalável)
// ---------------------------------------------------------------------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((e) => {
      console.error("Falha ao registar service worker:", e);
    });
  });
}
