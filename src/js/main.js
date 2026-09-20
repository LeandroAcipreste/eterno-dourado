/**
 * Entrada do site, que é uma página só com cinco seções.
 *
 * Tudo nasce uma vez: cabeçalho, menu, área do cliente, rolagem suave do Lenis, a
 * 03LM em 3D que percorre a página inteira e o JS de cada seção
 * (src/pages/<nome>/<nome>.js). O menu e o cabeçalho acompanham a seção em que a
 * pessoa está; quem decide isso é a rolagem, não uma troca de página.
 */

import { el, els } from './utils/dom.js';
import { linkWhatsApp } from './utils/whatsapp.js';
import { montarCabecalho } from './components/cabecalho.js';
import { montarAreaCliente } from './components/area-cliente.js';
import { liberarPrimeiraDobra, montarAnimacao, prepararAnimacao, remedirAnimacao } from './components/animacao.js';
import { montarCortina } from './components/cortina.js';
import { montarPreloader } from './components/preloader.js';
import { montarRolagemSuave } from './components/rolagem-suave.js';
import { aCadaQuadroDeRolagem } from './utils/rolagem.js';

// seções com JS próprio; as outras são só HTML e CSS
const SECOES_COM_JS = ['home', 'colecao', 'catalogo'];
const ESPERA_PELO_ANEL = 3000; // teto da espera pelo 3D antes de revelar a página

const areaCliente = montarAreaCliente();
const cabecalho = montarCabecalho();
const cortina = montarCortina();
const preloader = montarPreloader();
const rolagem = montarRolagemSuave();
let anel = null;

const SECOES = els('[data-dobra]');

/**
 * O three.js e o GLB custam segundos de fio principal nesta máquina: são chamados com
 * a abertura ainda na tela, para o engasgo cair onde ninguém está olhando.
 */
async function subirAnel() {
  try {
    const { montarAnel3d } = await import('./components/anel3d.js');
    anel = montarAnel3d();
    anel.medirTrilha();
  } catch (erro) {
    console.error('a 03LM não subiu:', erro);
  }
}

// botões de entrar existem no cabeçalho, no menu e em cada cartão criado depois
document.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-entrar]')) areaCliente.abrir();
});

/** Os links já apontam para o WhatsApp no HTML; aqui ganham a mensagem pronta. */
function ligarLinksWhatsApp(raiz) {
  for (const link of els('[data-whatsapp]', raiz)) {
    link.href = linkWhatsApp(link.dataset.whatsapp);
    link.target = '_blank';
    link.rel = 'noopener';
  }
}

/** O menu leva a uma seção com a mesma rolagem suave do resto do site. */
function ligarMenu() {
  document.addEventListener('click', (evento) => {
    const link = evento.target.closest('[data-menu] [data-pagina]');
    if (!link) return;
    const destino = el(`#${link.dataset.pagina}`);
    if (!destino) return;
    evento.preventDefault();
    cabecalho.fecharMenu();
    // marca na hora: esperar a rolagem chegar deixaria o menu sem resposta no clique
    cabecalho.marcarPagina(link.dataset.pagina);
    rolagem.ir(destino.getBoundingClientRect().top + window.scrollY, { suave: true });
    history.replaceState(null, '', `#${link.dataset.pagina}`);
  });
}

/**
 * A seção que ocupa mais tela é a seção atual: é o que o cabeçalho mostra. A 03LM
 * não depende disso: ela segue a trilha contínua da página.
 */
function acompanharSecoes() {
  let atual = null;
  // a seção atual é a que ocupa mais tela. Pelo meio da tela, uma seção mais baixa
  // que meia janela nunca seria escolhida; por observador, seria a última a entrar.
  const conferir = () => {
    let melhor = null;
    let maior = 0;
    for (const s of SECOES) {
      const r = s.getBoundingClientRect();
      const visivel = Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0);
      if (visivel > maior) {
        maior = visivel;
        melhor = s;
      }
    }
    const secao = melhor;
    if (!secao || secao === atual) return;
    atual = secao;
    cabecalho.marcarPagina(secao.dataset.dobra);
  };
  aCadaQuadroDeRolagem(conferir);
}

/**
 * Diz no console como a abertura ficou de verdade, e não só que o código rodou: o que
 * está marcado, o que tem gatilho, se o título entrou e o que ele mostra na tela. Cada
 * linha com PROBLEMA é uma causa provável de a hero parecer parada.
 */
function conferirAbertura() {
  const secao = el('[data-abertura]');
  const titulo = el('#home h1');
  if (!secao || !titulo) {
    console.warn('[Eterno Dourado 18/09] hero · PROBLEMA: a seção da abertura ou o título não existem no HTML');
    return;
  }

  const span = titulo.querySelector('.palavra > span');
  const estado = span ? getComputedStyle(span) : null;
  const problemas = [];
  if (!window.gsap || !window.ScrollTrigger) problemas.push('GSAP não carregou: nada anima por rolagem');
  if (!span) problemas.push('o título não foi dividido em palavras');
  if (titulo.dataset.dentro === undefined) problemas.push('o título não entrou (data-dentro ausente)');
  if (estado && parseFloat(estado.translate) !== 0) problemas.push(`a palavra parou fora do lugar (translate ${estado.translate})`);
  if (getComputedStyle(titulo).opacity !== '1') problemas.push(`o título está com opacidade ${getComputedStyle(titulo).opacity}`);
  if (getComputedStyle(el('.abertura__conteudo')).opacity !== '1') problemas.push('o bloco de texto da abertura está apagado');

  const relatorio = [
    `gatilhos=${window.ScrollTrigger ? ScrollTrigger.getAll().length : 0}`,
    `marcados na abertura=${els('[data-anim]', secao).length}`,
    `título=${titulo.dataset.dentro !== undefined ? 'dentro' : 'fora'}`,
    `palavras=${titulo.querySelectorAll('.palavra').length}`,
    `cortina=${el('[data-cortina]')?.dataset.estado}`,
    `cabeçalho=${document.documentElement.dataset.pronto !== undefined ? 'desceu' : 'ainda em cima'}`,
    `anel=${el('[data-anel3d]')?.classList.contains('is-pronto') ? 'pronto' : 'não subiu'}`,
  ].join(' · ');

  if (problemas.length) console.warn(`[Eterno Dourado 18/09] hero · ${relatorio} · PROBLEMA: ${problemas.join('; ')}`);
  else console.info(`[Eterno Dourado 18/09] hero · ${relatorio} · tudo certo`);
}

async function iniciar() {
  history.scrollRestoration = 'manual';
  const abertura = preloader.abrir(); // começa a contar já, não depois de montar tudo
  ligarLinksWhatsApp(document);
  prepararAnimacao(document); // o texto já nasce escondido, atrás da abertura
  ligarMenu();
  acompanharSecoes();

  for (const nome of SECOES_COM_JS) {
    try {
      const { init } = await import(`../pages/${nome}/${nome}.js`);
      await init({ container: document, areaCliente });
    } catch (erro) {
      console.error(`a seção ${nome} não subiu por completo:`, erro);
    }
  }

  rolagem.medir();
  // os gatilhos nascem e medem a página enquanto a abertura ainda cobre a tela; o que
  // já está visível fica segurado, para a primeira dobra não entrar por trás dela
  montarAnimacao(document, { segurar: true });
  remedirAnimacao();

  // a 03LM começa a subir agora, com a abertura ainda cobrindo a tela: o three.js e o
  // GLB custam segundos de fio principal, e é aqui que ninguém vê. A roda do nome gira
  // no compositor, então ela continua girando mesmo com o fio travado.
  const anel3d = subirAnel();

  await abertura; // os 8 s do nome girando correm desde a primeira pintura
  // se o 3D ainda estiver travando o fio, a dobra espera um pouco: ela não pode entrar
  // em cima de um engasgo. Mas espera com teto, senão uma máquina lenta prenderia
  // a pessoa na abertura.
  await Promise.race([anel3d, new Promise((resolver) => setTimeout(resolver, ESPERA_PELO_ANEL))]);
  await cortina.revelar();

  liberarPrimeiraDobra(); // agora sim, a abertura entra: nada a medir, nada a travar
  await new Promise((resolver) => setTimeout(resolver, 700));
  document.documentElement.dataset.pronto = ''; // e o cabeçalho desce por último
  setTimeout(conferirAbertura, 1400); // com a entrada já terminada, o relato é o que se vê
}

iniciar().catch((erro) => console.error('o site não subiu por completo:', erro));
