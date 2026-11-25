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
const campoPedido = el('[data-acerto-pedido]');
const quitados = el('[data-acerto-quitados]');
const conta = el('[data-acerto-conta]');
const campoSobra = el('[data-acerto-sobra]');

const reais = (valor) => `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');
const data = (iso) => new Date(iso).toLocaleDateString('pt-BR');
const chaveDoMes = (iso) => new Date(iso).toLocaleDateString('sv-SE').slice(0, 7);
const nomeDoMes = (chave) => {
  const [ano, mes] = chave.split('-').map(Number);
  const nome = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  return nome.charAt(0).toUpperCase() + nome.slice(1);
};
const hoje = () => new Date().toLocaleDateString('sv-SE');

// igual a acertos.js no backend
const FORMAS = ['Cheques', 'Boleto', 'Minha comissão', 'Devolução'];
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

function desenharCard() {
  campoForma.innerHTML = opcoesDeForma();
  const abertos = pedidos.filter((p) => falta(p) > 0).reverse();
  campoPedido.innerHTML = abertos.length
    ? ['<option value="">Do mais antigo</option>',
       ...abertos.map((p) => `<option value="${p.id}">${p.numero} · ${escapar(p.cliente_nome)} · falta ${dinheiro(falta(p))}</option>`)].join('')
    : '<option value="">Nenhum pedido em aberto</option>';
  limparSimulacao();
}

function limparSimulacao() {
  simulacao = null;
  quitados.innerHTML = '';
  conta.textContent = '';
  campoSobra.innerHTML = '';
  el('[data-acerto-sobra-campo]').hidden = true;
}

function desenharSimulacao(s) {
  quitados.innerHTML = s.quitados
    .map((p) => `<li><span>${p.numero} · ${escapar(p.cliente)}</span><span>quita ${dinheiro(p.falta)}</span></li>`)
    .join('');
  conta.dataset.erro = 'nao';
  conta.textContent = `Quita ${s.quitados.length} ${s.quitados.length === 1 ? 'pedido' : 'pedidos'} (${dinheiro(s.usado)}). Sobram ${dinheiro(s.sobra)}.`;
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
  if (!valor) return limparSimulacao();
  const params = new URLSearchParams({ valor });
  if (campoPedido.value) params.set('pedido', campoPedido.value);
  if (campoSobra.value) params.set('sobra', campoSobra.value);
  const esta = ++ultimaConsulta;
  try {
    const s = await pedir(`/api/acertos/simular?${params}`);
    if (esta !== ultimaConsulta) return;
    simulacao = s;
    desenharSimulacao(s);
  } catch (erro) {
    if (esta !== ultimaConsulta) return;
    limparSimulacao();
    conta.dataset.erro = 'sim';
    conta.textContent = erro.message;
  }
}

let espera;
campoValor.addEventListener('input', () => {
  campoSobra.innerHTML = '';
  clearTimeout(espera);
  espera = setTimeout(simular, 300);
});
campoPedido.addEventListener('change', () => {
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
const status = (p) => (falta(p) > 0 ? 'aberto' : 'quitado');

const celulaDoPago = (p) => `
          <span class="carteira__pago" data-pago>${p.acerto_valor != null ? dinheiro(p.acerto_valor) : '0,00'}</span>
          <input class="carteira__campo carteira__campo--valor" type="text" inputmode="decimal" value="${p.acerto_valor != null ? dinheiro(p.acerto_valor) : ''}" placeholder="0,00" data-valor hidden aria-label="Valor pago à fábrica pelo pedido ${p.numero}" />
          <span class="carteira__status" data-falta>${textoDaFalta(p)}</span>
          <button class="carteira__editar" type="button" data-editar>Alterar</button>`;

function desenharMes() {
  const doMes = pedidos.filter((p) => p.mes === mesAberto);
  el('[data-contagem]').textContent = `(${doMes.length})`;
  const corpo = el('[data-pedidos]');
  if (doMes.length === 0) {
    corpo.innerHTML = `<tr><td colspan="9" class="carteira__vazio">Nenhum pedido em ${nomeDoMes(mesAberto).toLowerCase()}.</td></tr>`;
    return;
  }
  corpo.innerHTML = doMes
    .map(
      (p) => `
      <tr class="carteira__linha" data-pedido="${p.id}" data-status="${status(p)}">
        <td><strong>${p.numero}</strong><span class="admin__cidade">${data(p.criado_em)}</span></td>
        <td>${escapar(p.cliente_nome)}</td>
        <td>${dinheiro(p.total_bruto)}</td>
        <td>${Number(p.desconto) > 0 ? `${Number(p.desconto)}% · ${dinheiro(p.abatimento)}` : '—'}</td>
        <td>${Number(p.frete) > 0 ? `${dinheiro(p.frete)}<span class="admin__cidade">${p.clientePagaFrete ? 'cliente paga' : 'por minha conta'}</span>` : '—'}</td>
        <td>${dinheiro(p.total)}</td>
        <td>${dinheiro(p.fabrica)}</td>
        <td class="carteira__comissao" data-comissao>${textoDaComissao(p)}</td>
        <td class="carteira__acerto">${celulaDoPago(p)}</td>
      </tr>`,
    )
    .join('');
}

// Alterar abre o valor pago; Concluir grava e atualiza o status da linha
el('[data-pedidos]').addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-editar]');
  if (!botao) return;
  const linha = botao.closest('[data-pedido]');
  const campo = el('[data-valor]', linha);
  if (campo.hidden) {
    campo.hidden = false;
    el('[data-pago]', linha).hidden = true;
    botao.textContent = 'Concluir';
    campo.focus();
    campo.select();
    return;
  }
  const p = pedidos.find((item) => String(item.id) === linha.dataset.pedido);
  botao.disabled = true;
  try {
    const { pedido: salvo } = await gravarAcerto(p, {
      valor: campo.value,
      forma: p.acerto_forma ?? '',
      dia: p.acerto_dia ? String(p.acerto_dia).slice(0, 10) : hoje(),
      observacao: p.acerto_obs ?? '',
    });
    Object.assign(p, salvo);
    el('[data-pago]', linha).textContent = p.acerto_valor != null ? dinheiro(p.acerto_valor) : '0,00';
    el('[data-falta]', linha).textContent = textoDaFalta(p);
    el('[data-comissao]', linha).innerHTML = textoDaComissao(p);
    linha.dataset.status = status(p);
    campo.hidden = true;
    el('[data-pago]', linha).hidden = false;
    botao.textContent = 'Alterar';
    desenharTotais();
    desenharCard();
    desenharSaldo((await pedir('/api/acertos')).saldo);
    avisar('');
  } catch (erro) {
    avisar(erro.message, { erro: true });
  } finally {
    botao.disabled = false;
  }
});

// Enter no campo conclui
el('[data-pedidos]').addEventListener('keydown', (evento) => {
  if (evento.key === 'Enter' && evento.target.matches('[data-valor]')) {
    evento.preventDefault();
    el('[data-editar]', evento.target.closest('[data-pedido]')).click();
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
