/**
 * A primeira coisa que roda na visita.
 *
 * A visita começa sempre na abertura. O navegador, por conta própria, volta para a
 * posição em que a página estava antes de recarregar, ou pula para a âncora da URL —
 * e as duas coisas são decididas antes de o corpo existir. Por isso este arquivo é
 * carregado de forma síncrona no cabeçalho, e não como módulo no fim do corpo como o
 * resto do JS: depois do corpo, o navegador já agendou o salto e não há como desfazer
 * sem a página pular à vista.
 *
 * É tudo o que ele faz. Qualquer outra coisa pertence ao main.js.
 */

history.scrollRestoration = 'manual';

if (location.hash) {
  history.replaceState(null, '', location.pathname + location.search);
}
