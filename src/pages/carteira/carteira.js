/**
 * Minha carteira: a divisão do dinheiro de cada pedido.
 *
 * A conta é a regra do Leandro, escrita uma vez em precificacao.js: a fábrica fica
 * com 50% do valor de tabela mais o frete; a comissão é a outra metade, menos o
 * desconto dado ao cliente e menos o frete, quando ele está incluso.
 *
 * Os valores vêm do pedido como ele foi fechado, não da tabela de hoje.
 */

import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { escapar } from '../../js/utils/dom.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';
import { dividirPedido } from '../../js/precificacao.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');

const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');
const data = (iso) => new Date(iso).toLocaleDateString('pt-BR');

function avisar(texto, { erro = false } = {}) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  aviso.dataset.erro = erro ? 'sim' : 'nao';
}

/** O pedido com a divisão já feita, para a tabela e os totais lerem o mesmo. */
function comDivisao(p) {
  const clientePagaFrete = p.frete_pago_pelo_cliente !== false;
  const divisao = dividirPedido({
    bruto: Number(p.total_bruto),
    abatimento: Number(p.abatimento),
    frete: Number(p.frete),
    clientePagaFrete,
  });
  return { ...p, clientePagaFrete, ...divisao };
}

function desenhar(pedidos) {
  el('[data-contagem]').textContent = `(${pedidos.length})`;
  el('[data-pedidos]').replaceChildren(
    ...pedidos.map((p) => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td><strong>${p.numero}</strong><span class="admin__cidade">${data(p.criado_em)}</span></td>
        <td>${escapar(p.cliente_nome)}</td>
        <td>${dinheiro(p.total_bruto)}</td>
        <td>${Number(p.desconto) > 0 ? `${Number(p.desconto)}% · ${dinheiro(p.abatimento)}` : '—'}</td>
        <td>${Number(p.frete) > 0 ? `${dinheiro(p.frete)}<span class="admin__cidade">${p.clientePagaFrete ? 'cliente paga' : 'por minha conta'}</span>` : '—'}</td>
        <td>${dinheiro(p.total)}</td>
        <td>${dinheiro(p.fabrica)}</td>
        <td class="carteira__comissao">${dinheiro(p.comissao)}</td>`;
      return linha;
    }),
  );
}

function somar(pedidos) {
  const soma = (pegar) => pedidos.reduce((total, p) => total + Number(pegar(p)), 0);
  el('[data-total-comissao]').textContent = `R$ ${dinheiro(soma((p) => p.comissao))}`;
  el('[data-total-fabrica]').textContent = `R$ ${dinheiro(soma((p) => p.fabrica))}`;
  el('[data-total-faturado]').textContent = `R$ ${dinheiro(soma((p) => p.total))}`;
  el('[data-total-desconto]').textContent = `R$ ${dinheiro(soma((p) => p.abatimento))}`;
  el('[data-total-frete]').textContent = `R$ ${dinheiro(soma((p) => p.freteNaComissao))}`;
}

async function carregar() {
  const { pedidos } = await pedir('/api/financeiro');
  const contas = pedidos.map(comDivisao);
  desenhar(contas);
  somar(contas);
  if (contas.length === 0) avisar('Nenhum pedido fechado ainda: a carteira começa no primeiro.');
}

const cliente = await quemEstaLogado();
if (!cliente) {
  avisar('Entre para abrir a carteira.', { erro: true });
  montarAreaCliente().abrir();
} else if (!cliente.admin) {
  avisar(`${cliente.nome}, esta página é do administrador.`, { erro: true });
} else {
  painel.hidden = false;
  await carregar().catch((erro) => avisar(erro.message, { erro: true }));
}
