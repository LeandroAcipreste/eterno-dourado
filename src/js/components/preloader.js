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

const ANIMACAO = 'preloader-sair';
const LIMITE = 11000; // rede de segurança: aba em segundo plano não dispara animação
const TEMPO_ATE_SAIR = 8000; // o que o CSS espera antes de começar a esmaecer
const CHAVE_TESTE = 'eterno-dourado:sem-abertura';

const desligadaNoTeste = () => {
  try {
    return sessionStorage.getItem(CHAVE_TESTE) === 'sim';
  } catch {
    return false; // navegação privada com armazenamento bloqueado
  }
};

/**
 * Diz no console se a roda está mesmo girando na tela, e não só se o código rodou:
 * mede o ângulo duas vezes e compara. Serve para separar "o CSS não se aplicou" de
 * "o navegador está com animação desligada", que é a causa silenciosa mais comum.
 */
function conferirGiro(preloader) {
  const roda = preloader.querySelector('.preloader__roda');
  if (!roda) return;
  const estilo = getComputedStyle(roda);
  const angulo = () => parseFloat(getComputedStyle(roda).rotate) || 0;
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
  // no teste ela sai do documento aqui, antes de a página montar: parada por cima
  // da tela, bloquearia o conteúdo e a medição
  if (preloader && desligadaNoTeste()) preloader.remove();

  return {
    async abrir() {
      if (!preloader?.isConnected) return;
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
