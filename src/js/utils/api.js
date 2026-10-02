/**
 * Conversa com a API do ERP (a pasta irmã eterno-dourado-backend).
 *
 * A sessão vai em cookie, então toda chamada precisa de credentials: 'include' —
 * sem isso o navegador não manda o cookie para outra porta e o servidor responde
 * "entre para continuar" a cada pedido.
 *
 * Em desenvolvimento a API está em outra porta (127.0.0.1:3001). Publicado, ela
 * responde no mesmo endereço do site, e a base fica vazia.
 */

import { API } from '../config.js';

/** Erro com a frase que o servidor escreveu, que é a que a pessoa lê na tela. */
export class ErroDaApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

/** Uma chamada à API, com o cookie de sessão junto e o erro já com a frase do servidor. */
export async function pedir(caminho, opcoes = {}) {
  let resposta;
  try {
    resposta = await fetch(API + caminho, {
      ...opcoes,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...opcoes.headers },
    });
  } catch {
    // servidor fora do ar, sem rede, CORS: para quem está na tela é tudo a mesma coisa
    throw new ErroDaApi('Não foi possível falar com o servidor agora.', 0);
  }
  const corpo = await resposta.json().catch(() => ({}));
  if (!resposta.ok) throw new ErroDaApi(corpo.erro ?? 'Não foi possível concluir agora.', resposta.status);
  return corpo;
}

/** @param {string} usuario e-mail ou CNPJ, como o campo do site pede */
export const entrar = (usuario, senha) =>
  pedir('/api/entrar', { method: 'POST', body: JSON.stringify({ email: usuario, senha }) });

export const sair = () => pedir('/api/sair', { method: 'POST' });

/** Quem está logado, ou null. Não lança quando ninguém entrou ainda. */
export const quemEstaLogado = () => pedir('/api/eu').then((r) => r.cliente).catch(() => null);
