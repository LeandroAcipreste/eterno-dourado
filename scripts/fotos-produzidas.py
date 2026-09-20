"""Converte as fotos produzidas (PNG de 1 a 3 MB) em WebP para o site.

    py scripts/fotos-produzidas.py

Lê assets/img-produzidas/*.png e grava assets/img-produzidas/web/<nome>-640.webp
e <nome>-1280.webp (sem ampliar: foto menor que a largura fica no tamanho dela).
As de produto mantêm o código do arquivo; as de pessoas ganham nomes curtos.
"""

from pathlib import Path

from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
ORIGEM = RAIZ / 'assets/img-produzidas'
DESTINO = ORIGEM / 'web'
LARGURAS = (640, 1280)

# as imagens de pessoas vieram com o nome da exportação do ChatGPT
NOMES = {
    'ChatGPT Image 26 de jul. de 2025, 05_42_35.png': 'maos-1',
    'ChatGPT Image 26 de jul. de 2025, 05_46_31.png': 'maos-2',
    'ChatGPT Image 26 de jul. de 2025, 05_59_44 (1).png': 'casal-maos',
    'ChatGPT Image 26 de jul. de 2025, 05_59_44.png': 'casal',
}


def main():
    DESTINO.mkdir(exist_ok=True)
    for arquivo in sorted(ORIGEM.glob('*.png')):
        nome = NOMES.get(arquivo.name, arquivo.stem)
        with Image.open(arquivo) as imagem:
            imagem = imagem.convert('RGB')
            for largura in LARGURAS:
                alvo = min(largura, imagem.width)
                copia = imagem if alvo == imagem.width else imagem.resize(
                    (alvo, round(imagem.height * alvo / imagem.width)), Image.LANCZOS
                )
                saida = DESTINO / f'{nome}-{largura}.webp'
                copia.save(saida, 'WEBP', quality=82, method=6)
                print(f'{saida.relative_to(RAIZ)}  {copia.width}x{copia.height}  {saida.stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
