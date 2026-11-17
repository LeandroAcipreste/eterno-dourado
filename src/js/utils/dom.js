/**
 * Texto do banco ou de quem digita não é marcação: entra como letra, nunca como tag.
 * Um nome de cliente ou uma descrição com "<" quebraria a página — ou pior, traria
 * script junto.
 */
export const escapar = (valor) =>
  String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

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

/** O sistema pede movimento reduzido? */
export function movimentoReduzido() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
