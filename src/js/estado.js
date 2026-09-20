/**
 * Estado compartilhado da página, com assinatura simples.
 *
 * Um lugar só guarda: o modelo escolhido, as opções dele e as linhas do
 * pedido. Os componentes leem daqui e avisam daqui; nenhum deles conhece o
 * outro.
 */

import { chaveDoGrupo, pedrasValidas } from './precificacao.js';

const CHAVE_ARMAZEM = 'eterno-dourado:pedido:v1';

const ouvintes = new Set();

const estado = {
  modelos: [],
  porCodigo: new Map(),
  regras: null,
  selecionado: null, // código do modelo
  opcoes: { forro: false, pedras: 0 },
  /** Map<chaveDoGrupo, {code, forro, pedras, numeracoes: Map<number, number>}> */
  grupos: new Map(),
  desconto: 15,
  frete: 0,
  filtros: { busca: '', tipo: new Set(), familia: new Set(), larguraMm: new Set() },
};

export function inscrever(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function avisar(motivo) {
  for (const ouvinte of ouvintes) ouvinte(estado, motivo);
}

/* --- carga ---------------------------------------------------------------- */

export function semear({ modelos, regras }) {
  estado.modelos = modelos;
  estado.porCodigo = new Map(modelos.map((m) => [m.code, m]));
  estado.regras = regras;
  recuperar();
}

/**
 * Primeiro desenho. Os componentes se inscrevem depois do semear, então quem
 * chama isto é o main, uma vez, quando todos já estão montados.
 */
export function publicar() {
  avisar('semeado');
}

export const modelo = (code) => estado.porCodigo.get(code) ?? null;
export const modeloSelecionado = () => modelo(estado.selecionado);
export const ler = () => estado;

/* --- seleção -------------------------------------------------------------- */

export function selecionar(code) {
  if (!estado.porCodigo.has(code)) return;
  estado.selecionado = code;
  // pedra avulsa não vale para solitário e meia aliança: zera ao trocar
  estado.opcoes.pedras = pedrasValidas(modelo(code), estado.opcoes.pedras);
  avisar('selecao');
}

export function definirOpcao(nome, valor) {
  if (nome === 'forro') estado.opcoes.forro = Boolean(valor);
  if (nome === 'pedras') estado.opcoes.pedras = pedrasValidas(modeloSelecionado(), valor);
  avisar('opcoes');
}

/* --- filtros -------------------------------------------------------------- */

export function definirBusca(texto) {
  estado.filtros.busca = String(texto ?? '');
  avisar('filtros');
}

export function alternarFiltro(campo, valor) {
  const conjunto = estado.filtros[campo];
  if (!conjunto) return;
  const chave = String(valor);
  if (conjunto.has(chave)) conjunto.delete(chave);
  else conjunto.add(chave);
  avisar('filtros');
}

export function limparFiltros() {
  estado.filtros.busca = '';
  estado.filtros.tipo.clear();
  estado.filtros.familia.clear();
  estado.filtros.larguraMm.clear();
  avisar('filtros');
}

/* --- pedido --------------------------------------------------------------- */

/** Soma `passo` peças na numeração informada, para o modelo e opções atuais. */
export function somarPeca(numeracao, passo = 1) {
  const code = estado.selecionado;
  if (!code) return;

  const { forro } = estado.opcoes;
  const pedras = pedrasValidas(modelo(code), estado.opcoes.pedras);
  const chave = chaveDoGrupo({ code, forro, pedras });

  let grupo = estado.grupos.get(chave);
  if (!grupo) {
    grupo = { code, forro, pedras, numeracoes: new Map() };
    estado.grupos.set(chave, grupo);
  }

  const atual = grupo.numeracoes.get(numeracao) ?? 0;
  const novo = Math.max(0, Math.min(999, atual + passo));

  if (novo === 0) grupo.numeracoes.delete(numeracao);
  else grupo.numeracoes.set(numeracao, novo);

  if (grupo.numeracoes.size === 0) estado.grupos.delete(chave);

  guardar();
  avisar('pedido');
}

export function definirQuantidade(chave, numeracao, quantidade) {
  const grupo = estado.grupos.get(chave);
  if (!grupo) return;
  const n = Math.max(0, Math.min(999, Number.parseInt(quantidade, 10) || 0));
  if (n === 0) grupo.numeracoes.delete(numeracao);
  else grupo.numeracoes.set(numeracao, n);
  if (grupo.numeracoes.size === 0) estado.grupos.delete(chave);
  guardar();
  avisar('pedido');
}

export function removerLinha(chave, numeracao) {
  definirQuantidade(chave, numeracao, 0);
}

export function limparPedido() {
  estado.grupos.clear();
  guardar();
  avisar('pedido');
}

export function definirDesconto(valor) {
  const n = Number(valor);
  estado.desconto = Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
  guardar();
  avisar('pedido');
}

export function definirFrete(valor) {
  const n = Number(valor);
  estado.frete = Number.isFinite(n) ? Math.max(0, n) : 0;
  guardar();
  avisar('pedido');
}

/** Quantidade já pedida numa numeração, no grupo do modelo e opções atuais. */
export function quantidadeEm(numeracao) {
  const code = estado.selecionado;
  if (!code) return 0;
  const pedras = pedrasValidas(modelo(code), estado.opcoes.pedras);
  const chave = chaveDoGrupo({ code, forro: estado.opcoes.forro, pedras });
  return estado.grupos.get(chave)?.numeracoes.get(numeracao) ?? 0;
}

/** Achata os grupos em linhas, na ordem em que foram criados. */
export function linhasDoPedido() {
  const linhas = [];
  for (const [chave, grupo] of estado.grupos) {
    const item = modelo(grupo.code);
    if (!item) continue;
    const numeracoes = [...grupo.numeracoes.entries()].sort((a, b) => a[0] - b[0]);
    for (const [numeracao, qt] of numeracoes) {
      linhas.push({ chave, modelo: item, forro: grupo.forro, pedras: grupo.pedras, numeracao, qt });
    }
  }
  return linhas;
}

/* --- persistência --------------------------------------------------------- */

function guardar() {
  try {
    const dados = {
      grupos: [...estado.grupos].map(([chave, g]) => [
        chave,
        { code: g.code, forro: g.forro, pedras: g.pedras, numeracoes: [...g.numeracoes] },
      ]),
      desconto: estado.desconto,
      frete: estado.frete,
    };
    localStorage.setItem(CHAVE_ARMAZEM, JSON.stringify(dados));
  } catch {
    /* aba privada ou armazenamento bloqueado: o pedido segue só em memória */
  }
}

function recuperar() {
  try {
    const cru = localStorage.getItem(CHAVE_ARMAZEM);
    if (!cru) return;
    const dados = JSON.parse(cru);
    if (Number.isFinite(dados.desconto)) estado.desconto = dados.desconto;
    if (Number.isFinite(dados.frete)) estado.frete = dados.frete;
    for (const [chave, g] of dados.grupos ?? []) {
      if (!estado.porCodigo.has(g.code)) continue; // catálogo mudou
      estado.grupos.set(chave, {
        code: g.code,
        forro: Boolean(g.forro),
        pedras: Number(g.pedras) || 0,
        numeracoes: new Map(g.numeracoes.map(([n, q]) => [Number(n), Number(q)])),
      });
    }
  } catch {
    /* dado velho ou corrompido: começa vazio */
  }
}
