/**
 * Fechamento padrão de um <dialog> aberto com showModal():
 * botão [data-fechar], clique no fundo escurecido e Esc (nativo).
 */
export function ligarFechamento(dialogo, aoFechar) {
  dialogo.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar]')) {
      dialogo.close();
      return;
    }
    // o conteúdo ocupa o diálogo inteiro, então clique no próprio <dialog> é o fundo
    if (evento.target === dialogo) dialogo.close();
  });

  if (aoFechar) dialogo.addEventListener('close', aoFechar);
}
