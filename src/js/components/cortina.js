/**
 * Arco da abertura: o véu em navy com filete de ouro que revela a primeira dobra,
 * como o arco do preloader do novo-site. Entre dobras não entra em cena — a troca
 * ali é o cruzamento de opacidade do contêiner.
 *
 * O CSS anima [data-estado] (coberta → revelando → parada); aqui o JS só troca o
 * atributo e espera a transição terminar.
 */

import { el, esperarTransicao } from '../utils/dom.js';

const dosQuadros = () => new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(resolver)));

export function montarCortina() {
  const cortina = el('[data-cortina]');

  return {
    /** Sai da tela e revela a dobra que já está montada. */
    async revelar() {
      if (!cortina) return;
      // o estado anterior precisa ser pintado antes, senão não existe transição
      await dosQuadros();
      cortina.dataset.estado = 'revelando';
      await esperarTransicao(cortina, 'translate', 1400);
      cortina.dataset.estado = 'parada';
    },
  };
}
