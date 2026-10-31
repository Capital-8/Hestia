import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Project } from '@hestia/model';
import { pickElement, pickModelPoint } from './pick3d.ts';
import { highlightOf } from './highlight3d.ts';
import { COR_DO_FANTASMA, CamadaFantasmas, OPACIDADE_DO_FANTASMA } from './ghost.ts';

/** Projeto com uma parede no térreo; a prévia acrescenta a cópia no pavimento 2. */
function projetos(): { base: Project; previa: Project } {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }) });
  const base = store.project;
  const copia = new ProjectStore(base);
  copia.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3 }) });
  return { base, previa: copia.project };
}

/** Câmera olhando para a parede do pavimento 2 (x 0..4, z 3..6). */
function camera(): THREE.PerspectiveCamera {
  const c = new THREE.PerspectiveCamera(38, 1, 0.05, 2000);
  c.position.set(2, -10, 4.5);
  c.lookAt(2, 0, 4.5);
  c.updateMatrixWorld(true);
  return c;
}

describe('camada de fantasmas do Colar alinhado', () => {
  it('desenha só o que não existe no projeto real, em violeta translúcido sem sombra', () => {
    const { base, previa } = projetos();
    const camada = new CamadaFantasmas();
    const caixa = camada.atualizar(previa, base);

    expect(camada.quantidade).toBe(1);
    const malhas = camada.grupo.children.filter((o): o is THREE.Mesh => o instanceof THREE.Mesh);
    expect(malhas.length).toBeGreaterThan(0);
    for (const m of malhas) {
      const material = m.material as THREE.MeshBasicMaterial;
      expect(material.color.getHex()).toBe(COR_DO_FANTASMA);
      expect(material.transparent).toBe(true);
      expect(material.opacity).toBe(OPACIDADE_DO_FANTASMA);
      expect(material.depthWrite).toBe(false);
      expect(m.castShadow).toBe(false);
      expect(m.receiveShadow).toBe(false);
      expect(m.userData.ghost).toBe(true);
      expect(m.userData.semPick).toBe(true);
      expect(m.userData.ranges).toBeUndefined();
    }
    // A caixa cobre a parede copiada no nível de destino (cota 3 a 6).
    expect(caixa.isEmpty()).toBe(false);
    expect(caixa.min.z).toBeCloseTo(3, 6);
    expect(caixa.max.z).toBeCloseTo(6, 6);
    expect(caixa.min.x).toBeCloseTo(0, 6);
    expect(caixa.max.x).toBeCloseTo(4, 6);
    expect(caixa.min.y).toBeLessThan(0);
    expect(caixa.max.y).toBeGreaterThan(0);
    camada.dispose();
  });

  it('não entra no picking por BVH nem no ponto do modelo (semPick)', () => {
    const { base, previa } = projetos();
    const camada = new CamadaFantasmas();
    camada.atualizar(previa, base);
    const cam = camera();

    expect(pickElement(camada.grupo, cam, { x: 0, y: 0 })).toBeNull();
    expect(pickModelPoint(camada.grupo, cam, { x: 0, y: 0 })).toBeNull();
    // O realce também não acha o fantasma: ele procura `userData.ranges`, que a camada não tem.
    const realce = highlightOf(camada.grupo, ['w2'], { color: 0xffffff, fill: 0.35, edges: 1 });
    expect(realce.children).toHaveLength(0);
    camada.dispose();
  });

  it('sem elemento novo a camada fica vazia', () => {
    const { base } = projetos();
    const camada = new CamadaFantasmas();
    const caixa = camada.atualizar(base, base);
    expect(camada.quantidade).toBe(0);
    expect(camada.grupo.children).toHaveLength(0);
    expect(caixa.isEmpty()).toBe(true);
    camada.dispose();
  });
});
