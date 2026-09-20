"""Refaz a foto de uma referência no estilo de estúdio, com o Gemini, e recorta o fundo.

    py scripts/refazer-fotos.py 03LM-1                 3 tentativas, grava a mais fiel
    py scripts/refazer-fotos.py 03LM-1 --tentativas 5
    py scripts/refazer-fotos.py --modelos              modelos de imagem que a sua chave acessa

Precisa de GEMINI_API_KEY no ambiente. O modelo vem de GEMINI_MODELO_IMAGEM
(padrão gemini-3-pro-image, o Nano Banana Pro).

Entrada:
  assests/img/aliancas-hd/<codigo>.png   a peça (o desenho não pode mudar)
  utils/referencia-estilo.*              só luz, reflexo e qualidade do material

Saída:
  assests/img/aliancas-ia/bruto/<codigo>-<n>.png   cada tentativa, como veio
  assests/img/aliancas-ia/<codigo>.png             a mais fiel, com fundo transparente
  <temp>/eterno-dourado-fotos/<codigo>-comparacao.png   original | nova, para aprovar

Fidelidade: original e tentativa são recortadas, cada silhueta é enquadrada pela
própria caixa e as duas são sobrepostas (IoU). A luz pode mudar; o desenho, não.
Abaixo de --minimo nada é gravado, e as tentativas ficam em bruto/ para conferir.
"""

import argparse
import base64
import importlib.util
import io
import json
import os
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np
from PIL import Image

RAIZ = Path(__file__).resolve().parents[1]
ORIGINAIS = RAIZ / 'assests/img/aliancas-hd'
SAIDA = RAIZ / 'assests/img/aliancas-ia'
PASTA_TMP = Path(tempfile.gettempdir()) / 'eterno-dourado-fotos'
API = 'https://generativelanguage.googleapis.com/v1beta'
MODELO = os.environ.get('GEMINI_MODELO_IMAGEM', 'gemini-3-pro-image')
MARFIM = (247, 243, 234)

PROMPT = (
    'Professional jewelry product photograph for a wholesale catalog. '
    'The FIRST image is the exact product: recreate the very same wedding rings with no design change: '
    'same number of rings, same sizes relative to each other, same position, camera angle and framing, '
    'same band width and profile, same grooves and edges, same stones (count, position, size and setting), '
    'yellow gold outside and polished stainless steel inside exactly where the first image shows them. '
    'Do not add, remove, move or restyle any detail. '
    'Change only the photography: pure black seamless background, dark luxury studio with large soft lights, '
    'rich warm yellow gold with mirror polish and crisp reflections, brilliant-cut diamonds with sharp facets '
    'and sparkle, tack-sharp focus, high resolution, no text, no logo, no props, no shadow on the background.'
)
PROMPT_REFERENCIA = 'The SECOND image is only a reference for lighting, reflections and material quality. Never copy its ring design.'


def pedir(caminho, corpo=None):
    chave = os.environ.get('GEMINI_API_KEY')
    if not chave:
        raise SystemExit('defina GEMINI_API_KEY (Google AI Studio) e abra um terminal novo')
    dados = json.dumps(corpo).encode() if corpo is not None else None
    requisicao = urllib.request.Request(
        f'{API}/{caminho}',
        data=dados,
        method='POST' if dados else 'GET',
        headers={'x-goog-api-key': chave, 'Content-Type': 'application/json'},
    )
    try:
        with urllib.request.urlopen(requisicao, timeout=240) as resposta:
            return json.load(resposta)
    except urllib.error.HTTPError as erro:
        raise RuntimeError(f'HTTP {erro.code}: {erro.read().decode(errors="replace")[:400]}') from None


def png_base64(imagem):
    buffer = io.BytesIO()
    imagem.save(buffer, 'PNG')
    return base64.b64encode(buffer.getvalue()).decode()


def sobre_cor(imagem_rgba, cor):
    fundo = Image.new('RGBA', imagem_rgba.size, (*cor, 255))
    fundo.alpha_composite(imagem_rgba)
    return fundo.convert('RGB')


def gerar(original, referencia):
    texto = PROMPT + (' ' + PROMPT_REFERENCIA if referencia is not None else '')
    partes = [{'text': texto}, {'inline_data': {'mime_type': 'image/png', 'data': png_base64(original)}}]
    if referencia is not None:
        partes.append({'inline_data': {'mime_type': 'image/png', 'data': png_base64(referencia)}})
    corpo = {
        'contents': [{'parts': partes}],
        'generationConfig': {'responseModalities': ['TEXT', 'IMAGE'], 'imageConfig': {'aspectRatio': '3:4'}},
    }
    resposta = pedir(f'models/{MODELO}:generateContent', corpo)
    for candidato in resposta.get('candidates', []):
        for parte in candidato.get('content', {}).get('parts', []):
            dados = parte.get('inlineData') or parte.get('inline_data')
            if dados:
                return Image.open(io.BytesIO(base64.b64decode(dados['data']))).convert('RGB')
    motivo = resposta.get('promptFeedback') or [c.get('finishReason') for c in resposta.get('candidates', [])]
    raise RuntimeError(f'o modelo não devolveu imagem: {motivo}')


def preparar_recorte():
    """Mesmo modelo e mesmo matting de scripts/remover-fundo.py, com a sessão carregada uma vez."""
    especificacao = importlib.util.spec_from_file_location('remover_fundo', Path(__file__).parent / 'remover-fundo.py')
    modulo = importlib.util.module_from_spec(especificacao)
    especificacao.loader.exec_module(modulo)
    sessao = modulo.new_session(modulo.MODELO)
    return lambda imagem: modulo.remove(imagem.convert('RGB'), session=sessao, **modulo.MATTING)


def silhueta(imagem_rgba, lado=320):
    """Máscara enquadrada pela própria caixa, centrada num quadrado, sem distorcer a proporção."""
    alfa = np.asarray(imagem_rgba.getchannel('A')) > 128
    ys, xs = np.nonzero(alfa)
    if len(xs) == 0:
        return None
    recorte = alfa[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    altura, largura = recorte.shape
    escala = lado / max(altura, largura)
    tamanho = (max(1, round(largura * escala)), max(1, round(altura * escala)))
    reduzida = np.asarray(Image.fromarray(recorte.astype(np.uint8) * 255).resize(tamanho, Image.BILINEAR)) > 127
    tela = np.zeros((lado, lado), bool)
    y0 = (lado - reduzida.shape[0]) // 2
    x0 = (lado - reduzida.shape[1]) // 2
    tela[y0:y0 + reduzida.shape[0], x0:x0 + reduzida.shape[1]] = reduzida
    return tela


def fidelidade(original_rgba, gerada_rgba):
    a, b = silhueta(original_rgba), silhueta(gerada_rgba)
    if a is None or b is None:
        return 0.0
    return float((a & b).sum() / max((a | b).sum(), 1))


def salvar_comparacao(original_rgba, nova_rgba, destino, altura=720):
    lados = []
    for imagem, cor in ((original_rgba, (255, 255, 255)), (nova_rgba, MARFIM)):
        plana = sobre_cor(imagem, cor)
        lados.append(plana.resize((round(plana.width * altura / plana.height), altura), Image.LANCZOS))
    painel = Image.new('RGB', (lados[0].width + lados[1].width + 24, altura), (255, 255, 255))
    painel.paste(lados[0], (0, 0))
    painel.paste(lados[1], (lados[0].width + 24, 0))
    destino.parent.mkdir(parents=True, exist_ok=True)
    painel.save(destino)


def main():
    argumentos = argparse.ArgumentParser(description='Refaz a foto de uma referência com o Gemini.')
    argumentos.add_argument('codigo', nargs='?')
    argumentos.add_argument('--tentativas', type=int, default=3)
    argumentos.add_argument('--minimo', type=float, default=0.85, help='fidelidade mínima (IoU) para gravar')
    argumentos.add_argument('--modelos', action='store_true')
    a = argumentos.parse_args()

    if a.modelos:
        for modelo in pedir('models?pageSize=1000').get('models', []):
            if 'image' in modelo['name']:
                print(modelo['name'], '·', modelo.get('displayName', ''))
        return 0
    if not a.codigo:
        argumentos.error('informe o código, por exemplo 03LM-1')

    caminho_original = ORIGINAIS / f'{a.codigo}.png'
    original = Image.open(caminho_original).convert('RGBA')
    referencias = sorted((RAIZ / 'utils').glob('referencia-estilo.*'))
    referencia = Image.open(referencias[0]).convert('RGB') if referencias else None
    if referencia is None:
        print('aviso: sem utils/referencia-estilo.*, o estilo vai só pelo texto', file=sys.stderr)

    recortar = preparar_recorte()
    (SAIDA / 'bruto').mkdir(parents=True, exist_ok=True)
    melhor = None
    for n in range(1, a.tentativas + 1):
        inicio = time.time()
        try:
            gerada = gerar(sobre_cor(original, (255, 255, 255)), referencia)
        except RuntimeError as erro:
            print(f'tentativa {n}: {erro}', file=sys.stderr, flush=True)
            continue
        gerada.save(SAIDA / 'bruto' / f'{a.codigo}-{n}.png')
        recortada = recortar(gerada)
        nota = fidelidade(original, recortada)
        print(f'tentativa {n}: fidelidade {nota:.3f} ({gerada.width}x{gerada.height}, {time.time() - inicio:.0f}s)', flush=True)
        if melhor is None or nota > melhor[0]:
            melhor = (nota, n, recortada)

    if melhor is None:
        return 1
    nota, n, recortada = melhor
    painel = PASTA_TMP / f'{a.codigo}-comparacao.png'
    salvar_comparacao(original, recortada, painel)
    print('comparação:', painel)
    if nota < a.minimo:
        print(f'nenhuma tentativa chegou a {a.minimo}; nada gravado. Tentativas em {SAIDA / "bruto"}', file=sys.stderr)
        return 1
    destino = SAIDA / f'{a.codigo}.png'
    recortada.save(destino)
    print(f'escolhida: tentativa {n}, fidelidade {nota:.3f} -> {destino.relative_to(RAIZ)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
