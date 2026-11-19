import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { DEFAULT_MATERIALS } from '@hestia/model';
import { criarCena, type PreviewShape } from './cenaMaterial3d.ts';

/** Ponto mais baixo (em y) do objeto visível que projeta sombra: o próprio objeto, sem piso/parede. */
function minY(scene: THREE.Scene): number {
  scene.updateMatrixWorld(true);
  let min = Infinity;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.castShadow && m.visible) min = Math.min(min, new THREE.Box3().setFromObject(m).min.y);
  });
  return min;
}

describe('cena de prévia de material: o objeto encosta no piso e não o atravessa', () => {
  const formas: PreviewShape[] = ['sphere', 'cube', 'plane'];
  const giros: Array<[number, number]> = [[0, 0], [-0.5, 0.1], [1.2, 0.9], [3.1, -1.4], [-2.2, 1.5], [0.7, -0.3]];
  for (const forma of formas) {
    it(`${forma}: nenhum ponto abaixo do piso, e o mais baixo toca o piso`, () => {
      const cena = criarCena(new THREE.Texture(), forma, DEFAULT_MATERIALS[0]!, false);
      for (const [yaw, pitch] of giros) {
        cena.girar(yaw, pitch);
        const y = minY(cena.scene);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeLessThan(0.01);
      }
      cena.dispose();
    });
  }

  it('trocar de forma reassenta o objeto no piso', () => {
    const cena = criarCena(new THREE.Texture(), 'cube', DEFAULT_MATERIALS[0]!, false);
    cena.girar(0.9, 0.8);
    cena.definirForma('plane');
    expect(minY(cena.scene)).toBeGreaterThanOrEqual(-1e-6);
    cena.definirForma('sphere');
    expect(minY(cena.scene)).toBeGreaterThanOrEqual(-1e-6);
    cena.dispose();
  });

  it('o giro vertical é no eixo X da tela, mesmo depois de girar na horizontal', () => {
    const cena = criarCena(new THREE.Texture(), 'cube', DEFAULT_MATERIALS[0]!, false);
    // Topo do cubo (+y) depois de inclinar: deve ir para +z (em direção à câmera) com pitch > 0, em QUALQUER yaw.
    const alturaCentro = (): THREE.Vector3 => {
      let v = new THREE.Vector3();
      cena.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.castShadow && m.visible) v = new THREE.Vector3(0, 1, 0).transformDirection(m.matrixWorld);
      });
      return v;
    };
    for (const yaw of [0, 1.5, 3.1, -2.0]) {
      cena.girar(yaw, 0.5);
      cena.scene.updateMatrixWorld(true);
      expect(alturaCentro().z).toBeGreaterThan(0.3);
    }
    cena.dispose();
  });
});
