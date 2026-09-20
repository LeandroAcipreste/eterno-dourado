import { WHATSAPP } from '../config.js';

/** Link do WhatsApp com a mensagem já escrita. */
export function linkWhatsApp(mensagem = '') {
  const texto = mensagem ? `?text=${encodeURIComponent(mensagem)}` : '';
  return `https://wa.me/${WHATSAPP.numero}${texto}`;
}
