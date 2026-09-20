/** Os 80 modelos (src/data/modelos.json), baixados uma vez e reaproveitados entre as dobras. */

let pedido = null;

export function carregarModelos() {
  pedido ??= fetch('/src/data/modelos.json')
    .then((resposta) => {
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
      return resposta.json();
    })
    .catch((erro) => {
      pedido = null; // uma falha de rede não trava as próximas tentativas
      throw erro;
    });
  return pedido;
}
