/**
 * Visualizador de GLB com órbita, usado pelas ferramentas de scripts/glb
 * (comparar.html). A cena vem de estudio3d.js, a mesma da 03LM das dobras.
 *
 * Duas regras de consumo:
 *   · o laço de render para quando o canvas sai da tela;
 *   · a câmera em três quartos é enquadrada pela diagonal da peça, sem distância chumbada.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ESTUDIO, aplicarReflexo, aplicarTons } from './estudio3d.js';

export { ESTUDIO, temWebGL } from './estudio3d.js';

const carregador = new GLTFLoader();

// só estes pedem refazer o mapa de reflexo; os outros valem no quadro seguinte
const CHAVES_DO_REFLEXO = ['brilhoCaixas', 'suavidade'];

export class Visualizador {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{girar?: boolean, interativo?: boolean, enquadramento?: number, sensibilidade?: number, amortecimento?: number, estudio?: object}} opcoes
   */
  constructor(canvas, opcoes = {}) {
    this.canvas = canvas;
    this.palco = canvas.parentElement;
    this.girando = opcoes.girar ?? true;
    this.enquadramento = opcoes.enquadramento ?? 1.12;
    this.modeloAtual = null;
    this.pedido = 0;
    this.visivel = false;
    this.rodando = false;
    this.estudio = null;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    this.cena = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.001, 10);
    this.camera.position.set(0.029, 0.017, 0.059);
    this.definirEstudio(opcoes.estudio);

    this.controles = new OrbitControls(this.camera, this.renderer.domElement);
    this.controles.enablePan = false;
    this.controles.enableDamping = true;
    this.controles.dampingFactor = opcoes.amortecimento ?? 0.15;
    this.controles.rotateSpeed = opcoes.sensibilidade ?? 1.6;
    this.controles.zoomSpeed = 1.1;
    this.controles.autoRotate = this.girando;
    this.controles.autoRotateSpeed = 0.6;
    this.controles.enabled = opcoes.interativo ?? true;
    if (!this.controles.enabled) this.canvas.style.pointerEvents = 'none';

    this.laco = this.laco.bind(this);

    this.observadorTamanho = new ResizeObserver(() => this.redimensionar());
    this.observadorTamanho.observe(this.palco);
    this.redimensionar();

    this.observadorVisao = new IntersectionObserver(
      ([entrada]) => {
        this.visivel = entrada.isIntersecting;
        if (this.visivel) this.iniciar();
        else this.parar();
      },
      { rootMargin: '120px' },
    );
    this.observadorVisao.observe(this.palco);
  }

  /** Aplica ajustes sobre ESTUDIO (ou sobre o estúdio atual); só refaz o reflexo quando a sala muda. */
  definirEstudio(ajustes = {}) {
    const anterior = this.estudio;
    const e = { ...ESTUDIO, ...anterior, ...ajustes };
    this.estudio = e;
    aplicarTons(this.renderer, e);
    if (anterior && CHAVES_DO_REFLEXO.every((chave) => anterior[chave] === e[chave])) return;
    aplicarReflexo(this.renderer, this.cena, e);
  }

  redimensionar() {
    const { width, height } = this.palco.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  iniciar() {
    if (this.rodando) return;
    this.rodando = true;
    this.renderer.setAnimationLoop(this.laco);
  }

  parar() {
    if (!this.rodando) return;
    this.rodando = false;
    this.renderer.setAnimationLoop(null);
  }

  laco() {
    this.controles.update();
    this.renderer.render(this.cena, this.camera);
  }

  enquadrar() {
    if (!this.modeloAtual) return;
    const caixa = new THREE.Box3().setFromObject(this.modeloAtual);
    const centro = caixa.getCenter(new THREE.Vector3());
    const raio = caixa.getSize(new THREE.Vector3()).length() / 2;
    this.modeloAtual.position.sub(centro);

    // o lado mais estreito do palco manda: em tela vertical a abertura horizontal é a menor
    const meiaAbertura = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const angulo = Math.min(meiaAbertura, Math.atan(Math.tan(meiaAbertura) * this.camera.aspect));
    const distancia = (raio / Math.sin(angulo)) * this.enquadramento;

    this.camera.position.set(distancia * 0.78, distancia * 0.33, distancia * 0.53);
    this.camera.near = Math.max(0.0005, distancia / 100);
    this.camera.far = distancia * 20;
    this.camera.updateProjectionMatrix();
    this.controles.target.set(0, 0, 0);
    this.controles.minDistance = raio * 1.3;
    this.controles.maxDistance = distancia * 3;
    this.controles.update();
  }

  /** Troca o modelo; um número de pedido impede que um GLB antigo chegue depois e sobrescreva o novo. */
  async abrir(caminho) {
    const meuPedido = ++this.pedido;
    const gltf = await carregador.loadAsync(caminho);

    if (meuPedido !== this.pedido) {
      descartar(gltf.scene);
      return false;
    }

    if (this.modeloAtual) {
      this.cena.remove(this.modeloAtual);
      descartar(this.modeloAtual);
    }

    this.modeloAtual = gltf.scene;
    this.cena.add(this.modeloAtual);
    this.enquadrar();
    this.canvas.classList.add('is-pronto');
    if (this.visivel) this.iniciar();
    return true;
  }

  destruir() {
    this.parar();
    this.observadorTamanho.disconnect();
    this.observadorVisao.disconnect();
    this.controles.dispose();
    if (this.modeloAtual) descartar(this.modeloAtual);
    this.cena.environment?.dispose();
    this.renderer.dispose();
  }
}

function descartar(raiz) {
  raiz.traverse((objeto) => {
    objeto.geometry?.dispose();
    const materiais = Array.isArray(objeto.material) ? objeto.material : [objeto.material];
    for (const material of materiais) material?.dispose();
  });
}
