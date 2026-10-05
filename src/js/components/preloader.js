/**
 * Abertura do site: o nome em círculo girando por 8 segundos. Quando ele começa a sair,
 * a cortina já começa a revelar a página: as duas coisas se sobrepõem, e a passagem é
 * um movimento só em vez de dois tempos mortos.
 *
 * Quem faz o efeito é o CSS: a roda gira e a abertura esmaece sozinha ao fim dos
 * 8 s (e some de vez, com visibility). Isso vale inclusive para quem pediu menos
 * movimento no sistema, que recebe a mesma abertura girando devagar. Aqui o JS só
 * espera a animação terminar para tirar o elemento e liberar o resto da montagem.
 *
 * A suíte de testes desliga a abertura pela chave abaixo, senão seriam 8 segundos
 * em cada aba medida.
 */

import { el, movimentoReduzido } from '../utils/dom.js';
import { emTeste } from '../config.js';

const ANIMACAO = 'preloader-sair';
const LIMITE = 11000; // rede de segurança: aba em segundo plano não dispara animação
const TEMPO_ATE_SAIR = 8000; // o que o CSS espera antes de começar a esmaecer

/**
 * Diz no console se a roda está mesmo girando na tela, e não só se o código rodou:
 * mede o ângulo duas vezes e compara. Serve para separar "o CSS não se aplicou" de
 * "o navegador está com animação desligada", que é a causa silenciosa mais comum.
 */
function conferirGiro(preloader) {
  const roda = preloader.querySelector('.preloader__giro');
  if (!roda) return;
  const estilo = getComputedStyle(roda);
  // a roda gira por transform: o ângulo sai da matriz, não de uma propriedade solta
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

/**
 * O giro só começa com a fonte da marca já na tela.
 *
 * As fontes são carregadas com font-display: swap, então o nome desenha primeiro numa
 * fonte substituta e salta para a Bodoni quando ela chega. Com a roda já girando, esse
 * salto aparece como um tranco. Esperar a fonte custa alguns milésimos — ela vem com
 * preload — e troca um tranco por um começo limpo.
 *
 * Meio segundo é o teto: fonte que não chegou não pode deixar a roda parada.
 */
function liberarGiro(preloader) {
  const liberar = () => preloader.setAttribute('data-pronta', '');
  const reserva = setTimeout(liberar, 500);
  document.fonts?.ready.then(() => {
    clearTimeout(reserva);
    liberar();
  }) ?? liberar();
}

export function montarPreloader() {
  const preloader = el('[data-preloader]');
  // no teste ela sai do documento aqui, antes de a página montar: parada por cima
  // da tela, bloquearia o conteúdo e a medição
  if (preloader && emTeste()) preloader.remove();

  return {
    async abrir() {
      if (!preloader?.isConnected) return;
      liberarGiro(preloader);
      conferirGiro(preloader);

      // some do documento sozinha quando a animação acaba; quem chamou não espera por
      // isso, para a cortina poder começar a sair junto com o nome, num movimento só
      const aoTerminar = (evento) => {
        if (evento.target !== preloader || evento.animationName !== ANIMACAO) return;
        preloader.removeEventListener('animationend', aoTerminar);
        preloader.remove();
      };
      preloader.addEventListener('animationend', aoTerminar);
      setTimeout(() => preloader.remove(), LIMITE); // aba em segundo plano não anima

      // devolve quando o CSS COMEÇA a apagar o nome. Cronômetro no JS não serve: ele
      // começa a contar quando a página monta, e a animação começou na primeira pintura.
      await new Promise((resolver) => {
        const aoComecar = (evento) => {
          if (evento.target !== preloader || evento.animationName !== ANIMACAO) return;
          preloader.removeEventListener('animationstart', aoComecar);
          clearTimeout(reserva);
          resolver();
        };
        const reserva = setTimeout(resolver, TEMPO_ATE_SAIR + 2000);
        preloader.addEventListener('animationstart', aoComecar);
      });
    },
  };
}
