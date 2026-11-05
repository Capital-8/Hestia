import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, view3dOf, type Project, type SheetView3DCamera } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { ModelScene } from '../model3d/scene3d.ts';

const CAM: SheetView3DCamera = { azimuth: 0.6, elevation: 0.45, distance: 12, target: { x: 2, y: 1, z: 1 }, ortho: false };

function parede(): Project {
  const p = createEmptyProject();
  const w = makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
  p.elements[w.id] = { ...w, order: 1 };
  return p;
}

describe('snapshot da cena para o render offline', () => {
  it('exporta triângulos, materiais e lotes válidos', () => {
    const p = parede();
    const comRealista: Project = { ...p, view3d: { ...view3dOf(p), style: 'realistic', shadows: true, edges: true } };
    const cena = new ModelScene();
    try {
      cena.update(comRealista, p.levels.map((l) => resolveLevel(comRealista, l.id)), { dark: false, edges: true, shadows: true });
      const snap = cena.exportarCenaDeRender({ camera: CAM, aspect: 16 / 9 });
      expect(snap.version).toBe(1);
      expect(snap.positions.length).toBeGreaterThan(0);
      expect(snap.indices.length % 3).toBe(0);
      expect(snap.materials.length).toBeGreaterThan(0);
      expect(snap.batches.length).toBeGreaterThan(0);
      expect(snap.camera.view.length).toBe(16);
      expect(snap.camera.projection.length).toBe(16);
      for (const b of snap.batches) {
        expect(b.indexStart).toBeGreaterThanOrEqual(0);
        expect(b.indexStart + b.indexCount).toBeLessThanOrEqual(snap.indices.length);
        expect(b.material).toBeGreaterThanOrEqual(0);
        expect(b.material).toBeLessThan(snap.materials.length);
      }
      for (const m of snap.materials) {
        for (const n of [...m.baseColor, m.roughness, m.metallic, m.opacity, m.transmission, m.ior]) {
          expect(Number.isFinite(n)).toBe(true);
        }
      }

      // Modo apresentação: datum/grid/chão/picking/realces fora da imagem.
      cena.modoApresentacao(true);
      const niveis = cena.scene.children.find((o) => o.userData.levels === true);
      expect(niveis?.visible).toBe(false);
      cena.modoApresentacao(false);
      expect(niveis?.visible).toBe(true);
    } finally {
      cena.dispose();
    }
  });
});
