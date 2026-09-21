/**
 * Entrada e saída de tudo o que aparece na página.
 *
 * Nada fica estático: texto, foto e cartão têm um estado "fora" e um "dentro", e
 * atravessam de um para o outro quando entram ou saem da tela — descendo ou
 * subindo. Quem desenha o movimento é o CSS; o GSAP (ScrollTrigger) só dispara,
 * trocando dois atributos:
 *
 *   data-dentro   está na tela
 *   data-de       de que lado ele entra ou para que lado ele sai (baixo/cima)
 *
 * Os títulos ainda são divididos em palavras aqui, para cada uma subir da sua
 * máscara com um atraso a mais (--i). Nenhuma interpolação em JavaScript.
 */

import { els } from '../utils/dom.js';

/** O que cada coisa da página faz ao entrar. A ordem importa: vale a primeira que casar. */
const TIPOS = [
  ['.modelo', 'cartao'],
  ['[class*="cartao"], [class*="passo"], [class*="prova"], article, blockquote', 'cartao'],
  // o título da abertura entra letra a letra, cada uma girando como uma aliança
  ['#home h1', 'giro'],
  ['h1', 'palavras'],
  ['h2', 'letras'],
  ['figure, picture, img, .colecao__foto', 'foto'],
  ['.rotulo', 'entra'],
  ['h3, h4, p, li, dt, dd, .btn, form, figcaption', 'sobe'],
];

/**
 * Onde cada tipo começa a entrar, na altura da tela. Quanto menor a porcentagem,
 * mais para dentro da tela o elemento já está quando anima — a pessoa vê a entrada
 * acontecer. Com o gatilho perto da borda (90%), coisas altas como as fotos
 * terminavam a animação antes de aparecerem de fato.
 */
const INICIO = {
  foto: 'top 72%',
  cartao: 'top 78%',
  padrao: 'top 82%',
};

/**
 * Quem está dentro de um palco preso não pode ser o próprio gatilho: o elemento fica
 * parado na tela enquanto a página rola, mas o ScrollTrigger julga pela posição dele no
 * documento — e mandava sair quem ainda estava à vista. Vale para a vitrine e para a
 * abertura, que também tem palco preso. O gatilho passa a ser a seção inteira.
 */
const PALCO_PRESO = '[data-vitrine], [data-abertura], [data-colecao]';
const gatilhoDe = (alvo) => alvo.closest(PALCO_PRESO) ?? alvo;

/**
 * No pé da página não existe rolagem que traga o elemento até "top 82%": o documento
 * acaba antes, e o último atalho do rodapé e a linha do © ficavam invisíveis para
 * sempre. Ali o começo vai preso (clamp) ao que a página tem de rolagem. Só ali: no
 * topo, o clamp prenderia o começo em zero, e a página parada em zero contaria como
 * "antes do começo" — a abertura sairia em vez de entrar.
 */
const comecoDe = (alvo) => {
  const inicio = INICIO[alvo.dataset.anim] ?? INICIO.padrao;
  return alvo.closest('.rodape') ? `clamp(${inicio})` : inicio;
};

/** Dentro de um cartão nada anima sozinho: o cartão inteiro é que entra. */
const DENTRO_DE_CARTAO = '.modelo, [class*="cartao"]';

function marcar(raiz) {
  for (const [seletor, tipo] of TIPOS) {
    for (const alvo of els(seletor, raiz)) {
      if (alvo.dataset.anim) continue;
      if (alvo.closest(DENTRO_DE_CARTAO) && !alvo.matches(DENTRO_DE_CARTAO)) continue;
      if (alvo.closest('[data-cabecalho], [data-menu], [data-preloader], dialog')) continue;
      // a arte do rodapé ocupa a largura inteira: crescer 4% na entrada empurraria a
      // página para o lado
      if (alvo.closest('.rodape__arte')) continue;
      // foto dentro de foto ganharia a escala duas vezes (a figure e a img dentro dela)
      if (tipo === 'foto' && alvo.parentElement?.closest('[data-anim="foto"]')) continue;
      alvo.dataset.anim = tipo;
    }
  }
}

/**
 * Cada palavra numa máscara, para subir de dentro dela. O texto inteiro fica no
 * aria-label e as partes saem da leitura, para o leitor de tela não soletrar.
 */
function dividirEmPalavras(titulo) {
  if (titulo.children.length > 0) return;
  const texto = titulo.textContent.trim().replace(/\s+/g, ' ');
  titulo.setAttribute('aria-label', texto);

  const partes = [];
  texto.split(' ').forEach((palavra, indice) => {
    if (indice > 0) partes.push(document.createTextNode(' '));
    const mascara = document.createElement('span');
    mascara.className = 'palavra';
    mascara.setAttribute('aria-hidden', 'true');
    const interna = document.createElement('span');
    interna.textContent = palavra;
    interna.style.setProperty('--i', String(indice));
    mascara.append(interna);
    partes.push(mascara);
  });
  titulo.replaceChildren(...partes);
}

/**
 * Cada letra numa caixa própria, com uma ordem embaralhada em --i: é o efeito de
 * caractere do webHub, só que o atraso vira dado para o CSS em vez de interpolação
 * no JavaScript. O texto inteiro fica no aria-label, para não ser soletrado.
 */
function dividirEmLetras(titulo, { embaralhar = true } = {}) {
  if (titulo.children.length > 0) return;
  const texto = titulo.textContent.trim().replace(/\s+/g, ' ');
  titulo.setAttribute('aria-label', texto);

  // na ordem da leitura quando o efeito é o giro: uma aliança depois da outra
  const ordem = [...texto].map((_, i) => i);
  if (embaralhar) {
    for (let i = ordem.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
    }
  }

  // as letras vão agrupadas por palavra: soltas, a linha quebrava no meio de uma
  // palavra ("Ete / rno"), porque cada letra é uma caixa e o texto pode quebrar entre elas
  const partes = [];
  let letraAtual = 0;
  texto.split(' ').forEach((palavra, indice) => {
    if (indice > 0) partes.push(document.createTextNode(' '));
    const caixaPalavra = document.createElement('span');
    caixaPalavra.className = 'letras-palavra';
    caixaPalavra.setAttribute('aria-hidden', 'true');
    for (const letra of palavra) {
      const caixa = document.createElement('span');
      caixa.className = 'letra';
      caixa.textContent = letra;
      caixa.style.setProperty('--i', String(ordem[letraAtual]));
      letraAtual += 1;
      caixaPalavra.append(caixa);
    }
    letraAtual += 1; // o espaço também conta na ordem sorteada
    partes.push(caixaPalavra);
  });
  titulo.replaceChildren(...partes);
}

/** Enquanto a abertura cobre a tela, ninguém entra: fica na fila. */
let segurando = false;
const segurados = [];

/**
 * Enquanto a página é remedida, ninguém entra nem sai. O refresh do ScrollTrigger
 * reavalia todos os gatilhos e dispara saída e entrada em quem já estava na tela — e
 * isso, no meio da chegada do título da abertura, reiniciava a contagem das letras que
 * ainda não tinham tido a vez: começava certo, travava, e o resto aparecia em bloco.
 */
let remedindo = false;

const entrar = (alvo, de) => {
  if (remedindo) return;
  if (segurando) {
    // vale para qualquer caminho, inclusive o onEnter que o ScrollTrigger dispara ao
    // remedir a página: sem isto, a primeira dobra animava atrás da cortina e aparecia
    // pronta quando ela abria
    if (!segurados.includes(alvo)) segurados.push(alvo);
    return;
  }
  alvo.dataset.de = de;
  alvo.dataset.dentro = '';
};

const sair = (alvo, para) => {
  if (remedindo) return;
  delete alvo.dataset.dentro;
  alvo.dataset.de = para;
};

/**
 * Deixa o trecho pronto para animar: marca o tipo de cada elemento e divide os
 * títulos. Separado de ligar os gatilhos porque a abertura precisa do texto já
 * escondido enquanto o preloader está na tela — se os gatilhos nascessem junto, a
 * primeira dobra entraria por trás dele e apareceria pronta.
 *
 * @returns {HTMLElement[]} os elementos que ainda não têm gatilho
 */
export function prepararAnimacao(raiz = document) {
  marcar(raiz);
  const alvos = els('[data-anim]', raiz);
  for (const alvo of alvos) {
    if (alvo.dataset.preparado !== undefined) continue;
    alvo.dataset.preparado = '';
    if (alvo.dataset.anim === 'palavras') dividirEmPalavras(alvo);
    if (alvo.dataset.anim === 'letras') dividirEmLetras(alvo);
    if (alvo.dataset.anim === 'giro') dividirEmLetras(alvo, { embaralhar: false });
    if (alvo.dataset.anim === 'onda') dividirEmLetras(alvo, { embaralhar: false });
  }
  return alvos;
}

/**
 * Solta quem estava segurado: a primeira dobra entra agora, com a página já medida.
 * Medir os gatilhos custa caro, e fazer isso no mesmo quadro em que o texto começa a
 * se mexer engasgava a entrada.
 */
export function liberarPrimeiraDobra() {
  segurando = false;
  for (const alvo of segurados.splice(0)) entrar(alvo, 'baixo');
}

/**
 * Liga os gatilhos de rolagem do trecho (a vitrine chama de novo a cada desenho,
 * com os cartões recém-criados).
 *
 * @param {ParentNode} raiz
 * @param {{segurar?: boolean}} opcoes segurar: quem já está na tela espera a abertura
 */
export function montarAnimacao(raiz = document, { segurar = false } = {}) {
  // quem já tem gatilho fica de fora: a vitrine remonta a cada filtro, e a abertura
  // prepara a página inteira antes de qualquer gatilho existir
  if (segurar) segurando = true;
  const alvos = prepararAnimacao(raiz).filter((alvo) => alvo.dataset.gatilho === undefined);
  if (alvos.length === 0) return;
  for (const alvo of alvos) alvo.dataset.gatilho = '';

  const { gsap, ScrollTrigger } = window;
  // sem GSAP tudo nasce no lugar e legível. A preferência de movimento do sistema não
  // desliga nada aqui: ela encurta as distâncias no CSS, e o site continua vivo.
  if (!gsap || !ScrollTrigger) {
    for (const alvo of alvos) entrar(alvo, 'baixo');
    return;
  }

  gsap.registerPlugin(ScrollTrigger);
  for (const alvo of alvos) {
    const gatilho = ScrollTrigger.create({
      trigger: gatilhoDe(alvo),
      start: comecoDe(alvo),
      end: 'bottom 18%',
      onEnter: () => entrar(alvo, 'baixo'),
      onEnterBack: () => entrar(alvo, 'cima'),
      onLeave: () => sair(alvo, 'cima'),
      onLeaveBack: () => sair(alvo, 'baixo'),
    });
    // quem já está na tela quando o gatilho nasce não recebe onEnter: o ScrollTrigger
    // só avisa as travessias. Sem isto, a primeira dobra ficava escondida para sempre.
    if (gatilho.isActive) entrar(alvo, 'baixo'); // com a fila ligada, entrar() é quem segura
  }
}

/** A página mudou de altura (cartões, fontes, imagens): os gatilhos remedem. */
export function remedirAnimacao() {
  if (!window.ScrollTrigger) return;
  // o refresh reavalia e chama os callbacks na mesma linha, então o pino sai aqui
  // mesmo: por quadro, uma aba fora de foco o deixaria preso e nada mais entraria
  remedindo = true; // medir a página não pode mexer no que já está acontecendo nela
  try {
    window.ScrollTrigger.refresh();
  } finally {
    remedindo = false;
  }
}
