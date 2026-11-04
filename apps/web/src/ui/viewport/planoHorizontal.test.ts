import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { pontoNoPlanoHorizontal } from './planoHorizontal.ts';

/** Câmera ortográfica olhando para baixo (-Z), com 2 m × 2 m de enquadramento e o centro na origem. */
function ortograficaDeCima(): THREE.OrthographicCamera {
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

/** Câmera perspectiva de 90° em (0, 0, 10), olhando para a origem. */
function perspectivaDeCima(): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(90, 1, 0.1, 100);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe('pontoNoPlanoHorizontal', () => {
  it('na ortográfica de cima, o NDC vira diretamente o ponto do plano', () => {
    const camera = ortograficaDeCima();
    expect(pontoNoPlanoHorizontal(camera, { x: 0, y: 0 }, 2)).toEqual({ x: 0, y: 0 });
    expect(pontoNoPlanoHorizontal(camera, { x: 0.5, y: 0.5 }, 2)).toEqual({ x: 0.5, y: 0.5 });
    expect(pontoNoPlanoHorizontal(camera, { x: -0.5, y: 0.5 }, -1)).toEqual({ x: -0.5, y: 0.5 });
  });

  it('na perspectiva de 90°, o plano mais perto da câmera reduz o afastamento na mesma proporção', () => {
    const camera = perspectivaDeCima();
    // A 10 m da câmera (z = 0), o meio-enquadramento é 10 m. Em z = 2 (8 m da câmera), NDC 0,5 vale 4 m.
    expect(pontoNoPlanoHorizontal(camera, { x: 0, y: 0 }, 2)).toEqual({ x: 0, y: 0 });
    const ponto = pontoNoPlanoHorizontal(camera, { x: 0.5, y: 0 }, 2);
    expect(ponto?.x).toBeCloseTo(4, 10);
    expect(ponto?.y).toBeCloseTo(0, 10);
  });

  it('raio paralelo ao plano devolve null', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.up.set(0, 0, 1);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 10, 5);
    camera.updateMatrixWorld();
    expect(pontoNoPlanoHorizontal(camera, { x: 0, y: 0 }, 2)).toBeNull();
  });

  it('plano atrás da câmera devolve null', () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 20);
    camera.updateMatrixWorld();
    expect(pontoNoPlanoHorizontal(camera, { x: 0, y: 0 }, 2)).toBeNull();
  });
});
