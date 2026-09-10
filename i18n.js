"use strict";

// ---------------------------------------------------------------------
// Traduções da ContaClick -- Português (predefinição) e Inglês.
// Carregado ANTES do app.js (ver ordem dos <script> no index.html).
//
// Como funciona:
//   - No HTML, cada texto fixo tem um atributo data-i18n / data-i18n-html
//     / data-i18n-alt / data-i18n-aria com a chave. app.js percorre-os em
//     aplicarTraducoesEstaticas().
//   - Os textos que mudam em runtime (título do lote, dicas da câmara,
//     resultado do QR...) chamam t("chave") diretamente no app.js.
//   - Chaves com {algo} são substituídas por t("chave", { algo: valor }).
//
// Acrescentar uma língua nova = mais uma entrada aqui + mais um botão no
// .selector-idioma do index.html. Nada no app.js precisa de mudar.
// ---------------------------------------------------------------------

const TRADUCOES = {
  pt: {
    marca_sub: "Vanessa Branco — Contabilidade e Finanças",

    // --- Início ---
    inicio_titulo: "ContaClick",
    inicio_texto: "O documento tem código QR (fatura, recibo...) ou não (guia da AT, outro papel qualquer)?",
    inicio_titulo_mais: "Adicionar mais um documento",
    inicio_texto_mais: "Já tens {docs} no envio. Este novo tem código QR ou não?",
    doc_singular: "1 documento",
    doc_plural: "{n} documentos",
    btn_com_qr_html: "Com código QR<small>2 fotos: QR + documento</small>",
    btn_sem_qr_html: "Sem código QR<small>1 foto só do documento</small>",
    btn_instalar: "📌 Fixar app no ecrã principal",
    nota_instalar_ios_html:
      "Para fixares no ecrã principal: toca em <strong>Partilhar</strong> (⬆) e depois em <strong>\"Adicionar ao Ecrã Principal\"</strong>.",

    // --- Câmara ---
    passo_1: "Passo 1 de 2 — Código QR",
    passo_2: "Passo 2 de 2 — Documento completo",
    passo_doc: "Documento",
    dica_qr: "Aproxima bem o telemóvel até o código QR ficar dentro do quadrado.",
    dica_doc: "Afasta-te o suficiente para apanhar o documento completo.",
    cam_abrir: "A abrir câmara...",
    cam_procurar_qr: "A procurar código QR...",
    cam_qr_encontrado: "Código QR encontrado",
    captura_aria: "Tirar foto",

    // --- Revisão ---
    foto_qr_alt: "Código QR fotografado",
    foto_doc_alt: "Documento completo fotografado",
    rotulo_doc_completo: "Documento completo",
    btn_repetir_foto: "↺ Repetir esta foto",
    btn_adicionar_lote: "✓ Adicionar ao envio",
    qr_lido_html: "✓ Código QR lido<small>Ficou bem identificado.</small>",
    qr_nao_lido_html: "⚠ QR não lido<small>Repete a 1ª foto mais perto, ou envia à mesma.</small>",

    // --- Lote ---
    lote_titulo_1: "1 documento pronto",
    lote_titulo_n: "{n} documentos prontos",
    btn_adicionar_outro: "+ Adicionar outro documento",
    enviar_para: "Enviar para:",
    btn_copiar: "Copiar",
    btn_copiado: "Copiado!",
    copiar_aria: "Copiar endereço",
    btn_partilhar: "Enviar tudo »",
    nota_envio_html:
      "Toca em \"Enviar tudo\" e escolhe o <strong>Gmail</strong> (ou Mail) na lista que aparece — não o WhatsApp, para o(s) documento(s) chegar(em) ao escritório. Confirma o destinatário acima antes de enviares (o telemóvel não o preenche sozinho).",
    doc_item: "Documento {n}",
    badge_sem_qr: "Sem código QR",
    badge_qr_ok: "✓ QR lido",
    badge_qr_duvida: "⚠ QR não lido",
    remover_aria: "Remover documento {n}",

    // --- Envio ---
    preparar: "A preparar...",
    erro_pdf: "Não consegui juntar as fotos em PDF. Tenta outra vez.",
    share_title: "Documentos",
    share_text: "Documentos para a contabilidade (enviar para {email}).",
    nome_ficheiro: "documento",

    // --- Concluído ---
    concluido_titulo: "Documentos preparados",
    concluido_texto:
      "Se já escolheste o Gmail/Mail e confirmaste o destinatário, está enviado. Se ainda não enviaste, os PDFs continuam prontos para partilhar.",
    btn_novo_documento: "Fotografar outro documento",
    btn_terminar: "Terminar",

    // --- Erro ---
    erro_titulo: "Não consegui aceder à câmara",
    erro_texto_inicial:
      "Verifica se deste permissão de câmara a este site nas definições do telemóvel, e tenta outra vez.",
    erro_perm:
      "Precisamos de acesso à câmara para tirar a foto. Verifica as permissões deste site nas definições do telemóvel.",
    erro_sem_camara: "Não encontrei nenhuma câmara neste aparelho.",
    erro_generico: "Não foi possível abrir a câmara. Tenta outra vez.",
    btn_tentar_de_novo: "Tentar de novo",
  },

  en: {
    marca_sub: "Vanessa Branco — Accounting and Finance",

    // --- Start ---
    inicio_titulo: "ContaClick",
    inicio_texto:
      "Does the document have a QR code (invoice, receipt...) or not (tax form, any other paper)?",
    inicio_titulo_mais: "Add another document",
    inicio_texto_mais: "You already have {docs} in the batch. Does this new one have a QR code?",
    doc_singular: "1 document",
    doc_plural: "{n} documents",
    btn_com_qr_html: "With QR code<small>2 photos: QR + document</small>",
    btn_sem_qr_html: "Without QR code<small>1 photo of the document only</small>",
    btn_instalar: "📌 Add app to home screen",
    nota_instalar_ios_html:
      "To add it to your home screen: tap <strong>Share</strong> (⬆) then <strong>\"Add to Home Screen\"</strong>.",

    // --- Camera ---
    passo_1: "Step 1 of 2 — QR code",
    passo_2: "Step 2 of 2 — Full document",
    passo_doc: "Document",
    dica_qr: "Move your phone in close until the QR code sits inside the square.",
    dica_doc: "Move back far enough to capture the whole document.",
    cam_abrir: "Opening camera...",
    cam_procurar_qr: "Looking for a QR code...",
    cam_qr_encontrado: "QR code found",
    captura_aria: "Take photo",

    // --- Review ---
    foto_qr_alt: "Photographed QR code",
    foto_doc_alt: "Photographed full document",
    rotulo_doc_completo: "Full document",
    btn_repetir_foto: "↺ Retake this photo",
    btn_adicionar_lote: "✓ Add to the batch",
    qr_lido_html: "✓ QR code read<small>Clearly captured.</small>",
    qr_nao_lido_html: "⚠ QR not read<small>Retake the 1st photo closer, or send it anyway.</small>",

    // --- Batch ---
    lote_titulo_1: "1 document ready",
    lote_titulo_n: "{n} documents ready",
    btn_adicionar_outro: "+ Add another document",
    enviar_para: "Send to:",
    btn_copiar: "Copy",
    btn_copiado: "Copied!",
    copiar_aria: "Copy address",
    btn_partilhar: "Send all »",
    nota_envio_html:
      "Tap \"Send all\" and pick <strong>Gmail</strong> (or Mail) from the list that appears — not WhatsApp, so the document(s) reach the office. Check the recipient above before sending (your phone won't fill it in automatically).",
    doc_item: "Document {n}",
    badge_sem_qr: "No QR code",
    badge_qr_ok: "✓ QR read",
    badge_qr_duvida: "⚠ QR not read",
    remover_aria: "Remove document {n}",

    // --- Sending ---
    preparar: "Preparing...",
    erro_pdf: "I couldn't combine the photos into a PDF. Please try again.",
    share_title: "Documents",
    share_text: "Documents for the accountant (send to {email}).",
    nome_ficheiro: "document",

    // --- Done ---
    concluido_titulo: "Documents ready",
    concluido_texto:
      "If you've already picked Gmail/Mail and confirmed the recipient, it's sent. If not, the PDFs are still ready to share.",
    btn_novo_documento: "Photograph another document",
    btn_terminar: "Finish",

    // --- Error ---
    erro_titulo: "I couldn't access the camera",
    erro_texto_inicial:
      "Check that you've granted camera permission to this site in your phone settings, and try again.",
    erro_perm:
      "We need camera access to take the photo. Check this site's permissions in your phone settings.",
    erro_sem_camara: "I couldn't find a camera on this device.",
    erro_generico: "The camera couldn't be opened. Please try again.",
    btn_tentar_de_novo: "Try again",
  },
};
