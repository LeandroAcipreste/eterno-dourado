/**
 * Área do cliente. O pedido será feito depois do login, no ERP; enquanto o
 * acesso não existe, o formulário não finge autenticar: explica e leva ao
 * WhatsApp.
 */

import { el } from '../utils/dom.js';
import { ligarFechamento } from '../utils/dialogo.js';

export function montarAreaCliente() {
  const dialogo = el('[data-dialogo-entrar]');
  if (!dialogo) return { abrir() {} };

  const forma = el('form', dialogo);
  const status = el('[data-entrar-status]', dialogo);

  forma?.addEventListener('submit', (evento) => {
    evento.preventDefault();
    status.hidden = false;
    status.focus();
  });

  ligarFechamento(dialogo);

  return {
    abrir() {
      if (status) status.hidden = true;
      dialogo.showModal();
      el('input', dialogo)?.focus();
    },
  };
}
