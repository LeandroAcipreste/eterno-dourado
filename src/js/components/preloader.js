/**
 * Abertura: a 03LM gira no centro da tela por 5 s e a hero se abre de dentro dela.
 *
 * O painel escuro cobre a página; o canvas da 03LM fica por cima dele enquanto
 * html[data-abertura] existir. Passados os 5 s, o painel ganha um furo no centro que
 * cresce até a tela inteira (máscara animada no CSS; o JS só marca data-abre).
 * Se a 03LM não carregar, o furo abre do mesmo jeito aos 5 s.
 *
 * Acontece em todo carregamento. A suíte de testes desliga pela chave de config.js.
 */

import { el } from '../utils/dom.js';
import { emTeste } from '../config.js';

const DURACAO = 5000; // a 03LM girando antes de a hero abrir
const TETO_HERO = 6000; // o quanto se espera pela fonte e imagem da hero
const FURO = 1000; // o furo crescendo até a tela inteira, igual ao do CSS

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const doisQuadros = () =>
  new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(resolver)));

/** Fonte carregada, imagem da hero decodificada e um quadro pintado com tudo no lugar. */
async function heroPronta() {
  await document.fonts?.ready.catch(() => {});
  const hero = el('[data-abertura]');
  const imagens = hero ? [...hero.querySelectorAll('img')] : [];
  await Promise.all(imagens.map((img) => (img.complete ? null : img.decode().catch(() => {}))));
  await doisQuadros();
}

export function montarPreloader() {
  const preloader = el('[data-preloader]');
  if (preloader && emTeste()) preloader.remove();

  const ativo = () => Boolean(preloader?.isConnected);
  let comecou = performance.now();

  return {
    /** A abertura vai acontecer? Decide se a 03LM sobe já no começo. */
    get ativo() {
      return ativo();
    },

    /** Começa a contar os 5 s e põe a 03LM por cima do painel. */
    abrir() {
      if (!ativo()) return;
      comecou = performance.now();
      document.documentElement.dataset.abertura = '';
    },

    /** Resolve quando os 5 s da abertura passaram. Sem abertura, na hora. */
    esperarAbertura() {
      if (!ativo()) return Promise.resolve();
      return esperar(Math.max(0, DURACAO - (performance.now() - comecou)));
    },

    /** Fonte e imagem da hero prontas, com teto. */
    esperarHero: () => Promise.race([heroPronta(), esperar(TETO_HERO)]),

    /** O furo abre e cresce até a tela inteira; a 03LM volta para baixo do conteúdo. */
    async abrirFuro() {
      if (!ativo()) return;
      const chegou = new Promise((resolver) => {
        const aoFim = (evento) => {
          if (evento.target !== preloader || evento.animationName !== 'preloader-furo') return;
          preloader.removeEventListener('animationend', aoFim);
          clearTimeout(reserva);
          resolver();
        };
        const reserva = setTimeout(resolver, FURO + 400); // aba em segundo plano não anima
        preloader.addEventListener('animationend', aoFim);
      });
      preloader.setAttribute('data-abre', '');
      await chegou;
      preloader.remove();
      delete document.documentElement.dataset.abertura;
    },
  };
}
