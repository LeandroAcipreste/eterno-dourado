/**
 * Painel do administrador: visão do mês, lojistas e cadastro.
 *
 * Quem decide se você entra aqui é o servidor, não esta página: toda rota de cliente
 * exige a sessão de administrador, e o que se faz aqui é só desenhar o que ela devolve.
 * Esconder o painel é conforto, não segurança.
 *
 * O desconto e o frete gravados aqui são os que entram no pedido do lojista.
 */

import { escapar } from '../../js/utils/dom.js';
import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { montarMenuDoPainel } from '../../js/components/cabecalho.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';
import { dividirPedido } from '../../js/precificacao.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const corpo = el('[data-clientes]');
const contagem = el('[data-contagem]');
const forma = el('[data-forma-cliente]');

const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');

function avisar(texto, { erro = false } = {}) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  aviso.dataset.erro = erro ? 'sim' : 'nao';
}

/** Uma linha por cliente, com desconto, frete e situação editáveis no lugar. */
function desenhar(clientes) {
  contagem.textContent = `(${clientes.length})`;
  corpo.replaceChildren(
    ...clientes.map((c) => {
      const linha = document.createElement('tr');
      linha.dataset.id = c.id;
      linha.innerHTML = `
        <td>
          <strong>${escapar(c.nome)}</strong>
          ${c.cidade ? `<span class="admin__cidade">${escapar(c.cidade)}</span>` : ''}
          <a class="admin__acao" href="/src/pages/cliente/cliente.html?id=${Number(c.id)}">Abrir ficha</a>
        </td>
        <td>
          ${escapar(c.email)}
          ${c.cnpj ? `<span class="admin__cidade">${escapar(c.cnpj)}</span>` : ''}
          ${c.admin ? '<span class="admin__marca">administrador</span>' : ''}
        </td>
        <td><input type="number" min="0" max="100" step="0.5" value="${c.desconto}" data-campo="desconto" aria-label="Desconto de ${escapar(c.nome)}" /></td>
        <td><input type="number" min="0" step="0.01" value="${dinheiro(c.frete)}" data-campo="frete" aria-label="Frete de ${escapar(c.nome)}" ${c.paga_frete ? '' : 'disabled'} /></td>
        <td>
          <label class="admin__marcar">
            <input type="checkbox" data-campo="pagaFrete" ${c.paga_frete ? 'checked' : ''} />
            <span>Paga frete</span>
          </label>
          <label class="admin__marcar">
            <input type="checkbox" data-campo="ativo" ${c.ativo ? 'checked' : ''} />
            <span>Ativo</span>
          </label>
        </td>
        <td><input type="text" maxlength="200" value="${escapar(c.observacao)}" data-campo="observacao" aria-label="Observação fixa de ${escapar(c.nome)}" /></td>`;
      return linha;
    }),
  );
}

async function carregar() {
  const { clientes } = await pedir('/api/clientes');
  desenhar(clientes);
  const ativos = clientes.filter((c) => c.ativo && !c.admin);
  el('[data-visao-lojistas]').textContent = String(ativos.length);
  el('[data-visao-lojistas-nota]').textContent = `de ${clientes.filter((c) => !c.admin).length} cadastrados`;
}

/** Mudança em qualquer campo da tabela grava só aquele campo, naquele cliente. */
corpo?.addEventListener('change', async (evento) => {
  const campo = evento.target.closest('[data-campo]');
  if (!campo) return;
  const linha = campo.closest('tr');
  const valor = campo.type === 'checkbox' ? campo.checked : campo.type === 'number' ? Number(campo.value) : campo.value;
  try {
    await pedir(`/api/clientes/${linha.dataset.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ [campo.dataset.campo]: valor }),
    });
    avisar('Cadastro atualizado.');
    // frete só vale para quem paga: a coluna acompanha a marcação
    if (campo.dataset.campo === 'pagaFrete') await carregar();
  } catch (erro) {
    avisar(erro.message, { erro: true });
    await carregar(); // a tela volta ao que o banco tem
  }
});

forma?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(forma));
  try {
    const { cliente } = await pedir('/api/clientes', {
      method: 'POST',
      body: JSON.stringify({
        ...dados,
        desconto: Number(dados.desconto),
        frete: Number(dados.frete),
        pagaFrete: dados.pagaFrete === 'on',
      }),
    });
    forma.reset();
    avisar(`${cliente.nome} cadastrado. Passe o e-mail e a senha para ele.`);
    await carregar();
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
});

/* ---- visão do mês --------------------------------------------------------- */

const reais = (valor) => `R$ ${Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function carregarVisao() {
  const [{ pedidos }, { saldo }] = await Promise.all([pedir('/api/financeiro?limite=500'), pedir('/api/acertos')]);
  const agora = new Date();
  const doMes = pedidos.filter((p) => {
    const d = new Date(p.criado_em);
    return d.getMonth() === agora.getMonth() && d.getFullYear() === agora.getFullYear();
  });
  const comissao = doMes.reduce(
    (total, p) =>
      total +
      dividirPedido({
        bruto: Number(p.total_bruto),
        brutoPrata: Number(p.total_prata || 0),
        abatimento: Number(p.abatimento),
        frete: Number(p.frete),
        clientePagaFrete: p.frete_pago_pelo_cliente !== false,
      }).comissao -
      Number(p.acerto_comissao || 0),
    0,
  );
  const mes = agora.toLocaleDateString('pt-BR', { month: 'long' });
  const pecas = doMes.reduce((total, p) => total + Number(p.pecas || 0), 0);

  el('[data-visao-mes]').textContent = `Painel de ${mes}`;
  el('[data-visao-saldo]').textContent = reais(saldo.emAberto);
  el('[data-visao-saldo-nota]').textContent = `${reais(saldo.pago)} pagos de ${reais(saldo.devido)}. Abrir carteira`;
  el('[data-visao-comissao]').textContent = reais(comissao);
  el('[data-visao-comissao-nota]').textContent = doMes.length ? `sobre ${reais(doMes.reduce((t, p) => t + Number(p.total), 0))} faturados` : 'nenhum pedido ainda neste mês';
  el('[data-visao-pedidos]').textContent = String(doMes.length);
  el('[data-visao-pedidos-nota]').textContent = `${pecas} ${pecas === 1 ? 'aliança' : 'alianças'}`;
}

/* ---- meu cadastro ---------------------------------------------------------- */

function desenharMinhaFicha(conta) {
  el('[data-minha-ficha]').innerHTML = [
    ['Nome', conta.nome],
    ['E-mail', conta.email],
    ['CNPJ', conta.cnpj ?? '—'],
    ['Cidade', conta.cidade ?? '—'],
  ]
    .map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${escapar(valor)}</dd>`)
    .join('');
}

el('[data-forma-senha]')?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const forma = evento.target;
  const senha = new FormData(forma).get('senha');
  try {
    await pedir(`/api/clientes/${cliente.id}`, { method: 'PATCH', body: JSON.stringify({ senha }) });
    forma.reset();
    avisar('Senha trocada. Ela vale no próximo login.');
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
});

/* ---- entrada --------------------------------------------------------------- */

const cliente = await quemEstaLogado();
if (cliente && !cliente.admin) {
  // a página é do administrador: o lojista nem a vê, vai para a conta dele
  location.replace('/src/pages/conta/conta.html');
} else if (!cliente) {
  montarMenuDoPainel(null);
  avisar('Entre para abrir o painel.', { erro: true });
  montarAreaCliente().abrir();
} else {
  montarMenuDoPainel(cliente);
  el('[data-quem]').textContent = cliente.nome;
  painel.hidden = false;
  desenharMinhaFicha(cliente);
  // o link do menu abre a seção recolhida que ele aponta
  const alvo = location.hash && el(location.hash);
  if (alvo instanceof HTMLDetailsElement) alvo.open = true;
  // cada seção carrega a sua parte; uma que falhe não apaga as outras
  for (const [nome, carregarSecao] of [['lojistas', carregar], ['visão do mês', carregarVisao]]) {
    await carregarSecao().catch((erro) => avisar(`${nome}: ${erro.message}`, { erro: true }));
  }
}
