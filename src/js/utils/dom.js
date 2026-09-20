export const el = (seletor, raiz = document) => raiz.querySelector(seletor);
export const els = (seletor, raiz = document) => [...raiz.querySelectorAll(seletor)];

/** Cria elemento com classes, atributos, texto e filhos numa chamada. */
export function criar(tag, props = {}, filhos = []) {
  const node = document.createElement(tag);
  for (const [chave, valor] of Object.entries(props)) {
    if (valor === null || valor === undefined || valor === false) continue;
    if (chave === 'class') node.className = valor;
    else if (chave === 'texto') node.textContent = valor;
    else if (chave === 'dataset') Object.assign(node.dataset, valor);
    else if (chave === 'estilo') node.setAttribute('style', valor);
    else node.setAttribute(chave, valor === true ? '' : String(valor));
  }
  for (const filho of [].concat(filhos)) {
    if (filho) node.append(filho);
  }
  return node;
}

/** Debounce com cancelamento, para o refreshGeometry único da página. */
export function debounce(fn, espera = 160) {
  let id = 0;
  const envolvido = (...args) => {
    clearTimeout(id);
    id = setTimeout(() => fn(...args), espera);
  };
  envolvido.cancelar = () => clearTimeout(id);
  return envolvido;
}

/**
 * Espera uma transição de CSS terminar no próprio elemento. O limite é a rede de
 * segurança: em aba de segundo plano a transição não dispara, e a sequência não pode
 * ficar presa.
 *
 * Não há atalho para movimento reduzido: o site anima para todo mundo, e resolver na
 * hora fazia a primeira dobra ser solta ainda atrás da cortina — quando a tela
 * aparecia, a animação já tinha acontecido.
 */
export function esperarTransicao(alvo, propriedade, limite = 1200) {
  return new Promise((resolver) => {
    const terminar = () => {
      alvo.removeEventListener('transitionend', aoTerminar);
      clearTimeout(reserva);
      resolver();
    };
    const aoTerminar = (evento) => {
      if (evento.target === alvo && evento.propertyName === propriedade) terminar();
    };
    const reserva = setTimeout(terminar, limite);
    alvo.addEventListener('transitionend', aoTerminar);
  });
}

/** Lê o preferido do usuário uma vez e reage a mudanças. */
export function movimentoReduzido() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Espera a página estar estável para medir: fontes, imagens visíveis e dois
 * quadros de renderização, como a skill pede na fase de medição.
 */
export async function paginaEstavel() {
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      /* fonte não é bloqueante para medir */
    }
  }
  if (document.readyState !== 'complete') {
    await new Promise((resolve) => window.addEventListener('load', resolve, { once: true }));
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}
