import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Opening } from '@hestia/model';
import { LIGHT } from './types.ts';
import { buildPlanGeometry } from './build.ts';

/** C3: o símbolo da abertura na planta acompanha o vão na cota do corte (eixo da parede inclinada: z·tanθ). */
function simbolo(tilt: number, typeId: string, kind: 'window' | 'door'): { y: number; x: number } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, ...(tilt ? { tilt } : {}) }) });
  s.exec({ type: 'addOpening', opening: { id: 'o', kind, typeId, hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const ops = buildPlanGeometry({ project: p, levelId: 'lv_0', resolved: resolveLevel(p, 'lv_0'), below: null, viewport: { cx: 3, cy: 0, zoom: 200, width: 800, height: 600 }, theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false });
  // centro do bloco de traços da abertura: o que está no meio da parede (x entre 2 e 4) e é das aberturas
  const pts = ops.strokes.flatMap((st) => st.pts).filter((q) => q.x > 2.2 && q.x < 3.8);
  const ys = pts.map((q) => q.y);
  return { y: (Math.min(...ys) + Math.max(...ys)) / 2, x: 3 };
}

describe('planta: símbolo da abertura em parede inclinada (C3)', () => {
  for (const [typeId, kind] of [['ot_j120', 'window'], ['ot_p80', 'door']] as const) {
    it(`${kind}: com tilt 20 o símbolo sobe 1,2·tan20° em y em relação à parede vertical`, () => {
      const v = simbolo(0, typeId, kind);
      const t = simbolo(20, typeId, kind);
      expect(t.y - v.y).toBeGreaterThan(1.2 * Math.tan((20 * Math.PI) / 180) * 0.5);
    });
  }
});
