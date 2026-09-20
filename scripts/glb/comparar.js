/**
 * Ferramenta: foto do anel maior à esquerda e o GLB à direita, com a câmera de
 * frente (o GLB já vem girado como a foto), na mesma escala e com a cena do modal
 * (src/js/libs/visualizador3d.js).
 *
 * window.renderizar({ estudio, materiais }) aplica os valores, renderiza e mede a
 * diferença para a foto; é o que scripts/glb/afinar.mjs chama. Aberta por
 * scripts/glb/comparar.mjs, renderiza uma vez (?materiais= opcional) e grava o
 * resultado em body[data-resultado].
 */

import * as THREE from 'three';
import { Visualizador } from '/src/js/libs/visualizador3d.js';

const MARGEM = 16;
const BLOCO = 8;
const busca = new URLSearchParams(location.search);
const codigo = busca.get('codigo');
// cor chapada e sem tone mapping: o ACES mistura os canais e o verde puro deixaria de ser reconhecido
const PINTURA = {
  externo: new THREE.MeshBasicMaterial({ color: 0xff0000, toneMapped: false }),
  interno: new THREE.MeshBasicMaterial({ color: 0x00ff00, toneMapped: false }),
};

let ctx = null;

async function preparar() {
  const parametros = await (await fetch(`/scripts/glb/parametros/${codigo}.json`)).json();
  const imagem = new Image();
  imagem.src = `/assests/img/aliancas-hd/${codigo}.png`;
  await imagem.decode();

  const { x0, y0, x1, y1 } = parametros.anelNaFoto;
  const largura = x1 - x0 + 1 + 2 * MARGEM;
  const altura = y1 - y0 + 1 + 2 * MARGEM;
  const recorte = [x0 - MARGEM, y0 - MARGEM, largura, altura, 0, 0, largura, altura];

  const telaFoto = document.querySelector('[data-foto]');
  telaFoto.width = largura;
  telaFoto.height = altura;
  const ctxFoto = telaFoto.getContext('2d', { willReadFrequently: true });
  ctxFoto.fillStyle = '#fff';
  ctxFoto.fillRect(0, 0, largura, altura);
  ctxFoto.drawImage(imagem, ...recorte);
  const ctxAlfa = new OffscreenCanvas(largura, altura).getContext('2d');
  ctxAlfa.drawImage(imagem, ...recorte);

  const palco = document.querySelector('[data-palco]');
  palco.style.width = `${largura}px`;
  palco.style.height = `${altura}px`;
  const canvas = palco.querySelector('canvas');
  const visualizador = new Visualizador(canvas, { girar: false, interativo: false });
  // a ferramenta desenha quando pede, na câmera dela: nada de laço nem redimensionamento automático
  visualizador.observadorVisao.disconnect();
  visualizador.observadorTamanho.disconnect();
  await visualizador.abrir(`/assests/img/modelos-3d/glb/${codigo}.glb`);
  visualizador.parar();
  visualizador.redimensionar();

  // extensão real dos vértices vistos de frente, para casar com a caixa do anel na foto
  const modelo = visualizador.modeloAtual;
  modelo.updateMatrixWorld(true);
  const minimo = new THREE.Vector3(Infinity, Infinity, Infinity);
  const maximo = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const ponto = new THREE.Vector3();
  const materiais = {};
  modelo.traverse((objeto) => {
    if (!objeto.isMesh) return;
    for (const [chave, material] of Object.entries(parametros.materiais)) {
      if (objeto.material.name === material.nome) materiais[chave] = objeto.material;
    }
    const posicoes = objeto.geometry.attributes.position;
    for (let i = 0; i < posicoes.count; i++) {
      ponto.fromBufferAttribute(posicoes, i).applyMatrix4(objeto.matrixWorld);
      minimo.min(ponto);
      maximo.max(ponto);
    }
  });

  const escala = (y1 - y0 + 1) / (maximo.y - minimo.y);
  const camera = new THREE.OrthographicCamera();
  camera.position.set(0, 0, 0.1);
  camera.left = (minimo.x + maximo.x) / 2 - (MARGEM + (x1 - x0 + 1) / 2) / escala;
  camera.right = camera.left + largura / escala;
  camera.top = (minimo.y + maximo.y) / 2 + (MARGEM + (y1 - y0 + 1) / 2) / escala;
  camera.bottom = camera.top - altura / escala;
  camera.near = 0.001;
  camera.far = 1;
  camera.updateProjectionMatrix();

  ctx = {
    largura,
    altura,
    canvas,
    visualizador,
    camera,
    modelo,
    materiais,
    foto: ctxFoto.getImageData(0, 0, largura, altura).data,
    alfa: ctxAlfa.getImageData(0, 0, largura, altura).data,
  };
}

function aplicar({ estudio, materiais } = {}) {
  if (estudio) ctx.visualizador.definirEstudio(estudio);
  for (const [chave, ajuste] of Object.entries(materiais ?? {})) {
    const material = ctx.materiais[chave];
    if (!material) continue;
    if (ajuste.cor) material.color.set(ajuste.cor);
    if (ajuste.rugosidade != null) material.roughness = ajuste.rugosidade;
    if (ajuste.metal != null) material.metalness = ajuste.metal;
  }
}

function desenhar() {
  ctx.visualizador.renderer.render(ctx.visualizador.cena, ctx.camera);
}

/** Lê o canvas logo depois do render, antes de o navegador descartar o buffer. */
function lerCanvas(fundoBranco) {
  const tela = new OffscreenCanvas(ctx.largura, ctx.altura).getContext('2d');
  if (fundoBranco) {
    tela.fillStyle = '#fff';
    tela.fillRect(0, 0, ctx.largura, ctx.altura);
  }
  tela.drawImage(ctx.canvas, 0, 0, ctx.largura, ctx.altura);
  return tela.getImageData(0, 0, ctx.largura, ctx.altura).data;
}

/** Quadro com cor chapada por material: diz de qual material é cada pixel do render. */
function rotular() {
  const originais = new Map();
  ctx.modelo.traverse((objeto) => {
    if (!objeto.isMesh) return;
    const chave = Object.keys(ctx.materiais).find((c) => ctx.materiais[c] === objeto.material);
    originais.set(objeto, objeto.material);
    if (chave) objeto.material = PINTURA[chave];
  });
  desenhar();
  const rotulos = lerCanvas(false);
  for (const [objeto, material] of originais) objeto.material = material;
  desenhar();
  return rotulos;
}

/**
 * Por material: cor média, contraste (desvio da luminância) e erro médio em
 * blocos de 8 px entre foto e render. O erro de cada bloco soma a diferença de
 * cor média e a de contraste interno: só a média premiaria metal fosco, que
 * apaga os reflexos e acerta a cor "na média". O erro geral pondera pelos pixels.
 */
function medir(render, rotulos) {
  const { largura, altura, foto, alfa } = ctx;
  const colunas = Math.ceil(largura / BLOCO);
  const CAMPOS = 11; // n, foto rgb, render rgb, luz da foto (soma, quadrados), luz do render (soma, quadrados)
  const nova = () => ({
    n: 0,
    foto: [0, 0, 0],
    render: [0, 0, 0],
    luzFoto: [0, 0],
    luzRender: [0, 0],
    blocos: new Float64Array(colunas * Math.ceil(altura / BLOCO) * CAMPOS),
  });
  const regioes = { externo: nova(), interno: nova() };
  const luminancia = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  const desvio = (soma, quadrados, n) => Math.sqrt(Math.max(0, quadrados / n - (soma / n) ** 2));

  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4;
      if (alfa[i + 3] <= 128 || rotulos[i + 3] < 200) continue;
      const diferenca = rotulos[i] - rotulos[i + 1];
      const regiao = diferenca > 80 ? regioes.externo : diferenca < -80 ? regioes.interno : null;
      if (!regiao) continue;

      const bloco = regiao.blocos;
      const b = (Math.floor(y / BLOCO) * colunas + Math.floor(x / BLOCO)) * CAMPOS;
      regiao.n += 1;
      bloco[b] += 1;
      for (let c = 0; c < 3; c++) {
        regiao.foto[c] += foto[i + c];
        regiao.render[c] += render[i + c];
        bloco[b + 1 + c] += foto[i + c];
        bloco[b + 4 + c] += render[i + c];
      }
      const lf = luminancia(foto, i);
      const lr = luminancia(render, i);
      regiao.luzFoto[0] += lf;
      regiao.luzFoto[1] += lf * lf;
      regiao.luzRender[0] += lr;
      regiao.luzRender[1] += lr * lr;
      bloco[b + 7] += lf;
      bloco[b + 8] += lf * lf;
      bloco[b + 9] += lr;
      bloco[b + 10] += lr * lr;
    }
  }

  const resultado = {};
  let somaErro = 0;
  let somaPeso = 0;
  for (const [chave, r] of Object.entries(regioes)) {
    if (!r.n) throw new Error(`nenhum pixel do material ${chave}: o quadro de rótulos não reconheceu a cor`);
    let erro = 0;
    let contados = 0;
    for (let b = 0; b < r.blocos.length; b += CAMPOS) {
      const n = r.blocos[b];
      if (n < (BLOCO * BLOCO) / 4) continue;
      let cor = 0;
      for (let c = 0; c < 3; c++) cor += Math.abs(r.blocos[b + 1 + c] - r.blocos[b + 4 + c]) / n;
      const contraste = Math.abs(desvio(r.blocos[b + 7], r.blocos[b + 8], n) - desvio(r.blocos[b + 9], r.blocos[b + 10], n));
      erro += cor / 3 + contraste;
      contados += 1;
    }
    erro = contados ? erro / contados : 0;
    resultado[chave] = {
      erroBlocos: Number(erro.toFixed(2)),
      foto: r.foto.map((v) => Math.round(v / r.n)),
      render: r.render.map((v) => Math.round(v / r.n)),
      contrasteFoto: Math.round(desvio(...r.luzFoto, r.n)),
      contrasteRender: Math.round(desvio(...r.luzRender, r.n)),
    };
    somaErro += erro * r.n;
    somaPeso += r.n;
  }
  return { erro: Number((somaErro / somaPeso).toFixed(3)), ...resultado };
}

window.renderizar = async (config = {}) => {
  aplicar(config);
  desenhar();
  const render = lerCanvas(true);
  return medir(render, rotular());
};

window.estudioAtual = () => ({ ...ctx.visualizador.estudio });

preparar()
  .then(() => window.renderizar({ materiais: JSON.parse(busca.get('materiais') ?? '{}') }))
  .then((resultado) => {
    document.body.dataset.resultado = JSON.stringify(resultado);
  })
  .catch((erro) => {
    document.body.dataset.erro = String(erro?.stack ?? erro);
  });
