const MOEDA = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
});

const INTEIRO = new Intl.NumberFormat('pt-BR');

/** R$ 1.234,56 — ou um travessão quando não há valor. */
export function dinheiro(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(valor)) return '—';
  return MOEDA.format(valor);
}

export function numero(valor) {
  if (!Number.isFinite(valor)) return '—';
  return INTEIRO.format(valor);
}

/** 6 mm · aceita a largura 2.2 do aro fino sem virar "2,2000". */
export function milimetro(valor) {
  if (!Number.isFinite(valor)) return '—';
  const texto = Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');
  return `${texto} mm`;
}

export function porcento(valor) {
  if (!Number.isFinite(valor)) return '—';
  const texto = Number.isInteger(valor) ? String(valor) : valor.toFixed(1).replace('.', ',');
  return `${texto}%`;
}

/** Texto sem acento e em minúscula, para a busca do catálogo. */
export function achatar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

const NOME_FAMILIA = {
  liso: 'Liso',
  'pedra-unica': 'Pedra única',
  'meia-alianca': 'Meia aliança',
  solitario: 'Solitário',
};

const NOME_TIPO = {
  alianca: 'Aliança',
  anel: 'Anel',
};

export const nomeDaFamilia = (chave) => NOME_FAMILIA[chave] ?? chave;
export const nomeDoTipo = (chave) => NOME_TIPO[chave] ?? chave;

/** Rótulo curto de frisos, para a ficha técnica. */
export function frisos(quantidade) {
  if (!Number.isFinite(quantidade) || quantidade === 0) return 'sem friso';
  return quantidade === 1 ? '1 friso' : `${quantidade} frisos`;
}
