/**
 * Página /obrigado: recebe a mensagem pelo endereço (?texto=…), monta o link do
 * WhatsApp e abre a conversa. Existe para o contato ter uma página no próprio site —
 * é nela que o Google Ads conta a conversão, coisa que um link direto para o wa.me
 * não permite.
 *
 * A espera curta é de propósito: sem ela, a medição às vezes não chega a registrar a
 * visita antes de o navegador sair para o aplicativo.
 */

import { linkWhatsApp } from './utils/whatsapp.js';

const ESPERA = 900;
const PADRAO = 'Olá, Leandro! Quero comprar alianças no atacado.';

const texto = new URLSearchParams(location.search).get('texto') || PADRAO;
const destino = linkWhatsApp(texto);

const link = document.querySelector('#link-whatsapp');
if (link) link.href = destino;

setTimeout(() => {
  location.replace(destino);
}, ESPERA);
