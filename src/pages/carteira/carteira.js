// Carteira: saldo com a fábrica, totais gerais, card de acerto e pedidos por mês.

import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { montarMenuDoPainel } from '../../js/components/cabecalho.js';
import { escapar } from '../../js/utils/dom.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';
import { dividirPedido } from '../../js/precificacao.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const formaAcerto = el('[data-forma-acerto]');
const campoPedido = el('[data-acerto-pedido]');
const campoForma = el('[data-acerto-forma]');

const reais = (valor) => `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');
const data = (iso) => new Date(iso).toLocaleDateString('pt-BR');
// data sem hora, sem fuso
const dataDoDia = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
const chaveDoMes = (iso) => new Date(iso).toLocaleDateString('sv-SE').slice(0, 7);
const nomeDoMes = (chave) => {
  const [ano, mes] = chave.split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};
const hoje = () => new Date().toLocaleDateString('sv-SE');

// igual a acertos.js no backend
const FORMAS = ['Cheques', 'Boleto', 'Minha comissão'];
const abatido = (p) => (p.acerto_forma === 'Minha comissão' ? Number(p.acerto_valor || 0) : 0);
const comissaoLiquida = (p) => p.comissao - abatido(p);
const falta = (p) => Math.max(0, p.fabrica - Number(p.acerto_valor || 0));

let pedidos = [];
let acertos = [];
let mesAberto = chaveDoMes(new Date());

function avisar(texto, { erro = false } = {}) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  aviso.dataset.erro = erro ? 'sim' : 'nao';
}

function comDivisao(p) {
  const clientePagaFrete = p.frete_pago_pelo_cliente !== false;
  const divisao = dividirPedido({
    bruto: Number(p.total_bruto),
    abatimento: Number(p.abatimento),
    frete: Number(p.frete),
    clientePagaFrete,
  });
  return { ...p, clientePagaFrete, mes: chaveDoMes(p.criado_em), ...divisao };
}

function desenharSaldo({ devido, pago, emAberto }) {
  el('[data-saldo-aberto]').textContent = reais(emAberto);
  el('[data-saldo-devido]').textContent = reais(devido);
  el('[data-saldo-pago]').textContent = reais(pago);
  const fracao = devido > 0 ? Math.min(1, pago / devido) : 0;
  el('[data-saldo-pago-barra]').style.setProperty('--pago', fracao.toFixed(4));
  el('[data-saldo-barra]').setAttribute('aria-label', `${Math.round(fracao * 100)}% da parte da fábrica já foi pago`);
}

const soma = (lista, pegar) => lista.reduce((total, item) => total + Number(pegar(item) || 0), 0);

function desenharTotais() {
  el('[data-mes-comissao]').textContent = reais(soma(pedidos, comissaoLiquida));
  el('[data-mes-fabrica]').textContent = reais(soma(pedidos, (p) => p.fabrica));
  el('[data-mes-acertos]').textContent = reais(soma(acertos, (a) => a.valor) + soma(pedidos, (p) => p.acerto_valor));
  el('[data-mes-faturado]').textContent = reais(soma(pedidos, (p) => p.total));
  el('[data-mes-desconto]').textContent = reais(soma(pedidos, (p) => p.abatimento));
  el('[data-mes-frete]').textContent = reais(soma(pedidos, (p) => p.freteNaComissao));
}

// card: só pedidos em aberto
function desenharCard() {
  const abertos = pedidos.filter((p) => falta(p) > 0);
  campoPedido.innerHTML = abertos.length
    ? ['<option value="">Escolha o pedido</option>',
       ...abertos.map((p) => `<option value="${p.id}">${p.numero} · ${escapar(p.cliente_nome)} · falta ${dinheiro(falta(p))}</option>`)].join('')
    : '<option value="">Nenhum pedido em aberto</option>';
  campoForma.innerHTML = ['<option value="">Escolha a forma</option>', ...FORMAS.map((f) => `<option>${f}</option>`)].join('');
}

// preenche o card com o acerto do pedido ou com o que falta
campoPedido.addEventListener('change', () => {
  const p = pedidos.find((item) => String(item.id) === campoPedido.value);
  if (!p) return;
  campoForma.value = p.acerto_forma ?? '';
  formaAcerto.elements.valor.value = dinheiro(p.acerto_valor != null ? p.acerto_valor : falta(p));
  formaAcerto.elements.dia.value = p.acerto_dia ? String(p.acerto_dia).slice(0, 10) : hoje();
  formaAcerto.elements.observacao.value = p.acerto_obs ?? '';
});

function desenharMeses() {
  const meses = [...new Set([chaveDoMes(new Date()), ...pedidos.map((p) => p.mes)])].sort().reverse();
  el('[data-meses]').replaceChildren(
    ...meses.map((chave) => {
      const botao = document.createElement('button');
      botao.type = 'button';
      botao.className = 'meses__mes';
      botao.dataset.mes = chave;
      botao.setAttribute('aria-pressed', String(chave === mesAberto));
      const n = pedidos.filter((p) => p.mes === chave).length;
      botao.innerHTML = `<span>${nomeDoMes(chave)}</span><small>${n} ${n === 1 ? 'pedido' : 'pedidos'}</small>`;
      return botao;
    }),
  );
}

function celulaDoAcerto(p) {
  if (p.acerto_valor == null) return `<td>—</td><td>—<span class="admin__cidade">falta ${dinheiro(falta(p))}</span></td>`;
  const detalhe = [p.acerto_dia && dataDoDia(p.acerto_dia), p.acerto_obs && escapar(p.acerto_obs)].filter(Boolean).join(' · ');
  return `
    <td>${escapar(p.acerto_forma ?? '—')}${detalhe ? `<span class="admin__cidade">${detalhe}</span>` : ''}</td>
    <td>${dinheiro(p.acerto_valor)}<span class="admin__cidade">${falta(p) > 0 ? `falta ${dinheiro(falta(p))}` : 'quitado'}</span></td>`;
}

function desenharMes() {
  const doMes = pedidos.filter((p) => p.mes === mesAberto);
  el('[data-contagem]').textContent = `(${doMes.length})`;
  const corpo = el('[data-pedidos]');
  if (doMes.length === 0) {
    corpo.innerHTML = `<tr><td colspan="10" class="carteira__vazio">Nenhum pedido em ${nomeDoMes(mesAberto).toLowerCase()}.</td></tr>`;
    return;
  }
  corpo.innerHTML = doMes
    .map(
      (p) => `
      <tr>
        <td><strong>${p.numero}</strong><span class="admin__cidade">${data(p.criado_em)}</span></td>
        <td>${escapar(p.cliente_nome)}</td>
        <td>${dinheiro(p.total_bruto)}</td>
        <td>${Number(p.desconto) > 0 ? `${Number(p.desconto)}% · ${dinheiro(p.abatimento)}` : '—'}</td>
        <td>${Number(p.frete) > 0 ? `${dinheiro(p.frete)}<span class="admin__cidade">${p.clientePagaFrete ? 'cliente paga' : 'por minha conta'}</span>` : '—'}</td>
        <td>${dinheiro(p.total)}</td>
        <td>${dinheiro(p.fabrica)}</td>
        <td class="carteira__comissao">${dinheiro(comissaoLiquida(p))}${abatido(p) > 0 ? `<span class="admin__cidade">${dinheiro(abatido(p))} abatidos</span>` : ''}</td>
        ${celulaDoAcerto(p)}
      </tr>`,
    )
    .join('');
}

async function carregar() {
  const [{ pedidos: lista }, { acertos: pagos, saldo }] = await Promise.all([
    pedir('/api/financeiro?limite=500'),
    pedir('/api/acertos'),
  ]);
  pedidos = lista.map(comDivisao);
  acertos = pagos;
  desenharSaldo(saldo);
  desenharTotais();
  desenharCard();
  desenharMeses();
  desenharMes();
}

el('[data-meses]').addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-mes]');
  if (!botao) return;
  mesAberto = botao.dataset.mes;
  for (const outro of el('[data-meses]').children) outro.setAttribute('aria-pressed', String(outro === botao));
  desenharMes();
});

formaAcerto.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const { pedido, ...dados } = Object.fromEntries(new FormData(formaAcerto));
  if (!pedido) return avisar('Escolha o pedido.', { erro: true });
  if (!dados.forma) return avisar('Escolha a forma de pagamento.', { erro: true });
  const botao = formaAcerto.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    await pedir(`/api/pedidos/${pedido}/acerto`, { method: 'PATCH', body: JSON.stringify(dados) });
    formaAcerto.reset();
    formaAcerto.elements.dia.value = hoje();
    avisar('');
    await carregar();
  } catch (erro) {
    avisar(erro.message, { erro: true });
  } finally {
    botao.disabled = false;
  }
});

const cliente = await quemEstaLogado();
if (cliente && !cliente.admin) {
  location.replace('/src/pages/conta/conta.html');
} else if (!cliente) {
  montarMenuDoPainel(null);
  avisar('Entre para abrir a carteira.', { erro: true });
  montarAreaCliente().abrir();
} else {
  montarMenuDoPainel(cliente);
  formaAcerto.elements.dia.value = hoje();
  painel.hidden = false;
  await carregar().catch((erro) => avisar(erro.message, { erro: true }));
}
