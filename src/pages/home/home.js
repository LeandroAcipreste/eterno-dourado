/**
 * JS da home, que é o site inteiro: uma página com cinco dobras.
 *
 * Monta as dobras que têm JS próprio, cada uma da pasta dela. Como-comprar e
 * nossa-história são só HTML e CSS, e por isso não aparecem aqui.
 *
 * Quem chama este arquivo é o main.js, que não conhece as dobras: ele liga o que é
 * global (cabeçalho, menu, rolagem, 03LM) e entrega a página para cá.
 */

import { init as iniciarAbertura } from './abertura/abertura.js';
import { init as iniciarColecao } from './colecao/colecao.js';
import { init as iniciarCatalogo } from './catalogo/catalogo.js';

const DOBRAS = [
  ['abertura', iniciarAbertura],
  ['coleção', iniciarColecao],
  ['catálogo', iniciarCatalogo],
];

/**
 * @param {{container: ParentNode, areaCliente: object}} contexto
 * @returns {Promise<Array<Function|undefined>>} o que cada dobra devolve para desligar
 */
export async function init(contexto) {
  const desligar = [];
  for (const [nome, iniciar] of DOBRAS) {
    // uma dobra que falha não pode levar as outras junto: o resto da página continua
    try {
      desligar.push(await iniciar(contexto));
    } catch (erro) {
      console.error(`a dobra ${nome} não subiu por completo:`, erro);
    }
  }
  return desligar;
}
