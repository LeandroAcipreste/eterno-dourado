"""Remove o fundo de uma pasta de imagens com rembg, em lote.

    py scripts/remover-fundo.py <pasta-entrada> <pasta-saida>

Chamado pelo estágio 3 de scripts/aprimorar-imagens.mjs.

A sessão do modelo é criada uma vez e reaproveitada nas 80 imagens: carregar o
modelo custa cerca de 30 s, e por arquivo isso seria quase todo o tempo do lote.

Modelo: isnet-general-use. Foi o que segurou melhor os furos dos anéis — é isso
que define uma aliança, e um recorte que fecha o furo não serve.

alpha matting ligado. Sem ele o rembg devolve a peça inteira semitransparente
(medido: 60% dos pixels entre 1 e 254, nenhum opaco), e a peça fica lavada sobre
o fundo escuro do site.
"""

import sys
import time
from pathlib import Path

from PIL import Image
from rembg import new_session, remove

MODELO = "isnet-general-use"

# Limiares do matting. Frente alta e fundo baixo mantêm o miolo do metal opaco
# e só deixam a transição fina na borda; a erosão tira o resto do fundo que
# ficou colado na silhueta.
MATTING = dict(
    alpha_matting=True,
    alpha_matting_foreground_threshold=250,
    alpha_matting_background_threshold=15,
    alpha_matting_erode_size=6,
)

EXTENSOES = {".png", ".jpg", ".jpeg", ".webp"}


def main() -> int:
    if len(sys.argv) < 3:
        print("uso: py scripts/remover-fundo.py <entrada> <saida>", file=sys.stderr)
        return 2

    entrada = Path(sys.argv[1])
    saida = Path(sys.argv[2])
    saida.mkdir(parents=True, exist_ok=True)

    arquivos = sorted(p for p in entrada.iterdir() if p.suffix.lower() in EXTENSOES)
    if not arquivos:
        print(f"nenhuma imagem em {entrada}", file=sys.stderr)
        return 1

    inicio = time.time()
    print(f"carregando {MODELO}...", flush=True)
    sessao = new_session(MODELO)
    print(f"modelo pronto em {time.time() - inicio:.1f}s", flush=True)

    falhas = []
    for i, arquivo in enumerate(arquivos, start=1):
        t = time.time()
        try:
            with Image.open(arquivo) as img:
                recortado = remove(img.convert("RGB"), session=sessao, **MATTING)
            destino = saida / f"{arquivo.stem}.png"
            recortado.save(destino)
            print(
                f"{i:3}/{len(arquivos)}  {arquivo.name:<24} {recortado.size[0]}x{recortado.size[1]}  {time.time() - t:.1f}s",
                flush=True,
            )
        except Exception as erro:  # noqa: BLE001 — o lote não pode parar por um arquivo
            falhas.append((arquivo.name, str(erro).splitlines()[0]))
            print(f"{i:3}/{len(arquivos)}  {arquivo.name:<24} FALHOU: {erro}", file=sys.stderr, flush=True)

    ok = len(arquivos) - len(falhas)
    print(f"\n{ok}/{len(arquivos)} imagens recortadas em {time.time() - inicio:.0f}s", flush=True)
    if falhas:
        print(f"{len(falhas)} falha(s):", file=sys.stderr)
        for nome, erro in falhas:
            print(f"  {nome}: {erro}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
