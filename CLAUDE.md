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
- Pedra acrescentada: + R$ 2,00 cada, só em liso e pedra única (solitário e meia aliança já incluem).
- Modelo fora da tabela: "sob consulta".
- ERP (ainda não feito): o Leandro cadastra cada cliente com desconto % e se paga frete; desconto 0 esconde a linha; o pedido segue a folha `utils/PEDIDO JGT…pdf` (soma → desconto → frete → total) e gera um PDF enviado a ele.

## Mapa

```text
index.html                    o site inteiro: uma página com as cinco seções (data-dobra), na ordem do menu
vercel.json                   publicação: site estático, sem build, com cache longo em assests/, assets/ e vendor/
.gitignore                    o que não sobe (e, na Vercel, o que não fica público): .claude, design-system, todo .pdf, fontes das fotos e o estudo 3D. Regra de pasta sempre presa à raiz (/utils/ pegaria src/js/utils)
src/js/main.js                monta tudo uma vez (cabeçalho, menu, login, rolagem do Lenis, 03LM) e importa o JS de cada seção em src/pages/<nome>/<nome>.js
src/js/components/            cabecalho, area-cliente, reveal, rolagem-suave (Lenis), preloader (nome girando 8 s, uma vez por visita), cortina (revela a página), anel3d (03LM percorrendo as seções); pedido.js/.css guardados para o ERP
src/js/libs/                  estudio3d.js (cena 3D aprovada) e visualizador3d.js (ferramentas de GLB); three.js em assests/img/modelos-3d/vendor/three (importmap)
src/js/utils/                 dom, formato, imagem, whatsapp, dialogo
style.css                     todo o CSS global em @layer global + @import do CSS da home em layer(pagina)
src/pages/                    o CSS e o JS de cada seção: home (abertura), colecao (fotos + provas), catalogo (vitrine em x, 12 cartões + filtro), como-comprar, nossa-historia (com rodapé)
vendor/lenis/                 Lenis: rolagem suave com os ajustes do novo-site (duração 1,2 s, curva exponencial)
src/data/modelos.json         80 modelos, gerado por scripts/gerar-dados.mjs a partir de utils/TAB LM 26.pdf
assets/                       marca, fontes, favicon, img-pessoas, img-produzidas (web/ gerada por scripts/fotos-produzidas.py)
assests/img/                  fotos e GLB das alianças (grafia errada mantida: os dados apontam para ela)
assests/img/aliancas-ia/      fotos refeitas no estilo de estúdio pelo Gemini, recortadas; bruto/ guarda as tentativas
assests/img/aliancas-web/modelo-03LM/individuais/   só 03LM.glb, a peça que percorre a página. Os outros 242 GLB saíram do projeto para C:/Users/User/Documents/eterno-dourado-3d-guardados (543 MB); scripts/glb refaz qualquer um
scripts/                      geração de dados e imagens, testar.mjs, testes/<pagina>.mjs
scripts/glb/                  GLB fiel à foto, um anel por referência; parametros/<codigo>.json
design-system/                snapshot do iyO One (referência, não é o site): node servidor.js design-system
```

Os caminhos em `modelos.json` são relativos à raiz (`assests/...`): página fora da raiz precisa resolvê-los a partir de `/`.

## Design

Fonte: `Downloads/Eterno Dourado — Design do Marketplace Atacadista.pdf`; tokens na seção "variáveis" do `style.css`. Noite `#050912`, Marinho `#091321`, Safira `#0D1C2D`, Ouro `#D6A84E` (ação e seleção), Champagne `#F0CF82`, Marfim `#F7F3EA`. Bodoni Moda nos títulos (no lugar da ambroise-francois-std do novo-site, que é paga), DM Mono nos rótulos, Manrope no texto. Container 1200px, botão pílula 48–52px, H1 no celular 38–44px, nenhum texto de venda abaixo de 16px, contraste AA. Ouro como texto sobre marfim usa `--ouro-texto`.

## Comandos

- `node servidor.js` → http://127.0.0.1:8080. Precisa de http: fetch e GLB não abrem em `file://`.
- `node scripts/testar.mjs` → servidor e Chrome próprios; mede 360/390/768/1024/1440 e testa as interações com mouse e toque reais. Só imprime resumo e falhas. `--texto` lista o texto visível por seção; `--fotos` salva capturas.
- Foto de estúdio de uma referência: `py scripts/refazer-fotos.py <codigo>` (Gemini; precisa de `GEMINI_API_KEY` e de `utils/referencia-estilo.*`). Grava só a tentativa mais fiel ao desenho original e mostra o painel para aprovar.
- GLB de uma referência: `py scripts/glb/ajustar.py <codigo>` (geometria e vista pela foto) → `py scripts/glb/gerar.py <codigo>` → `node scripts/glb/afinar.mjs <codigo> --materiais` (sem a opção, afina também a luz do estúdio) → `py scripts/glb/gerar.py <codigo>` de novo → conferir com `node scripts/glb/comparar.mjs <codigo>`.

## Como trabalhar aqui

- Ler a skill do assunto antes de agir: `arquitetura-e-estrutura` para criar/mover arquivo, `texto-e-conteudo` para qualquer texto, `responsividade-matematica` para layout, `direcao-de-arte-e-midia` para animação e 3D.
- Menor alteração correta, entregue inteira: JS, CSS, imports e este mapa no mesmo passo.
- Verificar com `node scripts/testar.mjs`, sem escrever script novo. Interação nova ganha um passo em `scripts/testes/<pagina>.mjs`.
- Dizer com clareza o que não foi verificado.
- Não criar LEIA-ME/README. Atualizações curtas, sem repetir no fim o que já foi dito.
- Editar texto com as ferramentas de edição ou Node, nunca com PowerShell 5.1 (quebra UTF-8).
- Encerrar só processos abertos por você, pelo PID, nunca por nome.
- Animação: CSS anima, JS/GSAP só controla.
