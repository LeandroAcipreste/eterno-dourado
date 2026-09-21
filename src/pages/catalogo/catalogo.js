/**
 * Catálogo: filtro de largura, busca e os modelos numa vitrine que corre em x
 * enquanto a página rola em y. Cada cartão traz o que o antigo modal mostrava:
 * código, descrição da tabela (literal) e valor, com a foto grande. O que vale para a
 * tabela inteira (forro e pedra) é escrito uma vez, no topo da dobra.
 *
 * O JS mede a faixa e grava --distancia (quanto ela anda) e --p (progresso) na
 * vitrine; o CSS move a faixa e dá a altura da seção.
 */

import { criar, debounce, el } from '../../js/utils/dom.js';
import { criarCartao } from './cartao.js';
import { montarAnimacao, remedirAnimacao } from '../../js/components/animacao.js';
import { achatar, dinheiro, milimetro } from '../../js/utils/formato.js';
import { carregarModelos } from '../../js/utils/modelos.js';
import { aCadaQuadroDeRolagem, progressoDaSecao } from '../../js/utils/rolagem.js';
import { ADICIONAL_FORRO, ADICIONAL_PEDRA } from '../../js/precificacao.js';

// a vitrine mostra uma quantidade; o filtro de largura e a busca alcançam o resto
const MOSTRAR = 12;

export async function init({ container }) {
  const raiz = el('[data-catalogo]', container);
  if (!raiz) return undefined;

  const alvos = {
    vitrine: el('[data-vitrine]', raiz),
    palco: el('[data-vitrine-palco]', raiz),
    trilho: el('[data-catalogo-grade]', raiz),
    contagem: el('[data-catalogo-contagem]', raiz),
    vazio: el('[data-catalogo-vazio]', raiz),
    busca: el('[data-catalogo-busca]', raiz),
    adicionais: el('[data-catalogo-adicionais]', raiz),
  };

  let modelos;
  try {
    ({ modelos } = await carregarModelos());
  } catch (erro) {
    console.error('catálogo não carregado:', erro);
    alvos.vazio.hidden = false;
    alvos.vazio.textContent = 'Não foi possível carregar o catálogo agora. Fale com a gente no WhatsApp.';
    return undefined;
  }

  // vale para a tabela inteira: aparece uma vez, não em cada cartão
  if (alvos.adicionais) {
    alvos.adicionais.textContent = `Em qualquer modelo: forro de aço inoxidável + ${dinheiro(ADICIONAL_FORRO)} por aliança; pedra acrescentada + ${dinheiro(ADICIONAL_PEDRA)} cada.`;
  }

  // a vitrine abre nos 4 mm, com o botão aceso: a pessoa vê modelos de cara e troca
  // a largura nos botões. Clicar na largura acesa desmarca e esvazia a faixa.
  const LARGURA_INICIAL = '4';
  const filtro = { largura: LARGURA_INICIAL, busca: '' };

  const larguras = [...new Set(modelos.map((m) => m.larguraMm).filter((l) => l != null))].sort((a, b) => a - b);
  montarPilulas(el('[data-filtro="largura"]', raiz), larguras.map((l) => [String(l), milimetro(l)]), LARGURA_INICIAL);

  const topoDaVitrine = () => alvos.vitrine.getBoundingClientRect().top + window.scrollY;

  const medir = () => {
    const distancia = Math.max(0, alvos.trilho.scrollWidth - alvos.palco.clientWidth);
    alvos.vitrine.style.setProperty('--distancia', `${distancia}px`);
  };

  const acompanhar = () => alvos.vitrine.style.setProperty('--p', progressoDaSecao(alvos.vitrine).toFixed(4));

  const desenhar = () => {
    const lista = filtro.largura || filtro.busca.trim() ? filtrar(modelos, filtro) : [];
    const visiveis = lista.slice(0, MOSTRAR);
    alvos.trilho.replaceChildren(...visiveis.map(criarCartao));
    alvos.vazio.hidden = lista.length > 0 || (!filtro.largura && !filtro.busca.trim());
    if (lista.length === 0) alvos.contagem.textContent = '';
    else if (lista.length > MOSTRAR) alvos.contagem.textContent = `${MOSTRAR} de ${lista.length} modelos nesta largura`;
    else alvos.contagem.textContent = `${lista.length} de ${modelos.length} modelos`;
    medir();
    montarAnimacao(alvos.trilho); // os cartões novos também entram e saem
    remedirAnimacao();
    // a faixa mudou de tamanho: quem estava no meio dela volta ao começo da vitrine
    if (window.scrollY > topoDaVitrine()) window.scrollTo({ top: topoDaVitrine(), behavior: 'instant' });
    acompanhar();
  };

  const aoClicar = (evento) => {
    const pilula = evento.target.closest('[data-valor]');
    if (!pilula) return;
    const grupo = pilula.closest('[data-filtro]');
    // clicar de novo na largura escolhida desmarca: sem o botão "Todas", é assim que
    // a pessoa volta atrás
    const jaEscolhida = pilula.getAttribute('aria-pressed') === 'true';
    filtro[grupo.dataset.filtro] = jaEscolhida ? null : pilula.dataset.valor;
    for (const outra of grupo.querySelectorAll('[data-valor]')) {
      outra.setAttribute('aria-pressed', String(!jaEscolhida && outra === pilula));
    }
    desenhar();
  };

  /**
   * Buscar manda na largura: quem digita um código quer aquele modelo, não o cruzamento
   * com o filtro. Com 4 mm aceso, procurar um código de 3 mm não devolvia nada. Ao
   * limpar a busca, a vitrine volta para a largura de abertura.
   */
  const aoBuscar = debounce((evento) => {
    filtro.busca = evento.target.value;
    const procurando = filtro.busca.trim() !== '';
    filtro.largura = procurando ? null : LARGURA_INICIAL;
    for (const pilula of raiz.querySelectorAll('[data-filtro="largura"] [data-valor]')) {
      pilula.setAttribute('aria-pressed', String(!procurando && pilula.dataset.valor === LARGURA_INICIAL));
    }
    desenhar();
  }, 160);

  // teclado: o foco num cartão fora da tela rola a página até ele aparecer na faixa.
  // Só foco de teclado: no clique o foco chega no mousedown, e rolar ali tiraria o
  // botão de baixo do mouse antes do mouseup, e o clique nunca aconteceria.
  const aoFocar = (evento) => {
    const item = evento.target.closest('.modelo');
    if (!item || !evento.target.matches(':focus-visible')) return;
    const distancia = Math.max(1, alvos.trilho.scrollWidth - alvos.palco.clientWidth);
    const centro = item.offsetLeft + item.offsetWidth / 2 - alvos.palco.clientWidth / 2;
    const progresso = Math.min(1, Math.max(0, centro / distancia));
    const percurso = alvos.vitrine.offsetHeight - window.innerHeight;
    window.scrollTo({ top: topoDaVitrine() + progresso * percurso, behavior: 'instant' });
  };

  const aoRedimensionar = debounce(() => {
    medir();
    acompanhar();
  }, 120);

  raiz.addEventListener('click', aoClicar);
  alvos.busca?.addEventListener('input', aoBuscar);
  alvos.trilho.addEventListener('focusin', aoFocar);
  window.addEventListener('resize', aoRedimensionar);
  const pararRolagem = aCadaQuadroDeRolagem(acompanhar);
  desenhar();

  return () => {
    pararRolagem();
    aoBuscar.cancelar();
    aoRedimensionar.cancelar();
    window.removeEventListener('resize', aoRedimensionar);
  };
}

function montarPilulas(grupo, opcoes, escolhido) {
  if (!grupo) return;
  grupo.replaceChildren(
    ...opcoes.map(([valor, texto]) =>
      criar('button', {
        class: 'pilula',
        type: 'button',
        texto,
        dataset: { valor },
        'aria-pressed': String(valor === escolhido),
      }),
    ),
  );
}

function filtrar(modelos, filtro) {
  const palavras = achatar(filtro.busca).trim().split(/\s+/).filter(Boolean);
  return modelos.filter((m) => {
    if (filtro.largura && String(m.larguraMm) !== filtro.largura) return false;
    if (palavras.length === 0) return true;
    const alvo = achatar([m.code, m.descricaoTabela].filter(Boolean).join(' '));
    return palavras.every((p) => alvo.includes(p));
  });
}
