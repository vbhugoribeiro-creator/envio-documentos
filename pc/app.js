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
// 2026-09-15: já NÃO tira o "?c=" da barra de endereço -- ver o
// comentário completo no app.js da versão telemóvel (bug real
// confirmado, Barbara Bento: ícone fixado no ecrã principal ficava sem
// token para sempre, porque a barra de endereço já tinha sido limpa
// antes de o cliente tocar em "Fixar app").
// ---------------------------------------------------------------------
let tokenCliente = null;
(function lerTokenCliente() {
  try {
    const parametros = new URLSearchParams(window.location.search);
    const tokenDoLink = parametros.get("c");
    if (tokenDoLink) {
      // Usa já o token do link diretamente em memória -- ver o comentário
      // completo no app.js da versão telemóvel (bug real confirmado
      // 2026-09-25: o token chegava certo no URL, mas era "esquecido" se
      // o localStorage estivesse bloqueado/restrito, porque o código só
      // o usava depois de o reler de lá).
      tokenCliente = tokenDoLink;
      try {
        localStorage.setItem("contaclick_token", tokenDoLink);
      } catch (e) {
        /* localStorage bloqueado -- sem problema, tokenCliente já está
           definido a partir do URL. */
      }
    } else {
      tokenCliente = localStorage.getItem("contaclick_token");
    }
  } catch (e) {
    /* localStorage pode estar bloqueado -- sem token de uma visita
       anterior nesta sessão. */
  }
})();

// ---------------------------------------------------------------------
// Manifest dinâmico com o token embutido no start_url (2026-10-15) --
// mesmo motivo e mesma lógica da app do telemóvel (ver app.js, nota
// grande sobre o "Adicionar ao Ecrã Principal" usar o start_url do
// manifest, não o URL da barra de endereço). Campos iguais aos de
// pc/manifest.json, mantidos à mão.
function atualizarManifestComToken() {
  if (!tokenCliente) return;
  try {
    const manifesto = {
      name: "ContaClick PC — Vanessa Branco",
      short_name: "ContaClick PC",
      description:
        "Envia documentos contabilísticos do computador para a contabilidade. / Send accounting documents from your computer to the accountant.",
      start_url: `./index.html?c=${encodeURIComponent(tokenCliente)}`,
      scope: "./",
      display: "standalone",
      background_color: "#0f2636",
      theme_color: "#0f2636",
      icons: [
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
        { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    };
    const blob = new Blob([JSON.stringify(manifesto)], { type: "application/manifest+json" });
    const linkManifest = document.querySelector('link[rel="manifest"]');
    if (linkManifest) linkManifest.setAttribute("href", URL.createObjectURL(blob));
  } catch (e) {
    console.error("Falha a gerar o manifest com token (fica o estático, sem token no ícone):", e);
  }
}
atualizarManifestComToken();

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

// ---------------------------------------------------------------------
// Link PARTILHADO entre 2 empresas (2026-10-15) -- mesma lógica da app
// do telemóvel (ver app.js, nota completa lá).
// ---------------------------------------------------------------------
let parCliente = null;
let empresaEscolhida = null;
const blocoParCliente = document.getElementById("bloco-par-cliente");
const botoesParCliente = document.getElementById("botoes-par-cliente");

async function carregarParCliente() {
  if (!tokenCliente) return;
  try {
    const resposta = await fetch(`${WORKER_BASE_URL}/info-token?token=${encodeURIComponent(tokenCliente)}`);
    const dados = await resposta.json();
    parCliente = dados.par || null;
    // Pré-seleciona a empresa a que o link usado já pertencia -- ver
    // nota completa na app do telemóvel (app.js).
    if (parCliente && dados.sugestao) empresaEscolhida = dados.sugestao;
    renderizarBotoesParCliente();
    if (telas.lote.classList.contains("ativa")) blocoParCliente.classList.toggle("oculto", !parCliente);
  } catch (e) {
    console.error("Falha a carregar info do token (fica sem o passo de escolha de empresa):", e);
  }
}
carregarParCliente();

function renderizarBotoesParCliente() {
  botoesParCliente.innerHTML = "";
  if (!parCliente) return;
  parCliente.forEach((opcao) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-opcao-par";
    btn.textContent = opcao.rotulo;
    btn.classList.toggle("selecionado", empresaEscolhida === opcao.valor);
    btn.addEventListener("click", () => {
      empresaEscolhida = opcao.valor;
      renderizarBotoesParCliente();
    });
    botoesParCliente.appendChild(btn);
  });
}

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
  blocoParCliente.classList.toggle("oculto", !parCliente);
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

// Impressão digital do aparelho -- mesma função e mesmo motivo que na app
// do telemóvel (app.js): sinal adicional, independente de localStorage,
// para cruzar manualmente quando o token falha. Nunca decide nada
// sozinha, ver nota grande na outra app.
function calcularImpressaoDigitalAparelho() {
  try {
    const partes = [];
    partes.push(navigator.userAgent || "");
    partes.push(`${screen.width}x${screen.height}x${screen.colorDepth || ""}`);
    partes.push(Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    partes.push(navigator.language || "");
    partes.push(String(navigator.hardwareConcurrency || ""));
    partes.push(String(navigator.deviceMemory || ""));
    partes.push(String(window.devicePixelRatio || ""));
    try {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillText("ContaClick-fp", 2, 2);
      partes.push(canvas.toDataURL());
    } catch (e) {
      /* sem canvas disponível -- sem problema, fica só sem esta parte */
    }
    const texto = partes.join("|");
    let hash = 0;
    for (let i = 0; i < texto.length; i++) {
      hash = (hash * 31 + texto.charCodeAt(i)) | 0;
    }
    return String(hash);
  } catch (e) {
    return "";
  }
}

// Tenta enviar pelo servidor (Worker + Resend) antes de cair para
// Web Share / download manual -- ver mesma função na app do telemóvel
// (app.js), lógica idêntica. Nunca lança exceção para fora.
async function tentarEnvioAutomatico(ficheiros, miniaturas) {
  try {
    const formData = new FormData();
    for (const ficheiro of ficheiros) {
      formData.append("files", ficheiro, ficheiro.name);
    }
    if (tokenCliente) formData.append("token", tokenCliente);
    if (parCliente && empresaEscolhida) formData.append("empresa_escolhida", empresaEscolhida);
    formData.append("fp", calcularImpressaoDigitalAparelho());
    if (miniaturas && Object.keys(miniaturas).length > 0) {
      formData.append("miniaturas", JSON.stringify(miniaturas));
    }
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

// ---------------------------------------------------------------------
// Miniaturas por documento (2026-10-15) -- mesma lógica e mesmo motivo
// da app do telemóvel (ver app.js): uma prévia JPEG pequena mas com
// resolução suficiente para ampliar e ler, mostrada em "Ver os meus
// envios". Só gerada quando o lote NÃO vai comprimido num .zip -- com
// zip marcado, o Worker só vê 1 ficheiro final (o próprio .zip),
// perde-se a correspondência 1-para-1 com os documentos originais (o
// histórico já perde essa granularidade hoje, com ou sem miniaturas).
// ---------------------------------------------------------------------
const TAMANHO_MINIATURA_MAX = 900;
const QUALIDADE_MINIATURA = 0.72;

function redimensionarParaMiniatura(imagemOuCanvas, larguraNatural, alturaNatural) {
  const escala = Math.min(1, TAMANHO_MINIATURA_MAX / Math.max(larguraNatural, alturaNatural));
  const w = Math.max(1, Math.round(larguraNatural * escala));
  const h = Math.max(1, Math.round(alturaNatural * escala));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(imagemOuCanvas, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", QUALIDADE_MINIATURA);
}

async function gerarMiniaturaDeImagem(blob) {
  const img = await carregarImagem(blob);
  return redimensionarParaMiniatura(img, img.naturalWidth, img.naturalHeight);
}

// pdf.js só é preciso para PDFs já prontos (a maioria dos ficheiros
// nesta versão PC) -- carregado uma vez, em diferido, mesma versão
// fixa da app do telemóvel.
const PDFJS_VERSAO = "3.11.174";
const PDFJS_BASE_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSAO}`;
let promessaPdfJs = null;

function carregarPdfJs() {
  if (promessaPdfJs) return promessaPdfJs;
  promessaPdfJs = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${PDFJS_BASE_URL}/pdf.min.js`;
    script.onload = () => {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE_URL}/pdf.worker.min.js`;
      resolve(window.pdfjsLib);
    };
    script.onerror = () => reject(new Error("Falha a carregar pdf.js"));
    document.head.appendChild(script);
  });
  return promessaPdfJs;
}

async function gerarMiniaturaDePdf(file) {
  const pdfjsLib = await carregarPdfJs();
  const dados = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: dados }).promise;
  const pagina = await pdf.getPage(1);
  const viewportBase = pagina.getViewport({ scale: 1 });
  const escala = Math.min(2, TAMANHO_MINIATURA_MAX / Math.max(viewportBase.width, viewportBase.height));
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas.toDataURL("image/jpeg", QUALIDADE_MINIATURA);
}

// doc = item de "documentos" (ANTES de prepararFicheiros() converter
// imagem->PDF) -- "convertido" ainda é uma imagem normal nesta altura,
// "pdf" já é um PDF. "outro" (ex: HEIC não suportado pelo <canvas>)
// fica sem miniatura -- nunca bloqueia o envio, ver gerarMiniatura().
async function gerarMiniatura(doc) {
  try {
    if (doc.tipo === "pdf") return await gerarMiniaturaDePdf(doc.file);
    if (doc.tipo === "convertido") return await gerarMiniaturaDeImagem(doc.file);
    return null;
  } catch (e) {
    console.error("Falha a gerar miniatura (documento segue sem prévia):", e);
    return null;
  }
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
  // Pré-carrega com os nomes já enviados antes por este link (2026-09-15)
  // -- nomeSemColisao() já evitava colisão DENTRO do mesmo lote, mas não
  // sabia nada de lotes anteriores. Aqui o risco é menor que no
  // telemóvel (os ficheiros mantêm o nome original escolhido pelo
  // cliente, não um nome genérico gerado por nós) mas mesmo assim
  // acontece -- ex: o mesmo digitalizador a dar sempre "scan.pdf". Mesmo
  // histórico já usado no aviso de "já enviado antes".
  const usados = new Set(historicoConhecido ? [...historicoConhecido.keys()].map((n) => n.toLowerCase()) : []);
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
  if (parCliente && !empresaEscolhida) {
    alert(t("par_cliente_obrigatorio"));
    return;
  }

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

  let miniaturas = {};
  try {
    ficheirosPreparados = await prepararFicheiros();
    // Miniaturas geradas AQUI, antes de zipar -- "documentos" e
    // "ficheirosPreparados" estão na mesma ordem (prepararFicheiros() usa
    // Promise.all sobre documentos.map, preserva o índice), por isso o
    // nome final (já resolvido, com sufixo de colisão se preciso) está
    // sempre certo. Com ".zip" marcado, ficheirosPreparados vai já a
    // seguir reduzir-se a 1 único ficheiro -- sem correspondência
    // 1-para-1 nenhuma, por isso não vale a pena gerar nada (mesma
    // limitação que o histórico já tinha antes desta funcionalidade).
    if (!chkZip.checked) {
      await Promise.all(
        documentos.map(async (doc, indice) => {
          const miniatura = await gerarMiniatura(doc);
          if (miniatura) miniaturas[ficheirosPreparados[indice].name] = miniatura;
        })
      );
    }
    if (chkZip.checked) {
      ficheirosPreparados = [await ficheirosParaZip(ficheirosPreparados, nomeZipComData())];
      miniaturas = {};
    }
  } catch (e) {
    console.error("Erro a preparar os ficheiros:", e);
    btnEnviar.textContent = textoOriginal;
    btnEnviar.disabled = false;
    alert(t("erro_pdf"));
    return;
  }

  btnEnviar.textContent = t("a_enviar");
  const enviouAutomaticamente = await tentarEnvioAutomatico(ficheirosPreparados, miniaturas);
  btnEnviar.textContent = textoOriginal;
  btnEnviar.disabled = false;

  if (enviouAutomaticamente) {
    documentos = [];
    empresaEscolhida = null; // próximo lote volta a pedir a escolha
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

      // Apagar da lista -- mesma lógica da app do telemóvel (ver app.js).
      const cabecalho = document.createElement("div");
      cabecalho.className = "cabecalho-item-historico";
      const btnApagar = document.createElement("button");
      btnApagar.className = "btn-apagar-historico";
      btnApagar.setAttribute("aria-label", t("historico_apagar"));
      btnApagar.textContent = "🗑";
      btnApagar.addEventListener("click", async () => {
        if (!confirm(t("historico_confirmar_apagar"))) return;
        btnApagar.disabled = true;
        try {
          const resposta = await fetch(`${WORKER_BASE_URL}/apagar-envio`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: tokenCliente, id: envio.id }),
          });
          if (resposta.ok) {
            item.remove();
            if (!listaHistorico.children.length) historicoVazio.classList.remove("oculto");
          } else {
            btnApagar.disabled = false;
          }
        } catch (e) {
          console.error("Falha a apagar envio do histórico:", e);
          btnApagar.disabled = false;
        }
      });
      cabecalho.appendChild(btnApagar);
      item.appendChild(cabecalho);

      const lista = document.createElement("div");
      lista.className = "lista-ficheiros";
      envio.ficheiros.forEach((nome) => {
        const linha = document.createElement("div");
        linha.className = "ficheiro-historico";
        const miniatura = envio.miniaturas && envio.miniaturas[nome];
        if (miniatura) {
          const btn = document.createElement("button");
          btn.className = "miniatura-wrap";
          btn.setAttribute("aria-label", t("historico_toque_ampliar"));
          const img = document.createElement("img");
          img.src = miniatura;
          img.alt = "";
          btn.appendChild(img);
          btn.addEventListener("click", () => abrirVisualizadorMiniatura(miniatura));
          linha.appendChild(btn);
        } else {
          const semImagem = document.createElement("div");
          semImagem.className = "miniatura-wrap sem-imagem";
          semImagem.textContent = "📎";
          linha.appendChild(semImagem);
        }
        const nomeEl = document.createElement("span");
        nomeEl.className = "nome-ficheiro";
        nomeEl.textContent = nome;
        linha.appendChild(nomeEl);
        lista.appendChild(linha);
      });

      const meta = document.createElement("div");
      meta.className = "meta";
      const data = new Date(envio.enviado_em).toLocaleString(idioma === "en" ? "en-GB" : "pt-PT");
      meta.textContent = t("historico_item_meta", {
        tamanho: formatarTamanho(envio.tamanho_bytes),
        data,
      });
      item.append(lista, meta);
      listaHistorico.appendChild(item);
    });
  } catch (e) {
    console.error("Falha a carregar o histórico:", e);
    historicoVazio.classList.remove("oculto");
  }
});

btnHistoricoVoltar.addEventListener("click", () => mostrarTela("inicio"));

// ---------------------------------------------------------------------
// Visualizador de miniatura (zoom) -- mesma ideia da app do telemóvel.
// ---------------------------------------------------------------------
const visualizadorMiniatura = document.getElementById("visualizador-miniatura");
const imagemVisualizador = document.getElementById("imagem-visualizador");

function abrirVisualizadorMiniatura(src) {
  imagemVisualizador.src = src;
  visualizadorMiniatura.classList.remove("oculto");
}
function fecharVisualizadorMiniatura() {
  visualizadorMiniatura.classList.add("oculto");
  imagemVisualizador.src = "";
}
document.getElementById("btn-fechar-visualizador").addEventListener("click", fecharVisualizadorMiniatura);
visualizadorMiniatura.addEventListener("click", (e) => {
  if (e.target === visualizadorMiniatura) fecharVisualizadorMiniatura();
});
