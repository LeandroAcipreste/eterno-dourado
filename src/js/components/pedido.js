/**
 * Dobra do pedido.
 *
 * O mandril é a régua de numeração: cada toque soma uma peça, e a pilha de
 * marcas acima da numeração cresce junto, então o comprador vê a forma do
 * pedido desenhada sobre a régua. Shift no toque tira uma peça.
 *
 * A planilha segue a folha de pedido do cliente:
 *   Referência | Numeração | Qt | Valor | Total
 * e fecha na mesma ordem: total → desconto → frete → total do pedido.
 */

import { criar, el, els } from '../utils/dom.js';
import { dinheiro, numero, porcento } from '../utils/formato.js';
import { fecharPedido, referenciaDoItem, valorDaUnidade } from '../precificacao.js';
import * as estado from '../estado.js';

const MARCO = 5; // numerações de 5 em 5 recebem risco maior, como numa régua

export function montarPedido() {
  const regua = el('[data-mandril-regua]');
  const corpo = el('[data-planilha-corpo]');
  if (!regua || !corpo) return;

  const alvos = {
    mandril: el('[data-modulo="mandril"]'),
    regua,
    modelo: el('[data-mandril-modelo]'),
    corpo,
    tabela: el('[data-planilha]'),
    vazia: el('[data-planilha-vazia]'),
    desconto: el('[data-fechamento-desconto]'),
    frete: el('[data-fechamento-frete]'),
    consulta: el('[data-pedido-consulta]'),
    totais: {
      pecas: els('[data-total-pecas]'),
      bruto: els('[data-total-bruto]'),
      desconto: els('[data-total-desconto]'),
      frete: els('[data-total-frete]'),
      pedido: els('[data-total-pedido]'),
    },
    resumo: {
      pecas: els('[data-resumo-pecas]'),
      modelos: els('[data-resumo-modelos]'),
      total: els('[data-resumo-total]'),
    },
  };

  construirRegua(alvos.regua);
  ligarRegua(alvos.regua);
  ligarPlanilha(alvos.corpo);
  ligarFechamento(alvos);

  estado.inscrever((atual, motivo) => {
    if (['semeado', 'selecao', 'opcoes', 'pedido'].includes(motivo)) desenhar(atual, alvos, motivo);
  });
}

/* --- mandril -------------------------------------------------------------- */

function construirRegua(regua) {
  const { regras } = estado.ler();
  const min = regras?.numeracaoMin ?? 8;
  const max = regras?.numeracaoMax ?? 34;

  const aros = [];
  for (let n = min; n <= max; n += 1) {
    aros.push(
      criar(
        'button',
        {
          class: 'aro',
          type: 'button',
          dataset: { aro: String(n), marco: n % MARCO === 0 ? 'sim' : 'nao', temPeca: 'nao' },
          'aria-label': `Numeração ${n}, nenhuma peça`,
        },
        [
          criar('span', { class: 'aro__berco', 'aria-hidden': 'true' }, [
            criar('span', { class: 'aro__pilha', estilo: '--q: 0' }),
          ]),
          criar('span', { class: 'aro__risco', 'aria-hidden': 'true' }),
          criar('span', { class: 'aro__num dado', texto: String(n) }),
        ],
      ),
    );
  }
  regua.replaceChildren(...aros);
}

function ligarRegua(regua) {
  regua.addEventListener('click', (evento) => {
    const aro = evento.target.closest('[data-aro]');
    if (!aro) return;
    estado.somarPeca(Number(aro.dataset.aro), evento.shiftKey ? -1 : 1);
    // a régua tem 27 numerações e não cabe inteira num telefone: mantém à
    // vista a numeração que acabou de mudar
    aro.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
  });

  // clique com o botão direito tira uma peça, sem abrir o menu do navegador
  regua.addEventListener('contextmenu', (evento) => {
    const aro = evento.target.closest('[data-aro]');
    if (!aro) return;
    evento.preventDefault();
    estado.somarPeca(Number(aro.dataset.aro), -1);
  });

  // setas andam pela régua; cima e baixo somam e tiram
  regua.addEventListener('keydown', (evento) => {
    const aro = evento.target.closest('[data-aro]');
    if (!aro) return;
    const passos = { ArrowLeft: -1, ArrowRight: 1 };
    if (evento.key in passos) {
      evento.preventDefault();
      const lista = els('[data-aro]', regua);
      const i = lista.indexOf(aro);
      lista[Math.min(lista.length - 1, Math.max(0, i + passos[evento.key]))]?.focus();
      return;
    }
    if (evento.key === 'ArrowUp' || evento.key === 'ArrowDown') {
      evento.preventDefault();
      estado.somarPeca(Number(aro.dataset.aro), evento.key === 'ArrowUp' ? 1 : -1);
    }
  });
}

function desenharRegua(atual, alvos, motivo) {
  const modelo = estado.modeloSelecionado();
  alvos.mandril.dataset.inativo = modelo ? 'nao' : 'sim';
  alvos.modelo.textContent = modelo ? referenciaDoItem({ modelo, ...atual.opcoes }) : 'nenhum modelo';

  let primeiraComPeca = null;

  for (const aro of els('[data-aro]', alvos.regua)) {
    const n = Number(aro.dataset.aro);
    const qt = estado.quantidadeEm(n);
    const pilha = el('.aro__pilha', aro);
    pilha.style.setProperty('--q', String(qt));
    aro.dataset.temPeca = qt > 0 ? 'sim' : 'nao';
    aro.setAttribute(
      'aria-label',
      qt === 0
        ? `Numeração ${n}, nenhuma peça`
        : `Numeração ${n}, ${qt} ${qt === 1 ? 'peça' : 'peças'}`,
    );
    if (qt > 0 && primeiraComPeca === null) primeiraComPeca = aro;
  }

  // Ao trocar de modelo, a régua mostra de onde começa o pedido desse modelo.
  // Sem isso, num telefone o comprador abre a régua no 8 e não vê as marcas.
  const trocouDeModelo = motivo !== 'pedido';
  if (trocouDeModelo && primeiraComPeca && alvos.regua.scrollWidth > alvos.regua.clientWidth) {
    primeiraComPeca.scrollIntoView({ inline: 'center', block: 'nearest' });
  }
}

/* --- planilha ------------------------------------------------------------- */

function ligarPlanilha(corpo) {
  corpo.addEventListener('click', (evento) => {
    const remover = evento.target.closest('[data-remover]');
    if (!remover) return;
    estado.removerLinha(remover.dataset.chave, Number(remover.dataset.numeracao));
  });

  corpo.addEventListener('change', (evento) => {
    const campo = evento.target.closest('[data-qt]');
    if (!campo) return;
    estado.definirQuantidade(campo.dataset.chave, Number(campo.dataset.numeracao), campo.value);
  });
}

function desenharPlanilha(atual, alvos) {
  const linhas = estado.linhasDoPedido();
  const temLinhas = linhas.length > 0;

  alvos.tabela.hidden = !temLinhas;
  alvos.vazia.hidden = temLinhas;

  if (!temLinhas) {
    alvos.corpo.replaceChildren();
    return;
  }

  // agrupa por referência, como na folha de pedido
  const porGrupo = new Map();
  for (const linha of linhas) {
    if (!porGrupo.has(linha.chave)) porGrupo.set(linha.chave, []);
    porGrupo.get(linha.chave).push(linha);
  }

  const nodes = [];
  for (const [chave, doGrupo] of porGrupo) {
    const primeira = doGrupo[0];
    const unidade = valorDaUnidade(primeira.modelo, primeira);
    const referencia = referenciaDoItem(primeira);
    const pecas = doGrupo.reduce((soma, l) => soma + l.qt, 0);

    nodes.push(
      criar('tr', { class: 'planilha__grupo' }, [
        criar('th', { colspan: 6, scope: 'colgroup', texto: tituloDoGrupo(primeira) }),
      ]),
    );

    for (const linha of doGrupo) {
      nodes.push(
        criar('tr', {}, [
          criar('td', { texto: referencia }),
          criar('td', { class: 'dado', texto: String(linha.numeracao) }),
          criar('td', {}, [
            criar('input', {
              class: 'dado planilha__qt',
              type: 'number',
              min: 0,
              max: 999,
              step: 1,
              value: String(linha.qt),
              inputmode: 'numeric',
              'aria-label': `Quantidade de ${referencia} na numeração ${linha.numeracao}`,
              dataset: { qt: '', chave, numeracao: String(linha.numeracao) },
            }),
          ]),
          criar('td', { texto: unidade === null ? 'a combinar' : dinheiro(unidade) }),
          criar('td', {
            texto: unidade === null ? '—' : dinheiro(unidade * linha.qt),
          }),
          criar('td', {}, [
            criar('button', {
              class: 'planilha__remover',
              type: 'button',
              texto: '×',
              'aria-label': `Remover ${referencia} na numeração ${linha.numeracao}`,
              dataset: { remover: '', chave, numeracao: String(linha.numeracao) },
            }),
          ]),
        ]),
      );
    }

    nodes.push(
      criar('tr', { class: 'planilha__subtotal' }, [
        criar('td', { colspan: 2, texto: 'Total de peças' }),
        criar('td', { class: 'dado', texto: String(pecas) }),
        criar('td', {}),
        criar('td', { texto: unidade === null ? '—' : dinheiro(unidade * pecas) }),
        criar('td', {}),
      ]),
    );
  }

  alvos.corpo.replaceChildren(...nodes);
}

function tituloDoGrupo({ modelo, forro, pedras }) {
  const partes = [modelo.descricaoTabela ?? modelo.code];
  if (forro) partes.push('com forro de aço inoxidável');
  if (pedras > 0) partes.push(pedras === 1 ? 'mais 1 pedra' : `mais ${pedras} pedras`);
  return partes.join(' · ');
}

/* --- fechamento ----------------------------------------------------------- */

function ligarFechamento(alvos) {
  alvos.desconto?.addEventListener('input', (e) => estado.definirDesconto(e.target.value));
  alvos.frete?.addEventListener('input', (e) => estado.definirFrete(e.target.value));

  el('[data-pedido-limpar]')?.addEventListener('click', () => {
    if (estado.linhasDoPedido().length === 0) return;
    estado.limparPedido();
  });

  el('[data-pedido-copiar]')?.addEventListener('click', async (evento) => {
    const botao = evento.currentTarget;
    const texto = pedidoEmTexto();
    const original = botao.textContent;
    try {
      await navigator.clipboard.writeText(texto);
      botao.textContent = 'Copiado';
    } catch {
      botao.textContent = 'Não foi possível copiar';
    }
    setTimeout(() => {
      botao.textContent = original;
    }, 1800);
  });
}

function desenharFechamento(atual, alvos) {
  const linhas = estado.linhasDoPedido();
  const fecho = fecharPedido(linhas, { desconto: atual.desconto, frete: atual.frete });

  if (alvos.desconto && document.activeElement !== alvos.desconto) {
    alvos.desconto.value = String(atual.desconto);
  }
  if (alvos.frete && document.activeElement !== alvos.frete) {
    alvos.frete.value = atual.frete.toFixed(2);
  }

  const escrever = (nodes, texto) => nodes.forEach((n) => (n.textContent = texto));

  escrever(alvos.totais.pecas, numero(fecho.pecas));
  escrever(alvos.totais.bruto, dinheiro(fecho.bruto));
  escrever(alvos.totais.desconto, dinheiro(fecho.comDesconto));
  escrever(alvos.totais.frete, dinheiro(fecho.frete));
  escrever(alvos.totais.pedido, dinheiro(fecho.pedido));

  escrever(alvos.resumo.pecas, numero(fecho.pecas));
  escrever(alvos.resumo.modelos, numero(atual.grupos.size));
  escrever(alvos.resumo.total, dinheiro(fecho.pedido));

  const botaoPedido = el('[data-nav-abrir-pedido]');
  if (botaoPedido) botaoPedido.dataset.temPeca = fecho.pecas > 0 ? 'sim' : 'nao';

  if (alvos.consulta) {
    alvos.consulta.hidden = !fecho.temSobConsulta;
    if (fecho.temSobConsulta) {
      const pecas = fecho.pecasSobConsulta;
      alvos.consulta.textContent =
        `${pecas} ${pecas === 1 ? 'peça está' : 'peças estão'} sob consulta. ` +
        'Elas contam no total de peças e ficam fora dos valores até você informar o preço.';
    }
  }
}

/* --- texto do pedido ------------------------------------------------------ */

function pedidoEmTexto() {
  const atual = estado.ler();
  const linhas = estado.linhasDoPedido();
  const fecho = fecharPedido(linhas, { desconto: atual.desconto, frete: atual.frete });

  const larguras = [30, 10, 5, 12, 12];
  const celula = (texto, i, direita = false) => {
    const t = String(texto);
    return direita ? t.padStart(larguras[i]) : t.padEnd(larguras[i]);
  };

  const saida = [
    'ETERNO DOURADO · PEDIDO',
    `Data: ${new Date().toLocaleDateString('pt-BR')}`,
    '',
    [
      celula('Referência', 0),
      celula('Numeração', 1),
      celula('Qt', 2, true),
      celula('Valor', 3, true),
      celula('Total', 4, true),
    ].join('  '),
    '-'.repeat(larguras.reduce((a, b) => a + b, 0) + 8),
  ];

  const porGrupo = new Map();
  for (const linha of linhas) {
    if (!porGrupo.has(linha.chave)) porGrupo.set(linha.chave, []);
    porGrupo.get(linha.chave).push(linha);
  }

  for (const [, doGrupo] of porGrupo) {
    const primeira = doGrupo[0];
    const unidade = valorDaUnidade(primeira.modelo, primeira);
    const referencia = referenciaDoItem(primeira);
    saida.push('', tituloDoGrupo(primeira).toUpperCase());

    for (const linha of doGrupo) {
      saida.push(
        [
          celula(referencia, 0),
          celula(linha.numeracao, 1),
          celula(linha.qt, 2, true),
          celula(unidade === null ? 'a combinar' : dinheiro(unidade), 3, true),
          celula(unidade === null ? '—' : dinheiro(unidade * linha.qt), 4, true),
        ].join('  '),
      );
    }

    const pecas = doGrupo.reduce((soma, l) => soma + l.qt, 0);
    saida.push(`${' '.repeat(larguras[0] + 2)}TOTAL DE PEÇAS: ${pecas}`);
  }

  saida.push(
    '',
    `Total de peças ....... ${fecho.pecas}`,
    `Total ................ ${dinheiro(fecho.bruto)}`,
    `Desconto de ${porcento(fecho.desconto)} .... -${dinheiro(fecho.abatimento)}`,
    `Total com desconto ... ${dinheiro(fecho.comDesconto)}`,
    `Frete ................ ${dinheiro(fecho.frete)}`,
    `TOTAL DO PEDIDO ...... ${dinheiro(fecho.pedido)}`,
  );

  if (fecho.temSobConsulta) {
    saida.push(
      '',
      `Atenção: ${fecho.pecasSobConsulta} peça(s) sob consulta, fora dos valores acima.`,
    );
  }

  return saida.join('\n');
}

/* --- desenho -------------------------------------------------------------- */

function desenhar(atual, alvos, motivo) {
  desenharRegua(atual, alvos, motivo);
  desenharPlanilha(atual, alvos);
  desenharFechamento(atual, alvos);
}
