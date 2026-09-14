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

// Worker Cloudflare que envia o email pelo servidor (2026-09-14) -- ver
// Desktop\contaclick-worker. Tentado primeiro em enviar(); se falhar cai
// sempre para o fluxo antigo (Web Share / descarregar + mailto:), mesma
// lógica da app do telemóvel.
const WORKER_BASE_URL = "https://api.vanessabranco.pt";
const WORKER_URL = `${WORKER_BASE_URL}/enviar`;

// Medidor de tamanho do lote (2026-09-14, pedido explícito do utilizador)
// -- mesma lógica e mesmo limite da app do telemóvel (ver app.js). Aplica-
// se sempre aos ficheiros ORIGINAIS, quer a opção "Comprimir num .zip"
// esteja marcada ou não -- comprimir um PDF/imagem já comprimido não
// costuma poupar espaço a sério, por isso o medidor não finge que sim.
const LIMITE_ENVIO_BYTES = 25 * 1024 * 1024;
const LIMIAR_AVISO_BYTES = 15 * 1024 * 1024;

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

// ---------------------------------------------------------------------
// Token pessoal do cliente (2026-09-14) -- mesma chave localStorage da
// app do telemóvel, mesma lógica (ver app.js: lerTokenCliente).
// ---------------------------------------------------------------------
let tokenCliente = null;
(function lerTokenCliente() {
  try {
    const parametros = new URLSearchParams(window.location.search);
    const tokenDoLink = parametros.get("c");
    if (tokenDoLink) {
      localStorage.setItem("contaclick_token", tokenDoLink);
      const urlLimpo = window.location.pathname + window.location.hash;
      window.history.replaceState(null, "", urlLimpo);
    }
    tokenCliente = localStorage.getItem("contaclick_token");
  } catch (e) {
    /* localStorage pode estar bloqueado -- sem problema, fica sem token
       nesta sessão. */
  }
})();

// ---------------------------------------------------------------------
// Aviso "já enviado antes" (2026-09-14, pedido explícito do utilizador)
// -- só possível com um link pessoal (sem token não há histórico a
// comparar). Carregado uma vez ao abrir a app (não bloqueia nada, corre
// em paralelo); se um ficheiro adicionado ao lote bater nome+tamanho com
// algo já enviado antes por este link, fica marcado com um aviso -- não
// impede de enviar (pode ser mesmo intencional), só avisa. Duplicado
// DENTRO do mesmo lote já era tratado à parte, ver adicionarFicheiros().
let historicoConhecido = null; // Map "nome|tamanho" -> data do envio anterior

async function carregarHistoricoConhecido() {
  if (!tokenCliente) return;
  try {
    const resposta = await fetch(`${WORKER_BASE_URL}/historico?token=${encodeURIComponent(tokenCliente)}`);
    const dados = await resposta.json();
    const mapa = new Map();
    for (const envio of dados.envios || []) {
      for (const nome of envio.ficheiros) {
        // Só se sabe o tamanho TOTAL do envio, não por ficheiro -- ainda
        // assim o nome sozinho já é um bom sinal de "provavelmente o
        // mesmo ficheiro", e evita reprocessar o zip para decompor.
        if (!mapa.has(nome)) mapa.set(nome, envio.enviado_em);
      }
    }
    historicoConhecido = mapa;
    // Repescagem: se o cliente já tiver adicionado ficheiros ao lote
    // ANTES desta resposta chegar (condição de corrida real, reportada
    // 2026-09-14 -- arrastar um ficheiro logo ao abrir a app, antes do
    // pedido ao servidor terminar), volta a verificar agora contra o
    // histórico que acabou de chegar, e atualiza o ecrã se necessário.
    let mudou = false;
    for (const doc of documentos) {
      if (!doc.dataEnvioAnterior && historicoConhecido.has(doc.nome)) {
        doc.dataEnvioAnterior = historicoConhecido.get(doc.nome);
        mudou = true;
      }
    }
    if (mudou && telas.lote.classList.contains("ativa")) renderizarLote();
  } catch (e) {
    console.error("Falha a carregar histórico conhecido (aviso de duplicado fica desativado):", e);
  }
}
carregarHistoricoConhecido();

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
  historico: document.getElementById("tela-historico"),
};

const dropZona = document.getElementById("drop-zona");
const inputFicheiros = document.getElementById("input-ficheiros");
const listaLote = document.getElementById("lista-lote");
const tituloLote = document.getElementById("titulo-lote");
const btnEnviar = document.getElementById("btn-enviar");
const chkZip = document.getElementById("chk-zip");
chkZip.addEventListener("change", () => atualizarMedidorTamanho());
const medidorPreenchimento = document.getElementById("medidor-preenchimento");
const medidorTexto = document.getElementById("medidor-texto");
const avisoTamanhoLote = document.getElementById("aviso-tamanho-lote");
const confirmarPassos = document.getElementById("confirmar-passos");
const confirmarTextoShare = document.getElementById("confirmar-texto-share");
const confirmarTitulo = document.getElementById("confirmar-titulo");
const confirmarNota = document.getElementById("confirmar-nota");
const avisoFallbackAutomatico = document.getElementById("aviso-fallback-automatico");

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
// Escolher / arrastar ficheiros -- a mesma zona de arrastar fica
// disponível tanto no ecrã inicial como no ecrã do lote (versão
// compacta), para se poder continuar a arrastar mais ficheiros sem
// precisar de abrir o explorador de ficheiros a cada vez. Pedido
// explícito do utilizador, 2026-09-11: "depois de colocar 1 pdf, a
// janela para arrastar deveria lá continuar, se não tem que abrir uma
// janela do explorer e isso não é prático".
// ---------------------------------------------------------------------
function tornarZonaDeDrop(zona) {
  zona.addEventListener("click", () => inputFicheiros.click());
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      inputFicheiros.click();
    }
  });
  ["dragenter", "dragover"].forEach((ev) =>
    zona.addEventListener(ev, (e) => {
      e.preventDefault();
      zona.classList.add("arrastando");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    zona.addEventListener(ev, (e) => {
      e.preventDefault();
      if (ev === "dragleave" && zona.contains(e.relatedTarget)) return;
      zona.classList.remove("arrastando");
    })
  );
  zona.addEventListener("drop", (e) => {
    if (e.dataTransfer && e.dataTransfer.files) adicionarFicheiros(e.dataTransfer.files);
  });
}
tornarZonaDeDrop(dropZona);
tornarZonaDeDrop(document.getElementById("drop-zona-lote"));

inputFicheiros.addEventListener("change", () => {
  adicionarFicheiros(inputFicheiros.files);
  inputFicheiros.value = ""; // permite re-escolher o mesmo ficheiro
});

// A página toda também aceita drop (mais tolerante do que só as zonas,
// em qualquer ecrã) -- evita o browser abrir o ficheiro se o cliente
// falhar a mira da zona.
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
    const dataAnterior = historicoConhecido ? historicoConhecido.get(file.name) : null;
    documentos.push({ file, nome: file.name, tipo: classificarFicheiro(file), dataEnvioAnterior: dataAnterior || null });
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
    if (doc.dataEnvioAnterior) {
      const aviso = document.createElement("span");
      aviso.className = "meta aviso-duplicado";
      const data = new Date(doc.dataEnvioAnterior).toLocaleDateString(idioma === "en" ? "en-GB" : "pt-PT");
      aviso.textContent = t("aviso_ja_enviado", { data });
      info.append(aviso);
    }

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
  atualizarMedidorTamanho();
}

function aplicarMedidorTamanho(total, aCalcular) {
  const excedido = total > LIMITE_ENVIO_BYTES;
  const percentagem = Math.min(100, (total / LIMITE_ENVIO_BYTES) * 100);
  medidorPreenchimento.style.width = `${percentagem}%`;
  medidorPreenchimento.classList.toggle("aviso", total > LIMIAR_AVISO_BYTES && !excedido);
  medidorPreenchimento.classList.toggle("excedido", excedido);
  medidorTexto.textContent = aCalcular ? t("a_calcular") : `${formatarTamanho(total)} / 25 MB`;
  avisoTamanhoLote.classList.toggle("oculto", !excedido);
  btnEnviar.disabled = excedido;
  return excedido;
}

// Chamada em cada mudança do lote (adicionar/remover ficheiro) e sempre
// que a caixa "Comprimir num .zip" muda -- pedido explícito do
// utilizador, 2026-09-14: sem isto a barra continuava a mostrar a soma
// dos ficheiros originais mesmo depois de marcar "Comprimir", o que não
// refletia o tamanho real que ia ser enviado. Sem compressão marcada, o
// cálculo é instantâneo (só soma bytes); com compressão marcada, gera
// mesmo o .zip para saber o tamanho real (mais lento, por isso mostra
// "A calcular..." enquanto isso). `pedidoAtual` evita que um cálculo
// lento e antigo sobreponha um resultado mais recente se o lote mudar
// outra vez a meio.
let pedidoMedidorAtual = 0;

async function atualizarMedidorTamanho() {
  const totalOriginal = documentos.reduce((soma, doc) => soma + (doc.file ? doc.file.size : 0), 0);

  if (!chkZip.checked || documentos.length === 0) {
    pedidoMedidorAtual++;
    return aplicarMedidorTamanho(totalOriginal, false);
  }

  const esteId = ++pedidoMedidorAtual;
  aplicarMedidorTamanho(totalOriginal, true);
  try {
    const ficheirosPreparados = await prepararFicheiros();
    const zip = await ficheirosParaZip(ficheirosPreparados, nomeZipComData());
    if (esteId !== pedidoMedidorAtual) return; // o lote já mudou outra vez entretanto
    return aplicarMedidorTamanho(zip.size, false);
  } catch (e) {
    console.error("Falha a calcular o tamanho comprimido, a mostrar o tamanho original:", e);
    if (esteId !== pedidoMedidorAtual) return;
    return aplicarMedidorTamanho(totalOriginal, false);
  }
}

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
let ultimoFallbackAutomatico = false;

function aplicarTextoConfirmar() {
  const ehShare = modoConfirmarAtual === "share";
  confirmarPassos.classList.toggle("oculto", ehShare);
  confirmarTextoShare.classList.toggle("oculto", !ehShare);
  confirmarTitulo.textContent = ehShare ? t("confirmar_titulo_share") : t("manual_titulo");
  confirmarNota.textContent = ehShare ? t("nota_confirmar_share") : t("nota_manual");
  // "Abrir o email" só faz sentido depois de ter descarregado ficheiros
  // (modo manual) -- em modo partilha nada foi descarregado, e abrir um
  // mailto: sem anexo nenhum só confundia (mesma lição já aprendida na
  // app do telemóvel: "mailto: nunca anexava o ficheiro").
  document.getElementById("bloco-abrir-email").classList.toggle("oculto", ehShare);
  // Só aparece quando se tentou o envio automático pelo servidor primeiro
  // e falhou -- ver tentarEnvioAutomatico().
  avisoFallbackAutomatico.classList.toggle("oculto", !ultimoFallbackAutomatico);
}

function mostrarConfirmar(modo, falhouAutomatico = false) {
  modoConfirmarAtual = modo;
  ultimoFallbackAutomatico = falhouAutomatico;
  aplicarTextoConfirmar();
  mostrarTela("confirmar");
}

// Tenta enviar pelo servidor (Worker + Resend) antes de cair para
// Web Share / download manual -- ver mesma função na app do telemóvel
// (app.js), lógica idêntica. Nunca lança exceção para fora.
async function tentarEnvioAutomatico(ficheiros) {
  try {
    const formData = new FormData();
    for (const ficheiro of ficheiros) {
      formData.append("files", ficheiro, ficheiro.name);
    }
    if (tokenCliente) formData.append("token", tokenCliente);
    const resposta = await fetch(WORKER_URL, { method: "POST", body: formData });
    return resposta.ok;
  } catch (e) {
    console.error("Envio automático falhou, a cair para o modo manual:", e);
    return false;
  }
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
  if (await atualizarMedidorTamanho()) return; // lote grande demais -- botão já ficou desativado, defesa extra

  // Pedido explícito do utilizador, 2026-09-14: o aviso "já enviado
  // antes" (ver adicionarFicheiros/carregarHistoricoConhecido) não
  // bloqueia sozinho -- mas ao carregar em enviar com algum ficheiro
  // marcado, pede uma confirmação extra em vez de deixar passar em
  // silêncio.
  const marcados = documentos.filter((d) => d.dataEnvioAnterior).length;
  if (marcados > 0) {
    const chave = marcados === 1 ? "confirmar_envio_repetido_1" : "confirmar_envio_repetido_n";
    if (!confirm(t(chave, { n: marcados }))) return;
  }

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

  btnEnviar.textContent = t("a_enviar");
  const enviouAutomaticamente = await tentarEnvioAutomatico(ficheirosPreparados);
  btnEnviar.textContent = textoOriginal;
  btnEnviar.disabled = false;

  if (enviouAutomaticamente) {
    documentos = [];
    mostrarTela("concluido");
    // Atualiza o histórico conhecido em fundo -- sem isto, reenviar o
    // mesmo ficheiro ainda na mesma sessão (sem recarregar a página)
    // nunca acionava o aviso, porque a lista só era lida uma vez ao
    // abrir a app (2026-09-14, reportado em teste real).
    carregarHistoricoConhecido();
    return;
  }

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
      mostrarConfirmar("share", true);
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
  mostrarConfirmar("manual", true);
}

btnEnviar.addEventListener("click", enviar);

document.getElementById("btn-cancelar-lote").addEventListener("click", () => {
  if (documentos.length === 0) return;
  if (!confirm(t("confirmar_cancelar_lote"))) return;
  documentos = [];
  mostrarTela("inicio");
});

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

// ---------------------------------------------------------------------
// "Instalar no ambiente de trabalho" -- pedido explícito do utilizador,
// 2026-09-14, mesma razão da app do telemóvel: muita gente não conhece o
// ícone de instalar escondido na barra de endereço do browser, por isso
// fica também um botão visível dentro da própria página.
//
// Chrome/Edge (Windows): disparam "beforeinstallprompt" quando a app
// cumpre os requisitos -- guarda o evento e usa-o quando o botão for
// clicado, tal como na app do telemóvel. Outros browsers (Firefox, Safari
// no Mac) nunca disparam este evento -- por isso a nota com os passos
// manuais fica visível por padrão, e só é escondida (a favor do botão) se
// o evento chegar mesmo a disparar.
// ---------------------------------------------------------------------
const btnInstalar = document.getElementById("btn-instalar");
const notaInstalarManual = document.getElementById("nota-instalar-manual");
let promptInstalacaoDiferido = null;

function aCorrerInstalada() {
  return window.matchMedia("(display-mode: standalone)").matches;
}

if (aCorrerInstalada()) {
  notaInstalarManual.classList.add("oculto");
} else {
  window.addEventListener("beforeinstallprompt", (evento) => {
    evento.preventDefault();
    promptInstalacaoDiferido = evento;
    btnInstalar.classList.remove("oculto");
    notaInstalarManual.classList.add("oculto");
  });
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
  notaInstalarManual.classList.add("oculto");
});

// ---------------------------------------------------------------------
// Histórico de envios (2026-09-14) -- mesma lógica da app do telemóvel
// (ver app.js), só visível com um link pessoal.
// ---------------------------------------------------------------------
const btnVerHistorico = document.getElementById("btn-ver-historico");
const listaHistorico = document.getElementById("lista-historico");
const historicoVazio = document.getElementById("historico-vazio");
const btnHistoricoVoltar = document.getElementById("btn-historico-voltar");

if (tokenCliente) {
  btnVerHistorico.classList.remove("oculto");
}

btnVerHistorico.addEventListener("click", async () => {
  mostrarTela("historico");
  listaHistorico.innerHTML = "";
  historicoVazio.classList.add("oculto");
  try {
    const resposta = await fetch(`${WORKER_BASE_URL}/historico?token=${encodeURIComponent(tokenCliente)}`);
    const dados = await resposta.json();
    const envios = dados.envios || [];
    if (envios.length === 0) {
      historicoVazio.classList.remove("oculto");
      return;
    }
    envios.forEach((envio) => {
      const item = document.createElement("div");
      item.className = "item-historico";
      const nomes = document.createElement("div");
      nomes.className = "nomes";
      nomes.textContent = envio.ficheiros.join(", ");
      const meta = document.createElement("div");
      meta.className = "meta";
      const data = new Date(envio.enviado_em).toLocaleString(idioma === "en" ? "en-GB" : "pt-PT");
      meta.textContent = t("historico_item_meta", {
        tamanho: formatarTamanho(envio.tamanho_bytes),
        data,
      });
      item.append(nomes, meta);
      listaHistorico.appendChild(item);
    });
  } catch (e) {
    console.error("Falha a carregar o histórico:", e);
    historicoVazio.classList.remove("oculto");
  }
});

btnHistoricoVoltar.addEventListener("click", () => mostrarTela("inicio"));
