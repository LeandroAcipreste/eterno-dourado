/**
 * Cabeçalho fixo por cima de todas as seções: a marca, entrar e o menu em
 * tela cheia. O menu abre por data-aberto e inert (sem [hidden], para o CSS
 * conseguir animar a entrada e a saída).
 */

import { el, els } from '../utils/dom.js';

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
      botao?.focus();
    }
  });

  return {
    fecharMenu: () => definirMenu(false),

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
