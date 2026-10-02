/**
 * Área do cliente: entra na conta do lojista pela API do ERP.
 *
 * O que a pessoa digita vai para /api/entrar, e a sessão volta em cookie. O valor do
 * pedido depende do desconto e do frete do cadastro dela, e por isso quem confere a
 * senha é o servidor — o site nunca decide quem entrou.
 *
 * A mensagem na tela é a que o servidor escreveu: e-mail e senha errados dão a mesma
 * frase, de propósito, para não entregar quem é cliente da casa.
 */

import { el } from '../utils/dom.js';
import { ligarFechamento } from '../utils/dialogo.js';
import { entrar, ErroDaApi, quemEstaLogado } from '../utils/api.js';

/**
 * A caixa de login, para a página que não a tem no HTML.
 *
 * Ela nasce igual à da home, de um lugar só: assim o login existe em qualquer página
 * sem o mesmo bloco de HTML copiado cinco vezes.
 */
function criarDialogo() {
  const dialogo = document.createElement('dialog');
  dialogo.className = 'modal modal--estreito';
  dialogo.setAttribute('data-dialogo-entrar', '');
  dialogo.setAttribute('aria-labelledby', 'entrar-titulo');
  dialogo.innerHTML = `
      <div class="entrar">
        <button class="modal__fechar" type="button" data-fechar aria-label="Fechar">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>

        <div>
          <p class="rotulo">Realiza seu login</p>
          <h2 class="entrar__titulo" id="entrar-titulo">Entre com seu usuário e sua senha</h2>
        </div>

        <form class="entrar__forma" novalidate>
          <div class="campo">
            <label for="entrar-usuario">E-mail ou CNPJ</label>
            <input id="entrar-usuario" name="usuario" type="text" autocomplete="username" required />
          </div>
          <div class="campo">
            <label for="entrar-senha">Senha</label>
            <input id="entrar-senha" name="senha" type="password" autocomplete="current-password" required />
          </div>
          <button class="btn btn--ouro" type="submit">Entrar</button>
        </form>

        <!-- o JS escreve aqui: erro do login, ou o nome de quem entrou -->
        <p class="entrar__status" data-entrar-status role="status" tabindex="-1" hidden></p>

        <p class="entrar__rodape">
          Ainda não é cliente?
          <a href="https://wa.me/5571991838595" data-whatsapp="Olá, Leandro! Quero me tornar cliente da Eterno Dourado.">Solicite seu cadastro</a>
        </p>
      </div>
    `;
  document.body.append(dialogo);
  return dialogo;
}

export function montarAreaCliente() {
  const dialogo = el('[data-dialogo-entrar]') ?? criarDialogo();

  const forma = el('form', dialogo);
  const status = el('[data-entrar-status]', dialogo);
  const botao = el('button[type="submit"]', dialogo);

  const avisar = (texto) => {
    if (!status) return;
    status.textContent = texto;
    status.hidden = !texto;
  };

  /**
   * Cada um vai para o seu lugar: o Leandro para o painel, o lojista para o pedido.
   * Ninguém fica numa caixa dizendo que entrou e sem ter o que fazer.
   */
  const DESTINO = {
    admin: '/src/pages/admin/admin.html',
    lojista: '/src/pages/pedido/pedido.html',
  };

  /**
   * Quem entrou na home vai para o seu lugar. Quem entrou já estando numa página do
   * sistema fica nela: a sessão chegou, a página se refaz com ela e ninguém perde o
   * caminho que já tinha andado.
   */
  const mostrarConta = (cliente) => {
    forma.hidden = true;
    const naHome = document.body.dataset.page === 'home';
    avisar(`Bem-vindo, ${cliente.nome}. ${naHome ? (cliente.admin ? 'Abrindo o painel.' : 'Abrindo seu pedido.') : 'Voltando ao que você estava fazendo.'}`);
    status?.focus({ preventScroll: true });
    if (naHome) location.href = cliente.admin ? DESTINO.admin : DESTINO.lojista;
    else location.reload();
  };

  forma?.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const dados = new FormData(forma);
    const usuario = String(dados.get('usuario') ?? '').trim();
    const senha = String(dados.get('senha') ?? '');
    if (!usuario || !senha) return avisar('Preencha os dois campos.');

    // enquanto o servidor responde, o botão para de aceitar clique: dois envios abrem
    // duas sessões e a segunda derruba a primeira
    botao.disabled = true;
    avisar('');
    try {
      const { cliente } = await entrar(usuario, senha);
      mostrarConta(cliente);
    } catch (erro) {
      avisar(erro instanceof ErroDaApi ? erro.message : 'Não foi possível entrar agora.');
    } finally {
      botao.disabled = false;
    }
  });

  ligarFechamento(dialogo);

  return {
    async abrir() {
      dialogo.showModal();
      // quem já entrou numa visita anterior não precisa digitar de novo: o cookie vale
      const cliente = await quemEstaLogado();
      if (cliente) return mostrarConta(cliente);
      avisar('');
      forma.hidden = false;
      el('input', dialogo)?.focus({ preventScroll: true });
    },
  };
}
