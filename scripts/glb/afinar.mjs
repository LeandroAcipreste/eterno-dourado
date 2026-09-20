/**
 * Afina a luz do estúdio e os materiais para o render do GLB ficar igual à foto.
 *
 *   node scripts/glb/afinar.mjs 03LM               luz do estúdio + materiais
 *   node scripts/glb/afinar.mjs 04LM --materiais   só materiais (estúdio já afinado)
 *
 * Busca por coordenadas com passos que encolhem, minimizando o erro por blocos
 * de 8 px entre foto e render (scripts/glb/comparar.js). Grava os materiais em
 * parametros/<codigo>.json, imprime o estúdio encontrado (para ESTUDIO em
 * src/js/libs/visualizador3d.js) e salva a captura na pasta temporária.
 * Depois: py scripts/glb/gerar.py <codigo>, para os materiais entrarem no GLB.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { abrirAba, abrirChrome, subirServidor } from '../cdp.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const codigo = process.argv[2];
const soMateriais = process.argv.includes('--materiais');
if (!codigo) throw new Error('uso: node scripts/glb/afinar.mjs <codigo> [--materiais]');

const arquivoParametros = path.join(RAIZ, 'scripts/glb/parametros', `${codigo}.json`);
const parametros = JSON.parse(fs.readFileSync(arquivoParametros, 'utf8'));
const CHAVES_ESTUDIO = ['exposicao', 'brilhoCaixas'];
const MAX_RODADAS = 40;

const hexParaRgb = (hexa) => [1, 3, 5].map((i) => parseInt(hexa.slice(i, i + 2), 16) / 255);
const rgbParaHex = (rgb) =>
  `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Cada ajuste muda um valor na direção do sinal: multiplica intensidades e canais de cor, soma na rugosidade. */
function listarAjustes() {
  const ajustes = [];
  if (!soMateriais) {
    for (const chave of CHAVES_ESTUDIO) {
      ajustes.push((c, passo, sinal) => {
        c.estudio[chave] = Math.max(0, c.estudio[chave] * (1 + sinal * passo));
      });
    }
  }
  for (const parte of Object.keys(parametros.materiais)) {
    for (let canal = 0; canal < 3; canal++) {
      ajustes.push((c, passo, sinal) => {
        const rgb = hexParaRgb(c.materiais[parte].cor);
        rgb[canal] *= 1 + sinal * passo * 0.5;
        c.materiais[parte].cor = rgbParaHex(rgb);
      });
    }
    ajustes.push((c, passo, sinal) => {
      const valor = c.materiais[parte].rugosidade + sinal * passo * 0.4;
      c.materiais[parte].rugosidade = Number(Math.min(1, Math.max(0.02, valor)).toFixed(3));
    });
  }
  return ajustes;
}

const servidor = await subirServidor();
const chrome = await abrirChrome();
try {
  const url = `${servidor.base}/scripts/glb/comparar.html?codigo=${encodeURIComponent(codigo)}`;
  const aba = await abrirAba(chrome.conexao, { url, largura: 900, altura: 760 });
  if (!(await aba.esperarQue('!!(document.body.dataset.resultado || document.body.dataset.erro)', 60000))) {
    throw new Error('a página de comparação não ficou pronta');
  }
  const erroDaPagina = await aba.ev('document.body.dataset.erro ?? null');
  if (erroDaPagina) throw new Error(erroDaPagina);

  const avaliar = (config) => aba.ev(`window.renderizar(${JSON.stringify(config)})`);
  let config = {
    estudio: await aba.ev('window.estudioAtual()'),
    materiais: Object.fromEntries(
      Object.entries(parametros.materiais).map(([parte, m]) => [parte, { cor: m.cor, rugosidade: m.rugosidade }]),
    ),
  };
  let melhor = await avaliar(config);
  console.log(`início: erro ${melhor.erro}`);

  if (!soMateriais) {
    for (const tons of ['aces', 'neutro']) {
      const candidato = structuredClone(config);
      candidato.estudio.tons = tons;
      const resultado = await avaliar(candidato);
      if (resultado.erro < melhor.erro) [config, melhor] = [candidato, resultado];
    }
    console.log(`tons ${config.estudio.tons}: erro ${melhor.erro}`);
  }

  const ajustes = listarAjustes();
  let passo = 0.4;
  let avaliacoes = 0;
  for (let rodada = 0; rodada < MAX_RODADAS && passo >= 0.03; rodada++) {
    let melhorou = false;
    for (const ajustar of ajustes) {
      for (const sinal of [1, -1]) {
        const candidato = structuredClone(config);
        ajustar(candidato, passo, sinal);
        const resultado = await avaliar(candidato);
        avaliacoes += 1;
        if (resultado.erro < melhor.erro - 0.01) {
          [config, melhor, melhorou] = [candidato, resultado, true];
          break;
        }
      }
    }
    console.log(`passo ${passo.toFixed(3)}: erro ${melhor.erro} (${avaliacoes} avaliações)`);
    if (!melhorou) passo /= 2;
  }

  await avaliar(config);
  const captura = path.join(os.tmpdir(), 'eterno-dourado-glb', `${codigo}-afinado.png`);
  await aba.foto(captura);

  for (const [parte, material] of Object.entries(config.materiais)) Object.assign(parametros.materiais[parte], material);
  fs.writeFileSync(arquivoParametros, JSON.stringify(parametros, null, 2), 'utf8');

  const arredondar = (objeto) =>
    Object.fromEntries(Object.entries(objeto).map(([k, v]) => [k, typeof v === 'number' ? Number(v.toFixed(3)) : v]));
  console.log(JSON.stringify({ erro: melhor.erro, externo: melhor.externo, interno: melhor.interno }));
  if (!soMateriais) console.log('ESTUDIO =', JSON.stringify(arredondar(config.estudio)));
  console.log('materiais =', JSON.stringify(config.materiais));
  console.log('captura:', captura);
} finally {
  // só os processos que este script abriu
  servidor.processo.kill();
  await chrome.encerrar();
}
