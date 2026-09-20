/**
 * Cena de estúdio do estudo 3D aprovado
 * (assests/img/aliancas-web/modelo-03LM/individuais.html): sala com as caixas de
 * luz ampliadas, ACES com exposição 1,15 e reflexo quase sem desfoque.
 * Compartilhada pela 03LM que acompanha a rolagem e pelo visualizador das
 * ferramentas de GLB.
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const ESTUDIO = {
  tons: 'aces',
  exposicao: 1.15,
  brilhoCaixas: 1.35, // escala das placas emissivas da sala
  suavidade: 0.008, // desfoque do reflexo no PMREM
};

export function criarEstudio(e) {
  const sala = new RoomEnvironment();
  for (const objeto of sala.children) {
    if (objeto.isMesh && !objeto.isInstancedMesh && objeto.material.emissiveIntensity > 1) {
      objeto.scale.multiplyScalar(e.brilhoCaixas);
    }
  }
  return sala;
}

/** Tone mapping e exposição do estúdio. */
export function aplicarTons(renderer, e = ESTUDIO) {
  renderer.toneMapping = e.tons === 'aces' ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
  renderer.toneMappingExposure = e.exposicao;
}

/** Gera o reflexo da sala e troca o da cena, descartando o anterior. */
export function aplicarReflexo(renderer, cena, e = ESTUDIO) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const sala = criarEstudio(e);
  cena.environment?.dispose();
  cena.environment = pmrem.fromScene(sala, e.suavidade).texture;
  sala.dispose();
  pmrem.dispose();
}

/** WebGL pode não existir: a página tem de continuar de pé sem o 3D. */
export function temWebGL() {
  try {
    const teste = document.createElement('canvas');
    return Boolean(teste.getContext('webgl2') || teste.getContext('webgl'));
  } catch {
    return false;
  }
}
