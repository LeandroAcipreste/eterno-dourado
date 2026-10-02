"""A arte de um post, montada a partir dos dados do modelo.

    py scripts/conteudo/post.py 303LM
    py scripts/conteudo/post.py 303LM --mais-vendida

A foto é a do catálogo, a mesma peça fotografada — nenhuma imagem é gerada por IA aqui.
O Instagram só aceita JPEG, e as fotos são WebP com fundo transparente (em JPEG a
transparência vira preto), então o post não é conversão: é composição.

Nada é inventado. Largura e acabamento saem da descrição da tabela, que é o nome da
peça. Preço não entra: é de atacado e fica no WhatsApp.

Sai 1080x1080 em assets/img-produzidas/posts/<codigo>.jpg.
"""

import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

RAIZ = Path(__file__).resolve().parents[2]
SAIDA = RAIZ / "assets/img-produzidas/posts"
LADO = 1080

# os tokens da marca, os mesmos do style.css
NOITE = (5, 9, 18)
MARINHO = (9, 19, 33)
SAFIRA = (13, 28, 45)
OURO = (214, 168, 78)
CHAMPAGNE = (240, 207, 130)
MARFIM = (247, 243, 234)
SUAVE = (198, 206, 218)

MARGEM = 64
COLUNA = 584  # onde começa a coluna de texto, à direita

BODONI = "bodoni-latin-normal-400-700.woff2"
MONO = "dmmono-latin-normal-500.woff2"
TEXTO = "manrope-latin-normal-200-800.woff2"

_cache: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def fonte(arquivo: str, tamanho: int) -> ImageFont.FreeTypeFont:
    """A fonte da marca, que vive em .woff2 e o desenho não lê direto."""
    chave = (arquivo, tamanho)
    if chave not in _cache:
        from fontTools.ttLib import TTFont

        memoria = io.BytesIO()
        TTFont(RAIZ / "assets/fonts" / arquivo).save(memoria)
        memoria.seek(0)
        _cache[chave] = ImageFont.truetype(memoria, tamanho)
    return _cache[chave]


def espacado(pintura, xy, texto, letra, cor, espaco=6, ancora="ls"):
    """Rótulo com respiro entre as letras: o PIL não tem letter-spacing."""
    x, y = xy
    largura = sum(letra.getlength(c) + espaco for c in texto) - espaco
    if ancora[0] == "m":
        x -= largura / 2
    elif ancora[0] == "r":
        x -= largura
    for c in texto:
        pintura.text((x, y), c, font=letra, fill=cor, anchor="l" + ancora[1])
        x += letra.getlength(c) + espaco


def quebrar(texto: str, letra: ImageFont.FreeTypeFont, largura: int) -> list[str]:
    linhas: list[str] = []
    atual = ""
    for palavra in texto.split():
        tentativa = f"{atual} {palavra}".strip()
        if letra.getlength(tentativa) <= largura or not atual:
            atual = tentativa
        else:
            linhas.append(atual)
            atual = palavra
    if atual:
        linhas.append(atual)
    return linhas


def fundo() -> Image.Image:
    """Noite descendo para marinho, com uma luz quente vindo do alto à esquerda."""
    base = Image.new("RGB", (LADO, LADO), NOITE)
    pintura = ImageDraw.Draw(base)
    for y in range(LADO):
        p = y / LADO
        pintura.line([(0, y), (LADO, y)], fill=tuple(round(NOITE[i] + (MARINHO[i] - NOITE[i]) * p) for i in range(3)))

    luz = Image.new("L", (LADO, LADO), 0)
    desenho = ImageDraw.Draw(luz)
    desenho.ellipse([-280, -360, 780, 540], fill=64)
    desenho.ellipse([420, 320, 1260, 1140], fill=24)
    luz = luz.filter(ImageFilter.GaussianBlur(150))
    return Image.composite(Image.new("RGB", (LADO, LADO), SAFIRA), base, luz)


def selo(arte: Image.Image, centro: tuple[int, int], raio: int = 72) -> None:
    """O selo de mais vendida: só aparece quando os pedidos dizem que é."""
    pintura = ImageDraw.Draw(arte)
    pintura.ellipse([centro[0] - raio, centro[1] - raio, centro[0] + raio, centro[1] + raio], fill=(12, 10, 6), outline=OURO, width=3)
    pintura.ellipse([centro[0] - raio + 9, centro[1] - raio + 9, centro[0] + raio - 9, centro[1] + raio - 9], outline=CHAMPAGNE, width=1)
    pintura.text((centro[0], centro[1] - 18), "MAIS", font=fonte(TEXTO, 23), fill=CHAMPAGNE, anchor="mm")
    pintura.text((centro[0], centro[1] + 8), "VENDIDA", font=fonte(TEXTO, 23), fill=CHAMPAGNE, anchor="mm")
    pintura.text((centro[0], centro[1] + 36), "* * *", font=fonte(TEXTO, 18), fill=OURO, anchor="mm")


def icone(pintura, centro, tipo: str, raio: int = 32) -> None:
    """Um sinal simples dentro de um círculo de ouro — nunca ilustração de enfeite."""
    x, y = centro
    pintura.ellipse([x - raio, y - raio, x + raio, y + raio], outline=OURO, width=2)
    if tipo == "largura":
        pintura.line([(x - 14, y - 11), (x - 14, y + 11)], fill=CHAMPAGNE, width=2)
        pintura.line([(x + 14, y - 11), (x + 14, y + 11)], fill=CHAMPAGNE, width=2)
        pintura.line([(x - 14, y), (x + 14, y)], fill=CHAMPAGNE, width=2)
    elif tipo == "formato":
        pintura.ellipse([x - 15, y - 15, x + 15, y + 15], outline=CHAMPAGNE, width=3)
        pintura.line([(x - 15, y - 5), (x + 15, y - 5)], fill=CHAMPAGNE, width=1)
    elif tipo == "forro":
        pintura.polygon([(x, y - 16), (x + 13, y - 8), (x + 13, y + 5), (x, y + 16), (x - 13, y + 5), (x - 13, y - 8)], outline=CHAMPAGNE, width=2)
    elif tipo == "liga":
        for dy in (8, 0, -8):
            pintura.ellipse([x - 15, y + dy - 6, x + 15, y + dy + 4], outline=CHAMPAGNE, width=2)


def atributos(modelo: dict) -> list[tuple[str, str, str]]:
    """Ícone, título e detalhe de cada linha. Tudo lido da descrição da tabela."""
    linhas: list[tuple[str, str, str]] = []

    if modelo.get("larguraMm"):
        linhas.append(("largura", f"{modelo['larguraMm']:g}MM".replace(".", ","), "LARGURA MARCANTE"))

    # o acabamento é o que sobra da descrição depois de tirar o que já foi dito
    resto = re.sub(r"ALIAN[ÇC]A\s*", "", modelo["descricaoTabela"].upper())
    resto = re.sub(r"ANAT\.?\s*", "", resto)
    resto = re.sub(r"\d+(?:[.,]\d+)?\s*MM", "", resto)
    resto = re.sub(r"\s*,\s*", ", ", resto).strip(" ,")
    if resto:
        linhas.append(("formato", resto, "ACABAMENTO"))

    linhas.append(("forro", "INTERIOR EM AÇO INOX", "RESISTENTE E HIPOALERGÊNICO"))
    linhas.append(("liga", "LIGA DE MOEDA", "ALTA DURABILIDADE E BRILHO"))
    return linhas[:4]


def montar(modelo: dict, mais_vendida: bool = False) -> Image.Image:
    arte = fundo()
    pintura = ImageDraw.Draw(arte)

    # --- marca, no alto à esquerda
    emblema = Image.open(RAIZ / "assets/marca/emblema.png").convert("RGBA")
    emblema = emblema.resize((236, round(emblema.height * 236 / emblema.width)), Image.LANCZOS)
    arte.paste(emblema, (MARGEM + 42, MARGEM - 6), emblema)

    meio = MARGEM + 42 + emblema.width // 2
    topo = MARGEM + emblema.height + 42
    pintura.text((meio, topo), "ETERNO", font=fonte(BODONI, 60), fill=OURO, anchor="ms")
    pintura.text((meio, topo + 52), "DOURADO", font=fonte(BODONI, 50), fill=OURO, anchor="ms")
    espacado(pintura, (meio, topo + 88), "ALIANÇAS", fonte(MONO, 19), CHAMPAGNE, 8, "ms")

    if mais_vendida:
        selo(arte, (MARGEM + 62, topo + 150), 62)

    # --- o par, embaixo à esquerda
    caminho = RAIZ / modelo["foto"].replace("-380", "-760")
    if not caminho.exists():
        caminho = RAIZ / modelo["foto"]
    peca = Image.open(caminho).convert("RGBA")
    alvo = 496
    peca = peca.resize((alvo, round(peca.height * alvo / peca.width)), Image.LANCZOS)
    arte.paste(peca, (118, LADO - 124 - peca.height), peca)

    # --- a chamada, à direita
    largura = LADO - COLUNA - MARGEM
    centro = COLUNA + largura / 2
    espacado(pintura, (centro, MARGEM + 72), "SÍMBOLO DE AMOR", fonte(MONO, 24), MARFIM, 5, "ms")
    pintura.text((centro, MARGEM + 150), "PARA SEMPRE", font=fonte(BODONI, 72), fill=CHAMPAGNE, anchor="ms")

    y = MARGEM + 180
    pintura.line([(COLUNA, y), (LADO - MARGEM, y)], fill=OURO, width=1)
    y += 42
    for linha in ("ALIANÇAS DE MOEDA", "COM INTERIOR EM AÇO INOX"):
        pintura.text((centro, y), linha, font=fonte(TEXTO, 26), fill=MARFIM, anchor="ms")
        y += 34
    pintura.line([(COLUNA, y - 6), (LADO - MARGEM, y - 6)], fill=OURO, width=1)

    # --- os atributos
    y += 64
    for tipo, titulo, detalhe in atributos(modelo):
        icone(pintura, (COLUNA + 34, y), tipo)
        x = COLUNA + 92
        partes = quebrar(titulo, fonte(TEXTO, 28), LADO - MARGEM - x)[:2]
        for i, parte in enumerate(partes):
            pintura.text((x, y - 14 + i * 31), parte, font=fonte(TEXTO, 28), fill=CHAMPAGNE, anchor="ls")
        pintura.text((x, y - 14 + len(partes) * 31 + 4), detalhe, font=fonte(TEXTO, 20), fill=SUAVE, anchor="ls")
        y += 54 + len(partes) * 26

    # --- a referência, que é como o lojista pede a peça
    espacado(pintura, (LADO - MARGEM, LADO - 108), modelo["codigoTabela"], fonte(MONO, 25), OURO, 4, "rs")

    # --- assinatura
    espacado(pintura, (LADO / 2, LADO - 50), "AMOR QUE BRILHA. ETERNO POR NATUREZA.", fonte(MONO, 20), CHAMPAGNE, 4, "ms")
    return arte


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit("diga a referência: py scripts/conteudo/post.py 303LM")

    procurado = sys.argv[1].upper().replace("-", "").replace("/", "")
    dados = json.loads((RAIZ / "src/data/modelos.json").read_text(encoding="utf-8"))
    achado = next(
        (m for m in dados["modelos"] if m["code"].upper().replace("-", "").replace("/", "") == procurado),
        None,
    )
    if not achado:
        raise SystemExit(f"{sys.argv[1]} não está no catálogo com foto")

    SAIDA.mkdir(parents=True, exist_ok=True)
    arquivo = SAIDA / f"{achado['code']}.jpg"
    montar(achado, "--mais-vendida" in sys.argv).save(arquivo, "JPEG", quality=92, optimize=True, progressive=True)
    print(f"{arquivo.relative_to(RAIZ)} · {achado['codigoTabela']} — {achado['descricaoTabela']}")


if __name__ == "__main__":
    main()
