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

  it('não deixa endpoint fora do eixo vencer o modo travado', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 3, y: 0.4 }, b: { x: 5, y: 0.4 } }) });
    const inf = infer({ x: 3.02, y: 0.38 }, ctx({ project: s.project, orthoLock: true }));
    // O canto fora do eixo não vira o ponto: o resultado continua sobre a reta travada (y = 0). Ele pode, no máximo,
    // servir de rastreio de extensão (x do canto), que é um alinhamento sobre a reta, não a captura do canto.
    expect(inf.point.y).toBe(0);
    expect(inf.point).not.toEqual({ x: 3, y: 0.4 });
    expect(['ortho', 'alignment']).toContain(inf.kind);
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

describe('Orto/Polar não desligam os demais rastreios (planta)', () => {
  const comParede = () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 4, y: 2 }, b: { x: 4, y: 6 } }) });
    return s.project;
  };

  it('ortogonal: extremidade da parede sobre a reta ainda é capturada', () => {
    const inf = infer({ x: 4.03, y: 2.04 }, ctx({ project: comParede(), from: { x: 0, y: 2 }, orthoLock: true }));
    expect(inf.kind).toBe('endpoint');
    expect(inf.point).toEqual({ x: 4, y: 2 });
  });

  it('ortogonal: a reta cruza o prolongamento da parede (rastreio de extensão)', () => {
    const inf = infer({ x: 3.99, y: 0.04 }, ctx({ project: comParede(), from: { x: 0, y: 0 }, orthoLock: true }));
    expect(inf.point.x).toBeCloseTo(4, 6);
    expect(inf.point.y).toBe(0);
    expect(inf.kind).toBe('alignment');
  });

  it('polar: a reta a 45 graus cruza o prolongamento da parede', () => {
    const inf = infer({ x: 3.99, y: -4.0 }, ctx({ project: comParede(), from: { x: 0, y: 0 }, polar: true, polarIncrementDeg: 45 }));
    expect(inf.point.x).toBeCloseTo(4, 6);
    expect(inf.point.y).toBeCloseTo(-4, 6);
  });

  it('ortogonal e polar ligados: vale a ortogonal e os rastreios continuam', () => {
    const inf = infer({ x: 3.99, y: 0.04 }, ctx({ project: comParede(), from: { x: 0, y: 0 }, orthoLock: true, polar: true }));
    expect(inf.point.y).toBe(0);
    expect(inf.point.x).toBeCloseTo(4, 6);
  });
});
