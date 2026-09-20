"""Ajusta a geometria de uma aliança lisa à foto de referência.

    py scripts/glb/ajustar.py 03LM

Isola o anel maior de assests/img/aliancas-hd/<codigo>.png e procura a seção
(diâmetro, espessura, posição da borda, cúpulas) e a vista (guinada, arfagem,
rolagem) cuja silhueta e divisão ouro/branco mais coincidem com a foto. A
largura em mm vem do código (03 = 3 mm) e fixa a escala.

Grava scripts/glb/parametros/<codigo>.json (preserva os materiais já ajustados)
e uma comparação lado a lado na pasta temporária do sistema.
"""

import json
import sys
import tempfile
from pathlib import Path

import cv2
import numpy as np
from scipy import ndimage as ndi
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).parent))
from alianca import EXTERNO, INTERNO, malha, rotacao  # noqa: E402

RAIZ = Path(__file__).resolve().parents[2]
CODIGO = sys.argv[1]
LARGURA = float(sys.argv[2]) if len(sys.argv) > 2 else float(CODIGO[:2])
SAIDA = Path(__file__).parent / 'parametros' / f'{CODIGO}.json'
PASTA_TMP = Path(tempfile.gettempdir()) / 'eterno-dourado-glb'

imagem = cv2.imread(str(RAIZ / 'assests/img/aliancas-hd' / f'{CODIGO}.png'), cv2.IMREAD_UNCHANGED)
alfa = imagem[:, :, 3] > 128
rotulos_foto, total = ndi.label(alfa)
maior = 1 + int(np.argmax(ndi.sum(alfa, rotulos_foto, range(1, total + 1))))
ys, xs = np.where(rotulos_foto == maior)
BORDA = 16
y0, x0 = max(0, ys.min() - BORDA), max(0, xs.min() - BORDA)
y1, x1 = min(alfa.shape[0], ys.max() + BORDA + 1), min(alfa.shape[1], xs.max() + BORDA + 1)

foto = (rotulos_foto == maior)[y0:y1, x0:x1]
saturacao = cv2.cvtColor(imagem[:, :, :3], cv2.COLOR_BGR2HSV)[y0:y1, x0:x1, 1]
ouro_foto = foto & (saturacao > 55)
branco_foto = foto & (saturacao < 22)
ALTO, LARGO = foto.shape
ALVO_ALTURA = ys.max() - ys.min() + 1
ALVO_CENTRO = np.array([(xs.min() + xs.max()) / 2 - x0, (ys.min() + ys.max()) / 2 - y0])


def decodificar(x):
    guinada, arfagem, rolagem, diametro_rel, espessura_rel, meio, exp_ext, exp_int = x
    if not (0.12 <= espessura_rel <= 1.0 and 0.05 <= meio <= 0.95 and 1.4 <= exp_ext <= 9 and 1.4 <= exp_int <= 9):
        return None
    raio_externo = diametro_rel * LARGURA / 2
    espessura = espessura_rel * LARGURA
    if raio_externo - espessura < 3:
        return None
    geometria = {
        'largura': LARGURA,
        'raioExterno': raio_externo,
        'raioInterno': raio_externo - espessura,
        'meio': meio,
        'expoenteExterno': exp_ext,
        'expoenteInterno': exp_int,
    }
    return geometria, (guinada, arfagem, rolagem)


def desenhar(geometria, vista, n=96, k=48):
    """Projeção ortográfica pintada de trás para frente: 0 fundo, 1 ouro, 2 branco."""
    v, _, tris, rot = malha(geometria, n, k)
    camera = v @ rotacao(*vista).T
    plano = np.column_stack([camera[:, 0], -camera[:, 1]])
    minimo, maximo = plano.min(0), plano.max(0)
    escala = ALVO_ALTURA / (maximo[1] - minimo[1])
    pixels = (plano - (minimo + maximo) / 2) * escala + ALVO_CENTRO
    ordem = np.argsort(camera[tris, 2].mean(1))
    poligonos = np.round(pixels[tris[ordem]] * 16).astype(np.int32)
    tela = np.zeros((ALTO, LARGO), np.uint8)
    for poligono, rotulo in zip(poligonos, rot[ordem]):
        cv2.fillConvexPoly(tela, poligono, int(rotulo), cv2.LINE_8, 4)
    return tela


def medir(tela):
    silhueta = tela > 0
    iou = (silhueta & foto).sum() / max((silhueta | foto).sum(), 1)
    confiavel = (ouro_foto | branco_foto) & silhueta
    certo = ((tela == EXTERNO) & ouro_foto) | ((tela == INTERNO) & branco_foto)
    return iou, certo.sum() / max(confiavel.sum(), 1)


def perda(x):
    decodificado = decodificar(x)
    if decodificado is None:
        return 9.0
    iou, acordo = medir(desenhar(*decodificado))
    return (1 - iou) + 0.35 * (1 - acordo)


melhor = None
for guinada in (72, -72, 60, -60):
    inicio = np.array([guinada, 0, 0, 7.0, 0.5, 0.45, 2.5, 2.5])
    passos = np.array([8, 4, 3, 0.8, 0.12, 0.12, 0.6, 0.6])
    simplex = np.vstack([inicio] + [inicio + np.eye(8)[i] * passos[i] for i in range(8)])
    r = minimize(perda, inicio, method='Nelder-Mead', options={'initial_simplex': simplex, 'maxiter': 700, 'xatol': 1e-3, 'fatol': 1e-5})
    print(f'início guinada {guinada:>4}: perda {r.fun:.4f}')
    if melhor is None or r.fun < melhor.fun:
        melhor = r

r = minimize(perda, melhor.x, method='Nelder-Mead', options={'maxiter': 900, 'xatol': 1e-4, 'fatol': 1e-6})
geometria, vista = decodificar(r.x)
tela = desenhar(geometria, vista, 160, 72)
iou, acordo = medir(tela)

anterior = json.loads(SAIDA.read_text(encoding='utf-8')) if SAIDA.exists() else {}
resultado = {
    'codigo': CODIGO,
    'fonte': f'assests/img/aliancas-hd/{CODIGO}.png (anel maior)',
    'anelNaFoto': {'x0': int(xs.min()), 'y0': int(ys.min()), 'x1': int(xs.max()), 'y1': int(ys.max())},
    **{chave: round(float(valor), 4) for chave, valor in geometria.items()},
    'vistaDaFoto': dict(zip(('guinada', 'arfagem', 'rolagem'), (round(float(t), 2) for t in vista))),
    'ajuste': {'iouSilhueta': round(float(iou), 4), 'acordoCores': round(float(acordo), 4)},
    'materiais': anterior.get('materiais') or {
        'externo': {'nome': 'Ouro amarelo polido', 'cor': '#F6D58E', 'metal': 1, 'rugosidade': 0.14},
        'interno': {'nome': 'Ouro branco polido', 'cor': '#E4E4E2', 'metal': 1, 'rugosidade': 0.12},
    },
}
SAIDA.parent.mkdir(parents=True, exist_ok=True)
SAIDA.write_text(json.dumps(resultado, ensure_ascii=False, indent=2), encoding='utf-8')

# comparação: foto | rótulos da foto | render | contorno do render sobre a foto
cores = np.array([[255, 255, 255], [60, 170, 220], [150, 150, 150]], np.uint8)
recorte = imagem[y0:y1, x0:x1]
fundo_branco = (recorte[:, :, :3] * (recorte[:, :, 3:] / 255) + 255 * (1 - recorte[:, :, 3:] / 255)).astype(np.uint8)
rotulos_da_foto = np.zeros_like(tela)
rotulos_da_foto[foto] = 3
rotulos_da_foto[ouro_foto] = EXTERNO
rotulos_da_foto[branco_foto] = INTERNO
paleta = np.vstack([cores, [[210, 210, 210]]]).astype(np.uint8)
contorno = fundo_branco.copy()
bordas, _ = cv2.findContours((tela > 0).astype(np.uint8), cv2.RETR_LIST, cv2.CHAIN_APPROX_NONE)
cv2.drawContours(contorno, bordas, -1, (0, 0, 255), 1)
fronteira = cv2.Canny((tela * 100).astype(np.uint8), 50, 150) > 0
contorno[fronteira & (tela > 0)] = (0, 200, 0)
painel = np.hstack([fundo_branco, paleta[rotulos_da_foto], cores[tela], contorno])
PASTA_TMP.mkdir(exist_ok=True)
comparacao = PASTA_TMP / f'{CODIGO}-ajuste.png'
cv2.imwrite(str(comparacao), painel)

print(json.dumps({k: resultado[k] for k in ('raioExterno', 'raioInterno', 'meio', 'expoenteExterno', 'expoenteInterno', 'vistaDaFoto', 'ajuste')}, ensure_ascii=False))
print('comparação:', comparacao)
