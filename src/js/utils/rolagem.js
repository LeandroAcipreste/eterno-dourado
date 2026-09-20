/**
 * Medidas de rolagem para as seções presas (palco sticky dentro de uma seção alta).
 * Só leem geometria; quem escreve --p no elemento é a página.
 */

const limitar = (valor) => Math.min(1, Math.max(0, valor));

/** 0 quando o topo da seção encosta no topo da tela; 1 quando o fim dela encosta no fim da tela. */
export function progressoDaSecao(secao) {
  const percurso = secao.offsetHeight - window.innerHeight;
  return limitar(-secao.getBoundingClientRect().top / Math.max(1, percurso));
}

/** 0 no topo da página; 1 no fim. */
export function progressoDaPagina() {
  const percurso = document.documentElement.scrollHeight - window.innerHeight;
  return percurso > 0 ? limitar(window.scrollY / percurso) : 0;
}

/** Chama `fn` no máximo uma vez por quadro enquanto houver rolagem ou mudança de tamanho. Devolve a função que desliga. */
export function aCadaQuadroDeRolagem(fn) {
  let pedido = 0;
  const agendar = () => {
    if (pedido) return;
    pedido = requestAnimationFrame(() => {
      pedido = 0;
      fn();
    });
  };
  window.addEventListener('scroll', agendar, { passive: true });
  window.addEventListener('resize', agendar);
  agendar();
  return () => {
    cancelAnimationFrame(pedido);
    window.removeEventListener('scroll', agendar);
    window.removeEventListener('resize', agendar);
  };
}
