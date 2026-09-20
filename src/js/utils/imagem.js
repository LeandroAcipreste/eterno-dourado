import { criar } from './dom.js';

/**
 * Monta a <img> de uma peça com srcset.
 *
 * As fotos aprimoradas saem em três larguras (190, 380 e 570) por
 * scripts/aprimorar-imagens.mjs. O `sizes` diz ao navegador a largura de
 * exibição em CSS, e ele escolhe a densidade certa — sem isso ele baixaria
 * sempre a maior.
 *
 * `width` e `height` vão sempre no atributo, para o cartão reservar o espaço e
 * a grade não saltar enquanto as imagens carregam.
 */
// os caminhos de modelos.json são relativos à raiz; as dobras moram em subpastas
const daRaiz = (caminho) => (/^(\/|https?:|data:)/.test(caminho) ? caminho : `/${caminho}`);

export function imagemDaPeca(modelo, { classe = 'peca__img', sizes, alt, prioridade = false } = {}) {
  const larguras = modelo.fotoLarguras ?? [];
  const props = {
    class: classe,
    src: daRaiz(modelo.foto),
    // proporção real da peça: nenhuma delas é quadrada
    width: modelo.fotoW ?? 190,
    height: modelo.fotoH ?? 190,
    alt: alt ?? `Par de alianças ${modelo.code}`,
    decoding: 'async',
  };

  if (larguras.length > 1) {
    props.srcset = larguras.map((v) => `${daRaiz(v.caminho)} ${v.largura}w`).join(', ');
    props.sizes = sizes ?? '190px';
  }

  // a peça do hero é a primeira coisa visível; as demais podem esperar
  if (prioridade) props.fetchpriority = 'high';
  else props.loading = 'lazy';

  return criar('img', props);
}
