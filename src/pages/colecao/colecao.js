/** Coleção: o progresso da galeria presa em --p, para o CSS mover cada foto na velocidade dela. */

import { el } from '../../js/utils/dom.js';
import { aCadaQuadroDeRolagem, progressoDaSecao } from '../../js/utils/rolagem.js';

export function init({ container }) {
  const galeria = el('[data-colecao]', container);
  if (!galeria) return undefined;
  return aCadaQuadroDeRolagem(() => galeria.style.setProperty('--p', progressoDaSecao(galeria).toFixed(4)));
}
