/**
 * Entrada do site, que é uma página só com cinco seções.
 *
 * Tudo nasce uma vez: cabeçalho, menu, área do cliente, rolagem suave do Lenis, a
 * 03LM em 3D que percorre a página inteira e o JS de cada seção
 * (src/pages/<nome>/<nome>.js). O menu e o cabeçalho acompanham a seção em que a
 * pessoa está; quem decide isso é a rolagem, não uma troca de página.
 */

import { debounce, el, els } from './utils/dom.js';
import { montarCabecalho } from './components/cabecalho.js';
import { montarAreaCliente } from './components/area-cliente.js';
import { liberarPrimeiraDobra, montarAnimacao, prepararAnimacao, remedirAnimacao } from './components/animacao.js';
import { montarPreloader } from './components/preloader.js';
import { montarRolagemSuave } from './components/rolagem-suave.js';
import { aCadaQuadroDeRolagem } from './utils/rolagem.js';
import { quemEstaLogado, sair } from './utils/api.js';

const ESPERA_PELO_ANEL = 1200; // o 3D só começa a carregar depois que a abertura entra

const areaCliente = montarAreaCliente();
const cabecalho = montarCabecalho();
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

// sair vale de qualquer lugar: o menu do administrador tem o botão
document.addEventListener('click', async (evento) => {
  if (!evento.target.closest('[data-sair]')) return;
  await sair().catch(() => {});
  location.reload();
});

// botões de entrar existem no cabeçalho, no menu e em cada cartão criado depois
document.addEventListener('click', (evento) => {
  if (evento.target.closest('[data-entrar]')) areaCliente.abrir();
});

/**
 * Os links já apontam para o WhatsApp no HTML, e funcionam assim se o JS não rodar.
 * Com JS, eles passam por /obrigado levando a mensagem: é essa página no próprio site
 * que permite medir o contato (o Google Ads não conta uma saída direta para o wa.me).
 */
function ligarLinksWhatsApp(raiz) {
  for (const link of els('[data-whatsapp]', raiz)) {
    link.href = `/src/pages/obrigado/obrigado.html?texto=${encodeURIComponent(link.dataset.whatsapp)}`;
    link.removeAttribute('target');
    link.removeAttribute('rel');
  }
}

/**
 * Todo link para uma seção desta página desliza até ela, venha do menu ou de um botão
 * no meio do conteúdo ("Abrir catálogo", "Torne-se cliente"). Pular para o conteúdo
 * fica de fora: quem usa teclado quer chegar no ato, não assistir à viagem.
 */
function ligarMenu() {
  document.addEventListener('click', (evento) => {
    const link = evento.target.closest('a[href^="#"]:not(.pular)');
    if (!link) return;
    const secao = link.dataset.pagina ?? link.getAttribute('href').slice(1);
    const destino = el(`#${secao}`);
    if (!destino) return;
    evento.preventDefault();
    cabecalho.fecharMenu();
    // marca na hora: esperar a rolagem chegar deixaria o menu sem resposta no clique
    cabecalho.marcarPagina(secao);
    rolagem.ir(destino.getBoundingClientRect().top + window.scrollY, { suave: true });
    // sem gravar #seção na URL: recarregar a página tem que voltar para a abertura
  });
}

/**
 * A visita começa sempre na abertura. Nem a posição guardada pelo navegador, nem uma
 * âncora na URL (que o navegador reaplica no load), nem o Lenis, que nasce com a
 * posição antiga, podem jogar a pessoa no meio da página.
 */
function irParaAbertura() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  window.scrollTo(0, 0);
  rolagem.ir(0);
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
    `cabeçalho=${document.documentElement.dataset.pronto !== undefined ? 'desceu' : 'ainda em cima'}`,
    `anel=${el('[data-anel3d]')?.classList.contains('is-pronto') ? 'pronto' : 'não subiu'}`,
  ].join(' · ');

  if (problemas.length) console.warn(`[Eterno Dourado 18/09] hero · ${relatorio} · PROBLEMA: ${problemas.join('; ')}`);
  else console.info(`[Eterno Dourado 18/09] hero · ${relatorio} · tudo certo`);
}

async function iniciar() {
  // a visita começa sempre na abertura: nem a posição guardada pelo navegador nem uma
  // âncora na URL podem jogar a pessoa no meio da página enquanto o nome ainda gira
  history.scrollRestoration = 'manual';
  irParaAbertura();
  // voltando pelo botão Voltar, a página sai do cache já rolada
  window.addEventListener('pageshow', (evento) => {
    if (evento.persisted) irParaAbertura();
  });
  preloader.abrir(); // começa a contar o tempo mínimo já, não depois de montar tudo
  ligarLinksWhatsApp(document);
  prepararAnimacao(document); // o texto já nasce escondido, atrás da abertura
  ligarMenu();
  acompanharSecoes();
  // quem já entrou vê o menu da conta dele, não as cinco seções do visitante
  quemEstaLogado().then((cliente) => cabecalho.mostrarConta(cliente));

  // a página cuida das dobras dela; daqui para baixo, só o que é global
  try {
    const { init } = await import(`../pages/${document.body.dataset.page}/${document.body.dataset.page}.js`);
    await init({ container: document, areaCliente });
  } catch (erro) {
    console.error('a página não subiu por completo:', erro);
  }

  rolagem.medir();
  // os gatilhos nascem e medem a página enquanto a abertura ainda cobre a tela; o que
  // já está visível fica segurado, para a primeira dobra não entrar por trás dela
  montarAnimacao(document, { segurar: true });
  remedirAnimacao();


  // só agora a abertura pode sair: a página está medida, a fonte chegou e a primeira
  // dobra tem o que mostrar. Antes disso, sair é entregar uma tela se montando.
  // a roda apaga primeiro; o painel ainda cobre a tela
  await preloader.apagarRoda();

  // a dobra é liberada com o painel ainda em cima: quando ele descer, a hero já está
  // entrando, em vez de aparecer parada esperando a vez dela
  liberarPrimeiraDobra();
  await preloader.descer();

  // A página só tem a altura final depois das fontes, das imagens e dos cartões do
  // catálogo. As faixas de rolagem dos títulos são contas em cima dessa geometria:
  // sem refazê-las aqui, elas apontam para onde a página não está mais, e o título
  // nunca chega a aparecer.
  const remedirTudo = () => {
    rolagem.medir();
    remedirAnimacao();
    anel?.medirTrilha();
  };
  remedirTudo();
  document.fonts?.ready.then(remedirTudo).catch(() => {});
  window.addEventListener('resize', debounce(remedirTudo, 200));
  setTimeout(remedirTudo, 2500);

  // O giro das letras é da chegada, e só dela: na volta do scroll o CSS já traz a letra
  // sem rotação ([data-anim="giro"][data-de="cima"]). Trocar o data-anim por aqui, como
  // se fazia, cortava a chegada no meio: as regras do giro paravam de valer e toda letra
  // que ainda não tinha tido a vez perdia o opacity: 0 e surgia de uma vez.
  await new Promise((resolver) => setTimeout(resolver, 700));
  document.documentElement.dataset.pronto = ''; // e o cabeçalho desce por último

  // a 03LM por último: o three.js e o GLB custam segundos de fio principal nesta
  // máquina, e durante a abertura isso congelava o nome girando
  setTimeout(subirAnel, ESPERA_PELO_ANEL);
  setTimeout(conferirAbertura, 1400); // com a entrada já terminada, o relato é o que se vê
}

iniciar().catch((erro) => console.error('o site não subiu por completo:', erro));
