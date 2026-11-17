/**
 * Minha carteira.
 *
 * Saldo em aberto com a fábrica (GET /api/acertos, calculado no servidor sobre todos
 * os pedidos) e, embaixo, um mês por vez: pedidos, divisão do dinheiro e acertos.
 * A divisão de cada pedido é dividirPedido (precificacao.js), sobre os valores com
 * que o pedido foi fechado.
 */

import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { montarMenuDoPainel } from '../../js/components/cabecalho.js';
import { escapar } from '../../js/utils/dom.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';
import { dividirPedido } from '../../js/precificacao.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const formaAcerto = el('[data-forma-acerto]');

const reais = (valor) => `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');
const data = (iso) => new Date(iso).toLocaleDateString('pt-BR');
// "2026-11": a chave do mês. Data sem hora (o dia do acerto) é lida no fuso local.
const chaveDoMes = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.slice(0, 7) : new Date(iso).toLocaleDateString('sv-SE').slice(0, 7));
const nomeDoMes = (chave) => {
  const [ano, mes] = chave.split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};
const hoje = () => new Date().toLocaleDateString('sv-SE');

let pedidos = [];
let acertos = [];
let mesAberto = chaveDoMes(hoje());

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

function desenharMeses() {
  const meses = [...new Set([chaveDoMes(hoje()), ...pedidos.map((p) => p.mes), ...acertos.map((a) => chaveDoMes(a.dia))])]
    .sort()
    .reverse();
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

function desenharMes() {
  const doMes = pedidos.filter((p) => p.mes === mesAberto);
  const acertosDoMes = acertos.filter((a) => chaveDoMes(a.dia) === mesAberto);
  const soma = (lista, pegar) => lista.reduce((total, item) => total + Number(pegar(item)), 0);

  el('[data-mes-comissao]').textContent = reais(soma(doMes, (p) => p.comissao));
  el('[data-mes-fabrica]').textContent = reais(soma(doMes, (p) => p.fabrica));
  el('[data-mes-acertos]').textContent = reais(soma(acertosDoMes, (a) => a.valor));
  el('[data-mes-faturado]').textContent = reais(soma(doMes, (p) => p.total));
  el('[data-mes-desconto]').textContent = reais(soma(doMes, (p) => p.abatimento));
  el('[data-mes-frete]').textContent = reais(soma(doMes, (p) => p.freteNaComissao));

  el('[data-contagem]').textContent = `(${doMes.length})`;
  const corpo = el('[data-pedidos]');
  if (doMes.length === 0) {
    corpo.innerHTML = `<tr><td colspan="8" class="carteira__vazio">Nenhum pedido em ${nomeDoMes(mesAberto).toLowerCase()}.</td></tr>`;
  } else {
    corpo.replaceChildren(
      ...doMes.map((p) => {
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

  const lista = el('[data-acertos]');
  if (acertosDoMes.length === 0) {
    lista.innerHTML = '<li class="carteira__vazio">Nenhum acerto lançado neste mês.</li>';
    return;
  }
  lista.replaceChildren(
    ...acertosDoMes.map((a) => {
      const item = document.createElement('li');
      item.className = 'acertos__item';
      item.innerHTML = `
        <span class="acertos__valor">${reais(a.valor)}</span>
        <span class="acertos__info">${data(a.dia + 'T12:00:00')}${a.observacao ? ` · ${escapar(a.observacao)}` : ''}</span>
        <button class="acertos__apagar" type="button" data-apagar="${a.id}" aria-label="Apagar acerto de ${reais(a.valor)}">Apagar</button>`;
      return item;
    }),
  );
}

async function carregar() {
  const [{ pedidos: lista }, { acertos: pagos, saldo }] = await Promise.all([
    pedir('/api/financeiro?limite=500'),
    pedir('/api/acertos'),
  ]);
  pedidos = lista.map(comDivisao);
  acertos = pagos;
  desenharSaldo(saldo);
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
  const dados = Object.fromEntries(new FormData(formaAcerto));
  const botao = formaAcerto.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    await pedir('/api/acertos', { method: 'POST', body: JSON.stringify(dados) });
    formaAcerto.reset();
    formaAcerto.elements.dia.value = hoje();
    mesAberto = chaveDoMes(dados.dia || hoje());
    avisar('');
    await carregar();
  } catch (erro) {
    avisar(erro.message, { erro: true });
  } finally {
    botao.disabled = false;
  }
});

el('[data-acertos]').addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-apagar]');
  if (!botao || !confirm('Apagar este acerto? O valor volta para o saldo em aberto.')) return;
  try {
    await pedir(`/api/acertos/${botao.dataset.apagar}`, { method: 'DELETE' });
    await carregar();
  } catch (erro) {
    avisar(erro.message, { erro: true });
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
