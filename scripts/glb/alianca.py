"""Geometria paramétrica de aliança lisa e gravação de GLB.

A seção transversal é fechada e feita de duas meias superelipses: a de fora
(ouro amarelo) e a de dentro (ouro branco). As duas se encontram na borda com
tangente vertical, então a borda sai arredondada sem costura.

Parâmetros (mm):
  largura          extensão no eixo do anel
  raioExterno      raio no topo da cúpula de fora
  raioInterno      raio no fundo da cúpula de dentro
  meio             posição da borda na espessura (0 = no raio interno, 1 = no externo)
  expoenteExterno  2 = cúpula elíptica; maior = mais achatada, borda mais viva
  expoenteInterno  idem para o lado de dentro (anatômico)
"""

import json
import math
import struct

import numpy as np

EXTERNO, INTERNO = 1, 2


def secao(p, k):
    """Pontos (k, 2) no plano (x axial, r radial) e o rótulo de cada ponto."""
    w, ro, ri = p['largura'], p['raioExterno'], p['raioInterno']
    rm = ri + (ro - ri) * p['meio']
    meia = k // 2

    u = np.linspace(0, math.pi, meia, endpoint=False)
    c, s = np.cos(u), np.sin(u)
    x_ext = (w / 2) * np.sign(c) * np.abs(c) ** (2 / p['expoenteExterno'])
    r_ext = rm + (ro - rm) * np.abs(s) ** (2 / p['expoenteExterno'])

    u = np.linspace(math.pi, 2 * math.pi, meia, endpoint=False)
    c, s = np.cos(u), np.sin(u)
    x_int = (w / 2) * np.sign(c) * np.abs(c) ** (2 / p['expoenteInterno'])
    r_int = rm - (rm - ri) * np.abs(s) ** (2 / p['expoenteInterno'])

    pontos = np.vstack([np.column_stack([x_ext, r_ext]), np.column_stack([x_int, r_int])])
    rotulos = np.array([EXTERNO] * meia + [INTERNO] * meia)
    return pontos, rotulos


def malha(p, n=200, k=72):
    """Anel no plano XY com eixo em Z. Devolve vértices, normais, triângulos e rótulo por triângulo."""
    pontos, rotulos = secao(p, k)
    k = len(pontos)
    a = np.arange(n) * 2 * math.pi / n
    x = np.outer(np.cos(a), pontos[:, 1])
    y = np.outer(np.sin(a), pontos[:, 1])
    z = np.tile(pontos[:, 0], (n, 1))
    v = np.stack([x, y, z], -1).reshape(-1, 3)

    i = np.arange(n)[:, None]
    j = np.arange(k)[None, :]
    a0 = i * k + j
    a1 = ((i + 1) % n) * k + j
    b0 = i * k + (j + 1) % k
    b1 = ((i + 1) % n) * k + (j + 1) % k
    tris = np.concatenate([np.stack([a0, b0, a1], -1).reshape(-1, 3), np.stack([a1, b0, b1], -1).reshape(-1, 3)])
    rot = np.tile(np.broadcast_to(rotulos[None, :], (n, k)).reshape(-1), 2)

    normais = _normais(v, tris)
    # a normal de fora tem de apontar para longe do eixo; se não, inverte a ordem
    externos = np.repeat(rotulos[None, :] == EXTERNO, n, 0).reshape(-1)
    radial = v[externos, :2]
    if np.mean(np.sum(normais[externos, :2] * radial, 1)) < 0:
        tris = tris[:, [0, 2, 1]]
        normais = -normais
    return v, normais, tris, rot


def _normais(v, tris):
    face = np.cross(v[tris[:, 1]] - v[tris[:, 0]], v[tris[:, 2]] - v[tris[:, 0]])
    n = np.zeros_like(v)
    for c in range(3):
        np.add.at(n, tris[:, c], face)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def rotacao(guinada, arfagem, rolagem):
    """Graus. R = Rz(rolagem) · Rx(arfagem) · Ry(guinada)."""
    g, a, r = (math.radians(t) for t in (guinada, arfagem, rolagem))
    ry = np.array([[math.cos(g), 0, math.sin(g)], [0, 1, 0], [-math.sin(g), 0, math.cos(g)]])
    rx = np.array([[1, 0, 0], [0, math.cos(a), -math.sin(a)], [0, math.sin(a), math.cos(a)]])
    rz = np.array([[math.cos(r), -math.sin(r), 0], [math.sin(r), math.cos(r), 0], [0, 0, 1]])
    return rz @ rx @ ry


def _linear(hexa):
    """sRGB '#rrggbb' para linear, como o glTF espera em baseColorFactor."""
    c = [int(hexa[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]


def gravar_glb(caminho, nome, v, normais, tris, rot, materiais, extras):
    """materiais: {'externo': {...}, 'interno': {...}} com cor (hex sRGB), metal e rugosidade."""
    blob = bytearray()
    doc = {
        'asset': {'version': '2.0', 'generator': 'eterno-dourado scripts/glb', 'extras': extras},
        'scene': 0,
        'scenes': [{'nodes': [0]}],
        'nodes': [{'name': nome, 'mesh': 0}],
        'meshes': [{'name': nome, 'primitives': []}],
        'materials': [],
        'buffers': [],
        'bufferViews': [],
        'accessors': [],
    }

    def acessor(dados, tipo, alvo):
        while len(blob) % 4:
            blob.append(0)
        deslocamento = len(blob)
        blob.extend(dados.tobytes())
        doc['bufferViews'].append({'buffer': 0, 'byteOffset': deslocamento, 'byteLength': dados.nbytes, 'target': alvo})
        item = {
            'bufferView': len(doc['bufferViews']) - 1,
            'componentType': {np.dtype('<f4'): 5126, np.dtype('<u2'): 5123, np.dtype('<u4'): 5125}[dados.dtype],
            'count': len(dados),
            'type': tipo,
        }
        if tipo == 'VEC3':
            item.update(min=dados.min(0).tolist(), max=dados.max(0).tolist())
        doc['accessors'].append(item)
        return len(doc['accessors']) - 1

    for rotulo, chave in ((EXTERNO, 'externo'), (INTERNO, 'interno')):
        m = materiais[chave]
        doc['materials'].append({
            'name': m['nome'],
            'pbrMetallicRoughness': {
                'baseColorFactor': [*_linear(m['cor']), 1],
                'metallicFactor': m['metal'],
                'roughnessFactor': m['rugosidade'],
            },
        })
        parte = tris[rot == rotulo]
        usados, novo = np.unique(parte, return_inverse=True)
        indices = novo.reshape(-1).astype('<u2' if len(usados) < 65536 else '<u4')
        doc['meshes'][0]['primitives'].append({
            'attributes': {
                'POSITION': acessor(np.ascontiguousarray(v[usados] * 0.001, '<f4'), 'VEC3', 34962),
                'NORMAL': acessor(np.ascontiguousarray(normais[usados], '<f4'), 'VEC3', 34962),
            },
            'indices': acessor(np.ascontiguousarray(indices), 'SCALAR', 34963),
            'material': len(doc['materials']) - 1,
        })

    doc['buffers'] = [{'byteLength': len(blob)}]
    j = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode()
    j += b' ' * ((-len(j)) % 4)
    b = bytes(blob) + b'\0' * ((-len(blob)) % 4)
    caminho.write_bytes(
        struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(j) + 8 + len(b))
        + struct.pack('<II', len(j), 0x4E4F534A) + j
        + struct.pack('<II', len(b), 0x004E4942) + b
    )
