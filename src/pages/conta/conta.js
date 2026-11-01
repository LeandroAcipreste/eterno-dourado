/**
 * Página do lojista: o cadastro dele e os pedidos que já fez.
 *
 * Ele muda só nome, e-mail, CNPJ e senha. Cidade, desconto, frete e observação
 * aparecem e não mudam: são do Leandro, e o servidor ignora o que mais chegar em /api/eu.
 */

import { API } from '../../js/config.js';
import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { montarMenuDoPainel } from '../../js/components/cabecalho.js';
import { escapar } from '../../js/utils/dom.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const forma = el('[data-forma-cadastro]');

const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');

const SITUACAO = {
  enviado: 'Enviado',
  'em-producao': 'Em produção',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
};

function avisar(texto, { erro = false } = {}) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  aviso.dataset.erro = erro ? 'sim' : 'nao';
}

/* ---- cadastro ------------------------------------------------------------------ */

function desenharCadastro(conta) {
  el('[data-quem]').textContent = conta.nome;
  el('[data-condicoes]').innerHTML = [
    ['Cidade', conta.cidade || '—'],
    ['Desconto', `${Number(conta.desconto)}%`],
    ['Frete', conta.paga_frete ? `R$ ${dinheiro(conta.frete)}` : 'Incluso'],
    ['Observação', conta.observacao || '—'],
  ]
    .map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${escapar(valor)}</dd>`)
    .join('');

  for (const campo of ['nome', 'email', 'cnpj']) forma.elements[campo].value = conta[campo] ?? '';
  forma.elements.senha.value = '';
}

forma?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(forma));
  if (!dados.senha) delete dados.senha; // em branco, a senha fica como está
  try {
    const { cliente } = await pedir('/api/eu', { method: 'PATCH', body: JSON.stringify(dados) });
    desenharCadastro(cliente);
    avisar(dados.senha ? 'Cadastro salvo. A senha nova vale no próximo login.' : 'Cadastro salvo.');
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
});

/* ---- pedidos ------------------------------------------------------------------- */

async function carregarPedidos() {
  const { pedidos } = await pedir('/api/pedidos');
  el('[data-contagem]').textContent = pedidos.length ? `(${pedidos.length})` : '';
  el('[data-tabela-pedidos]').hidden = pedidos.length === 0;
  el('[data-sem-pedidos]').hidden = pedidos.length > 0;
  el('[data-pedidos]').replaceChildren(
    ...pedidos.map((p) => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td><strong>${escapar(p.numero)}</strong></td>
        <td>${new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
        <td>${Number(p.pecas)}</td>
        <td>${p.tem_sob_consulta ? `${dinheiro(p.total)} + sob consulta` : dinheiro(p.total)}</td>
        <td>${SITUACAO[p.situacao] ?? escapar(p.situacao)}</td>
        <td><a href="${API}/api/pedidos/${Number(p.id)}/folha.pdf">Baixar PDF</a></td>`;
      return linha;
    }),
  );
}

/* ---- entrada ------------------------------------------------------------------- */

const cliente = await quemEstaLogado();
montarMenuDoPainel(cliente);
if (!cliente) {
  avisar('Entre para ver sua conta.', { erro: true });
  montarAreaCliente().abrir();
} else {
  painel.hidden = false;
  desenharCadastro(cliente);
  await carregarPedidos().catch((erro) => avisar(`pedidos: ${erro.message}`, { erro: true }));
}
