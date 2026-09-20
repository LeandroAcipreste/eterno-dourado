// Aprimora as fotos do catálogo: super-resolução, recorte e saídas para a web.
//
//   node scripts/aprimorar-imagens.mjs            # as 80 de uma vez
//   node scripts/aprimorar-imagens.mjs 303LM      # só um código, para conferir
//
// Os originais vão para assests/img/aliancas-original/ antes de qualquer coisa
// e nunca são sobrescritos.
//
// ---------------------------------------------------------------------------
// Quatro estágios, cada modelo rodando UMA vez sobre a pasta inteira
//
//   1. reconstruir a foto original (Node)
//      O arquivo de entrada já é RGBA, mas o RGB dos pixels transparentes ainda
//      guarda o fundo de estúdio. Descartar o alfa devolve exatamente a
//      fotografia de onde a peça foi recortada — que é o que os dois modelos
//      esperam ver.
//
//   2. Real-ESRGAN x4plus (vendor/realesrgan, Vulkan, sem Python)
//      Interpolação amplia sem criar detalhe. Quem reconstrói friso e aresta é
//      o modelo treinado. Uma chamada só, com a pasta inteira.
//
//   3. rembg / isnet-general-use (scripts/remover-fundo.py)
//      A máscara é refeita em 4x em vez de ampliada a partir dos 190px. A
//      diferença é medível: a silhueta antiga tinha degraus e franja clara; a
//      nova sai lisa. A sessão do modelo é reaproveitada nas 80.
//
//   4. limpar a borda e gerar os tamanhos (Node)
//      O rembg mexe no alfa mas não no RGB, então o branco do estúdio continua
//      atrás da máscara. Se ele ficar, o navegador o mistura na borda ao
//      desenhar em tela retina e vira halo claro sobre o fundo bronze.
//      Por isso: descontaminar, sangrar, e reduzir com Lanczos pré-multiplicado.
//
// O ffmpeg entra só para decodificar e codificar; as contas de alfa são feitas
// aqui, porque precisam ser explícitas.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';

const RAIZ = path.resolve(import.meta.dirname, '..');
const ENTRADA = path.join(RAIZ, 'assests', 'img', 'aliancas-sem-fundo');
const ORIGINAIS = path.join(RAIZ, 'assests', 'img', 'aliancas-original');
const SAIDA_PNG = path.join(RAIZ, 'assests', 'img', 'aliancas-hd');
const SAIDA_WEB = path.join(RAIZ, 'assests', 'img', 'aliancas-web');

const ESRGAN = path.join(RAIZ, 'vendor', 'realesrgan', 'realesrgan-ncnn-vulkan.exe');
const MODELOS = path.join(RAIZ, 'vendor', 'realesrgan', 'models');
const MODELO = 'realesrgan-x4plus';
const ESCALA = 4;

const REMOVER_FUNDO = path.join(RAIZ, 'scripts', 'remover-fundo.py');
const PY = process.platform === 'win32' ? 'py' : 'python3';

const LADO_WEB = [190, 380, 570, 760];
const RAIO_SANGRIA = 8;
const NITIDEZ = 0.18; // leve: repõe só o que a redução tira
const NITIDEZ_RAIO = 0.9;

/* ------------------------------------------------------------- ffmpeg ----- */

function dimensoes(arquivo) {
  const saida = execFileSync('ffprobe', [
    '-v', 'error', '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height', '-of', 'csv=p=0:s=x', arquivo,
  ]).toString().trim();
  const [w, h] = saida.split('x').map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h)) throw new Error(`dimensões ilegíveis: ${arquivo}`);
  return { w, h };
}

function decodificar(arquivo, temp, nome = 'in.rgba') {
  const cru = path.join(temp, nome);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', arquivo, '-pix_fmt', 'rgba', '-f', 'rawvideo', cru]);
  const { w, h } = dimensoes(arquivo);
  const px = fs.readFileSync(cru);
  if (px.length !== w * h * 4) {
    throw new Error(`${path.basename(arquivo)}: ${px.length} bytes, esperado ${w * h * 4} (${w}x${h})`);
  }
  return { px, w, h };
}

function codificar(buf, w, h, destino, temp, opcoes = []) {
  const cru = path.join(temp, 'out.rgba');
  fs.writeFileSync(cru, buf);
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', cru,
    ...opcoes, destino,
  ]);
}

/* ------------------------------------------------------------- borda ------ */

function corDoFundo(px, w, h) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) {
    if (px[i * 4 + 3] !== 0) continue;
    r += px[i * 4]; g += px[i * 4 + 1]; b += px[i * 4 + 2]; n++;
  }
  if (n < 50) return [255, 255, 255];
  return [r / n, g / n, b / n];
}

/** Desfaz a mistura do fundo na borda: F = (C − (1−a)·B) / a. */
function descontaminarBorda(px, w, h, [br, bg, bb]) {
  for (let i = 0; i < w * h; i++) {
    const a8 = px[i * 4 + 3];
    if (a8 === 0 || a8 === 255) continue;
    const a = a8 / 255;
    const inv = 1 - a;
    px[i * 4] = clampa((px[i * 4] - inv * br) / a);
    px[i * 4 + 1] = clampa((px[i * 4 + 1] - inv * bg) / a);
    px[i * 4 + 2] = clampa((px[i * 4 + 2] - inv * bb) / a);
  }
}

/** Estende a cor da peça para dentro do transparente. */
function sangrarBorda(px, w, h, passes) {
  const temCor = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) temCor[i] = px[i * 4 + 3] > 0 ? 1 : 0;

  for (let passe = 0; passe < passes; passe++) {
    const novos = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (temCor[i]) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const j = ny * w + nx;
            if (!temCor[j]) continue;
            r += px[j * 4]; g += px[j * 4 + 1]; b += px[j * 4 + 2]; n++;
          }
        }
        if (n) novos.push([i, r / n, g / n, b / n]);
      }
    }
    if (novos.length === 0) break;
    for (const [i, r, g, b] of novos) {
      px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b;
      temCor[i] = 1;
    }
  }
}

function limparBorda(px, w, h) {
  descontaminarBorda(px, w, h, corDoFundo(px, w, h));
  sangrarBorda(px, w, h, RAIO_SANGRIA);
}

/* ------------------------------------------------- pré-multiplicado ------- */

function preMultiplicar(px, w, h) {
  const f = new Float32Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255;
    f[i * 4] = (px[i * 4] / 255) * a;
    f[i * 4 + 1] = (px[i * 4 + 1] / 255) * a;
    f[i * 4 + 2] = (px[i * 4 + 2] / 255) * a;
    f[i * 4 + 3] = a;
  }
  return f;
}

function desfazerPreMultiplicacao(f, w, h) {
  const px = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = Math.min(1, Math.max(0, f[i * 4 + 3]));
    const inv = a > 0.0001 ? 1 / a : 0;
    px[i * 4] = clampa(f[i * 4] * inv * 255);
    px[i * 4 + 1] = clampa(f[i * 4 + 1] * inv * 255);
    px[i * 4 + 2] = clampa(f[i * 4 + 2] * inv * 255);
    px[i * 4 + 3] = clampa(a * 255);
  }
  return px;
}

const clampa = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

/* ------------------------------------------------------------ Lanczos ----- */

const LOBOS = 3;
const sinc = (x) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));
const lanczos = (x) => (Math.abs(x) >= LOBOS ? 0 : sinc(Math.abs(x)) * sinc(Math.abs(x) / LOBOS));

function pesos(origem, destino) {
  const escala = destino / origem;
  const suporte = escala < 1 ? LOBOS / escala : LOBOS;
  const linhas = [];
  for (let d = 0; d < destino; d++) {
    const centro = (d + 0.5) / escala - 0.5;
    const ini = Math.max(0, Math.ceil(centro - suporte));
    const fim = Math.min(origem - 1, Math.floor(centro + suporte));
    const ws = [];
    let soma = 0;
    for (let s = ini; s <= fim; s++) {
      const p = lanczos(escala < 1 ? (s - centro) * escala : s - centro);
      ws.push(p); soma += p;
    }
    if (soma !== 0) for (let k = 0; k < ws.length; k++) ws[k] /= soma;
    linhas.push({ ini, ws });
  }
  return linhas;
}

function reamostrar(f, w, h, nw, nh) {
  const horiz = new Float32Array(nw * h * 4);
  const px = pesos(w, nw);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < nw; x++) {
      const { ini, ws } = px[x];
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < ws.length; k++) {
        const i = (y * w + (ini + k)) * 4, p = ws[k];
        r += f[i] * p; g += f[i + 1] * p; b += f[i + 2] * p; a += f[i + 3] * p;
      }
      const o = (y * nw + x) * 4;
      horiz[o] = r; horiz[o + 1] = g; horiz[o + 2] = b; horiz[o + 3] = a;
    }
  }
  const saida = new Float32Array(nw * nh * 4);
  const py = pesos(h, nh);
  for (let y = 0; y < nh; y++) {
    const { ini, ws } = py[y];
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let k = 0; k < ws.length; k++) {
        const i = ((ini + k) * nw + x) * 4, p = ws[k];
        r += horiz[i] * p; g += horiz[i + 1] * p; b += horiz[i + 2] * p; a += horiz[i + 3] * p;
      }
      const o = (y * nw + x) * 4;
      saida[o] = r; saida[o + 1] = g; saida[o + 2] = b; saida[o + 3] = a;
    }
  }
  return saida;
}

function desfocarGaussiano(f, w, h, sigma) {
  const raio = Math.max(1, Math.ceil(sigma * 3));
  const nucleo = [];
  let soma = 0;
  for (let i = -raio; i <= raio; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    nucleo.push(v); soma += v;
  }
  for (let i = 0; i < nucleo.length; i++) nucleo[i] /= soma;

  const passo = (entrada, horizontal) => {
    const saida = new Float32Array(entrada.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0, a = 0;
        for (let k = -raio; k <= raio; k++) {
          const nx = horizontal ? Math.min(w - 1, Math.max(0, x + k)) : x;
          const ny = horizontal ? y : Math.min(h - 1, Math.max(0, y + k));
          const i = (ny * w + nx) * 4, p = nucleo[k + raio];
          r += entrada[i] * p; g += entrada[i + 1] * p; b += entrada[i + 2] * p; a += entrada[i + 3] * p;
        }
        const o = (y * w + x) * 4;
        saida[o] = r; saida[o + 1] = g; saida[o + 2] = b; saida[o + 3] = a;
      }
    }
    return saida;
  };
  return passo(passo(f, true), false);
}

function aguçar(f, w, h, forca, raio) {
  if (forca <= 0) return f;
  const borrado = desfocarGaussiano(f, w, h, raio);
  const saida = new Float32Array(f.length);
  for (let i = 0; i < w * h; i++) {
    const a = f[i * 4 + 3];
    const peso = forca * a; // sem alfa, sem nitidez: a silhueta não ganha contorno
    for (let c = 0; c < 3; c++) {
      const v = f[i * 4 + c];
      saida[i * 4 + c] = v + peso * (v - borrado[i * 4 + c]);
    }
    saida[i * 4 + 3] = a;
  }
  return saida;
}

/* ------------------------------------------------------------ estágios ---- */

/** 1 — descarta o alfa e recupera a fotografia de estúdio original. */
function reconstruirFotos(arquivos, destino, temp) {
  fs.mkdirSync(destino, { recursive: true });
  for (const arquivo of arquivos) {
    const origem = path.join(ENTRADA, arquivo);

    const backup = path.join(ORIGINAIS, arquivo);
    if (!fs.existsSync(backup)) {
      fs.mkdirSync(ORIGINAIS, { recursive: true });
      fs.copyFileSync(origem, backup);
    }

    const nome = arquivo.replace(/\.png$/i, '');
    execFileSync('ffmpeg', [
      '-y', '-loglevel', 'error', '-i', origem,
      '-vf', 'format=rgb24', // o alfa cai: sobra a foto de fundo branco
      '-frames:v', '1', path.join(destino, `${nome}.png`),
    ]);
  }
}

/**
 * 2 — Real-ESRGAN, um arquivo por chamada.
 *
 * O modo pasta do binário (-i dir -o dir) trava com violação de acesso
 * (0xC0000005) nesta máquina depois de algumas imagens — provavelmente a GPU
 * integrada não aguenta a fila inteira. Por arquivo é estável, e ainda deixa o
 * lote continuar quando um cai.
 */
function superResolucao(entrada, saida, aoProgredir) {
  fs.mkdirSync(saida, { recursive: true });
  const arquivos = fs.readdirSync(entrada).filter((f) => /\.png$/i.test(f));
  const falhas = [];

  arquivos.forEach((arquivo, i) => {
    const destino = path.join(saida, arquivo);
    if (fs.existsSync(destino)) return; // retomada: já ampliado

    let ultimoErro = null;
    for (let tentativa = 1; tentativa <= 2; tentativa++) {
      const r = spawnSync(
        ESRGAN,
        ['-i', path.join(entrada, arquivo), '-o', destino, '-n', MODELO, '-m', MODELOS, '-s', String(ESCALA)],
        { stdio: ['ignore', 'ignore', 'ignore'] },
      );
      if (r.status === 0 && fs.existsSync(destino)) return aoProgredir?.(i + 1, arquivos.length, arquivo);
      ultimoErro = `código ${r.status}`;
      try { fs.rmSync(destino, { force: true }); } catch { /* saída parcial */ }
    }
    falhas.push({ arquivo, erro: ultimoErro });
    console.error(`  Real-ESRGAN falhou em ${arquivo}: ${ultimoErro}`);
  });

  if (falhas.length === arquivos.length) {
    throw new Error(`Real-ESRGAN falhou em todas as ${arquivos.length} imagens`);
  }
  return falhas;
}

/** 3 — rembg sobre a pasta inteira, numa chamada, com a sessão reaproveitada. */
function removerFundo(entrada, saida) {
  const r = spawnSync(PY, [REMOVER_FUNDO, entrada, saida], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`rembg saiu com código ${r.status}`);
}

/** 4 — limpa a borda e gera PNG mestre e os WebP do srcset. */
function finalizar(arquivo, recortados, temp) {
  const nome = arquivo.replace(/\.png$/i, '');
  const origem = path.join(recortados, `${nome}.png`);
  const { px, w, h } = decodificar(origem, temp);

  limparBorda(px, w, h);
  codificar(px, w, h, path.join(SAIDA_PNG, `${nome}.png`), temp, ['-pred', 'mixed']);

  const pre = preMultiplicar(px, w, h);
  const maiorLado = Math.max(w, h);
  const saidas = [];

  for (const lado of LADO_WEB) {
    const escala = Math.min(1, lado / maiorLado);
    const cheio = escala === 1;
    const dw = cheio ? w : Math.max(1, Math.round(w * escala));
    const dh = cheio ? h : Math.max(1, Math.round(h * escala));
    const reduzido = cheio
      ? px
      : desfazerPreMultiplicacao(aguçar(reamostrar(pre, w, h, dw, dh), dw, dh, NITIDEZ, NITIDEZ_RAIO), dw, dh);
    const destino = path.join(SAIDA_WEB, `${nome}-${lado}.webp`);
    codificar(reduzido, dw, dh, destino, temp, [
      '-c:v', 'libwebp', '-lossless', '0', '-quality', '88', '-compression_level', '6',
    ]);
    saidas.push({ lado, bytes: fs.statSync(destino).size });
  }

  return { arquivo, para: `${w}x${h}`, saidas };
}

/* ---------------------------------------------------------------- lote ---- */

function main() {
  if (!fs.existsSync(ESRGAN)) {
    console.error(`Real-ESRGAN não encontrado em ${path.relative(RAIZ, ESRGAN)}`);
    process.exit(1);
  }

  const filtro = process.argv[2];
  const arquivos = fs
    .readdirSync(ENTRADA)
    .filter((f) => /\.png$/i.test(f))
    .filter((f) => !filtro || f.toLowerCase().startsWith(filtro.toLowerCase()));

  if (arquivos.length === 0) {
    console.error(`nenhum PNG${filtro ? ` começando por "${filtro}"` : ''} em ${path.relative(RAIZ, ENTRADA)}`);
    process.exit(1);
  }

  // Pasta de trabalho fixa, não descartável: o lote leva mais de uma hora e uma
  // queda no meio não pode jogar fora o que já foi ampliado. Rodar de novo
  // retoma de onde parou, e ela só é apagada quando tudo dá certo.
  const temp = path.join(os.tmpdir(), 'eterno-dourado-aprimorar');
  const dirFotos = path.join(temp, '1-fotos');
  const dirAmpliadas = path.join(temp, '2-ampliadas');
  const dirRecortadas = path.join(temp, '3-recortadas');
  fs.mkdirSync(temp, { recursive: true });
  const relogio = Date.now();
  const falhas = [];

  try {
    console.log(`[1/4] recuperando a foto de estúdio de ${arquivos.length} imagens`);
    reconstruirFotos(arquivos, dirFotos, temp);

    console.log(`[2/4] Real-ESRGAN ${MODELO} ${ESCALA}x — cerca de 50 s por imagem`);
    const falhasSr = superResolucao(dirFotos, dirAmpliadas, (feitas, total, nome) => {
      console.log(`  ${String(feitas).padStart(3)}/${total}  ${nome}`);
    });
    falhas.push(...falhasSr.map((f) => ({ arquivo: f.arquivo, erro: `Real-ESRGAN ${f.erro}` })));

    console.log(`[3/4] rembg, refazendo a máscara em ${ESCALA}x`);
    removerFundo(dirAmpliadas, dirRecortadas);

    console.log(`[4/4] limpando a borda e gerando PNG e WebP`);
    const relatorio = [];
    arquivos.forEach((arquivo, i) => {
      const nome = arquivo.replace(/\.png$/i, '');
      if (!fs.existsSync(path.join(dirRecortadas, `${nome}.png`))) {
        // caiu num estágio anterior e já foi registrado lá
        if (!falhas.some((f) => f.arquivo === arquivo)) {
          falhas.push({ arquivo, erro: 'não chegou recortada ao estágio final' });
        }
        return;
      }
      try {
        const r = finalizar(arquivo, dirRecortadas, temp);
        relatorio.push(r);
        const kb = r.saidas.map((s) => `${s.lado}:${(s.bytes / 1024).toFixed(0)}KB`).join(' ');
        console.log(`  ${String(i + 1).padStart(3)}/${arquivos.length}  ${arquivo.padEnd(24)} ${r.para}  ${kb}`);
      } catch (erro) {
        falhas.push({ arquivo, erro: erro.message.split('\n')[0] });
        console.error(`  ${String(i + 1).padStart(3)}/${arquivos.length}  ${arquivo.padEnd(24)} FALHOU: ${erro.message.split('\n')[0]}`);
      }
    });

    const peso = relatorio.reduce((a, r) => a + r.saidas.reduce((b, s) => b + s.bytes, 0), 0);
    const minutos = ((Date.now() - relogio) / 60000).toFixed(1);

    console.log(`\n${relatorio.length}/${arquivos.length} imagens concluídas em ${minutos} min`);
    console.log(`  originais intocados  ${path.relative(RAIZ, ORIGINAIS)}`);
    console.log(`  PNG ${ESCALA}x            ${path.relative(RAIZ, SAIDA_PNG)}`);
    console.log(`  WebP do srcset       ${path.relative(RAIZ, SAIDA_WEB)}  (${(peso / 1048576).toFixed(1)} MB)`);
  } catch (erro) {
    console.error(`\nlote interrompido: ${erro.message}`);
    console.error(`o que já foi processado está em ${temp} — rodar de novo retoma dali`);
    process.exitCode = 1;
    return;
  }

  if (falhas.length) {
    console.error(`\n${falhas.length} falha(s):`);
    for (const f of falhas) console.error(`  ${f.arquivo}: ${f.erro}`);
    console.error(`intermediários mantidos em ${temp} para você rodar de novo e retomar`);
    process.exitCode = 1;
    return;
  }

  // só limpa quando tudo deu certo
  fs.rmSync(temp, { recursive: true, force: true });
}

main();
