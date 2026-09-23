/**
 * Fábrica do cartão do modelo.
 *
 * Um lugar só monta o cartão, e todos saem iguais: mesma estrutura, mesma ordem e
 * o mesmo tamanho, que vem do CSS (--cartao-largura e --cartao-altura). A foto
 * fica com o espaço que sobra depois do texto, e o texto encolhe junto com a tela
 * pelos clamps de catalogo.css — por isso a aliança aparece em qualquer largura.
 *
 * O que vale para a tabela inteira (forro, pedra) é escrito uma vez, no topo da
 * seção. O cartão só tem a marcação do forro, que soma o valor dele no preço.
 */

import { criar } from '../../js/utils/dom.js';
import { imagemDaPeca } from '../../js/utils/imagem.js';
import { dinheiro } from '../../js/utils/formato.js';
import { valorDaUnidade } from '../../js/precificacao.js';

/**
 * @param {object} modelo um item de src/data/modelos.json
 * @param {number} indice posição na vitrine: vira o atraso da entrada, em --d
 */
export function criarCartao(modelo, indice = 0) {
  const textoDoPreco = (forro) => `${dinheiro(valorDaUnidade(modelo, { forro }))} por aliança`;
  const preco = criar('p', {
    class: modelo.sobConsulta ? 'modelo__preco modelo__preco--consulta' : 'modelo__preco',
    texto: modelo.sobConsulta ? 'Valor sob consulta' : textoDoPreco(false),
  });

  // o forro soma no valor mostrado; sem valor (sob consulta) a linha fica vazia, só
  // para a foto ter a mesma altura em todos os cartões
  let forro = criar('div', { class: 'modelo__forro', 'aria-hidden': 'true' });
  if (!modelo.sobConsulta) {
    const marcar = criar('input', { type: 'checkbox', class: 'modelo__forro-marcar' });
    marcar.addEventListener('change', () => {
      preco.textContent = textoDoPreco(marcar.checked);
    });
    forro = criar('label', { class: 'modelo__forro' }, [
      marcar,
      criar('span', { class: 'modelo__forro-caixa', 'aria-hidden': 'true' }),
      criar('span', { texto: 'Com forro de aço inoxidável' }),
    ]);
  }

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
        preco,
        forro,
      ]),
    ]),
  );
}
