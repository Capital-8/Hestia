import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Opening } from '@hestia/model';
import { resolveLevel } from './resolve.ts';
import { openingPlaneIssues } from './openingPlaneIssues.ts';

function arco(sag: number, tilt: number, plano?: 'vertical' | 'inclinado') {
  const base = createEmptyProject();
  base.openingTypes.ot_jan = { ...base.openingTypes.ot_j120!, id: 'ot_jan', width: 1.2, height: 1.0, sill: 1.0, leaves: 0 };
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', height: 3, a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, sag, tilt }) });
  const o: Opening = { id: 'o1', kind: 'window', typeId: 'ot_jan', hostId: 'w1', offset: 3, flipHand: false, flipFacing: false, sillOverride: null, mark: '', ...(plano ? { plano } : {}) };
  s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

describe('F2.8: vão inclinado em arco (w² ≤ 0,4·R)', () => {
  it('R=3,75 (cabe): corte inclinado, sem aviso', () => {
    const p = arco(1.5, 5);
    expect(resolveLevel(p, 'lv_0').walls.w1!.tiltCuts).toHaveLength(1);
    expect(openingPlaneIssues(p)).toEqual([]);
  });
  it('R=3,25 (não cabe): usa o vertical e avisa, traduzido', () => {
    const p = arco(2, 5);
    expect(resolveLevel(p, 'lv_0').walls.w1!.tiltCuts).toBeUndefined();
    const pt = openingPlaneIssues(p, 'pt');
    expect(pt).toHaveLength(1);
    expect(pt[0]!.code).toBe('aberturaPlanoVerticalNoArco');
    expect(openingPlaneIssues(p, 'en')[0]!.message).toContain('vertical plane');
  });
  it('plano vertical declarado: nunca avisa nem corta inclinado', () => {
    const p = arco(2, 5, 'vertical');
    expect(openingPlaneIssues(p)).toEqual([]);
    expect(resolveLevel(p, 'lv_0').walls.w1!.tiltCuts).toBeUndefined();
  });
});
