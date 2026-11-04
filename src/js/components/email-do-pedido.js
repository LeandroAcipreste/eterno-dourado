/**
 * Enviar o resumo de um pedido por e-mail, com a folha em PDF anexa.
 *
 * O endereço vem sugerido (o do cliente) e o Leandro pode trocar por qualquer outro.
 * Quem manda é o servidor, pelo Gmail do Eterno Dourado; só o administrador pode.
 */

import { pedir } from '../utils/api.js';

let sequencia = 0;

/**
 * @param {{id: number, numero: number}} pedido
 * @param {{sugestao?: string, avisar: (texto: string, opcoes?: {erro?: boolean}) => void}} opcoes
 * @returns {HTMLFormElement}
 */
export function formularioDeEmail(pedido, { sugestao = '', avisar }) {
  const id = `email-pedido-${++sequencia}`;
  const forma = document.createElement('form');
  forma.className = 'admin__forma';
  forma.noValidate = true;
  forma.innerHTML = `
    <div class="campo">
      <label for="${id}">Enviar o pedido ${Number(pedido.numero)} para o e-mail</label>
      <input id="${id}" name="para" type="email" autocomplete="email" required />
    </div>
    <button class="btn btn--contorno btn--compacto" type="submit">Enviar por e-mail</button>`;
  forma.elements.para.value = sugestao;

  forma.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const botao = forma.querySelector('button');
    botao.disabled = true;
    try {
      const { para } = await pedir(`/api/pedidos/${Number(pedido.id)}/email`, {
        method: 'POST',
        body: JSON.stringify({ para: forma.elements.para.value }),
      });
      avisar(`Pedido ${pedido.numero} enviado para ${para}.`);
    } catch (erro) {
      avisar(erro.message, { erro: true });
    } finally {
      botao.disabled = false;
    }
  });

  return forma;
}
