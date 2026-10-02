/** Dados de contato usados em mais de um lugar do site. */

export const WHATSAPP = {
  numero: '5571991838595',
  exibicao: '(71) 99183-8595',
};

/**
 * Onde a API do ERP responde. Em desenvolvimento ela roda em outra porta (o site em
 * 8080, a API em 3001); publicada, responde no mesmo endereço do site, e a base fica
 * vazia para a chamada sair relativa.
 */
const LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname);
export const API = LOCAL ? 'http://127.0.0.1:3001' : '';

/**
 * O teste (scripts/teste/testar.mjs) grava esta chave na aba antes de a página abrir. O que
 * depende de tempo real — a abertura de 8 s, a saída para o WhatsApp — fica quieto, e
 * o teste consegue medir a página em vez de esperar ou ser levado para fora do site.
 */
export const CHAVE_TESTE = 'eterno-dourado:sem-abertura';

export const emTeste = () => {
  try {
    return sessionStorage.getItem(CHAVE_TESTE) === 'sim';
  } catch {
    return false; // navegação privada com armazenamento bloqueado
  }
};
