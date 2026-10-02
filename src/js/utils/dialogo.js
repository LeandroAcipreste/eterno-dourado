/**
 * Fechamento de um <dialog> aberto com showModal().
 *
 * Só o botão [data-fechar] fecha — clique no fundo escurecido, não. Quem está no meio
 * de digitar e-mail e senha não pode perder o que escreveu por um clique de raspão
 * fora da caixa. O Esc continua valendo, porque é o X de quem usa teclado.
 */
export function ligarFechamento(dialogo, aoFechar) {
  dialogo.addEventListener('click', (evento) => {
    if (evento.target.closest('[data-fechar]')) dialogo.close();
  });

  if (aoFechar) dialogo.addEventListener('close', aoFechar);
}
