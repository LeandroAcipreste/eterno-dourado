"""Gera o GLB de uma aliança a partir de scripts/glb/parametros/<codigo>.json.

    py scripts/glb/gerar.py 03LM

Uma aliança só, centrada na origem, em metros, girada como na foto de
referência: com a câmera de frente, o modal abre na mesma vista da foto. O lado
de fora e o de dentro são primitivas separadas, cada uma com o seu material.
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from alianca import gravar_glb, malha, rotacao  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
CODIGO = sys.argv[1]
parametros = json.loads((Path(__file__).parent / 'parametros' / f'{CODIGO}.json').read_text(encoding='utf-8'))

v, normais, tris, rot = malha(parametros)
vista = parametros['vistaDaFoto']
orientacao = rotacao(vista['guinada'], vista['arfagem'], vista['rolagem'])
v, normais = v @ orientacao.T, normais @ orientacao.T

destino = RAIZ / 'assests/img/modelos-3d/glb' / f'{CODIGO}.glb'
gravar_glb(
    destino,
    f'Aliança {CODIGO}',
    v,
    normais,
    tris,
    rot,
    parametros['materiais'],
    {'fonte': parametros['fonte'], 'larguraMM': parametros['largura'], 'diametroExternoMM': round(2 * parametros['raioExterno'], 2)},
)
print(f'{destino.relative_to(RAIZ)}: {destino.stat().st_size / 1024:.0f} KB, {len(v)} vértices, {len(tris)} triângulos')
