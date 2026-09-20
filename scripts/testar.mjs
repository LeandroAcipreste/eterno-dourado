/**
 * Verificação do site num Chrome de verdade.
 *
 *   node scripts/testar.mjs           layout em 360/390/768/1024/1440 e interações
 *   node scripts/testar.mjs --texto   imprime também o texto visível por seção
 *   node scripts/testar.mjs --fotos   salva capturas na pasta temporária do sistema
 *
 * Sobe o próprio servidor e o próprio Chrome e, no fim, encerra só esses dois
 * processos. Imprime um resumo curto e as falhas; sai com código 1 se algo falhar.
 *
 * Páginas: a home (/) e cada src/pages/<nome>/<nome>.html. As interações de
 * uma página ficam em scripts/testes/<nome>.mjs.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { abrirChrome, abrirAba, esperar, subirServidor } from './cdp.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OPCOES = new Set(process.argv.slice(2));
const LARGURAS = [360, 390, 768, 1024, 1440];
const PASTA_FOTOS = path.join(os.tmpdir(), 'eterno-dourado-testes');
const NL = String.fromCharCode(10);

function listarPaginas() {
  const paginas = [{ nome: 'home', url: '/' }];
  const pasta = path.join(RAIZ, 'src/pages');
  for (const nome of fs.readdirSync(pasta)) {
    if (fs.existsSync(path.join(pasta, nome, `${nome}.html`))) {
      paginas.push({ nome, url: `/src/pages/${nome}/${nome}.html` });
    }
  }
  return paginas;
}

/* Roda dentro da página: precisa ser autocontida. */
function medirLayout() {
  const falhas = [];
  const estreito = innerWidth < 768;
  const nome = (e) => {
    const classe = typeof e.className === 'string' ? e.className.trim().split(/\s+/)[0] : '';
    return e.tagName.toLowerCase() + (e.id ? `#${e.id}` : '') + (classe ? `.${classe}` : '');
  };
  const visivel = (e) => {
    if (e.closest('[hidden], dialog:not([open]), .sr, .pular')) return false;
    const s = getComputedStyle(e);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const dentroDeRecorte = (e) => {
    for (let p = e.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') return true;
    }
    return false;
  };

  const excesso = document.documentElement.scrollWidth - innerWidth;
  if (excesso > 0) {
    const culpados = [...document.querySelectorAll('body *')]
      .filter((e) => e.getBoundingClientRect().right > innerWidth + 1 && !dentroDeRecorte(e))
      .slice(0, 5)
      .map(nome);
    falhas.push(`rolagem horizontal de ${excesso}px (${culpados.join(', ')})`);
  }

  const interativos = [
    ...document.querySelectorAll('a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"]'),
  ].filter(visivel);

  if (estreito) {
    for (const e of interativos) {
      if (getComputedStyle(e).display === 'inline' && e.closest('p')) continue; // link no meio da frase
      // tamanho de layout, sem transform: um cartão ainda entrando está com scale menor que 1
      const largura = e.offsetWidth;
      const altura = e.offsetHeight;
      if (largura < 44 || altura < 44) {
        falhas.push(`alvo de toque ${largura}x${altura}px: ${nome(e)}`);
      }
    }
    for (const e of document.querySelectorAll('main p, main li')) {
      if (!visivel(e) || e.closest('[class*="rotulo"]')) continue;
      const temTexto = [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      const tamanho = parseFloat(getComputedStyle(e).fontSize);
      if (temTexto && tamanho < 16) {
        falhas.push(`texto de ${tamanho}px no celular: ${nome(e)} "${e.textContent.trim().slice(0, 40)}"`);
      }
    }
  }

  // controle coberto por outra camada (overlay invisível, foto sobre canvas...)
  const y0 = scrollY;
  for (const e of interativos) {
    e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
    const topo = document.elementFromPoint(x, y);
    if (topo && !e.contains(topo)) falhas.push(`${nome(e)} coberto por ${nome(topo)}`);
  }
  window.scrollTo({ top: y0, behavior: 'instant' });

  let h1 = null;
  const titulo = document.querySelector('h1');
  if (titulo) {
    const s = getComputedStyle(titulo);
    const tamanho = Math.round(parseFloat(s.fontSize));
    const linhas = Math.round(titulo.getBoundingClientRect().height / (parseFloat(s.lineHeight) || tamanho * 1.2));
    h1 = `${tamanho}px/${linhas}l`;
    if (estreito && linhas > 3) falhas.push(`H1 em ${linhas} linhas`);
  }

  return { falhas, h1 };
}

/* Roda dentro da página: texto visível por seção, para revisar redundância. */
function textoPorSecao() {
  const limpar = (t) => t.replace(/\s+/g, ' ').trim();
  return [...document.querySelectorAll('header, main > section, footer, dialog')]
    .map((s) => {
      const rotulo = s.id || s.dataset.section || s.tagName.toLowerCase();
      return `[${rotulo}] ${limpar(s.tagName === 'DIALOG' ? s.textContent : s.innerText)}`;
    })
    .join(String.fromCharCode(10));
}

const falhas = [];
const errosDaPagina = new Set();
const passosOk = [];
const resumos = [];
const textos = [];

const servidor = await subirServidor();
let chrome = null;
try {
  chrome = await abrirChrome();
  const urls = new Map();
  chrome.conexao.on('Runtime.exceptionThrown', (p) => {
    const d = p.exceptionDetails;
    errosDaPagina.add(`JS: ${String(d.exception?.description ?? d.text).split(NL)[0]}`);
  });
  // erro que o site pegou e registrou também reprova: uma montagem que falha e segue
  // em silêncio deixava a página pela metade com a suíte dizendo que estava tudo bem
  chrome.conexao.on('Runtime.consoleAPICalled', (p) => {
    if (p.type !== 'error') return;
    const texto = p.args.map((a) => a.description ?? a.value ?? '').join(' ').split(NL)[0];
    errosDaPagina.add(`console: ${texto.slice(0, 160)}`);
  });
  chrome.conexao.on('Network.requestWillBeSent', (p) => urls.set(p.requestId, p.request.url));
  chrome.conexao.on('Network.loadingFailed', (p) => {
    if (p.errorText !== 'net::ERR_ABORTED') errosDaPagina.add(`rede: ${urls.get(p.requestId) ?? '?'} ${p.errorText}`);
  });
  chrome.conexao.on('Network.responseReceived', (p) => {
    if (p.response.status >= 400) errosDaPagina.add(`rede: ${p.response.url} HTTP ${p.response.status}`);
  });

  for (const pagina of listarPaginas()) {
    const url = servidor.base + pagina.url;
    const medidas = [];

    for (const largura of LARGURAS) {
      const toque = largura < 768;
      const aba = await abrirAba(chrome.conexao, { url, largura, altura: toque ? 844 : 900, toque });
      await esperar(1200); // dados carregados por fetch e fontes
      const { falhas: problemas, h1 } = await aba.ev(`(${medirLayout})()`);
      for (const problema of problemas) falhas.push(`${pagina.nome} ${largura}px · ${problema}`);
      if (h1) medidas.push(`${largura} ${h1}`);
      if (OPCOES.has('--fotos')) await aba.foto(path.join(PASTA_FOTOS, `${pagina.nome}-${largura}.png`));
      if (OPCOES.has('--texto') && largura === 1440) {
        textos.push(`## ${pagina.nome}${NL}${await aba.ev(`(${textoPorSecao})()`)}`);
      }
      await aba.fechar();
    }
    resumos.push(`${pagina.nome} · H1 ${medidas.join(' · ')}`);

    const roteiro = path.join(RAIZ, 'scripts/testes', `${pagina.nome}.mjs`);
    if (fs.existsSync(roteiro)) {
      const { default: testar } = await import(pathToFileURL(roteiro).href);
      await testar({
        abrir: (opcoes) => abrirAba(chrome.conexao, { url, ...opcoes }),
        ok: (nome) => passosOk.push(nome),
        falhar: (mensagem) => falhas.push(`${pagina.nome} · ${mensagem}`),
      });
    }
  }
} finally {
  // só os processos que este script abriu
  servidor.processo.kill();
  await chrome?.encerrar();
}

for (const resumo of resumos) console.log(resumo);
console.log(`interações ok: ${passosOk.length}${passosOk.length ? ` (${passosOk.join(', ')})` : ''}`);
if (textos.length) console.log(NL + textos.join(NL + NL));
if (OPCOES.has('--fotos')) console.log(`capturas em ${PASTA_FOTOS}`);

const todas = [...falhas, ...errosDaPagina];
console.log(todas.length ? `${NL}FALHAS (${todas.length})${NL}- ${todas.join(`${NL}- `)}` : 'nenhuma falha');
process.exit(todas.length ? 1 : 0);
