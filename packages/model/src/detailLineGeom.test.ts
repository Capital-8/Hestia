import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, detailLineLength, detailLinePoints, detailLineSegments } from './index.ts';

const A = { x: 0, y: 0 };
const B = { x: 2, y: 0 };
const near = (p: { x: number; y: number }, x: number, y: number) => {
  expect(p.x).toBeCloseTo(x, 9);
  expect(p.y).toBeCloseTo(y, 9);
};

describe('detailLineSegments', () => {
  it('sem sag devolve 1 segmento igual ao original', () => {
    expect(detailLineSegments({ id: 'l', a: A, b: B })).toEqual([[A, B]]);
    expect(detailLineLength({ id: 'l', a: A, b: B })).toBe(2);
  });

  it('sag = metade da corda (2 m) e semicirculo de raio 1: meio do arco em (1, 1)', () => {
    const segs = detailLineSegments({ id: 'l', a: A, b: B, sag: 1 });
    expect(segs).toHaveLength(8);
    near(segs[0]![0], 0, 0);
    near(segs[7]![1], 2, 0);
    near(segs[3]![1], 1, 1); // fim do 4o segmento = meio do arco
    near(segs[1]![1], 1 - Math.SQRT1_2, Math.SQRT1_2); // 45 graus do inicio: (0.2929, 0.7071)
    for (const [p, q] of segs) { expect(Math.hypot(p.x - 1, p.y)).toBeCloseTo(1, 9); expect(Math.hypot(q.x - 1, q.y)).toBeCloseTo(1, 9); }
  });

  it('sag negativo abaula a direita: meio em (1, -1)', () => {
    near(detailLineSegments({ id: 'l', a: A, b: B, sag: -1 })[3]![1], 1, -1);
  });

  it('comprimento do semicirculo e pi; sag maior que a metade da corda e limitado', () => {
    expect(detailLineLength({ id: 'l', a: A, b: B, sag: 1 })).toBeCloseTo(3.141592653589793, 9);
    expect(detailLineLength({ id: 'l', a: A, b: B, sag: 5 })).toBeCloseTo(3.141592653589793, 9);
  });

  it('flecha 0,5 em corda de 2 m: raio 1,25, centro (1, -0,75), extremos exatos', () => {
    const l = { id: 'l', a: A, b: B, sag: 0.5 };
    const pts = detailLinePoints(l);
    expect(pts).toHaveLength(6); // ceil(1,8546 / pi * 8) = 5 segmentos
    near(pts[0]!, 0, 0);
    near(pts[5]!, 2, 0);
    for (const p of pts) expect(Math.hypot(p.x - 1, p.y + 0.75)).toBeCloseTo(1.25, 9);
    expect(detailLineLength(l)).toBeCloseTo(2.3182, 3); // 2 * 1,25 * asin(0,8)
  });

  it('maxSegLen aumenta o numero de segmentos', () => {
    const segs = detailLineSegments({ id: 'l', a: A, b: B, sag: 1 }, 0.1);
    expect(segs.length).toBe(32); // ceil(pi / 0,1)
  });
});

describe('comandos preservam sag', () => {
  it('add, update parcial e desfazer mantem o sag', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: A, b: B, sag: 0.5 } });
    expect(s.project.levels[0]!.detailLines![0]!.sag).toBe(0.5);
    s.exec({ type: 'updateDetailLine', levelId: 'lv_0', id: 'dl1', patch: { b: { x: 3, y: 0 } } });
    expect(s.project.levels[0]!.detailLines![0]!.sag).toBe(0.5);
    s.exec({ type: 'updateDetailLine', levelId: 'lv_0', id: 'dl1', patch: { sag: -0.25 } });
    expect(s.project.levels[0]!.detailLines![0]!.sag).toBe(-0.25);
    s.undo();
    expect(s.project.levels[0]!.detailLines![0]!.sag).toBe(0.5);
    expect(JSON.parse(JSON.stringify(s.project)).levels[0].detailLines[0].sag).toBe(0.5);
  });
});
