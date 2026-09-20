/**
 * Início: a abertura presa, com o progresso da rolagem em --p para o CSS
 * empurrar o título e apagar a arte, e a contagem de modelos.
 */

import { el, els } from '../../js/utils/dom.js';
import { carregarModelos } from '../../js/utils/modelos.js';
import { aCadaQuadroDeRolagem, progressoDaSecao } from '../../js/utils/rolagem.js';

export function init({ container }) {
  carregarModelos()
    .then(({ modelos }) => {
      for (const alvo of els('[data-contagem-modelos]', container)) alvo.textContent = String(modelos.length);
    })
    .catch((erro) => console.error('contagem de modelos indisponível:', erro));

  const abertura = el('[data-abertura]', container);
  if (!abertura) return undefined;
  return aCadaQuadroDeRolagem(() => abertura.style.setProperty('--p', progressoDaSecao(abertura).toFixed(4)));
}
