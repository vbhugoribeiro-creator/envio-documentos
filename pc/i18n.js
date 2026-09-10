"use strict";

// ---------------------------------------------------------------------
// Traduções da ContaClick PC -- Português (predefinição) e Inglês.
// Mesma mecânica da app do telemóvel (data-i18n* no HTML + t("chave") no
// app.js), mas tabela própria: esta versão é para computador, não tira
// fotos -- o cliente escolhe ficheiros que já tem no PC e envia tudo.
// A escolha de língua é partilhada com a app do telemóvel (mesma chave
// localStorage "contaclick_idioma").
// ---------------------------------------------------------------------

const TRADUCOES = {
  pt: {
    marca_sub: "Vanessa Branco — Contabilidade e Finanças",

    // --- Início ---
    inicio_titulo: "Enviar documentos para a contabilidade",
    inicio_texto:
      "Escolhe os ficheiros do teu computador — faturas, recibos, guias, extratos. Aceita PDF e imagens.",
    drop_linha1: "Arrasta ficheiros para aqui",
    drop_linha2: "ou clica para escolher no computador",
    drop_aria: "Escolher ficheiros",

    // --- Lote ---
    lote_titulo_1: "1 documento pronto",
    lote_titulo_n: "{n} documentos prontos",
    btn_adicionar_outro: "+ Adicionar mais ficheiros",
    enviar_para: "Enviar para:",
    btn_copiar: "Copiar",
    btn_copiado: "Copiado!",
    copiar_aria: "Copiar endereço",
    btn_enviar: "Enviar tudo »",
    nota_lote: "As imagens são convertidas para PDF; os PDF seguem tal como estão.",
    item_convertido: "imagem convertida para PDF",
    item_pdf: "PDF",
    item_outro: "enviado tal como está",
    remover_aria: "Remover {nome}",

    // --- Envio ---
    a_preparar: "A preparar...",
    erro_pdf: "Não consegui preparar um dos ficheiros. Tenta outra vez.",
    share_title: "Documentos para a contabilidade",
    share_text: "Documentos para a contabilidade (enviar para {email}).",

    // --- Envio manual (browser sem partilha de ficheiros) ---
    manual_titulo: "Ficheiros descarregados",
    manual_p1_html: "Os <strong>ficheiros</strong> foram guardados na pasta <strong>Transferências</strong>.",
    manual_p2_html: "Abre o teu email e cria uma <strong>mensagem nova</strong> para o endereço abaixo.",
    manual_p3_html: "Anexa os ficheiros descarregados e <strong>envia</strong>.",
    btn_abrir_email: "Abrir o email",
    btn_ja_enviei: "Já enviei — terminar",
    nota_manual:
      "O botão \"Abrir o email\" só preenche o destinatário e o assunto — os anexos tens de os arrastar tu (o browser não deixa anexar sozinho).",
    email_assunto: "Documentos para a contabilidade",
    email_corpo:
      "Boa tarde,\n\nSeguem em anexo os documentos para a contabilidade.\n(Anexa aqui os ficheiros que a ContaClick acabou de descarregar.)\n\nObrigado.",

    // --- Concluído ---
    concluido_titulo: "Enviado",
    concluido_texto:
      "Os documentos foram partilhados. Se ainda não escolheste a app de email, os ficheiros continuam prontos.",
    btn_novo: "Enviar mais documentos",
    btn_terminar: "Terminar",
  },

  en: {
    marca_sub: "Vanessa Branco — Accounting and Finance",

    // --- Start ---
    inicio_titulo: "Send documents to the accountant",
    inicio_texto:
      "Choose the files from your computer — invoices, receipts, tax forms, statements. PDF and images accepted.",
    drop_linha1: "Drag files here",
    drop_linha2: "or click to choose from your computer",
    drop_aria: "Choose files",

    // --- Batch ---
    lote_titulo_1: "1 document ready",
    lote_titulo_n: "{n} documents ready",
    btn_adicionar_outro: "+ Add more files",
    enviar_para: "Send to:",
    btn_copiar: "Copy",
    btn_copiado: "Copied!",
    copiar_aria: "Copy address",
    btn_enviar: "Send all »",
    nota_lote: "Images are converted to PDF; PDFs are sent as they are.",
    item_convertido: "image converted to PDF",
    item_pdf: "PDF",
    item_outro: "sent as it is",
    remover_aria: "Remove {nome}",

    // --- Sending ---
    a_preparar: "Preparing...",
    erro_pdf: "I couldn't prepare one of the files. Please try again.",
    share_title: "Documents for the accountant",
    share_text: "Documents for the accountant (send to {email}).",

    // --- Manual sending (browser without file sharing) ---
    manual_titulo: "Files downloaded",
    manual_p1_html: "The <strong>files</strong> were saved to your <strong>Downloads</strong> folder.",
    manual_p2_html: "Open your email and start a <strong>new message</strong> to the address below.",
    manual_p3_html: "Attach the downloaded files and <strong>send</strong>.",
    btn_abrir_email: "Open email",
    btn_ja_enviei: "I've sent it — finish",
    nota_manual:
      "The \"Open email\" button only fills in the recipient and subject — you have to drag the attachments in yourself (the browser won't attach them automatically).",
    email_assunto: "Documents for the accountant",
    email_corpo:
      "Hello,\n\nPlease find attached the documents for the accountant.\n(Attach here the files ContaClick just downloaded.)\n\nThank you.",

    // --- Done ---
    concluido_titulo: "Sent",
    concluido_texto:
      "The documents have been shared. If you haven't picked your email app yet, the files are still ready.",
    btn_novo: "Send more documents",
    btn_terminar: "Finish",
  },
};
