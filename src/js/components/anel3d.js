/**
 * A 03LM que percorre a página inteira com a rolagem, como o anel do ateliê.
 *
 * O caminho é uma trilha só: pontos ancorados em lugares da página (esta seção no
 * começo, aquela no meio) e, entre dois pontos, a peça caminha de um para o
 * outro. Como a trilha é contínua do topo ao rodapé, ela nunca salta — era o que
 * acontecia quando cada seção tinha o seu próprio progresso e uma delas era mais
 * baixa que a janela, fazendo esse número pular entre 0 e 1.
 *
 * O canvas nasce uma vez, fora das seções. O JS mexe só no objeto 3D; o DOM
 * recebe apenas a classe is-pronto, e o CSS faz a entrada.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { aplicarReflexo, aplicarTons, temWebGL } from '../libs/estudio3d.js';
import { el, els, movimentoReduzido } from '../utils/dom.js';

const GLB = '/assests/img/aliancas-web/modelo-03LM/individuais/03LM.glb';

const mix = (a, b, t) => a + (b - a) * t;
const limitar = (v) => Math.min(1, Math.max(0, v));
// começa e termina devagar: é o que dá o deslizar em vez do arrastão
const macio = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Pontos da trilha, na ordem da página.
 *
 * `secao` e `em` dizem onde o ponto fica: `em` é a fração da altura daquela seção
 * (0 no topo, 1 no fim). `pose` vale para a tela deitada e `retrato` para a tela
 * em pé, onde o texto ocupa a largura toda e a peça precisa ficar mais acima e
 * menor. x e y são frações da meia-tela; escala 1 ocupa metade da altura; giroX e
 * giroY vêm em radianos e giroY só cresce, para a peça girar sempre no mesmo
 * sentido.
 */
const TRILHA = [
  {
    secao: 'home',
    em: 0,
    pose: { x: 0, y: -0.04, escala: 0.92, giroX: 0.28, giroY: 0 },
    retrato: { x: 0, y: 0.52, escala: 0.8, giroX: 0.9, giroY: 0 },
  },
  // a volta inteira acontece no lugar, do tamanho em que ela nasceu: só depois a
  // peça parte para a direita e começa a encolher
  {
    secao: 'home',
    em: 0.55,
    pose: { x: 0, y: -0.04, escala: 0.92, giroX: 0.3, giroY: Math.PI * 2 },
    retrato: { x: 0, y: 0.52, escala: 0.8, giroX: 0.9, giroY: Math.PI * 2 },
  },
  {
    secao: 'home',
    em: 1,
    pose: { x: 0.7, y: -0.34, escala: 0.62, giroX: 0.5, giroY: Math.PI * 2.6 },
    retrato: { x: 0.4, y: 0.5, escala: 0.52, giroX: 0.7, giroY: Math.PI * 2.6 },
  },
  {
    secao: 'colecao',
    em: 0.5,
    pose: { x: -0.1, y: 0.16, escala: 0.6, giroX: 0.85, giroY: Math.PI * 4.2 },
    retrato: { x: -0.2, y: 0.46, escala: 0.46, giroX: 0.85, giroY: Math.PI * 4.2 },
  },
  // a vitrine precisa da tela inteira: a peça sai antes dos cartões e volta depois
  {
    secao: 'catalogo',
    em: 0.05,
    pose: { x: -0.62, y: 0.2, escala: 0, giroX: 0.95, giroY: Math.PI * 5 },
    retrato: { x: -0.35, y: 0.45, escala: 0, giroX: 0.95, giroY: Math.PI * 5 },
  },
  {
    secao: 'catalogo',
    em: 0.95,
    pose: { x: -0.62, y: 0.2, escala: 0, giroX: 0.95, giroY: Math.PI * 5.8 },
    retrato: { x: -0.35, y: 0.45, escala: 0, giroX: 0.95, giroY: Math.PI * 5.8 },
  },
  {
    secao: 'como-comprar',
    em: 0.5,
    pose: { x: -0.56, y: 0, escala: 0.62, giroX: 1, giroY: Math.PI * 7 },
    retrato: { x: 0.34, y: 0.54, escala: 0.46, giroX: 1, giroY: Math.PI * 7 },
  },
  {
    secao: 'nossa-historia',
    em: 0.45,
    pose: { x: 0.52, y: -0.1, escala: 0.7, giroX: 1.15, giroY: Math.PI * 8.2 },
    retrato: { x: 0.38, y: 0.5, escala: 0.46, giroX: 1.15, giroY: Math.PI * 8.2 },
  },
  // fim do percurso: dentro da faixa final, à direita, onde ela fica girando
  {
    alvo: '.chamada__faixa',
    em: 0.5,
    pose: { x: 0.66, y: 0.24, escala: 0.52, giroX: 1.05, giroY: Math.PI * 9 },
    retrato: { x: 0.3, y: -0.2, escala: 0.42, giroX: 1.05, giroY: Math.PI * 9 },
  },
  {
    secao: 'nossa-historia',
    em: 1,
    // na altura do botão, à direita: é onde ela fica girando no fim da página
    pose: { x: 0.66, y: 0.68, escala: 0.52, giroX: 1.05, giroY: Math.PI * 9.4 },
    retrato: { x: 0.3, y: 0.34, escala: 0.42, giroX: 1.05, giroY: Math.PI * 9.4 },
  },
];

const CHAVES = ['x', 'y', 'escala', 'giroX', 'giroY'];

export function montarAnel3d() {
  const canvas = el('[data-anel3d]');
  if (!canvas || !temWebGL()) return { medirTrilha() {} };

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  const cena = new THREE.Scene();
  aplicarTons(renderer);
  aplicarReflexo(renderer, cena);

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 0, 8);

  const grupo = new THREE.Group(); // pose da rolagem
  const peca = new THREE.Group(); // modelo centrado e com raio 1
  grupo.add(peca);
  cena.add(grupo);

  let pronto = false;
  const atual = { x: 0, y: -0.04, escala: 0, giroX: 0.28, giroY: 0 };

  new GLTFLoader()
    .loadAsync(GLB)
    .then((gltf) => {
      const modelo = gltf.scene;
      const caixa = new THREE.Box3().setFromObject(modelo);
      const raio = caixa.getSize(new THREE.Vector3()).length() / 2;
      modelo.position.sub(caixa.getCenter(new THREE.Vector3()));
      peca.scale.setScalar(1 / raio);
      peca.add(modelo);
      pronto = true;
      canvas.classList.add('is-pronto');
    })
    .catch((erro) => console.error('a 03LM não carregou:', erro));

  /**
   * Onde cada ponto da trilha cai na página, em pixels de rolagem. Medir aqui, e
   * não a cada quadro, evita obrigar o navegador a recalcular o layout 60 vezes
   * por segundo só para saber onde as seções estão.
   */
  let pontos = [];
  const medirTrilha = () => {
    const secoes = new Map(els('[data-dobra]').map((s) => [s.dataset.dobra, s]));
    pontos = TRILHA.map((ponto) => {
      // o ponto se ancora numa seção ou num elemento qualquer (o alvo), como a faixa
      // final, onde a peça termina o percurso
      const ancora = ponto.alvo ? el(ponto.alvo) : secoes.get(ponto.secao);
      if (!ancora) return null;
      const topo = ancora.getBoundingClientRect().top + window.scrollY;
      return { ...ponto, onde: topo + ancora.offsetHeight * ponto.em };
    }).filter(Boolean);
  };

  const medirTela = () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    medirTrilha();
  };
  medirTela();
  window.addEventListener('resize', medirTela);

  /** A pose para a posição de rolagem: entre os dois pontos que a cercam. */
  const poseAgora = (retrato) => {
    const posicao = window.scrollY + window.innerHeight / 2;
    const campo = (ponto) => (retrato ? ponto.retrato : ponto.pose);
    if (pontos.length === 0) return TRILHA[0].pose;
    if (posicao <= pontos[0].onde) return campo(pontos[0]);
    for (let i = 1; i < pontos.length; i++) {
      if (posicao > pontos[i].onde) continue;
      const de = pontos[i - 1];
      const para = pontos[i];
      const t = macio(limitar((posicao - de.onde) / Math.max(1, para.onde - de.onde)));
      const pose = {};
      for (const chave of CHAVES) pose[chave] = mix(campo(de)[chave], campo(para)[chave], t);
      return pose;
    }
    return campo(pontos.at(-1));
  };

  // a preferência não congela a peça: ela só diminui o balanço e o giro de fundo
  const calmo = movimentoReduzido() ? 0.35 : 1;
  let alturaConhecida = 0;

  const quadro = (tempo) => {
    requestAnimationFrame(quadro);
    if (!pronto || document.hidden) return;

    // a página muda de altura quando o catálogo troca de cartões: a trilha remede
    if (document.documentElement.scrollHeight !== alturaConhecida) {
      alturaConhecida = document.documentElement.scrollHeight;
      medirTrilha();
    }

    const retrato = camera.aspect < 0.8;
    const pose = poseAgora(retrato);
    // a suavização vale sempre: ela diminui o movimento, não aumenta. Com movimento
    // reduzido a peça saltava de pose em pose, que é o pior dos dois mundos.
    const aproximacao = 0.08;
    for (const chave of CHAVES) atual[chave] = mix(atual[chave], pose[chave], aproximacao);

    const meiaAltura = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    const meiaLargura = meiaAltura * camera.aspect;
    // em tela vertical a peça encolhe junto com a largura, para não cobrir o texto
    const fatorLargura = Math.max(0.62, Math.min(1, camera.aspect));
    // o bailar: um balanço pequeno e lento por cima da pose, para a peça nunca
    // ficar parada na tela mesmo com a página quieta
    const balancoX = Math.sin(tempo * 0.00035) * 0.03 * calmo;
    const balancoY = Math.sin(tempo * 0.00052 + 1.2) * 0.025 * calmo;
    grupo.position.set((atual.x + balancoX) * meiaLargura, (atual.y + balancoY) * meiaAltura, 0);
    grupo.scale.setScalar(atual.escala * meiaAltura * 0.5 * fatorLargura);
    grupo.visible = atual.escala > 0.01;
    const respiro = Math.sin(tempo * 0.00041) * 0.06 * calmo;
    grupo.rotation.set(atual.giroX + respiro, atual.giroY + tempo * 0.00012 * calmo, respiro * 0.5);

    renderer.render(cena, camera);
  };
  requestAnimationFrame(quadro);

  return {
    /** A página mudou de tamanho (cartões novos, fonte carregada): remede a trilha. */
    medirTrilha,
  };
}
