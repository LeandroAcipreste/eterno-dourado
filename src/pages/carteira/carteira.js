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
const campoValor = el('[data-acerto-valor]');
const campoForma = el('[data-acerto-forma]');
const listaDoCard = el('[data-acerto-pedidos]');
const conta = el('[data-acerto-conta]');
const campoSobra = el('[data-acerto-sobra]');

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
const opcoesDeForma = (atual = '') =>
  ['<option value="">Escolha</option>', ...FORMAS.map((f) => `<option${f === atual ? ' selected' : ''}>${f}</option>`)].join('');
const abatido = (p) => (p.acerto_forma === 'Minha comissão' ? Number(p.acerto_valor || 0) : 0);
const comissaoLiquida = (p) => p.comissao - abatido(p);
const falta = (p) => Math.max(0, Math.round((p.fabrica - Number(p.acerto_valor || 0)) * 100) / 100);

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

/* ---- card: a conta é do backend (/api/acertos/simular e /lancar) ---- */

let simulacao = null;
let marcadoAMao = false;

const linhaDoCard = (p, marcado) => `
      <li><label class="acerto__pedido">
        <input type="checkbox" data-quita="${p.id}"${marcado ? ' checked' : ''} />
        <span>${p.numero} · ${escapar(p.cliente ?? p.cliente_nome)}</span>
        <span class="acerto__falta">falta ${dinheiro(p.falta ?? falta(p))}</span>
      </label></li>`;

function desenharCard() {
  campoForma.innerHTML = opcoesDeForma();
  simulacao = null;
  marcadoAMao = false;
  const abertos = pedidos.filter((p) => falta(p) > 0).reverse();
  listaDoCard.innerHTML = abertos.length ? abertos.map((p) => linhaDoCard(p, false)).join('') : '<li class="carteira__vazio">Nenhum pedido em aberto.</li>';
  conta.textContent = '';
  el('[data-acerto-sobra-campo]').hidden = true;
}

function desenharSimulacao(s) {
  const ids = s.quitados.map((p) => p.id);
  listaDoCard.innerHTML = s.abertos.map((p) => linhaDoCard(p, ids.includes(p.id))).join('');
  conta.dataset.erro = 'nao';
  conta.textContent = `Quita ${ids.length} ${ids.length === 1 ? 'pedido' : 'pedidos'} (${dinheiro(s.usado)}). Sobram ${dinheiro(s.sobra)}.`;
  const campoDaSobra = el('[data-acerto-sobra-campo]');
  campoDaSobra.hidden = !s.destino;
  if (!s.destino) return;
  campoSobra.innerHTML = s.candidatos
    .map((p) => `<option value="${p.id}"${p.id === s.destino.id ? ' selected' : ''}>${p.numero} · ${escapar(p.cliente)} · fica faltando ${dinheiro(Math.max(0, p.falta - s.sobra))}</option>`)
    .join('');
}

let ultimaConsulta = 0;
async function simular() {
  const valor = campoValor.value.trim();
  if (!valor) return desenharCard();
  const params = new URLSearchParams({ valor });
  if (marcadoAMao) params.set('quitar', [...listaDoCard.querySelectorAll('[data-quita]:checked')].map((c) => c.dataset.quita).join(',') || '0');
  if (!el('[data-acerto-sobra-campo]').hidden && campoSobra.value) params.set('sobra', campoSobra.value);
  const esta = ++ultimaConsulta;
  try {
    const s = await pedir(`/api/acertos/simular?${params}`);
    if (esta !== ultimaConsulta) return;
    simulacao = s;
    desenharSimulacao(s);
  } catch (erro) {
    if (esta !== ultimaConsulta) return;
    simulacao = null;
    conta.dataset.erro = 'sim';
    conta.textContent = erro.message;
    el('[data-acerto-sobra-campo]').hidden = true;
  }
}

let espera;
campoValor.addEventListener('input', () => {
  marcadoAMao = false;
  campoSobra.innerHTML = '';
  clearTimeout(espera);
  espera = setTimeout(simular, 300);
});
listaDoCard.addEventListener('change', () => {
  marcadoAMao = true;
  campoSobra.innerHTML = '';
  simular();
});
campoSobra.addEventListener('change', simular);

const gravarAcerto = (p, { valor, forma, dia, observacao }) =>
  pedir(`/api/pedidos/${p.id}/acerto`, { method: 'PATCH', body: JSON.stringify({ valor, forma, dia, observacao }) });

formaAcerto.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (!simulacao) return avisar('Digite o valor enviado à fábrica.', { erro: true });
  if (!campoForma.value) return avisar('Escolha a forma de pagamento.', { erro: true });
  const { dia, observacao } = Object.fromEntries(new FormData(formaAcerto));
  const botao = formaAcerto.querySelector('[type="submit"]');
  botao.disabled = true;
  try {
    await pedir('/api/acertos/lancar', {
      method: 'POST',
      body: JSON.stringify({
        valor: simulacao.valor,
        quitar: simulacao.quitados.map((p) => p.id),
        sobraPara: simulacao.destino?.id ?? null,
        forma: campoForma.value,
        dia,
        observacao,
      }),
    });
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

/* ---- pedidos do mês ---- */

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

const textoDaComissao = (p) =>
  `${dinheiro(comissaoLiquida(p))}${abatido(p) > 0 ? `<span class="admin__cidade">${dinheiro(abatido(p))} abatidos</span>` : ''}`;
const textoDaFalta = (p) => (falta(p) > 0 ? `falta ${dinheiro(falta(p))}` : 'quitado');
const detalheDoAcerto = (p) => [p.acerto_dia && dataDoDia(p.acerto_dia), p.acerto_obs && escapar(p.acerto_obs)].filter(Boolean).join(' · ');

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
      <tr data-pedido="${p.id}">
        <td><strong>${p.numero}</strong><span class="admin__cidade">${data(p.criado_em)}</span></td>
        <td>${escapar(p.cliente_nome)}</td>
        <td>${dinheiro(p.total_bruto)}</td>
        <td>${Number(p.desconto) > 0 ? `${Number(p.desconto)}% · ${dinheiro(p.abatimento)}` : '—'}</td>
        <td>${Number(p.frete) > 0 ? `${dinheiro(p.frete)}<span class="admin__cidade">${p.clientePagaFrete ? 'cliente paga' : 'por minha conta'}</span>` : '—'}</td>
        <td>${dinheiro(p.total)}</td>
        <td>${dinheiro(p.fabrica)}</td>
        <td class="carteira__comissao" data-comissao>${textoDaComissao(p)}</td>
        <td>
          <select class="carteira__campo carteira__campo--forma" data-acerto="forma" aria-label="Como foi acertado o pedido ${p.numero}">${opcoesDeForma(p.acerto_forma ?? '')}</select>
          <span class="admin__cidade" data-detalhe>${detalheDoAcerto(p)}</span>
        </td>
        <td>
          <input class="carteira__campo carteira__campo--valor" type="text" inputmode="decimal" value="${p.acerto_valor != null ? dinheiro(p.acerto_valor) : ''}" placeholder="0,00" data-acerto="valor" aria-label="Valor pago à fábrica pelo pedido ${p.numero}" />
          <span class="admin__cidade" data-falta>${textoDaFalta(p)}</span>
        </td>
      </tr>`,
    )
    .join('');
}

// correção na linha: grava forma e valor, mantém data e observação
el('[data-pedidos]').addEventListener('change', async (evento) => {
  const linha = evento.target.closest('[data-pedido]');
  if (!linha || !evento.target.matches('[data-acerto]')) return;
  const p = pedidos.find((item) => String(item.id) === linha.dataset.pedido);
  try {
    const { pedido: salvo } = await gravarAcerto(p, {
      forma: el('[data-acerto="forma"]', linha).value,
      valor: el('[data-acerto="valor"]', linha).value,
      dia: p.acerto_dia ? String(p.acerto_dia).slice(0, 10) : hoje(),
      observacao: p.acerto_obs ?? '',
    });
    Object.assign(p, salvo);
    el('[data-falta]', linha).textContent = textoDaFalta(p);
    el('[data-comissao]', linha).innerHTML = textoDaComissao(p);
    el('[data-detalhe]', linha).innerHTML = detalheDoAcerto(p);
    desenharTotais();
    desenharCard();
    desenharSaldo((await pedir('/api/acertos')).saldo);
    avisar('');
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
});

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
