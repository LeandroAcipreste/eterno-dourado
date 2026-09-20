/**
 * Rolagem suave do Lenis, com os mesmos ajustes do novo-site: duração 1,2 s, roda
 * suavizada, toque com multiplicador 2 e a curva exponencial. É o que dá a sensação
 * de o site "deslizar" em vez de pular de linha em linha.
 *
 * O Lenis rola a janela de verdade (não é transform), então scrollY, position:
 * sticky e as medidas das páginas continuam valendo. Sem a biblioteca, ou com
 * movimento reduzido, o site segue com a rolagem do navegador.
 */

import { movimentoReduzido } from '../utils/dom.js';

const SEM_LENIS = {
  parar() {},
  seguir() {},
  ir(y, { suave = false } = {}) {
    window.scrollTo({ top: y, behavior: suave ? 'smooth' : 'instant' });
  },
  medir() {},
};

export function montarRolagemSuave() {
  if (!window.Lenis) return SEM_LENIS;

  const lenis = new window.Lenis({
    // com movimento reduzido a rolagem assenta mais rápido, mas continua suave
    duration: movimentoReduzido() ? 0.7 : 1.2,
    smoothWheel: true,
    // cada giro de roda anda pouco mais da metade: a página desliza em vez de disparar
    wheelMultiplier: 0.6,
    touchMultiplier: 2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    infinite: false,
  });

  // o ScrollTrigger precisa saber que a página andou: quem rola aqui é o Lenis
  lenis.on('scroll', () => window.ScrollTrigger?.update());

  const quadro = (tempo) => {
    lenis.raf(tempo);
    requestAnimationFrame(quadro);
  };
  requestAnimationFrame(quadro);

  return {
    /** Trava a rolagem enquanto a dobra sai. */
    parar: () => lenis.stop(),
    seguir: () => lenis.start(),
    /** Vai a uma posição: direto, ou deslizando quando o menu pede. */
    ir: (y, { suave = false } = {}) => lenis.scrollTo(y, suave ? { duration: 1.4 } : { immediate: true, force: true }),
    /** A dobra nova tem outra altura: o Lenis precisa remedir. */
    medir: () => lenis.resize(),
  };
}
