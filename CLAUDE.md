# Eterno Dourado

Atacado de alianças em Salvador (desde 2000; hoje quem atende é o Leandro). O site vai virar ERP: a home é vitrine com catálogo e modal 3D, e a compra só acontece depois do login.

## Público e texto

- Lojistas e revendedores que compram no atacado **para revender no próprio negócio**. Nunca escrever "vender alianças", como se ele fornecesse para venda.
- Todo texto segue a skill `texto-e-conteudo`: cada informação uma vez, nada de preenchimento, frase ditada pelo Leandro vai literal (com a pontuação dele).
- Nome de cada modelo = descrição de `utils/TAB LM 26.pdf`, literal (`descricaoTabela`). RLM e RDLM são diferentes ("Reta" × "Reta … Diamantada"); a largura também vem da descrição. Nada é deduzido do código.
- WhatsApp: (71) 99183-8595, em `src/js/config.js`.

## Regras de negócio (`src/js/precificacao.js`)

- Preço de tabela = uma aliança; o par é o dobro.
- Forro de aço inoxidável (o interior das fotos): + R$ 8,00 por aliança.
- Pedra acrescentada: + R$ 2,50 cada, só em liso e pedra única (solitário e meia aliança já incluem). Referência que já vem com pedra na tabela (06-1LM) usa o preço dela, sem somar nada.
- Modelo fora da tabela: "sob consulta".
- Referência escrita com pedra ("304SQLMC5MM COM 1 PEDRA") é a mesma referência com a pedra somada: quem separa isso é o ERP (`separarPedras`, em `src/pedidos.js` do backend), nunca o agente.
- Pedido em PDF, Excel, Word, CSV ou texto: nenhum passa por IA. O PDF é lido no começo do fluxo e o texto vai direto ao ERP; Excel e Word o ERP converte (`src/arquivo.js`, sem biblioteca nova). Quem lê a lista é `src/leitura.js`. Só foto vai ao leitor de imagem.
- Referência que não casa volta como pendência com as parecidas. O Leandro responde a referência certa e **o ERP** faz a troca (`corrigirReferencias`), mantendo numeração e quantidade — o fluxo só repassa a resposta.
- ERP: a API e o banco ficam na pasta irmã `Documents/eterno-dourado-backend` (Node + Postgres no Neon), que importa este `precificacao.js` em vez de copiar a conta. A página de pedido virá aqui, em `src/pages/pedido`. O Leandro cadastra cada cliente com desconto %, se paga frete e uma observação fixa, que sai na faixa OBS da folha e aparece na tela do lojista; desconto 0 esconde a linha; o pedido segue a folha `utils/PEDIDO JGT…pdf` (soma → desconto → frete → total) e gera um PDF enviado a ele.

## Mapa

```text
index.html                    a home: uma página com as cinco dobras (data-dobra), na ordem do menu; body data-page="home"
vercel.json                   publicação: site estático, sem build, com cache longo em assets/, assets/ e vendor/
.gitignore                    o que não sobe (e, na Vercel, o que não fica público): .claude, design-system, todo .pdf, fontes das fotos e o estudo 3D. Regra de pasta sempre presa à raiz (/utils/ pegaria src/js/utils)
src/js/main.js                monta o que é global (cabeçalho, menu, login, rolagem do Lenis, 03LM) e importa a página por body[data-page]; não conhece as dobras
src/js/components/            cabecalho, area-cliente, reveal, rolagem-suave (Lenis), preloader (nome girando 8 s, uma vez por visita), cortina (revela a página), anel3d (03LM percorrendo as seções)
src/js/libs/                  estudio3d.js (cena 3D aprovada) e visualizador3d.js (ferramentas de GLB); three.js em assets/img/modelos-3d/vendor/three (importmap)
src/js/utils/                 dom, formato, imagem, whatsapp, dialogo
style.css                     todo o CSS global em @layer global + @import de src/pages/home/home.css em layer(pagina)
src/pages/home/               a home inteira: home.css e home.js reúnem as dobras, cada uma na pasta dela — abertura, colecao (fotos + provas), catalogo (vitrine em x, 12 cartões + filtro), como-comprar, nossa-historia (com rodapé)
src/pages/obrigado/           a página /obrigado: html, css e js dela. A URL sem extensão vem do rewrite no vercel.json e do mesmo atalho no servidor.js
vendor/lenis/                 Lenis: rolagem suave com os ajustes do novo-site (duração 1,2 s, curva exponencial)
src/data/precos.json          as 407 linhas da TAB LM 26, lidas do PDF por scripts/dados/extrair-precos.mjs
src/data/modelos.json         os 80 modelos com foto e 3D, que sao a vitrine do site (gerar-dados.mjs)
                              o banco do ERP recebe as 408 referencias (tabela + precos-extras); a foto se junta pela referencia
src/data/precos-extras.json   preços que o Leandro informou e ainda não estão no PDF; com forroIncluso, o gerador tira os R$ 8,00 para o site não somar duas vezes
assets/                       marca, fontes, favicon, img-pessoas, img-produzidas (as .webp que o site serve)
assets/img/                  fotos e GLB das alianças (grafia errada mantida: os dados apontam para ela)
assets/img/aliancas-ia/      fotos refeitas no estilo de estúdio pelo Gemini, recortadas; bruto/ guarda as tentativas
assets/img/aliancas-web/modelo-03LM/individuais/   só 03LM.glb, a peça que percorre a página. Os outros 242 GLB saíram do projeto para C:/Users/User/Documents/eterno-dourado-3d-guardados (543 MB); scripts/glb refaz qualquer um
scripts/teste/                testar.mjs (a verificação do site), cdp.mjs (driver do Chrome) e <pagina>.mjs (as interações de cada página)
scripts/dados/                extrair-precos.mjs (PDF → precos.json) e gerar-dados.mjs (→ modelos.json)
scripts/fotos/                foto de estúdio de uma referência: refazer-fotos.py e o recorte de fundo que ele usa
scripts/glb/                  GLB fiel à foto, um anel por referência; parametros/<codigo>.json
design-system/                snapshot do iyO One (referência, não é o site): node servidor.js design-system
```

Os caminhos em `modelos.json` são relativos à raiz (`assets/...`): página fora da raiz precisa resolvê-los a partir de `/`.

## Design

Fonte: `Downloads/Eterno Dourado — Design do Marketplace Atacadista.pdf`; tokens na seção "variáveis" do `style.css`. Noite `#050912`, Marinho `#091321`, Safira `#0D1C2D`, Ouro `#D6A84E` (ação e seleção), Champagne `#F0CF82`, Marfim `#F7F3EA`. Bodoni Moda nos títulos (no lugar da ambroise-francois-std do novo-site, que é paga), DM Mono nos rótulos, Manrope no texto. Container 1200px, botão pílula 48–52px, H1 no celular 38–44px, nenhum texto de venda abaixo de 16px, contraste AA. Ouro como texto sobre marfim usa `--ouro-texto`.

## Comandos

- `node servidor.js` → http://127.0.0.1:8080. Precisa de http: fetch e GLB não abrem em `file://`.
- `node scripts/teste/testar.mjs` → servidor e Chrome próprios; mede 360/390/768/1024/1440 e testa as interações com mouse e toque reais. Só imprime resumo e falhas. `--texto` lista o texto visível por seção; `--fotos` salva capturas.
- Foto de estúdio de uma referência: `py scripts/fotos/refazer-fotos.py <codigo>` (Gemini; precisa de `GEMINI_API_KEY` e de `utils/referencia-estilo.*`). Grava só a tentativa mais fiel ao desenho original e mostra o painel para aprovar.
- GLB de uma referência: `py scripts/glb/ajustar.py <codigo>` (geometria e vista pela foto) → `py scripts/glb/gerar.py <codigo>` → `node scripts/glb/afinar.mjs <codigo> --materiais` (sem a opção, afina também a luz do estúdio) → `py scripts/glb/gerar.py <codigo>` de novo → conferir com `node scripts/glb/comparar.mjs <codigo>`.

## Como trabalhar aqui

- Ler a skill do assunto antes de agir: `arquitetura-e-estrutura` para criar/mover arquivo, `texto-e-conteudo` para qualquer texto, `responsividade-matematica` para layout, `direcao-de-arte-e-midia` para animação e 3D.
- Menor alteração correta, entregue inteira: JS, CSS, imports e este mapa no mesmo passo.
- Verificar com `node scripts/teste/testar.mjs`, sem escrever script novo. Interação nova ganha um passo em `scripts/teste/<pagina>.mjs`.
- Dizer com clareza o que não foi verificado.
- Não criar LEIA-ME/README. Atualizações curtas, sem repetir no fim o que já foi dito.
- Editar texto com as ferramentas de edição ou Node, nunca com PowerShell 5.1 (quebra UTF-8).
- Encerrar só processos abertos por você, pelo PID, nunca por nome.
- Animação: CSS anima, JS/GSAP só controla.
