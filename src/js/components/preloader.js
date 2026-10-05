/**
 * Abertura do site: o nome em círculo girando enquanto a primeira dobra se prepara.
 *
 * A abertura NÃO é um cronômetro. Ela sai quando duas coisas acontecem:
 *
 *   · passou o tempo mínimo da marca (8 s), que é o momento da chegada;
 *   · a hero está pronta — fonte carregada, imagens decodificadas, um quadro pintado.
 *
 * Fazer isso por relógio foi o defeito que existiu até aqui: com o site lento, os 8 s
 * cobriam a demora por acaso; quando o carregamento ficou rápido, a abertura passou a
 * sair antes de a hero existir, e a pessoa via a página se montando.
 *
 * A abertura é um painel só: ele cobre a tela, carrega a roda e desce revelando a
 * página. A roda é um PNG com fundo transparente, girando por CSS. A saída tem dois
 * tempos, nunca ao mesmo tempo: a roda apaga, e só então o painel desce.
 *
 * A suíte de testes desliga a abertura pela chave de config.js, senão seriam 8 segundos
 * em cada aba medida.
 */

import { el, movimentoReduzido } from '../utils/dom.js';
import { emTeste } from '../config.js';

const ANIMACAO = 'preloader-sair';
const MINIMO = 8000; // o tempo da marca: a chegada não pode ser atropelada
const TETO = 6000; // o quanto se espera pela hero DEPOIS do mínimo, e não mais
const FADE = 420; // o tempo em que a roda apaga, igual ao do CSS
const DESCIDA = 1600; // o tempo em que o painel desce, igual ao do CSS

// A abertura é uma chegada, não um pedágio: ela vale a primeira vez da visita. Quem
// recarrega, volta do pedido ou abre outra página não espera de novo.
const CHAVE_VISTA = 'eterno-dourado:abertura-vista';

const jaViu = () => {
  try {
    return sessionStorage.getItem(CHAVE_VISTA) === 'sim';
  } catch {
    return false; // navegação privada com armazenamento bloqueado: mostra a abertura
  }
};

const anotarQueViu = () => {
  try {
    sessionStorage.setItem(CHAVE_VISTA, 'sim');
  } catch {
    /* sem armazenamento: a abertura volta na próxima, e tudo bem */
  }
};

const esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));
const doisQuadros = () =>
  new Promise((resolver) => requestAnimationFrame(() => requestAnimationFrame(resolver)));

/**
 * A primeira dobra está em condições de entrar?
 *
 * Fonte carregada (senão o título salta de uma fonte para outra), imagem da dobra
 * decodificada (senão ela aparece em branco e preenche depois) e um quadro pintado
 * com tudo isso no lugar.
 */
async function heroPronta() {
  await document.fonts?.ready.catch(() => {});
  const hero = el('[data-abertura]');
  const imagens = hero ? [...hero.querySelectorAll('img')] : [];
  await Promise.all(imagens.map((img) => (img.complete ? null : img.decode().catch(() => {}))));
  await doisQuadros();
}

/**
 * Diz no console se a roda está mesmo girando na tela, e não só se o código rodou:
 * mede o ângulo duas vezes e compara. Serve para separar "o CSS não se aplicou" de
 * "o navegador está com animação desligada", que é a causa silenciosa mais comum.
 */
function conferirGiro(preloader) {
  const roda = preloader.querySelector('.preloader__roda');
  if (!roda) return;
  const estilo = getComputedStyle(roda);
  const angulo = () => {
    const m = new DOMMatrixReadOnly(getComputedStyle(roda).transform);
    return (Math.atan2(m.b, m.a) * 180) / Math.PI;
  };
  const antes = angulo();
  setTimeout(() => {
    const andou = Math.abs(angulo() - antes);
    const reduzido = movimentoReduzido();
    console.info(
      `[Eterno Dourado] abertura · animação: ${estilo.animationName} ${estilo.animationDuration} · girou ${andou.toFixed(1)}° em 600 ms` +
        (andou < 1
          ? reduzido
            ? ' · PARADA porque este computador está com "movimento reduzido" ligado (Windows: Configurações › Acessibilidade › Efeitos visuais › Animações)'
            : ' · PARADA sem ser por movimento reduzido: o CSS da roda não chegou à tela'
          : ''),
    );
  }, 600);
}

export function montarPreloader() {
  const preloader = el('[data-preloader]');
  // sai do documento aqui, antes de a página montar: parada por cima da tela, ela
  // bloquearia o conteúdo. Vale para o teste e para quem já viu a abertura nesta visita.
  if (preloader && (emTeste() || jaViu())) preloader.remove();

  let comecou = 0;

  return {
    /** Mostra a abertura e começa a contar o tempo mínimo. */
    abrir() {
      if (!preloader?.isConnected) return;
      comecou = performance.now();
      anotarQueViu();
      conferirGiro(preloader);
    },

    /**
     * Sai quando a hero está pronta, nunca antes do tempo mínimo.
     *
     * Devolve assim que a saída COMEÇA, não quando termina: a cortina desce junto com
     * o nome apagando, e a passagem é um movimento só em vez de dois tempos mortos.
     */
    /**
     * Apaga a roda. Volta quando ela sumiu — o painel ainda cobre a tela.
     *
     * Espera a hero ficar pronta e o tempo mínimo da marca, o que demorar mais. Vale
     * também quando a abertura não aparece (segunda visita): sem isso, a página era
     * revelada com a fonte e as imagens ainda chegando.
     */
    async apagarRoda() {
      if (!preloader?.isConnected) {
        await Promise.race([heroPronta(), esperar(TETO)]);
        return;
      }
      await Promise.all([
        esperar(Math.max(0, MINIMO - (performance.now() - comecou))),
        Promise.race([heroPronta(), esperar(MINIMO + TETO)]),
      ]);
      preloader.setAttribute('data-sair', '');
      await esperar(FADE);
    },

    /** O painel desce e revela a página. Volta quando terminou de sair. */
    async descer() {
      if (!preloader?.isConnected) return;
      const chegou = new Promise((resolver) => {
        const aoFim = (evento) => {
          if (evento.target !== preloader || evento.propertyName !== 'transform') return;
          preloader.removeEventListener('transitionend', aoFim);
          clearTimeout(reserva);
          resolver();
        };
        const reserva = setTimeout(resolver, DESCIDA + 400); // aba em segundo plano não anima
        preloader.addEventListener('transitionend', aoFim);
      });
      preloader.setAttribute('data-desce', '');
      await chegou;
      preloader.remove();
    },
  };
}
