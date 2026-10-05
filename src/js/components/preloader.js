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
 * A roda é um PNG com fundo transparente: o navegador o desenha uma vez e só gira a
 * camada. Quem faz o movimento é o CSS; o JS só diz quando sair.
 *
 * A suíte de testes desliga a abertura pela chave de config.js, senão seriam 8 segundos
 * em cada aba medida.
 */

import { el, movimentoReduzido } from '../utils/dom.js';
import { emTeste } from '../config.js';

const ANIMACAO = 'preloader-sair';
const MINIMO = 8000; // o tempo da marca: a chegada não pode ser atropelada
const TETO = 6000; // o quanto se espera pela hero DEPOIS do mínimo, e não mais
const LIMITE = 4000; // rede de segurança depois do pedido de saída

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
    async sair() {
      // A hero precisa estar pronta mesmo quando a abertura não aparece — na segunda
      // visita ela é pulada, e sem esta espera a cortina subia sobre uma hero ainda
      // sem fonte e sem imagem: a pessoa via a página se montando.
      if (!preloader?.isConnected) {
        await Promise.race([heroPronta(), esperar(TETO)]);
        return;
      }

      // com a abertura na tela, as duas condições correm juntas: manda a que demorar mais
      await Promise.all([
        esperar(Math.max(0, MINIMO - (performance.now() - comecou))),
        Promise.race([heroPronta(), esperar(MINIMO + TETO)]),
      ]);

      // devolve quando a roda TERMINA de apagar, não quando começa: a folha só desce
      // depois, e a passagem vira um movimento de cada vez em vez de dois ao mesmo
      // tempo, que era o que se via como duas quedas
      const saiu = new Promise((resolver) => {
        const aoTerminar = (evento) => {
          if (evento.target !== preloader || evento.animationName !== ANIMACAO) return;
          preloader.removeEventListener('animationend', aoTerminar);
          clearTimeout(reserva);
          resolver();
        };
        const reserva = setTimeout(resolver, LIMITE); // aba em segundo plano não anima
        preloader.addEventListener('animationend', aoTerminar);
      });

      setTimeout(() => preloader.remove(), LIMITE + 2000);

      preloader.setAttribute('data-sair', '');
      await saiu;
      preloader.remove();
    },
  };
}
