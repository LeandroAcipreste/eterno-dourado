/**
 * Cabeçalho fixo por cima de todas as seções: a marca, entrar e o menu em
 * tela cheia. O menu abre por data-aberto e inert (sem [hidden], para o CSS
 * conseguir animar a entrada e a saída).
 */

import { el, els } from '../utils/dom.js';
import { sair } from '../utils/api.js';

export function montarCabecalho() {
  const botao = el('[data-menu-abrir]');
  const menu = el('[data-menu]');

  const definirMenu = (aberto) => {
    if (!menu || !botao) return;
    menu.dataset.aberto = aberto ? 'sim' : 'nao';
    menu.inert = !aberto;
    botao.setAttribute('aria-expanded', String(aberto));
    document.documentElement.classList.toggle('menu-aberto', aberto);
    const rotulo = el('.sr', botao);
    if (rotulo) rotulo.textContent = aberto ? 'Fechar menu' : 'Abrir menu';
  };

  definirMenu(false);
  botao?.addEventListener('click', () => definirMenu(menu.dataset.aberto !== 'sim'));

  // escolher um destino fecha o menu
  menu?.addEventListener('click', (evento) => {
    if (evento.target.closest('a, button')) definirMenu(false);
  });

  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && menu?.dataset.aberto === 'sim') {
      definirMenu(false);
      botao?.focus({ preventScroll: true });
    }
  });

  /**
   * O menu do administrador. Logado, as cinco seções do site não dizem nada a quem
   * entrou para trabalhar: o que ele precisa é tirar pedido, cadastrar cliente, mexer
   * na tabela, ver o financeiro e sair.
   */
  const MENU_ADMIN = [
    ['Fazer pedido', '/src/pages/pedido/pedido.html'],
    ['Cadastrar cliente', '/src/pages/admin/admin.html#clientes'],
    ['Alterar tabela de preço', '/src/pages/tabela/tabela.html'],
    ['Financeiro', '/src/pages/carteira/carteira.html'],
    ['Meu cadastro', '/src/pages/admin/admin.html#meu-cadastro'],
  ];

  /** O menu de quem entrou para comprar: pedir, ver o que já pediu e o próprio cadastro. */
  const MENU_LOJISTA = [
    ['Fazer pedido', '/src/pages/pedido/pedido.html'],
    ['Meus pedidos', '/src/pages/conta/conta.html#pedidos'],
    ['Meu cadastro', '/src/pages/conta/conta.html#cadastro'],
  ];

  const numero = (i) => String(i + 1).padStart(2, '0');

  return {
    fecharMenu: () => definirMenu(false),

    /**
     * Troca o menu e o botão do cabeçalho pelo que a conta pede. Sem conta, nada muda:
     * o menu das seções continua sendo o certo para quem está conhecendo o catálogo.
     *
     * @param {{nome: string, admin: boolean}|null} cliente
     */
    mostrarConta(cliente) {
      const entrar = el('.cabecalho__entrar');
      if (!cliente) return;

      // quem já entrou não precisa do botão de entrar
      if (entrar) entrar.hidden = true;

      const lista = el('.menu__lista', menu);
      const acoes = el('.menu__acoes', menu);
      if (!lista) return;

      const itens = cliente.admin ? MENU_ADMIN : MENU_LOJISTA;
      lista.innerHTML = itens
        .map(
          ([texto, destino], i) =>
            `<li><a class="menu__link" href="${destino}"><span class="menu__numero">${numero(i)}</span><span class="menu__nome">${texto}</span></a></li>`,
        )
        .join('');

      if (acoes) {
        acoes.innerHTML = `<button class="btn btn--contorno" type="button" data-sair>Sair</button>`;
      }
    },

    /** Marca no menu a seção em que a pessoa está. */
    marcarPagina(pagina) {
      for (const link of els('[data-pagina]', menu ?? document)) {
        if (link.dataset.pagina !== pagina) {
          link.removeAttribute('aria-current');
          continue;
        }
        link.setAttribute('aria-current', 'page');
      }
    },
  };
}

/**
 * As páginas do painel não têm o cabeçalho fixo da home: o botão do menu fica no topo
 * delas e só aparece para quem entrou, já com o menu da conta.
 *
 * @param {{nome: string, admin: boolean}|null} cliente
 */
export function montarMenuDoPainel(cliente) {
  const cabecalho = montarCabecalho();
  if (!cliente) return;
  cabecalho.mostrarConta(cliente);
  const botao = el('[data-menu-abrir]');
  if (botao) botao.hidden = false;

  // o Sair mora no menu, criado agora
  document.addEventListener('click', async (evento) => {
    if (!evento.target.closest('[data-sair]')) return;
    await sair().catch(() => {});
    location.href = '/';
  });
}
