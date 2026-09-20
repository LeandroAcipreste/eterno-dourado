/**
 * Motor de preço. Funções puras: nada de DOM aqui.
 *
 * Regras do cliente, para atacado:
 *   · o valor da tabela é de UMA aliança; o par é o dobro;
 *   · forro de aço inoxidável soma R$ 8,00 por aliança;
 *   · cada pedra acrescentada soma R$ 2,00, e isso vale só para modelo liso
 *     ou de pedra única. Em solitário e meia aliança as pedras já estão no
 *     valor da tabela, então não somam nada.
 *
 * Conferência com o pedido real de 18/08: 303LM custa R$ 34,70 na tabela e foi
 * faturado a R$ 42,70 com forro de aço. 34,70 + 8,00 = 42,70.
 */

export const ADICIONAL_FORRO = 8;
export const ADICIONAL_PEDRA = 2;
export const ALIANCAS_POR_PAR = 2;

/** Centavos, para a soma não acumular erro de ponto flutuante. */
const centavos = (reais) => Math.round(reais * 100);
const reais = (cent) => cent / 100;

/**
 * Monta a conta de uma aliança, linha por linha, para a interface poder
 * mostrar de onde vem o número.
 *
 * @param {object} modelo item de src/data/modelos.json
 * @param {{forro?: boolean, pedras?: number}} opcoes
 * @returns {{linhas: Array<{rotulo: string, valor: number|null}>, unidade: number|null, par: number|null, sobConsulta: boolean}}
 */
export function contaDaUnidade(modelo, opcoes = {}) {
  const forro = Boolean(opcoes.forro);
  const pedras = pedrasValidas(modelo, opcoes.pedras);

  if (!modelo || modelo.sobConsulta) {
    const linhas = [{ rotulo: 'Tabela', valor: null }];
    if (forro) linhas.push({ rotulo: 'Forro de aço inoxidável', valor: ADICIONAL_FORRO });
    if (pedras > 0) linhas.push({ rotulo: rotuloPedras(pedras), valor: pedras * ADICIONAL_PEDRA });
    return { linhas, unidade: null, par: null, sobConsulta: true };
  }

  const linhas = [{ rotulo: `Tabela · ${modelo.codigoTabela}`, valor: modelo.precoUnidade }];
  let total = centavos(modelo.precoUnidade);

  if (forro) {
    linhas.push({ rotulo: 'Forro de aço inoxidável', valor: ADICIONAL_FORRO });
    total += centavos(ADICIONAL_FORRO);
  }

  if (pedras > 0) {
    const valor = pedras * ADICIONAL_PEDRA;
    linhas.push({ rotulo: rotuloPedras(pedras), valor });
    total += centavos(valor);
  }

  return {
    linhas,
    unidade: reais(total),
    par: reais(total * ALIANCAS_POR_PAR),
    sobConsulta: false,
  };
}

function rotuloPedras(quantidade) {
  return quantidade === 1 ? '1 pedra acrescentada' : `${quantidade} pedras acrescentadas`;
}

/** Solitário e meia aliança não aceitam pedra avulsa: a contagem volta a zero. */
export function pedrasValidas(modelo, quantidade) {
  if (!modelo?.aceitaPedraAvulsa) return 0;
  const n = Number.parseInt(quantidade, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 30);
}

/** Só o valor da unidade, sem as linhas. Devolve null quando é sob consulta. */
export function valorDaUnidade(modelo, opcoes) {
  return contaDaUnidade(modelo, opcoes).unidade;
}

/**
 * Fecha o pedido inteiro na mesma ordem da folha de pedido do cliente:
 * soma das linhas → desconto → frete → total do pedido.
 *
 * Itens sob consulta contam nas peças e ficam fora dos valores.
 *
 * @param {Array<{modelo: object, forro: boolean, pedras: number, numeracao: number, qt: number}>} itens
 * @param {{desconto?: number, frete?: number}} ajustes
 */
export function fecharPedido(itens, ajustes = {}) {
  const desconto = faixa(ajustes.desconto, 0, 100, 0);
  const frete = Math.max(0, Number(ajustes.frete) || 0);

  let bruto = 0;
  let pecas = 0;
  let pecasSobConsulta = 0;

  for (const item of itens) {
    const qt = Math.max(0, Number.parseInt(item.qt, 10) || 0);
    if (qt === 0) continue;
    pecas += qt;

    const unidade = valorDaUnidade(item.modelo, item);
    if (unidade === null) {
      pecasSobConsulta += qt;
      continue;
    }
    bruto += centavos(unidade) * qt;
  }

  const abatimento = Math.round((bruto * desconto) / 100);
  const comDesconto = bruto - abatimento;
  const pedido = comDesconto + centavos(frete);

  return {
    pecas,
    pecasSobConsulta,
    temSobConsulta: pecasSobConsulta > 0,
    bruto: reais(bruto),
    desconto,
    abatimento: reais(abatimento),
    comDesconto: reais(comDesconto),
    frete,
    pedido: reais(pedido),
  };
}

function faixa(valor, min, max, padrao) {
  const n = Number(valor);
  if (!Number.isFinite(n)) return padrao;
  return Math.min(max, Math.max(min, n));
}

/**
 * Etiqueta de referência de um item, no espírito da folha de pedido, onde a
 * coluna "Referência" carrega o código e as variações ("302LM C 5MM").
 */
export function referenciaDoItem({ modelo, forro, pedras }) {
  const partes = [modelo.code];
  if (forro) partes.push('aço');
  const n = pedrasValidas(modelo, pedras);
  if (n > 0) partes.push(n === 1 ? '1 pedra' : `${n} pedras`);
  return partes.join(' · ');
}

/** Chave de agrupamento: o mesmo modelo com as mesmas opções é um grupo só. */
export function chaveDoGrupo({ code, forro, pedras }) {
  return `${code}|${forro ? 'aco' : 'liso'}|${pedras || 0}`;
}
