import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { DEFAULT_SNAP } from './types.ts';
import { infer } from './infer.ts';

const ctx = (over: Partial<Parameters<typeof infer>[1]> = {}) => ({
  project: createEmptyProject(),
  levelId: 'lv_0',
  mpp: 0.01,
  gridStep: 0.1,
  from: { x: 0, y: 0 },
  ...over,
});

describe('modo ortogonal travado (F8)', () => {
  it('projeta no eixo horizontal ou vertical mais próximo e devolve guia ortogonal', () => {
    const h = infer({ x: 3.03, y: 0.4 }, ctx({ orthoLock: true }));
    expect(h.point).toEqual({ x: 3.03, y: 0 });
    expect(h.kind).toBe('ortho');
    expect(h.guides[0]).toMatchObject({ kind: 'ortho', to: { x: 3.03, y: 0 } });

    const v = infer({ x: 0.4, y: 3.03 }, ctx({ orthoLock: true }));
    expect(v.point).toEqual({ x: 0, y: 3.03 });
  });

  it('não deixa endpoint fora do eixo vencer o modo travado, mas a guia dele cruza o eixo', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: 0.4 }, b: { x: 5, y: 0.4 } }) });
    const inf = infer({ x: 3.02, y: 0.38 }, ctx({ project: s.project, orthoLock: true }));
    expect(inf.point).toEqual({ x: 3, y: 0 });
    expect(inf.kind).toBe('alignment');
    // A guia de alinhamento da ponta (x = 3) continua visível junto com a linha ortogonal.
    expect(inf.guides.some((g) => g.kind === 'alignment' && g.from.x === 3 && g.from.y === 0.4)).toBe(true);
    expect(inf.guides.some((g) => g.kind === 'ortho')).toBe(true);
    // Como no Revit (Shift trava e Tab escapa), o Tab alcança a captura fora do eixo.
    const tabbed = infer({ x: 3.02, y: 0.38 }, ctx({ project: s.project, orthoLock: true, cycle: 1 }));
    expect(tabbed.kind).toBe('endpoint');
    expect(tabbed.point).toEqual({ x: 3, y: 0.4 });
  });

  it('captura sobre o eixo vence o ponto travado e mantém a guia ortogonal', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: 0 }, b: { x: 5, y: 0 } }) });
    const inf = infer({ x: 3.02, y: 0.03 }, ctx({ project: s.project, orthoLock: true }));
    expect(inf.kind).toBe('endpoint');
    expect(inf.point).toEqual({ x: 3, y: 0 });
    expect(inf.guides.some((g) => g.kind === 'ortho')).toBe(true);
  });

  it('continua ortogonal mesmo com as capturas desligadas', () => {
    const inf = infer({ x: 2.04, y: 0.3 }, ctx({ orthoLock: true, snap: { ...DEFAULT_SNAP, enabled: false } }));
    expect(inf.kind).toBe('ortho');
    expect(inf.point).toEqual({ x: 2.04, y: 0 });
  });

  it('sem o modo, ponto livre não vira ortogonal', () => {
    const inf = infer({ x: 2.04, y: 1.3 }, ctx());
    expect(inf.kind).not.toBe('ortho');
  });
});

describe('rastreamento polar (F10)', () => {
  it('projeta no m�ltiplo do incremento e devolve guia polar', () => {
    const inf = infer({ x: 3, y: 1.1 }, ctx({ polar: true, polarIncrementDeg: 30 }));
    const angle = Math.atan2(inf.point.y, inf.point.x) * 180 / Math.PI;
    expect(angle).toBeCloseTo(30, 6);
    expect(inf.kind).toBe('polar');
    expect(inf.guides[0]).toMatchObject({ kind: 'polar' });
  });

  it('aceita incremento personalizado (22,5�)', () => {
    const inf = infer({ x: 3, y: 1.2 }, ctx({ polar: true, polarIncrementDeg: 22.5 }));
    const angle = Math.atan2(inf.point.y, inf.point.x) * 180 / Math.PI;
    expect(angle).toBeCloseTo(22.5, 6);
  });

  it('ortogonal tem prioridade quando os dois est�o ligados', () => {
    const inf = infer({ x: 3, y: 1.1 }, ctx({ orthoLock: true, polar: true, polarIncrementDeg: 30 }));
    expect(inf.kind).toBe('ortho');
    expect(inf.point).toEqual({ x: 3, y: 0 });
  });
});
