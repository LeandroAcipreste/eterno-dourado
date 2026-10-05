/**
 * Tabela de preço, a página inteira.
 *
 * Em repouso é leitura: as 80 referências com o valor de uma aliança. Alterar é um
 * clique no "Alterar" ao lado da referência — o campo aparece só naquela linha, grava
 * ao sair dele ou no Enter, e o Esc desiste.
 *
 * Quem decide se você pode mudar preço é o servidor: a rota exige administrador.
 */

import { montarAreaCliente } from '../../js/components/area-cliente.js';
import { escapar } from '../../js/utils/dom.js';
import { pedir, quemEstaLogado } from '../../js/utils/api.js';
import { ADICIONAL_FORRO, ADICIONAL_PEDRA, valorDaUnidade } from '../../js/precificacao.js';

/** O modelo de cada linha, para a conta do forro e da pedra não depender da tela. */
const porCodigo = new Map();

const el = (selecao, raiz = document) => raiz.querySelector(selecao);

const aviso = el('[data-aviso]');
const painel = el('[data-painel]');
const corpo = el('[data-precos]');

const dinheiro = (valor) => Number(valor).toFixed(2).replace('.', ',');

function avisar(texto, { erro = false } = {}) {
  aviso.textContent = texto;
  aviso.hidden = !texto;
  aviso.dataset.erro = erro ? 'sim' : 'nao';
}

function desenhar(modelos) {
  porCodigo.clear();
  corpo.replaceChildren(
    ...modelos.map((m) => {
      porCodigo.set(m.code, m);
      const linha = document.createElement('tr');
      linha.dataset.codigo = m.code;
      linha.dataset.preco = m.sobConsulta ? '' : m.precoUnidade;
      // pedra avulsa só em liso e pedra única: nos outros ela já está no preço
      const pedra = m.aceitaPedraAvulsa
        ? `<label class="tabela__opcao">
             <input type="checkbox" data-opcao="pedra" />
             <span>Pedra +${dinheiro(ADICIONAL_PEDRA)}</span>
           </label>`
        : '';
      linha.innerHTML = `
        <td>
          <strong>${escapar(m.codigoTabela ?? m.code)}</strong>
          <button class="tabela__alterar" type="button" data-alterar>Alterar</button>
        </td>
        <td>${m.descricaoTabela ? escapar(m.descricaoTabela) : '<span class="admin__cidade">fora da tabela</span>'}</td>
        <td>${m.larguraMm ? `${String(m.larguraMm).replace('.', ',')} mm` : '—'}</td>
        <td class="tabela__opcoes">
          <label class="tabela__opcao">
            <input type="checkbox" data-opcao="forro" />
            <span>Forro +${dinheiro(ADICIONAL_FORRO)}</span>
          </label>
          ${pedra}
        </td>
        <td class="tabela__valor" data-valor>${m.sobConsulta ? 'sob consulta' : dinheiro(m.precoUnidade)}</td>`;
      return linha;
    }),
  );
}

/** O valor com o que estiver marcado na linha: a conta é a mesma do catálogo. */
function mostrarValor(linha) {
  const modelo = porCodigo.get(linha.dataset.codigo);
  if (!modelo) return;
  const marcado = (nome) => el(`[data-opcao="${nome}"]`, linha)?.checked ?? false;
  const valor = valorDaUnidade(
    { ...modelo, precoUnidade: Number(linha.dataset.preco) },
    { forro: marcado('forro'), pedras: marcado('pedra') ? 1 : 0 },
  );
  const cela = el('[data-valor]', linha);
  if (el('input', cela)) return; // está em edição: não atropelar quem digita
  cela.textContent = valor === null ? 'sob consulta' : dinheiro(valor);
  cela.dataset.comOpcao = marcado('forro') || marcado('pedra') ? 'sim' : 'nao';
}

corpo?.addEventListener('change', (evento) => {
  if (evento.target.closest('[data-opcao]')) mostrarValor(evento.target.closest('tr'));
});

async function carregar(busca = '') {
  // a tabela inteira: 408 referências, com foto ou sem
  const { modelos } = await pedir(`/api/modelos?limite=500&busca=${encodeURIComponent(busca)}`);
  desenhar(modelos);
}

/** Troca o valor da linha por um campo, já com o cursor nele. */
function abrirCampo(linha) {
  const cela = el('[data-valor]', linha);
  if (el('input', cela)) return;
  const anterior = linha.dataset.preco;
  cela.innerHTML = `<input type="number" min="0" step="0.01" value="${anterior}" aria-label="Preço de ${linha.querySelector('strong').textContent}" />`;
  const campo = el('input', cela);
  campo.focus();
  campo.select();

  const fechar = () => mostrarValor(linha);

  const gravar = async () => {
    const preco = Number(campo.value);
    if (!Number.isFinite(preco) || preco < 0) return fechar();
    if (String(preco) === String(anterior)) return fechar();
    try {
      const { modelo } = await pedir(`/api/modelos/${encodeURIComponent(linha.dataset.codigo)}`, {
        method: 'PATCH',
        body: JSON.stringify({ preco }),
      });
      linha.dataset.preco = modelo.precoUnidade;
      fechar();
      avisar(`${modelo.codigoTabela ?? modelo.code} agora custa R$ ${dinheiro(modelo.precoUnidade)} por aliança.`);
    } catch (erro) {
      fechar();
      avisar(erro.message, { erro: true });
    }
  };

  campo.addEventListener('blur', gravar, { once: true });
  campo.addEventListener('keydown', (evento) => {
    if (evento.key === 'Enter') campo.blur();
    if (evento.key === 'Escape') {
      campo.removeEventListener('blur', gravar);
      fechar();
    }
  });
}

corpo?.addEventListener('click', (evento) => {
  const botao = evento.target.closest('[data-alterar]');
  if (botao) abrirCampo(botao.closest('tr'));
});

let buscando;
el('[data-busca]')?.addEventListener('input', (evento) => {
  clearTimeout(buscando);
  const termo = evento.target.value;
  buscando = setTimeout(() => carregar(termo).catch((erro) => avisar(erro.message, { erro: true })), 250);
});

/* ---- modelo novo ----------------------------------------------------------- */

const formaNovo = el('[data-forma-novo]');
const botaoNovo = el('[data-abrir-novo]');

botaoNovo?.addEventListener('click', () => {
  formaNovo.hidden = !formaNovo.hidden;
  botaoNovo.setAttribute('aria-expanded', String(!formaNovo.hidden));
  if (!formaNovo.hidden) el('input', formaNovo).focus();
});

formaNovo?.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  const dados = Object.fromEntries(new FormData(formaNovo));
  try {
    const { modelo } = await pedir('/api/modelos', {
      method: 'POST',
      body: JSON.stringify({
        codigo: dados.codigo,
        descricao: dados.descricao,
        largura: dados.largura ? Number(dados.largura) : null,
        preco: Number(dados.preco),
      }),
    });
    formaNovo.reset();
    formaNovo.hidden = true;
    botaoNovo.setAttribute('aria-expanded', 'false');
    avisar(`${modelo.codigoTabela ?? modelo.code} entrou na tabela por R$ ${dinheiro(modelo.precoUnidade)}.`);
    // a busca é limpa para o modelo novo aparecer na lista
    el('[data-busca]').value = '';
    await carregar();
  } catch (erro) {
    avisar(erro.message, { erro: true });
  }
});

/* ---- entrada --------------------------------------------------------------- */

const cliente = await quemEstaLogado();
if (!cliente) {
  avisar('Entre para ver a tabela.', { erro: true });
  montarAreaCliente().abrir();
} else if (!cliente.admin) {
  avisar(`${cliente.nome}, esta página é do administrador.`, { erro: true });
} else {
  painel.hidden = false;
  await carregar().catch((erro) => avisar(erro.message, { erro: true }));
}
