// Lê a tabela de preços em PDF e grava src/data/precos.json.
//
//   node scripts/extrair-precos.mjs
//
// O PDF é um relatório do FortesReport com texto não comprimido e uma posição
// Td por célula. As colunas são reconhecidas pelo x, que é fixo no relatório:
//   código 22 | descrição 98 | ref. 275 | unidade 394 | últ. alteração 451 | preço 551
//
// O texto vem em WinAnsi com escapes octais. Os code points de 0x00 a 0xFF já
// coincidem com o Unicode, exceto a faixa 0x80-0x9F, que vai pelo mapa abaixo.

import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const PDF = path.join(RAIZ, 'utils', 'TAB LM 26.pdf');
const SAIDA = path.join(RAIZ, 'src', 'data', 'precos.json');

// posição x de cada coluna: [início, fim)
const COLUNAS = {
  code: [15, 60],
  descricao: [90, 270],
  ref: [270, 380],
  unidade: [385, 430],
  alterado: [440, 500],
  preco: [500, 600],
};

const CP1252 = {
  128: '€', 130: '‚', 131: 'ƒ', 132: '„', 133: '…',
  134: '†', 135: '‡', 136: 'ˆ', 137: '‰', 138: 'Š',
  139: '‹', 140: 'Œ', 142: 'Ž', 145: '‘', 146: '’',
  147: '“', 148: '”', 149: '•', 150: '–', 151: '—',
  152: '˜', 153: '™', 154: 'š', 155: '›', 156: 'œ',
  158: 'ž', 159: 'Ÿ',
};

function decodificarString(bruto) {
  let saida = '';
  for (let i = 0; i < bruto.length; i++) {
    if (bruto.charCodeAt(i) === 92) {
      const octal = bruto.slice(i + 1).match(/^[0-7]{1,3}/);
      if (octal) {
        saida += String.fromCharCode(parseInt(octal[0], 8));
        i += octal[0].length;
        continue;
      }
      saida += bruto[i + 1];
      i += 1;
      continue;
    }
    saida += bruto[i];
  }
  // a faixa 0x80-0x9F e o unico ponto em que o WinAnsi difere do Latin-1
  let corrigido = String();
  for (const c of saida) {
    const cp = c.codePointAt(0);
    corrigido += cp >= 0x80 && cp <= 0x9f ? (CP1252[cp] ?? c) : c;
  }
  return corrigido;
}

/** Devolve, por página, a lista de trechos de texto com sua posição. */
function lerTrechos(pdf) {
  const bruto = pdf.toString('latin1');
  const streams = [...bruto.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)]
    .map((m) => m[1])
    .filter((s) => s.includes('BT'));

  return streams.map((stream) => {
    const trechos = [];
    for (const bloco of stream.matchAll(/BT([\s\S]*?)ET/g)) {
      const corpo = bloco[1];
      const td = corpo.match(/([-\d.]+)\s+([-\d.]+)\s+Td/);
      if (!td) continue;
      const texto = [...corpo.matchAll(/\((.*?)\)\s*Tj/g)]
        .map((m) => decodificarString(m[1]))
        .join('');
      if (!texto.trim()) continue;
      trechos.push({ x: parseFloat(td[1]), y: parseFloat(td[2]), texto });
    }
    return trechos;
  });
}

function extrair() {
  const paginas = lerTrechos(fs.readFileSync(PDF));
  const itens = [];
  const categorias = new Set();

  paginas.forEach((trechos, indice) => {
    const linhas = new Map();
    for (const t of trechos) {
      const chave = Math.round(t.y);
      if (!linhas.has(chave)) linhas.set(chave, []);
      linhas.get(chave).push(t);
    }

    for (const [, celulas] of [...linhas].sort((a, b) => b[0] - a[0])) {
      celulas.sort((a, b) => a.x - b.x);

      const filtro = celulas.find((c) => c.texto.includes('Da categoria de produtos'));
      if (filtro) categorias.add(filtro.texto.replace(/^Filtros:\s*/, '').trim());

      const em = ([lo, hi]) => celulas.find((c) => c.x >= lo && c.x < hi);
      const code = em(COLUNAS.code);
      const descricao = em(COLUNAS.descricao);
      const preco = em(COLUNAS.preco);
      if (!code || !descricao || !preco) continue;
      if (code.texto.includes('digo')) continue; // linha de cabeçalho

      const valor = Number.parseFloat(preco.texto.trim().replace(/\./g, '').replace(',', '.'));
      if (!Number.isFinite(valor)) continue;

      const ref = em(COLUNAS.ref);
      const unidade = em(COLUNAS.unidade);
      const alterado = em(COLUNAS.alterado);
      itens.push({
        code: code.texto.trim(),
        descricao: descricao.texto.trim(),
        ref: ref ? ref.texto.trim() : null,
        unidade: unidade ? unidade.texto.trim() : null,
        alterado: alterado ? alterado.texto.trim() : null,
        preco: valor,
        pagina: indice + 1,
      });
    }
  });

  return { itens, categorias: [...categorias] };
}

const { itens, categorias } = extrair();
const duplicados = itens.length - new Set(itens.map((i) => i.code)).size;

fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
fs.writeFileSync(
  SAIDA,
  JSON.stringify(
    {
      origem: 'utils/TAB LM 26.pdf',
      categorias,
      extraidoEm: new Date().toISOString().slice(0, 10),
      itens,
    },
    null,
    1,
  ),
  'utf8',
);

console.log(`${itens.length} itens · ${duplicados} códigos duplicados · categorias: ${categorias.join('; ')}`);
console.log(`gravado em ${path.relative(RAIZ, SAIDA)}`);
