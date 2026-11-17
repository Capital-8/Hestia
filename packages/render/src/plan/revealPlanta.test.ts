import { describe, expect, it } from 'vitest';
import { resolveLevel } from '@hestia/engine';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Opening, type OpeningType, type Wall } from '@hestia/model';
import { LIGHT } from './types.ts';
import { buildPlanGeometry } from './build.ts';

/*
 * Recuo do batente na planta: parede de 0,20 (a=(0,0), b=(6,0), face externa em y = +0,10), janela de 1,20 no meio com
 * batente fixo de 0,09. Sem recuo o batente ocupa y de -0,045 a 0,045; com 0,05 ele vai para dentro (y negativo):
 * de -0,095 a -0,005.
 */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };

/** Coordenadas y dos pontos dos traços que ficam DENTRO do vão (x) e estritamente dentro da espessura da parede. */
function ysDoVao(tipo: string, reveal?: OpeningType['reveal'], flipped = false): number[] {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  const t = s.project.openingTypes[tipo]!;
  s.exec({ type: 'upsertOpeningType', openingType: { ...t, id: 'ot_x', frameDepthMode: 'fixed', frameDepth: 0.09, ...(reveal ? { reveal } : {}) } });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_t', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, flipped }) as Wall });
  s.exec({ type: 'addOpening', opening: { id: 'o', kind: t.kind, typeId: 'ot_x', hostId: 'w', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } as Opening });
  const p = s.project;
  const ops = buildPlanGeometry({ project: p, levelId: 'lv_0', resolved: resolveLevel(p, 'lv_0'), below: null, viewport: { cx: 3, cy: 0, zoom: 200, width: 800, height: 600 }, theme: LIGHT, dark: false, selection: [], hover: null, preview: [], inference: null, showGrid: false });
  return ops.strokes.flatMap((st) => st.pts).filter((q) => q.x > 2.401 && q.x < 3.599 && Math.abs(q.y) < 0.0999).map((q) => q.y);
}
const tem = (ys: number[], v: number): boolean => ys.some((y) => Math.abs(y - v) < 1e-6);

describe('planta: recuo do batente (reveal)', () => {
  for (const tipo of ['ot_j120', 'ot_p90']) {
    it(`${tipo}: sem recuo o batente está em ±0,045; com 0,05 passa a [-0,095; -0,005]`, () => {
      const a = ysDoVao(tipo);
      expect(tem(a, 0.045) && tem(a, -0.045)).toBe(true);
      const b = ysDoVao(tipo, { depth: 0.05 });
      expect(tem(b, -0.095) && tem(b, -0.005)).toBe(true);
      expect(tem(b, 0.045)).toBe(false);
    });
  }

  it('reveal 0 desenha exatamente os mesmos pontos que sem o campo', () => {
    expect(ysDoVao('ot_j120', { depth: 0 })).toEqual(ysDoVao('ot_j120'));
  });

  it('parede com flipped: o recuo vai para y positivo', () => {
    const b = ysDoVao('ot_j120', { depth: 0.05 }, true);
    expect(tem(b, 0.095) && tem(b, 0.005)).toBe(true);
    expect(tem(b, -0.045)).toBe(false);
  });
});
