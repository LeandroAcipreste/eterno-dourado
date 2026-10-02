/**
 * Página do administrador: cadastro dos lojistas.
 *
 * Quem decide se você entra aqui é o servidor, não esta página: toda rota de cliente
 * exige a sessão de administrador, e o que se faz aqui é só desenhar o que ela devolve.
 * Esconder o painel é conforto, não segurança.
 *
 * O desconto e o frete gravados aqui são os que entram no pedido do lojista.
 */

import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { pedir, quemEstaLogado, sair } from '../../js/utils/api.js';
import { dividirPedido } from '../../js/precificacao.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const corpo = el('[data-clientes]');
const contagem = el('[data-contagem]');
const forma = el('[data-forma-cliente]');

const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');
// a observação é texto livre do Leandro: vai para dentro de um atributo, então escapa
const escapar = (texto) => String(texto ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

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
          <strong>${c.nome}</strong>
          ${c.cidade ? `<span class="admin__cidade">${c.cidade}</span>` : ''}
        </td>
        <td>
          ${c.email}
          ${c.cnpj ? `<span class="admin__cidade">${c.cnpj}</span>` : ''}
          ${c.admin ? '<span class="admin__marca">administrador</span>' : ''}
        </td>
        <td><input type="number" min="0" max="100" step="0.5" value="${c.desconto}" data-campo="desconto" aria-label="Desconto de ${c.nome}" /></td>
        <td><input type="number" min="0" step="0.01" value="${dinheiro(c.frete)}" data-campo="frete" aria-label="Frete de ${c.nome}" ${c.paga_frete ? '' : 'disabled'} /></td>
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
        <td><input type="text" maxlength="200" value="${escapar(c.observacao)}" data-campo="observacao" aria-label="Observação fixa de ${c.nome}" /></td>`;
      return linha;
    }),
  );
}

async function carregar() {
  const { clientes } = await pedir('/api/clientes');
  desenhar(clientes);
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

el('[data-sair]')?.addEventListener('click', async () => {
  await sair().catch(() => {});
  location.href = '/';
});

/* ---- financeiro ------------------------------------------------------------ */

async function carregarFinanceiro() {
  const { pedidos } = await pedir('/api/financeiro');
  const comissao = pedidos.reduce(
    (total, p) =>
      total +
      dividirPedido({
        bruto: Number(p.total_bruto),
        abatimento: Number(p.abatimento),
        frete: Number(p.frete),
        clientePagaFrete: p.frete_pago_pelo_cliente !== false,
      }).comissao,
    0,
  );
  el('[data-resumo-financeiro]').textContent = pedidos.length
    ? `${pedidos.length} pedidos · sua comissão soma R$ ${dinheiro(comissao)}`
    : 'Nenhum pedido fechado ainda.';
}

/* ---- meu cadastro ---------------------------------------------------------- */

function desenharMinhaFicha(conta) {
  el('[data-minha-ficha]').innerHTML = [
    ['Nome', conta.nome],
    ['E-mail', conta.email],
    ['CNPJ', conta.cnpj ?? '—'],
    ['Cidade', conta.cidade ?? '—'],
  ]
    .map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${valor}</dd>`)
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
if (!cliente) {
  avisar('Entre para abrir o painel.', { erro: true });
  montarAreaCliente().abrir();
} else if (!cliente.admin) {
  avisar(`${cliente.nome}, esta página é do administrador.`, { erro: true });
} else {
  el('[data-quem]').textContent = cliente.nome;
  el('[data-sair]').hidden = false;
  painel.hidden = false;
  desenharMinhaFicha(cliente);
  // cada seção carrega a sua parte; uma que falhe não apaga as outras
  for (const [nome, carregarSecao] of [['clientes', carregar], ['financeiro', carregarFinanceiro]]) {
    await carregarSecao().catch((erro) => avisar(`${nome}: ${erro.message}`, { erro: true }));
  }
}
