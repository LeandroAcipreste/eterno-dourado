// Cruza o catálogo 3D com a tabela de preços e grava src/data/modelos.json.
//
//   node scripts/dados/extrair-precos.mjs && node scripts/dados/gerar-dados.mjs
//
// Regras de preço confirmadas pelo cliente (atacado):
//   · preço da tabela é de UMA aliança; o par é o dobro;
//   · forro de aço  ....... + R$ 8,00 por aliança;
//   · pedra acrescentada .. + R$ 2,00 cada, só em modelo liso ou de pedra única
//     que não seja solitário. Em solitário e meia aliança as pedras já estão no
//     preço da tabela, então não somam nada.
//
// Conferência que valida a regra do forro, no pedido real de 18/08:
//   303LM tabela R$ 34,70 + R$ 8,00 = R$ 42,70, o valor cobrado no pedido.

import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const CATALOGO = path.join(RAIZ, 'assets', 'img', 'modelos-3d', 'catalogo.json');
const PRECOS = path.join(RAIZ, 'src', 'data', 'precos.json');
const EXTRAS = path.join(RAIZ, 'src', 'data', 'precos-extras.json');
const SAIDA = path.join(RAIZ, 'src', 'data', 'modelos.json');

// uma aliança por referência, do estudo 3D aprovado
const BASE_GLB = 'assets/img/aliancas-web/modelo-03LM/individuais';
const BASE_FOTO = 'assets/img/aliancas-sem-fundo';
const BASE_WEB = 'assets/img/aliancas-web';

// as larguras que existem em assets/img/aliancas-web, para o srcset
const LARGURAS_WEB = [190, 380, 570, 760];

export const ADICIONAL_FORRO = 8;
export const ADICIONAL_PEDRA = 2;

// Códigos do catálogo cujo equivalente na tabela tem o sufixo transposto.
/**
 * A foto e a tabela nem sempre chamam a peça pelo mesmo código. Aqui, à esquerda o
 * nome do arquivo da foto; à direita a referência da TAB LM 26, que é quem manda:
 * dela saem o nome do modelo, a largura e o preço.
 *
 * As linhas abaixo da primeira vieram do Leandro em 23/09/2026, peça por peça, para
 * as alianças que estavam sem preço. Nada aqui foi deduzido do código.
 */
const EQUIVALENTES = {
  // Hoje o nome do arquivo da foto É a referência da tabela: as 15 que estavam fora
  // foram renomeadas em 23/09/2026, pela lista do Leandro. Só sobra esta, porque nome
  // de arquivo não aceita a barra que a tabela usa.
  '305-1-6MM': '305-1/6MM',
  // a foto 310-1LM é a peça 303-10LM da tabela; o arquivo mantém o nome porque já
  // existe outra foto chamada 303-10LM, de outra tomada da mesma referência
  '310-1LM': '303-10LM',
};


/**
 * Quantas pedras a descrição da tabela já inclui.
 * Devolve null quando a peça é cravejada sem contagem declarada (zircônia,
 * pavê): o preço já cobre as pedras, mas o número não está na tabela.
 */
export function pedrasNaDescricao(descricao = '') {
  const varias = descricao.match(/(\d+)\s*Ped?dras?/i);
  if (varias) return Number.parseInt(varias[1], 10);
  if (/\bC\/\s*Ped?dra\b|\bCom\s+Ped?dra\b|\bPed?dra\b/i.test(descricao)) return 1;
  if (/zirc[oô]nia|pav[eê]/i.test(descricao)) return null;
  return 0;
}

/** Aliança de casamento (par) ou anel solitário avulso. */
function tipoDaPeca(item, descricao = '') {
  if (item.stones === 'solitaire' || /\bAnel\b/i.test(descricao)) return 'anel';
  return 'alianca';
}

/**
 * Modelo liso ou de pedra única (não solitário) aceita pedra avulsa por R$ 2.
 * Solitário e meia aliança (pedras na borda ou no centro) já vêm com as pedras
 * embutidas no preço da tabela.
 */
function aceitaPedraAvulsa(item) {
  return item.stones === 'none' || item.stones === 'single';
}

function familiaDePedra(item) {
  if (item.stones === 'solitaire') return 'solitario';
  if (item.stones === 'edge' || item.stones === 'center') return 'meia-alianca';
  if (item.stones === 'single') return 'pedra-unica';
  return 'liso';
}

/** Largura e altura direto do IHDR, sem decodificar a imagem. */
function medirPng(arquivo) {
  try {
    const b = fs.readFileSync(arquivo);
    if (b.readUInt32BE(0) !== 0x89504e47) return { w: 190, h: 190 };
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  } catch {
    return { w: 190, h: 190 };
  }
}

/**
 * Largura como a tabela escreve ("Aliança Anat. Reta 6mm", "Aro 2mm").
 * Em "Anel Solitário Pedra 4mm" o número é da pedra, não do aro: fica null, como
 * nos modelos fora da tabela. Nada é deduzido do código do modelo.
 */
export function larguraNaDescricao(descricao) {
  if (!descricao) return null;
  const aro = descricao.match(/Aro\s+(\d+(?:[.,]\d+)?)\s*mm/i);
  if (aro) return Number(aro[1].replace(',', '.'));
  if (!/^Alian[çc]a/i.test(descricao)) return null;
  const medida = descricao.match(/(\d+(?:[.,]\d+)?)\s*mm/i);
  return medida ? Number(medida[1].replace(',', '.')) : null;
}

/**
 * Peças que o Leandro informou e que ainda não estão no PDF da tabela
 * (src/data/precos-extras.json). Quando o preço que ele passa já vem com o forro de
 * aço, o forro sai daqui: o site soma os R$ 8,00 de volta quando a pessoa marca a
 * opção, e somar duas vezes cobraria a mais.
 */
function extras() {
  if (!fs.existsSync(EXTRAS)) return [];
  const arquivo = JSON.parse(fs.readFileSync(EXTRAS, 'utf8'));
  return arquivo.itens.map((i) => ({
    code: i.code,
    descricao: i.descricao,
    preco: i.forroIncluso ? Number((i.precoNaTabela - ADICIONAL_FORRO).toFixed(2)) : i.precoNaTabela,
  }));
}

function main() {
  const catalogo = JSON.parse(fs.readFileSync(CATALOGO, 'utf8'));
  const tabela = JSON.parse(fs.readFileSync(PRECOS, 'utf8'));
  const porCodigo = new Map(tabela.itens.map((i) => [i.code.toUpperCase(), i]));
  // o que o Leandro informou vale por cima do PDF: é mais recente que ele
  for (const extra of extras()) porCodigo.set(extra.code.toUpperCase(), extra);

  const modelos = catalogo.map((item) => {
    const alvo = (EQUIVALENTES[item.code] ?? item.code).toUpperCase();
    const linha = porCodigo.get(alvo) ?? null;
    const pedras = linha ? pedrasNaDescricao(linha.descricao) : 0;

    // As fotos aprimoradas são WebP em três larguras. Se ainda não foram
    // geradas, o modelo cai no PNG original e o site continua de pé.
    const web = LARGURAS_WEB.map((largura) => ({
      largura,
      caminho: `${BASE_WEB}/${item.code}-${largura}.webp`,
    })).filter((v) => fs.existsSync(path.join(RAIZ, v.caminho)));

    // proporção real da foto, para o cartão reservar o espaço certo:
    // as peças não são quadradas (188x200, 205x205, 140x185...)
    const proporcao = medirPng(path.join(RAIZ, `${BASE_FOTO}/${item.code}.PNG`));

    return {
      code: item.code,
      // nomes de arquivo: os GLB e as fotos usam o mesmo código do catálogo
      glb: `${BASE_GLB}/${item.code}.glb`,
      foto: web.length ? web[1]?.caminho ?? web[0].caminho : `${BASE_FOTO}/${item.code}.PNG`,
      fotoOriginal: `${BASE_FOTO}/${item.code}.PNG`,
      fotoLarguras: web,
      fotoW: proporcao.w,
      fotoH: proporcao.h,
      // o nome da peça é descricaoTabela, literal; a largura sai dela, nunca do código
      larguraMm: larguraNaDescricao(linha?.descricao),
      pedras: item.stones,
      familia: familiaDePedra(item),
      tipo: tipoDaPeca(item, linha?.descricao),
      pedrasInclusas: pedras,
      cravejada: pedras === null || (typeof pedras === 'number' && pedras >= 10),
      aceitaPedraAvulsa: aceitaPedraAvulsa(item),
      forroDeAcoNoModelo: Boolean(item.silver),
      bytes: item.bytes,
      // preço
      codigoTabela: linha ? linha.code : null,
      descricaoTabela: linha ? linha.descricao : null,
      precoUnidade: linha ? linha.preco : null,
      sobConsulta: !linha,
    };
  });

  const comPreco = modelos.filter((m) => !m.sobConsulta);
  const faltando = modelos.filter((m) => m.sobConsulta).map((m) => m.code);

  // Só entra no JSON final o que existe em disco, para nunca gerar 404.
  const ausentes = [];
  for (const m of modelos) {
    for (const rel of [m.glb, m.foto]) {
      if (!fs.existsSync(path.join(RAIZ, rel))) ausentes.push(rel);
    }
  }

  const saida = {
    geradoEm: new Date().toISOString().slice(0, 10),
    origem: {
      catalogo: path.relative(RAIZ, CATALOGO).replaceAll('\\', '/'),
      precos: tabela.origem,
      categoriaDaTabela: tabela.categorias,
    },
    regras: {
      precoRefereA: 'uma aliança',
      parEquivale: 2,
      adicionalForroDeAco: ADICIONAL_FORRO,
      adicionalPorPedra: ADICIONAL_PEDRA,
      familiasQueNaoCobramPedra: ['solitario', 'meia-alianca'],
      numeracaoMin: 8,
      numeracaoMax: 34,
    },
    total: modelos.length,
    comPreco: comPreco.length,
    sobConsulta: faltando,
    modelos,
  };

  fs.mkdirSync(path.dirname(SAIDA), { recursive: true });
  fs.writeFileSync(SAIDA, JSON.stringify(saida, null, 1), 'utf8');

  console.log(`${modelos.length} modelos · ${comPreco.length} com preço · ${faltando.length} sob consulta`);
  if (ausentes.length) console.warn(`ATENÇÃO — arquivos ausentes (${ausentes.length}):\n  ${ausentes.join('\n  ')}`);
  else console.log('todos os GLB e fotos referenciados existem em disco');

  const faixa = comPreco.map((m) => m.precoUnidade);
  console.log(`preço da unidade: R$ ${Math.min(...faixa).toFixed(2)} a R$ ${Math.max(...faixa).toFixed(2)}`);
  console.log(`gravado em ${path.relative(RAIZ, SAIDA)}`);

}

// executado direto gera os dados; importado, só empresta larguraNaDescricao
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) main();
