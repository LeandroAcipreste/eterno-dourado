/**
 * Fábrica do cartão do modelo.
 *
 * Um lugar só monta o cartão, e todos saem iguais: mesma estrutura, mesma ordem e
 * o mesmo tamanho, que vem do CSS (--cartao-largura e --cartao-altura). A foto
 * fica com o espaço que sobra depois do texto, e o texto encolhe junto com a tela
 * pelos clamps de catalogo.css — por isso a aliança aparece em qualquer largura.
 *
 * O que vale para a tabela inteira (forro, pedra) não entra aqui: é escrito uma
 * vez, no topo da seção.
 */

import { criar } from '../../js/utils/dom.js';
import { imagemDaPeca } from '../../js/utils/imagem.js';
import { dinheiro } from '../../js/utils/formato.js';

/**
 * @param {object} modelo um item de src/data/modelos.json
 * @param {number} indice posição na vitrine: vira o atraso da entrada, em --d
 */
export function criarCartao(modelo, indice = 0) {
  const preco = modelo.sobConsulta ? 'Valor sob consulta' : `${dinheiro(modelo.precoUnidade)} por aliança`;

  return criar(
    'li',
    { class: 'modelo', estilo: `--d: ${indice * 70}` },
    criar('article', { class: 'modelo__cartao' }, [
      criar(
        'div',
        { class: 'modelo__foto' },
        imagemDaPeca(modelo, { classe: 'modelo__img', sizes: '(max-width: 599px) 70vw, 300px', alt: '' }),
      ),
      criar('div', { class: 'modelo__texto' }, [
        criar('p', { class: 'rotulo modelo__codigo', texto: modelo.code }),
        modelo.descricaoTabela && criar('h3', { class: 'modelo__nome', texto: modelo.descricaoTabela }),
        criar('p', {
          class: modelo.sobConsulta ? 'modelo__preco modelo__preco--consulta' : 'modelo__preco',
          texto: preco,
        }),
      ]),
    ]),
  );
}
