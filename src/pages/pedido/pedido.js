/**
 * Página do lojista: monta o pedido por referência.
 *
 * Ele digita o código ou o nome, vê a foto da peça, escolhe forro, pedra, numeração e
 * quantidade, e a folha ao lado mostra soma, desconto e frete — os dois últimos vindos
 * do cadastro dele, que ele vê e não muda.
 *
 * Nenhum valor é calculado aqui para valer: o pé da folha vem de /api/pedidos/resumo e
 * o pedido é refeito pelo servidor ao enviar. O que esta página faz é perguntar.
 */

import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { pedir, quemEstaLogado, sair } from '../../js/utils/api.js';
import { valorDaUnidade } from '../../js/precificacao.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const busca = el('[data-busca]');
const sugestoes = el('[data-sugestoes]');
const escolha = el('[data-escolha]');

const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');

/** As peças escolhidas, na ordem em que entraram na folha. */
const itens = [];
let peca = null; // a que está aberta na tela

function avisar(texto, { erro = false } = {}) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  aviso.dataset.erro = erro ? 'sim' : 'nao';
}

/* ---- procurar a referência -------------------------------------------------- */

function mostrarSugestoes(modelos) {
  sugestoes.replaceChildren(
    ...modelos.map((m) => {
      const item = document.createElement('li');
      item.setAttribute('role', 'option');
      item.dataset.codigo = m.code;
      item.innerHTML = `
        ${m.foto ? `<img src="/${m.foto}" alt="" loading="lazy" />` : '<span class="pedido__sem-foto" aria-hidden="true"></span>'}
        <span class="pedido__sugestao-texto">
          <strong>${m.codigoTabela ?? m.code}</strong>
          <span>${m.descricaoTabela ?? ''}</span>
        </span>
        <span class="pedido__sugestao-valor">${m.sobConsulta ? 'sob consulta' : `R$ ${dinheiro(m.precoUnidade)}`}</span>`;
      item._modelo = m;
      return item;
    }),
  );
  sugestoes.hidden = modelos.length === 0;
  busca.setAttribute('aria-expanded', String(!sugestoes.hidden));
}

let procurando;
busca?.addEventListener('input', () => {
  clearTimeout(procurando);
  const termo = busca.value.trim();
  if (termo.length < 2) return mostrarSugestoes([]);
  procurando = setTimeout(async () => {
    try {
      const { modelos } = await pedir(`/api/modelos?limite=12&busca=${encodeURIComponent(termo)}`);
      mostrarSugestoes(modelos);
    } catch (erro) {
      avisar(erro.message, { erro: true });
    }
  }, 250);
});

sugestoes?.addEventListener('click', (evento) => {
  const item = evento.target.closest('li');
  if (item) abrirPeca(item._modelo);
});

/* ---- a peça escolhida -------------------------------------------------------- */

function abrirPeca(modelo) {
  peca = modelo;
  sugestoes.hidden = true;
  busca.setAttribute('aria-expanded', 'false');
  busca.value = modelo.codigoTabela ?? modelo.code;

  const foto = el('[data-foto-peca]');
  foto.src = modelo.foto ? `/${modelo.foto}` : '';
  foto.hidden = !modelo.foto;
  foto.alt = modelo.descricaoTabela ? `Aliança ${modelo.descricaoTabela}` : '';

  el('[data-codigo]').textContent = modelo.codigoTabela ?? modelo.code;
  el('[data-nome]').textContent = modelo.descricaoTabela ?? 'Modelo fora da tabela';
  el('[data-valor]').textContent = modelo.sobConsulta
    ? 'Valor sob consulta'
    : `R$ ${dinheiro(modelo.precoUnidade)} por aliança`;

  el('[data-forro]').checked = false;
  el('[data-pedra]').checked = false;
  // pedra avulsa só em liso e pedra única: nas outras ela já está no valor da tabela
  el('[data-pedra-linha]').hidden = !modelo.aceitaPedraAvulsa;
  numeracoes = [];
  desenharNumeracoes();

  escolha.hidden = false;
}

/* ---- as numerações do modelo aberto ------------------------------------------ */

/** O que ele já escolheu deste modelo, antes de finalizá-lo. */
let numeracoes = [];

/** O valor de uma aliança com o que estiver marcado agora: só para ele ver somando. */
const valorDaPeca = () =>
  valorDaUnidade(peca, { forro: el('[data-forro]').checked, pedras: el('[data-pedra]').checked ? 1 : 0 });

function desenharNumeracoes() {
  const lista = el('[data-numeracoes]');
  lista.replaceChildren(
    ...numeracoes.map((n, i) => {
      const item = document.createElement('li');
      item.innerHTML = `
        <span><strong>${n.numeracao || 'sem numeração'}</strong> · ${n.qt} ${n.qt === 1 ? 'aliança' : 'alianças'}</span>
        <button class="pedido__remover" type="button" data-tirar="${i}">Tirar</button>`;
      return item;
    }),
  );

  const pecas = numeracoes.reduce((soma, n) => soma + n.qt, 0);
  const unidade = valorDaPeca();
  const subtotal = el('[data-subtotal]');
  subtotal.hidden = pecas === 0;
  subtotal.textContent =
    unidade === null
      ? `${pecas} alianças · valor sob consulta`
      : `${pecas} ${pecas === 1 ? 'aliança' : 'alianças'} · R$ ${dinheiro(unidade * pecas)}`;
  el('[data-finalizar-modelo]').hidden = pecas === 0;
}

el('[data-adicionar-numeracao]')?.addEventListener('click', () => {
  if (!peca) return;
  const qt = Number(el('[data-quantidade]').value);
  const numeracao = el('[data-numeracao]').value;
  if (!Number.isFinite(qt) || qt < 1) return avisar('Diga quantas alianças.', { erro: true });

  // a mesma numeração escolhida duas vezes soma, em vez de virar duas linhas iguais
  const igual = numeracoes.find((n) => n.numeracao === numeracao);
  if (igual) igual.qt += qt;
  else numeracoes.push({ numeracao, qt });

  avisar('');
  desenharNumeracoes();
  el('[data-numeracao]').focus();
  el('[data-numeracao]').select();
});

// marcar forro ou pedra depois de escolher numeração recalcula o que está na tela
for (const opcao of ['[data-forro]', '[data-pedra]']) {
  el(opcao)?.addEventListener('change', () => desenharNumeracoes());
}

el('[data-numeracoes]')?.addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-tirar]');
  if (!botao) return;
  numeracoes.splice(Number(botao.dataset.tirar), 1);
  desenharNumeracoes();
});

/** Fecha o modelo: as numerações dele viram linhas da folha e o campo volta a esperar. */
el('[data-finalizar-modelo]')?.addEventListener('click', async () => {
  if (!peca || numeracoes.length === 0) return;
  const forro = el('[data-forro]').checked;
  const pedras = el('[data-pedra]').checked ? 1 : 0;

  for (const n of numeracoes) {
    itens.push({
      codigo: peca.code,
      referencia: peca.codigoTabela ?? peca.code,
      nome: peca.descricaoTabela ?? '',
      numeracao: n.numeracao,
      qt: n.qt,
      forro,
      pedras,
    });
  }

  numeracoes = [];
  peca = null;
  escolha.hidden = true;
  busca.value = '';
  busca.focus();
  await atualizarFolha();
});

/* ---- a folha ----------------------------------------------------------------- */

el('[data-itens]')?.addEventListener('click', async (evento) => {
  const botao = evento.target.closest('[data-remover]');
  if (!botao) return;
  itens.splice(Number(botao.dataset.remover), 1);
  await atualizarFolha();
});

function desenharItens(linhas) {
  el('[data-contagem]').textContent = itens.length ? `(${itens.length})` : '';
  el('[data-itens]').replaceChildren(
    ...itens.map((item, i) => {
      const daApi = linhas?.[i];
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td>
          <strong>${item.referencia}</strong>
          <span class="admin__cidade">${[item.forro ? 'com forro' : '', item.pedras ? 'com pedra' : ''].filter(Boolean).join(' · ') || item.nome}</span>
        </td>
        <td>${item.numeracao || '—'}</td>
        <td>${item.qt}</td>
        <td>${daApi?.valorTotal != null ? dinheiro(daApi.valorTotal) : 'sob consulta'}</td>
        <td><button class="pedido__remover" type="button" data-remover="${i}">Remover</button></td>`;
      return linha;
    }),
  );
}

/** O pé da folha vem pronto do servidor: soma, desconto do cadastro, frete e total. */
async function atualizarFolha() {
  const vazio = el('[data-vazio]');
  const resumo = el('[data-resumo]');
  const enviar = el('[data-enviar]');

  if (itens.length === 0) {
    desenharItens(null);
    vazio.hidden = false;
    resumo.hidden = true;
    enviar.hidden = true;
    return;
  }

  vazio.hidden = true;
  try {
    const { resumo: conta } = await pedir('/api/pedidos/resumo', {
      method: 'POST',
      body: JSON.stringify({ itens }),
    });
    desenharItens(conta.itens);

    el('[data-soma]').textContent = `R$ ${dinheiro(conta.soma)}`;
    el('[data-linha-desconto]').hidden = !conta.desconto.mostrar;
    el('[data-rotulo-desconto]').textContent = `Desconto ${conta.desconto.percentual}%`;
    el('[data-desconto]').textContent = `− R$ ${dinheiro(conta.desconto.valor)}`;
    el('[data-linha-frete]').hidden = conta.frete.valor === 0;
    el('[data-rotulo-frete]').textContent = conta.frete.incluso ? 'Frete (incluso)' : 'Frete';
    el('[data-frete]').textContent = conta.frete.incluso ? 'R$ 0,00' : `R$ ${dinheiro(conta.frete.valor)}`;
    el('[data-total]').textContent = `R$ ${dinheiro(conta.total)}`;

    resumo.hidden = false;
    enviar.hidden = false;
    avisar(conta.temSobConsulta ? 'Há peça sob consulta: o Leandro confirma o valor dela com você.' : '');
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
}

el('[data-enviar]')?.addEventListener('click', async () => {
  const botao = el('[data-enviar]');
  botao.disabled = true;
  try {
    const { pedido } = await pedir('/api/pedidos', { method: 'POST', body: JSON.stringify({ itens }) });
    itens.length = 0;
    await atualizarFolha();
    avisar(`Pedido ${pedido.numero} enviado. O Leandro recebe e fala com você pelo WhatsApp.`);
  } catch (erro) {
    avisar(erro.message, { erro: true });
  } finally {
    botao.disabled = false;
  }
});

el('[data-sair]')?.addEventListener('click', async () => {
  await sair().catch(() => {});
  location.href = '/';
});

/* ---- entrada ------------------------------------------------------------------ */

const cliente = await quemEstaLogado();
if (!cliente) {
  avisar('Entre para fazer seu pedido.', { erro: true });
  montarAreaCliente().abrir();
} else {
  el('[data-quem]').textContent = cliente.nome;
  // a observação do cadastro acompanha todo pedido deste cliente, e é ela que sai na folha
  if (cliente.observacao) {
    el('[data-observacao]').textContent = `OBS: ${cliente.observacao}`;
    el('[data-observacao]').hidden = false;
  }
  el('[data-sair]').hidden = false;
  painel.hidden = false;
  await atualizarFolha();
  busca.focus();
}
