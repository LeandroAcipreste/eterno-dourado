/**
 * Interações do site com mouse, toque e roda reais: a 03LM aparece e percorre a
 * página, o menu leva a qualquer seção, a área do cliente abre, a abertura da
 * visita gira e sai, e o catálogo filtra, busca e corre em x.
 *
 * Nada de .click() sintético: ele atravessa camadas que bloqueiam o usuário de verdade.
 */

import { esperar } from '../cdp.mjs';

const LOGIN = 'document.querySelector("[data-dialogo-entrar]")';
const SECAO = 'document.querySelector("[data-menu] [aria-current]")?.dataset.pagina ?? ""';
const MENU_ABERTO = 'document.querySelector("[data-menu]").dataset.aberto === "sim"';
/** O cabeçalho desce por último e leva 760 ms: antes de assentar, ninguém clica nele. */
const CABECALHO_NO_LUGAR = 'document.querySelector(".cabecalho").getBoundingClientRect().top >= 0';
/** A seção encostou no alto da tela: é o que a pessoa vê depois de escolher no menu. */
const chegouNoAlto = (secao) => `Math.abs(document.querySelector("#${secao}").getBoundingClientRect().top) < 220`;
const pilula = (texto) =>
  `[...document.querySelectorAll('[data-filtro="largura"] .pilula')].find((b) => b.textContent.trim() === '${texto}')`;

function exigir(condicao, mensagem) {
  if (!condicao) throw new Error(mensagem);
}

async function passo(ctx, nome, executar) {
  try {
    await executar();
    ctx.ok(nome);
  } catch (erro) {
    ctx.falhar(`${nome}: ${erro.message}`);
  }
}

/** Posição da peça na tela, em fração da meia-tela (o que o anel3d escreve na cena). */
const ondeEstaOAnel = `(() => {
  const canvas = document.querySelector("[data-anel3d]");
  return canvas.classList.contains("is-pronto");
})()`;

export default async function testarSite(ctx) {
  const d = await ctx.abrir({ largura: 1440, altura: 900 });

  await passo(ctx, 'anel 3D', async () => {
    exigir(await d.esperarQue(ondeEstaOAnel, 40000), 'a 03LM não apareceu');
  });

  await passo(ctx, 'a página rola por todas as seções', async () => {
    const nomes = [];
    for (const secao of ['colecao', 'catalogo', 'como-comprar', 'nossa-historia']) {
      await d.ev(`(() => {
        const alvo = document.querySelector("#${secao}");
        window.scrollTo({ top: alvo.getBoundingClientRect().top + scrollY + alvo.offsetHeight / 2 - innerHeight / 2, behavior: "instant" });
      })()`);
      await esperar(700);
      nomes.push(await d.ev(SECAO));
    }
    exigir(
      nomes.join(' · ') === 'colecao · catalogo · como-comprar · nossa-historia',
      `o cabeçalho não acompanhou as seções: ${nomes.join(' · ')}`,
    );
    await d.ev('window.scrollTo({ top: 0, behavior: "instant" })');
    await esperar(400);
  });

  await passo(ctx, 'o que fica preso na tela não sai antes da hora', async () => {
    // abertura e vitrine têm palco preso: o elemento fica parado à vista enquanto a
    // página rola, e o gatilho não pode julgar pela posição dele no documento
    for (const [secao, alvo, quanto] of [
      ['#home', '#home h1', 1.2],
      ['#catalogo', '.modelo', 0.5],
    ]) {
      await d.ev(`(() => {
        const s = document.querySelector("${secao}");
        const topo = s.getBoundingClientRect().top + scrollY;
        scrollTo({ top: topo + innerHeight * ${quanto}, behavior: "instant" });
      })()`);
      await esperar(900);
      const estado = await d.ev(`(() => {
        const e = document.querySelector("${alvo}");
        const r = e.getBoundingClientRect();
        const visivel = r.bottom > 0 && r.top < innerHeight;
        return (visivel ? "na tela" : "fora da tela") + "/" + (e.dataset.dentro !== undefined ? "dentro" : "saiu");
      })()`);
      exigir(estado === 'na tela/dentro', `${alvo} no palco preso: ${estado}`);
    }
    await d.ev('scrollTo({ top: 0, behavior: "instant" })');
    await esperar(400);
  });

  await passo(ctx, 'nada fica estático: entra e sai nos dois sentidos', async () => {
    // um parágrafo no meio da página: some ao passar por ele, volta ao subir
    const estado = `(() => {
      const alvo = document.querySelector('#como-comprar [data-anim]');
      return alvo.dataset.dentro !== undefined ? "dentro" : "fora:" + (alvo.dataset.de ?? "?");
    })()`;
    const irPara = (fracao) => `(() => {
      const alvo = document.querySelector("#como-comprar");
      const topo = alvo.getBoundingClientRect().top + scrollY;
      scrollTo({ top: topo + alvo.offsetHeight * ${fracao} - innerHeight / 2, behavior: "instant" });
    })()`;

    await d.ev(irPara(-1.2)); // bem antes da seção
    await esperar(600);
    exigir((await d.ev(estado)).startsWith('fora'), 'o elemento já nascia visível antes de entrar na tela');

    await d.ev(irPara(0.5)); // na seção
    await esperar(700);
    exigir((await d.ev(estado)) === 'dentro', 'o elemento não entrou ao aparecer na tela');

    await d.ev(irPara(2.5)); // muito depois
    await esperar(700);
    exigir(await d.ev(estado) === 'fora:cima', `descendo, o elemento não saiu por cima (${await d.ev(estado)})`);

    await d.ev(irPara(0.5)); // voltando, entra de novo
    await esperar(700);
    exigir((await d.ev(estado)) === 'dentro', 'subindo, o elemento não voltou a entrar');
    await d.ev('scrollTo({ top: 0, behavior: "instant" })');
    await esperar(400);
  });

  await passo(ctx, 'menu leva a qualquer seção', async () => {
    exigir(await d.esperarQue(CABECALHO_NO_LUGAR, 20000), 'o cabeçalho não desceu');
    await d.clicar('document.querySelector("[data-menu-abrir]")');
    exigir(await d.esperarQue(MENU_ABERTO, 2000), 'menu não abriu');
    await esperar(700);
    await d.clicar(`document.querySelector('[data-menu] [data-pagina="nossa-historia"]')`);
    // o que interessa é a seção ter chegado ao alto da tela; o marcado no menu vem
    // da rolagem e pode assentar um quadro depois
    exigir(await d.esperarQue(chegouNoAlto('nossa-historia'), 12000), 'o menu não levou à nossa história');
    exigir(!(await d.ev(MENU_ABERTO)), 'o menu ficou aberto depois de escolher');
    const marcado = (await d.esperarQue(`${SECAO} === "nossa-historia"`, 4000)) ? 'nossa-historia' : await d.ev(SECAO);
    exigir(marcado === 'nossa-historia', `o menu marcou "${marcado}" em vez da seção onde a pessoa está`);
  });

  await passo(ctx, 'área do cliente', async () => {
    await d.clicar('document.querySelector(".cabecalho__entrar")');
    exigir(await d.esperarQue(`${LOGIN}.open`, 3000), 'login não abriu');
    await d.clicar(`${LOGIN}.querySelector("button[type=submit]")`);
    exigir(await d.ev('!document.querySelector("[data-entrar-status]").hidden'), 'aviso não apareceu');
    await d.clicar(`${LOGIN}.querySelector("[data-fechar]")`);
    exigir(await d.ev(`!${LOGIN}.open`), 'X não fechou');
  });

  await passo(ctx, 'filtro de largura', async () => {
    await d.clicar(pilula('4 mm'));
    const nomes = await d.ev('[...document.querySelectorAll(".modelo__nome")].map((e) => e.textContent)');
    exigir(nomes.length > 0 && nomes.every((n) => n.includes(' 4mm')), `cartões fora do filtro: ${nomes.slice(0, 3)}`);
    await d.clicar(pilula('Todas'));
  });

  await passo(ctx, 'busca', async () => {
    await d.clicar('document.querySelector("[data-catalogo-busca]")');
    await d.digitar('03LM-1');
    await esperar(600);
    const primeiro = await d.ev('document.querySelector(".modelo__codigo")?.textContent ?? ""');
    exigir(primeiro === '03LM-1', `primeiro cartão: "${primeiro}"`);
    await d.ev(`(() => {
      const campo = document.querySelector("[data-catalogo-busca]");
      campo.value = "";
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
    await esperar(600);
  });

  await passo(ctx, 'vitrine corre em x', async () => {
    const percurso = await d.ev(`(() => {
      const vitrine = document.querySelector("[data-vitrine]");
      const topo = vitrine.getBoundingClientRect().top + scrollY;
      const percurso = vitrine.offsetHeight - innerHeight;
      scrollTo({ top: topo + percurso / 2, behavior: "instant" });
      return percurso;
    })()`);
    exigir(percurso > 600, `a vitrine não tem percurso (${percurso}px)`);
    await esperar(600);
    const deslocamento = await d.ev('parseFloat(getComputedStyle(document.querySelector("[data-catalogo-grade]")).translate) || 0');
    exigir(deslocamento < -200, `a faixa não andou (${deslocamento}px)`);
  });

  await passo(ctx, 'o cartão mostra tudo', async () => {
    const partes = await d.ev(`(() => {
      const cartao = document.querySelector(".modelo");
      const img = cartao.querySelector("img");
      return {
        codigo: cartao.querySelector(".modelo__codigo")?.textContent ?? "",
        nome: cartao.querySelector(".modelo__nome")?.textContent ?? "",
        preco: cartao.querySelector(".modelo__preco")?.textContent ?? "",
        foto: img?.naturalWidth > 0,
        altura: Math.round(cartao.getBoundingClientRect().height),
        botoes: cartao.querySelectorAll("button, a").length,
      };
    })()`);
    exigir(partes.codigo && partes.nome && partes.preco, `falta informação no cartão: ${JSON.stringify(partes)}`);
    exigir(partes.foto, 'a foto do cartão não carregou');
    exigir(partes.botoes === 0, `o cartão voltou a ter botão (${partes.botoes})`);
    exigir(partes.altura < 620, `o cartão não cabe na tela (${partes.altura}px)`);
  });

  await passo(ctx, 'toda foto do mesmo tamanho', async () => {
    const medidas = await d.ev(`(() => {
      // offset, não getBoundingClientRect: o retângulo inclui a transformação da
      // animação de entrada, e dois elementos iguais mediriam diferente
      const caixa = (e) => e.offsetWidth + "x" + e.offsetHeight;
      return {
        quadros: [...new Set([...document.querySelectorAll(".modelo__foto")].map(caixa))],
        fotos: [...new Set([...document.querySelectorAll(".modelo__img")].map(caixa))],
        cartoes: [...new Set([...document.querySelectorAll(".modelo")].map(caixa))],
      };
    })()`);
    exigir(medidas.cartoes.length === 1, `cartões de tamanhos diferentes: ${medidas.cartoes.join(', ')}`);
    exigir(medidas.quadros.length === 1, `quadros de foto diferentes: ${medidas.quadros.join(', ')}`);
    exigir(medidas.fotos.length === 1, `fotos de tamanhos diferentes: ${medidas.fotos.join(', ')}`);
  });
  await d.fechar();

  // a abertura da visita é a única aba que não pula o preloader
  const a = await ctx.abrir({ largura: 1440, altura: 900, semAbertura: false });
  await passo(ctx, 'abertura da visita', async () => {
    exigir(await a.esperarQue('!!document.querySelector("[data-preloader]")', 6000), 'o nome em círculo não apareceu');
    const roda = await a.ev('getComputedStyle(document.querySelector(".preloader__roda")).animationName');
    exigir(roda === 'preloader-girar', `a roda do nome não está girando (${roda})`);
    exigir(await a.esperarQue('!document.querySelector("[data-preloader]")', 16000), 'a abertura não saiu depois dos 8 s');
    exigir(await a.esperarQue('document.querySelector("[data-cortina]").dataset.estado === "parada"', 12000), 'a cortina não revelou a página');
  });
  await a.fechar();

  // a máquina de quem desligou as animações no sistema: aqui o CSS de movimento não
  // se aplica, e é exatamente o caso que os outros testes nunca veem
  const r = await ctx.abrir({ largura: 1440, altura: 900, semAbertura: false, reduzido: true });
  await passo(ctx, 'abertura com movimento reduzido', async () => {
    // gira mesmo aqui, só que devagar: o que não pode é ficar congelada na tela
    const girou = await r.ev(`(() => new Promise((ok) => {
      const roda = document.querySelector(".preloader__roda");
      const angulo = () => parseFloat(getComputedStyle(roda).rotate) || 0;
      const antes = angulo();
      setTimeout(() => ok(Math.abs(angulo() - antes)), 800);
    }))()`);
    exigir(girou > 1, `com movimento reduzido a roda ficou parada (${girou}°)`);
    exigir(await r.esperarQue('!document.querySelector("[data-preloader]")', 16000), 'a abertura ficou presa na tela');
    exigir(await r.esperarQue('document.querySelector("[data-cortina]").dataset.estado === "parada"', 12000), 'a cortina não liberou a página');
    exigir(await r.ev('document.querySelectorAll(".modelo").length > 0'), 'o catálogo não montou');
  });
  await r.fechar();

  const m = await ctx.abrir({ largura: 390, altura: 844, toque: true });
  await passo(ctx, 'menu do celular', async () => {
    exigir(await m.esperarQue(CABECALHO_NO_LUGAR, 20000), 'o cabeçalho não desceu');
    await m.clicar('document.querySelector("[data-menu-abrir]")');
    exigir(await m.esperarQue(MENU_ABERTO, 2000), 'menu não abriu');
    await esperar(700);
    await m.clicar(`document.querySelector('[data-menu] [data-pagina="catalogo"]')`);
    exigir(await m.esperarQue(chegouNoAlto('catalogo'), 14000), 'o menu não levou ao catálogo');
    exigir(await m.esperarQue('document.querySelectorAll(".modelo").length > 0', 15000), 'os cartões não apareceram');
  });
  await m.fechar();
}
