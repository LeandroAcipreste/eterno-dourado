/**
 * A ficha de um lojista, aberta da lista do painel (?id=).
 *
 * Mostra o cadastro como ele está (mudar desconto, frete e OBS continua no painel) e os
 * pedidos dele: cada um com a folha em PDF e o envio por e-mail, que abre embaixo da
 * linha com o e-mail do cliente já escrito.
 */

import { API } from '../../js/config.js';
import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { montarMenuDoPainel } from '../../js/components/cabecalho.js';
import { formularioDeEmail } from '../../js/components/email-do-pedido.js';
import { escapar } from '../../js/utils/dom.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const corpo = el('[data-pedidos]');

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

function desenharFicha(c) {
  document.title = `${c.nome} · Eterno Dourado`;
  el('[data-nome]').textContent = c.nome;
  el('[data-ficha]').innerHTML = [
    ['E-mail', c.email],
    ['CNPJ', c.cnpj || '—'],
    ['Cidade', c.cidade || '—'],
    ['Desconto', `${Number(c.desconto)}%`],
    ['Frete', c.paga_frete ? `R$ ${dinheiro(c.frete)}` : 'Incluso'],
    ['Observação', c.observacao || '—'],
    ['Situação', c.ativo ? 'Ativo' : 'Inativo'],
  ]
    .map(([rotulo, valor]) => `<dt>${rotulo}</dt><dd>${escapar(valor)}</dd>`)
    .join('');
  el('[data-fazer-pedido]').href = `/src/pages/pedido/pedido.html?cliente=${Number(c.id)}`;
  el('[data-fazer-pedido]').hidden = !c.ativo;
}

function desenharPedidos(pedidos, cliente) {
  el('[data-contagem]').textContent = pedidos.length ? `(${pedidos.length})` : '';
  el('[data-tabela-pedidos]').hidden = pedidos.length === 0;
  el('[data-sem-pedidos]').hidden = pedidos.length > 0;

  corpo.replaceChildren(
    ...pedidos.map((p) => {
      const linha = document.createElement('tr');
      linha.innerHTML = `
        <td><strong>${escapar(p.numero)}</strong></td>
        <td>${new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
        <td>${Number(p.pecas)}</td>
        <td>${p.tem_sob_consulta ? `${dinheiro(p.total)} + sob consulta` : dinheiro(p.total)}</td>
        <td>${SITUACAO[p.situacao] ?? escapar(p.situacao)}</td>
        <td>
          <a class="admin__acao" href="${API}/api/pedidos/${Number(p.id)}/folha.pdf">Baixar PDF</a>
          <button class="admin__acao" type="button" data-email>Enviar por e-mail</button>
        </td>`;

      // o formulário abre numa linha logo abaixo; clicar de novo fecha
      el('[data-email]', linha).addEventListener('click', () => {
        const aberta = linha.nextElementSibling?.dataset.linhaEmail === String(p.id);
        if (aberta) return linha.nextElementSibling.remove();
        const extra = document.createElement('tr');
        extra.dataset.linhaEmail = p.id;
        const celula = document.createElement('td');
        celula.colSpan = 6;
        celula.append(formularioDeEmail(p, { sugestao: cliente.email, avisar }));
        extra.append(celula);
        linha.after(extra);
        el('input', extra).focus();
      });
      return linha;
    }),
  );
}

/* ---- entrada ------------------------------------------------------------------- */

const conta = await quemEstaLogado();
if (conta && !conta.admin) {
  location.replace('/src/pages/conta/conta.html');
} else if (!conta) {
  montarMenuDoPainel(null);
  avisar('Entre para abrir a ficha do cliente.', { erro: true });
  montarAreaCliente().abrir();
} else {
  montarMenuDoPainel(conta);
  el('[data-quem]').textContent = conta.nome;
  const id = Number(new URLSearchParams(location.search).get('id'));
  try {
    const [{ cliente }, { pedidos }] = await Promise.all([
      pedir(`/api/clientes/${id}`),
      pedir(`/api/clientes/${id}/pedidos`),
    ]);
    painel.hidden = false;
    desenharFicha(cliente);
    desenharPedidos(pedidos, cliente);
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
}
