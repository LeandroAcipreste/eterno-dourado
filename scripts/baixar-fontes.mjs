// Baixa as fontes do Google Fonts para assets/fonts e grava os @font-face no style.css, entre /* fontes:inicio */ e /* fontes:fim */.
//
//   node scripts/baixar-fontes.mjs
//
// O site não usa CDN: tudo roda local. Só os subsets latin e latin-ext entram,
// que é o que o português precisa.
//
// As famílias seguem o sistema visual da marca (PDF "Design do Marketplace
// Atacadista", pág. 4): Cormorant Garamond nos títulos, Manrope na interface.

import fs from 'node:fs';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '..');
const DIR_FONTES = path.join(RAIZ, 'assets', 'fonts');
const SAIDA_CSS = path.join(RAIZ, 'style.css');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// a tipografia do novo-site: uma didone de alto contraste nos títulos (Bodoni Moda no lugar
// da ambroise-francois-std, que é paga), DM Mono nos rótulos e Manrope no texto
const FAMILIAS = [
  { chave: 'bodoni', nome: 'Bodoni Moda', query: 'Bodoni+Moda:opsz,wght@6..96,400..700' },
  { chave: 'dmmono', nome: 'DM Mono', query: 'DM+Mono:wght@300;400;500' },
  { chave: 'manrope', nome: 'Manrope', query: 'Manrope:wght@200..800' },
];

const SUBSETS = new Set(['latin', 'latin-ext']);

async function buscar(url) {
  const resposta = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!resposta.ok) throw new Error(`${resposta.status} em ${url}`);
  return resposta;
}

function nomeDoArquivo(chave, subset, style, weight, stretch) {
  const partes = [chave, subset, style, weight, stretch].filter(Boolean);
  return `${partes.join('-').replace(/\s+/g, '-').replace(/%/g, '')}.woff2`;
}

function blocoFontFace(nome, face) {
  const linhas = [
    '@font-face {',
    `  font-family: "${nome}";`,
    `  font-style: ${face.style};`,
    `  font-weight: ${face.weight};`,
  ];
  if (face.stretch) linhas.push(`  font-stretch: ${face.stretch};`);
  linhas.push('  font-display: swap;');
  linhas.push(`  src: url("assets/fonts/${face.arquivo}") format("woff2");`);
  if (face.range) linhas.push(`  unicode-range: ${face.range};`);
  linhas.push('}');
  return linhas.join('\n');
}

async function main() {
  fs.mkdirSync(DIR_FONTES, { recursive: true });

  const blocos = [];
  let total = 0;

  for (const familia of FAMILIAS) {
    const css = await (await buscar(`https://fonts.googleapis.com/css2?family=${familia.query}&display=swap`)).text();

    // cada @font-face vem precedido de um comentário com o nome do subset
    for (const pedaco of css.split('/*').slice(1)) {
      const subset = pedaco.slice(0, pedaco.indexOf('*/')).trim();
      if (!SUBSETS.has(subset)) continue;

      const url = pedaco.match(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/)?.[1];
      if (!url) continue;

      const face = {
        style: /font-style:\s*italic/.test(pedaco) ? 'italic' : 'normal',
        weight: pedaco.match(/font-weight:\s*([^;]+);/)?.[1].trim() ?? '400',
        stretch: pedaco.match(/font-stretch:\s*([^;]+);/)?.[1].trim() ?? null,
        range: pedaco.match(/unicode-range:\s*([^;]+);/)?.[1].trim() ?? null,
      };
      face.arquivo = nomeDoArquivo(
        familia.chave,
        subset,
        face.style,
        face.weight.replace(/\s+/g, '-'),
        face.stretch?.replace(/\s+/g, '-'),
      );

      const bytes = Buffer.from(await (await buscar(url)).arrayBuffer());
      fs.writeFileSync(path.join(DIR_FONTES, face.arquivo), bytes);
      blocos.push(blocoFontFace(familia.nome, face));
      total += 1;
      console.log(`${face.arquivo}  ${(bytes.length / 1024).toFixed(0)} KB`);
    }
  }

  // só o trecho entre as marcas muda; o resto do style.css é escrito à mão
  const INICIO = '/* fontes:inicio */';
  const FIM = '/* fontes:fim */';
  const css = fs.readFileSync(SAIDA_CSS, 'utf8');
  const inicio = css.indexOf(INICIO);
  const fim = css.indexOf(FIM);
  if (inicio < 0 || fim < inicio) throw new Error(`marcas ${INICIO} e ${FIM} não encontradas em style.css`);
  const recuar = (texto) => texto.split('\n').map((l) => (l ? `  ${l}` : l)).join('\n');
  const trecho = `${INICIO}\n${recuar(blocos.join('\n\n'))}\n  ${FIM}`;
  fs.writeFileSync(SAIDA_CSS, css.slice(0, inicio) + trecho + css.slice(fim + FIM.length), 'utf8');
  console.log(`${total} faces · ${path.relative(RAIZ, SAIDA_CSS)}`);
}

main();
