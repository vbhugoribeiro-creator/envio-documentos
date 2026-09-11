"use strict";

// ---------------------------------------------------------------------
// Criador de ficheiros .zip minimalista, sem dependências externas.
// Pedido explícito do utilizador, 2026-09-11: poder comprimir o lote
// todo num único .zip antes de enviar (mais fácil de anexar a um email
// do que N ficheiros separados).
//
// Usa só o método STORE (sem compressão real/deflate) -- os documentos
// já são PDFs/JPEGs, que não comprimem mais nenhum, e implementar o
// deflate à mão só para ganhar tamanho zero não compensava a
// complexidade. O formato ainda é um .zip válido, lido por qualquer
// ferramenta (Explorer, Finder, 7-Zip, WinRAR...).
//
// Implementa só o necessário do formato ZIP/PKWARE: um cabeçalho local +
// dados por ficheiro, seguidos do diretório central e do seu terminador.
// CRC-32 calculado à mão (tabela standard IEEE 802.3).
// ---------------------------------------------------------------------

const CRC32_TABELA = (() => {
  const tabela = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  return tabela;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABELA[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Campos de data/hora no formato DOS usado pelo ZIP (16 bits cada).
function dataHoraDos(data) {
  const hora = ((data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1)) & 0xffff;
  const dia = (((data.getFullYear() - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate()) & 0xffff;
  return { hora, dia };
}

// ficheiros: Array<{ nome: string, dados: Uint8Array }>
async function criarZip(ficheiros) {
  const { hora, dia } = dataHoraDos(new Date());
  const partesLocais = [];
  const partesCentrais = [];
  let offset = 0;

  for (const { nome, dados } of ficheiros) {
    const nomeBytes = new TextEncoder().encode(nome);
    const crc = crc32(dados);
    const tamanho = dados.length;

    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true); // assinatura do cabeçalho local
    local.setUint16(4, 20, true); // versão mínima necessária
    local.setUint16(6, 0, true); // flags gerais
    local.setUint16(8, 0, true); // método de compressão: 0 = STORE
    local.setUint16(10, hora, true);
    local.setUint16(12, dia, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, tamanho, true); // tamanho comprimido = real (STORE)
    local.setUint32(22, tamanho, true);
    local.setUint16(26, nomeBytes.length, true);
    local.setUint16(28, 0, true); // sem campo extra
    partesLocais.push(new Uint8Array(local.buffer), nomeBytes, dados);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true); // assinatura do diretório central
    central.setUint16(4, 20, true); // versão que criou
    central.setUint16(6, 20, true); // versão mínima necessária
    central.setUint16(8, 0, true);
    central.setUint16(10, 0, true);
    central.setUint16(12, hora, true);
    central.setUint16(14, dia, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, tamanho, true);
    central.setUint32(24, tamanho, true);
    central.setUint16(28, nomeBytes.length, true);
    central.setUint16(30, 0, true); // campo extra
    central.setUint16(32, 0, true); // comentário
    central.setUint16(34, 0, true); // nº do disco
    central.setUint16(36, 0, true); // atributos internos
    central.setUint32(38, 0, true); // atributos externos
    central.setUint32(42, offset, true); // posição do cabeçalho local
    partesCentrais.push(new Uint8Array(central.buffer), nomeBytes);

    offset += local.buffer.byteLength + nomeBytes.length + tamanho;
  }

  const inicioCentral = offset;
  const tamanhoCentral = partesCentrais.reduce((soma, parte) => soma + parte.length, 0);

  const fim = new DataView(new ArrayBuffer(22));
  fim.setUint32(0, 0x06054b50, true); // assinatura do fim do diretório central
  fim.setUint16(4, 0, true);
  fim.setUint16(6, 0, true);
  fim.setUint16(8, ficheiros.length, true);
  fim.setUint16(10, ficheiros.length, true);
  fim.setUint32(12, tamanhoCentral, true);
  fim.setUint32(16, inicioCentral, true);
  fim.setUint16(20, 0, true); // sem comentário

  return new Blob([...partesLocais, ...partesCentrais, new Uint8Array(fim.buffer)], {
    type: "application/zip",
  });
}

// Converte uma lista de File num único File .zip, pronto a anexar/partilhar.
async function ficheirosParaZip(files, nomeZip) {
  const entradas = await Promise.all(
    files.map(async (f) => ({ nome: f.name, dados: new Uint8Array(await f.arrayBuffer()) }))
  );
  const blob = await criarZip(entradas);
  return new File([blob], nomeZip, { type: "application/zip" });
}
