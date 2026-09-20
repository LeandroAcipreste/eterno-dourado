/**
 * Driver mínimo do Chrome DevTools Protocol, sem dependências (usa o WebSocket
 * global do Node 22+). Abre um Chrome headless próprio e abas com mouse,
 * toque e teclado de verdade.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const NL = String.fromCharCode(10);

const CAMINHOS_CHROME = [
  process.env.CHROME,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean);

export const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

class Conexao {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pendentes = new Map();
    this.ouvintes = new Map();
  }

  static async abrir(url) {
    const ws = new WebSocket(url);
    await new Promise((resolver, rejeitar) => {
      ws.onopen = resolver;
      ws.onerror = rejeitar;
    });
    const conexao = new Conexao(ws);
    ws.onmessage = (evento) => {
      const msg = JSON.parse(evento.data);
      if (msg.id != null) {
        const pendente = conexao.pendentes.get(msg.id);
        conexao.pendentes.delete(msg.id);
        if (!pendente) return;
        if (msg.error) pendente.rejeitar(new Error(JSON.stringify(msg.error)));
        else pendente.resolver(msg.result);
      } else {
        for (const ouvinte of conexao.ouvintes.get(msg.method) ?? []) ouvinte(msg.params);
      }
    };
    return conexao;
  }

  send(metodo, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolver, rejeitar) => {
      this.pendentes.set(id, { resolver, rejeitar });
      this.ws.send(JSON.stringify({ id, method: metodo, params, sessionId }));
    });
  }

  on(metodo, ouvinte) {
    if (!this.ouvintes.has(metodo)) this.ouvintes.set(metodo, []);
    this.ouvintes.get(metodo).push(ouvinte);
  }

  fechar() {
    this.ws.close();
  }
}

const PREFIXO_PERFIL = 'eterno-dourado-chrome-';

/** No Windows o Chrome demora a soltar os arquivos ao fechar: cada execução apaga só perfis com mais de 10 min. */
function limparPerfisAntigos() {
  const limite = Date.now() - 10 * 60 * 1000;
  for (const nome of fs.readdirSync(os.tmpdir())) {
    if (!nome.startsWith(PREFIXO_PERFIL)) continue;
    const caminho = path.join(os.tmpdir(), nome);
    try {
      if (fs.statSync(caminho).mtimeMs < limite) fs.rmSync(caminho, { recursive: true, force: true });
    } catch {
      /* ainda preso por um Chrome que está fechando */
    }
  }
}

export async function abrirChrome() {
  const executavel = CAMINHOS_CHROME.find((caminho) => fs.existsSync(caminho));
  if (!executavel) throw new Error('Chrome não encontrado; defina a variável de ambiente CHROME');

  const porta = 9300 + Math.floor(Math.random() * 500);
  // um perfil por execução, para dois scripts poderem usar o Chrome ao mesmo tempo
  limparPerfisAntigos();
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), PREFIXO_PERFIL));
  const processo = spawn(
    executavel,
    [
      `--remote-debugging-port=${porta}`,
      `--user-data-dir=${perfil}`,
      '--headless=new',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-features=Translate,BackForwardCache',
      '--force-device-scale-factor=1',
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  let info = null;
  for (let i = 0; i < 100 && !info; i++) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/json/version`);
      if (resposta.ok) info = await resposta.json();
    } catch {
      await esperar(200);
    }
  }
  if (!info) {
    processo.kill();
    throw new Error('Chrome não abriu');
  }

  const conexao = await Conexao.abrir(info.webSocketDebuggerUrl);
  return {
    conexao,
    async encerrar() {
      try {
        conexao.fechar();
      } catch {
        /* já fechada */
      }
      processo.kill(); // só o Chrome que este script abriu
    },
  };
}

/** Servidor estático do projeto (servidor.js) numa porta livre. Encerrar com processo.kill(). */
export async function subirServidor() {
  const porta = 8300 + Math.floor(Math.random() * 600);
  const processo = spawn(process.execPath, ['servidor.js', '.', String(porta)], {
    cwd: new URL('..', import.meta.url),
    stdio: 'ignore',
  });
  const base = `http://127.0.0.1:${porta}`;
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${base}/`)).ok) return { base, processo };
    } catch {
      await esperar(100);
    }
  }
  processo.kill();
  throw new Error('servidor não subiu');
}

const TECLAS = { Escape: 27, Enter: 13, Tab: 9 };

/**
 * Nova aba já navegada e carregada, com ações de usuário real.
 *  pula o preloader de 8 s (o site só o mostra uma vez por sessão do
 * navegador): a suíte abre dezenas de abas e esperaria 8 s em cada uma.
 */
export async function abrirAba(conexao, { url, largura, altura, toque = false, semAbertura = true, reduzido = false }) {
  const { targetId } = await conexao.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await conexao.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (metodo, params) => conexao.send(metodo, params, sessionId);

  await S('Runtime.enable');
  await S('Page.enable');
  await S('Network.enable');
  // o headless pode fingir reduced-motion e esconder animação quebrada; com reduzido:
  // true a aba passa a ser a máquina de quem desligou as animações no sistema
  await S('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: reduzido ? 'reduce' : 'no-preference' }],
  });
  await S('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: toque });
  if (toque) await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  if (semAbertura) {
    await S('Page.addScriptToEvaluateOnNewDocument', {
      source: "try { sessionStorage.setItem('eterno-dourado:sem-abertura', 'sim'); } catch {}",
    });
  }

  const ev = async (expressao) => {
    const r = await S('Runtime.evaluate', { expression: expressao, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      throw new Error(String(d.exception?.description ?? d.text).split(NL)[0]);
    }
    return r.result.value;
  };

  const esperarQue = async (expressao, ms) => {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      try {
        if ((await ev(expressao)) === true) return true;
      } catch {
        /* a página ainda não tem o elemento */
      }
      await esperar(200);
    }
    return false;
  };

  /** Centro do elemento na tela; falha se outro elemento estiver por cima. */
  const ponto = async (expressao, { rolar = true } = {}) => {
    const p = await ev(`(() => {
      const e = ${expressao};
      if (!e) return null;
      if (${rolar}) e.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      const r = e.getBoundingClientRect();
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      const t = document.elementFromPoint(x, y);
      const livre = !!t && (t === e || e.contains(t));
      return { x, y, topo: livre ? null : t ? t.tagName.toLowerCase() + '.' + String(t.className).split(' ')[0] : 'nada' };
    })()`);
    if (!p) throw new Error(`elemento não encontrado: ${expressao.slice(0, 90)}`);
    if (p.topo) throw new Error(`coberto por ${p.topo}`);
    return p;
  };

  /** { rolar: false } clica onde o elemento está, sem rolar a página até ele (útil dentro de palco preso). */
  const clicar = async (expressao, opcoes) => {
    const { x, y } = await ponto(expressao, opcoes);
    await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await S('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await esperar(350);
  };

  /** Arraste horizontal de dx pixels pelo centro do elemento: toque na aba de celular, mouse nas outras. */
  const arrastar = async (expressao, dx, passos = 10) => {
    const { x, y } = await ponto(expressao);
    const x0 = x - dx / 2;
    if (toque) {
      await S('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
      for (let i = 1; i <= passos; i++) {
        await S('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / passos, y }] });
        await esperar(16);
      }
      await S('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    } else {
      await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0, y });
      await S('Input.dispatchMouseEvent', { type: 'mousePressed', x: x0, y, button: 'left', buttons: 1, clickCount: 1 });
      for (let i = 1; i <= passos; i++) {
        await S('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x0 + (dx * i) / passos, y, button: 'left', buttons: 1 });
        await esperar(16);
      }
      await S('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x0 + dx, y, button: 'left', clickCount: 1 });
    }
  };

  const tecla = async (nome) => {
    const codigo = TECLAS[nome];
    await S('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: nome, code: nome, windowsVirtualKeyCode: codigo });
    await S('Input.dispatchKeyEvent', { type: 'keyUp', key: nome, code: nome, windowsVirtualKeyCode: codigo });
    await esperar(300);
  };

  const digitar = (texto) => S('Input.insertText', { text: texto });

  /** Um giro da roda do mouse no centro da janela. */
  const rolar = async (deltaY) => {
    await S('Input.dispatchMouseEvent', { type: 'mouseWheel', x: largura / 2, y: altura / 2, deltaX: 0, deltaY });
    await esperar(60);
  };

  /** PNG da janela; com { inteira: true }, da página toda. */
  const foto = async (arquivo, { inteira = false } = {}) => {
    const opcoes = { format: 'png' };
    if (inteira) {
      const metricas = await S('Page.getLayoutMetrics');
      const altura = Math.ceil((metricas.cssContentSize ?? metricas.contentSize).height);
      Object.assign(opcoes, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: largura, height: altura, scale: 1 } });
    }
    const captura = await S('Page.captureScreenshot', opcoes);
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });
    fs.writeFileSync(arquivo, Buffer.from(captura.data, 'base64'));
  };

  await S('Page.navigate', { url });
  // aba de fundo tem requestAnimationFrame estrangulado pelo Chrome: o que depende de
  // quadro (marcar a seção, mover a peça 3D) fica lento e o teste mede errado
  await S('Page.bringToFront').catch(() => {});
  // a página é única e carrega as cinco seções de uma vez; em aba de fundo isso demora
  if (!(await esperarQue('document.readyState === "complete"', 45000))) throw new Error(`não carregou: ${url}`);

  return {
    ev,
    esperarQue,
    clicar,
    arrastar,
    tecla,
    digitar,
    rolar,
    foto,
    fechar: () => conexao.send('Target.closeTarget', { targetId }),
  };
}
