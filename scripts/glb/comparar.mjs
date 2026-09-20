/**
 * Foto × GLB lado a lado, na vista ajustada e com a cena do modal.
 *
 *   node scripts/glb/comparar.mjs 03LM
 *
 * Salva a captura na pasta temporária e imprime a cor média (sRGB) do ouro e do
 * branco na foto e no render, para acertar os materiais em parametros/<codigo>.json.
 */

import os from 'node:os';
import path from 'node:path';
import { abrirAba, abrirChrome, subirServidor } from '../cdp.mjs';

const codigo = process.argv[2];
if (!codigo) throw new Error('uso: node scripts/glb/comparar.mjs <codigo>');

const servidor = await subirServidor();
const chrome = await abrirChrome();
try {
  // argumento opcional: JSON de materiais para testar sem gerar o GLB de novo
  const materiais = process.argv[3] ? `&materiais=${encodeURIComponent(process.argv[3])}` : '';
  const url = `${servidor.base}/scripts/glb/comparar.html?codigo=${encodeURIComponent(codigo)}${materiais}`;
  const aba = await abrirAba(chrome.conexao, { url, largura: 900, altura: 760 });
  const terminou = await aba.esperarQue('!!(document.body.dataset.resultado || document.body.dataset.erro)', 60000);
  if (!terminou) throw new Error('a comparação não terminou');
  const erro = await aba.ev('document.body.dataset.erro ?? null');
  if (erro) throw new Error(erro);

  const arquivo = path.join(os.tmpdir(), 'eterno-dourado-glb', `${codigo}-comparacao.png`);
  await aba.foto(arquivo);
  console.log(await aba.ev('document.body.dataset.resultado'));
  console.log('comparação:', arquivo);
} finally {
  // só os processos que este script abriu
  servidor.processo.kill();
  await chrome.encerrar();
}
