import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { levelFrames } from './resolveFrames.ts';
import { joinStatus } from './joins.ts';
import { paresQueSeCruzam } from './wallTiltCruzamento.ts';
import { resolveLevel } from './resolve.ts';

/** X1: paredes que se cruzam sem junção (ao menos uma inclinada) não se cortam no pintor. Valores à mão, 1e-6. */
const camada: Layer = { function: 'structure', materialId: 'mat_concreto', thickness: 0.2, wraps: false };
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number }
function build(walls: W[]): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  return s.project;
}
const pares = (p: Project): string[] => {
  const fr = levelFrames(p, 'lv_0');
  return [...paresQueSeCruzam(fr, (id, w) => joinStatus(fr, id, w))].sort();
};
const area = (p: Project, id: string): number => {
  const l = resolveLevel(p, 'lv_0').walls[id]!.layers[0]!;
  return l.bands.reduce((s, b) => s + b.poly.reduce((t, pl) => t + pl.reduce((u, r, i) => u + (i === 0 ? 1 : -1) * Math.abs(r.reduce((a, q, k) => a + (q.x * r[(k + 1) % r.length]!.y - r[(k + 1) % r.length]!.x * q.y), 0) / 2), 0), 0) * (b.z1 - b.z0), 0);
};

describe('X1 · cruzamento sem junção', () => {
  const H: W = { id: 'H', a: { x: 0, y: -3 }, b: { x: 0, y: 3 } };
  const R: W = { id: 'R', a: { x: -3, y: 0 }, b: { x: 3, y: 0 } };

  it('X de duas retas: só com ao menos uma inclinada', () => {
    expect(pares(build([H, R]))).toEqual([]);
    expect(pares(build([{ ...H, tilt: 15 }, R]))).toEqual(['H|R']);
    expect(pares(build([H, { ...R, tilt: -10 }]))).toEqual(['H|R']);
  });
  it('X de reta com arco (cruzam no meio do eixo dos dois)', () => {
    expect(pares(build([{ ...H, sag: 1, tilt: 15 }, { id: 'R', a: { x: -5, y: 0 }, b: { x: 3, y: 0 }, tilt: 15 }]))).toEqual(['H|R']);
  });
  it('T (ponta no eixo, ponta passando pouco do eixo) e paredes afastadas não são X', () => {
    expect(pares(build([{ ...H, tilt: 15 }, { id: 'R', a: { x: -3, y: 0 }, b: { x: 0, y: 0 }, tilt: 15 }]))).toEqual([]);
    expect(pares(build([{ ...H, tilt: 15 }, { id: 'R', a: { x: -3, y: 0 }, b: { x: 0.05, y: 0 }, tilt: 15 }]))).toEqual([]);
    expect(pares(build([{ ...H, tilt: 15 }, { id: 'R', a: { x: 2, y: -3 }, b: { x: 2, y: 3 } }]))).toEqual([]);
  });
  it('cada parede do X inclinado fica inteira: volume de cada uma = o de sozinha (L·t·H); o X vertical segue cedendo a área do cruzamento', () => {
    // vertical: uma das duas perde o quadrado 0,2×0,2 do cruzamento (0,04 × 3 = 0,12 m³)
    const v = build([H, R]);
    expect(area(v, 'H') + area(v, 'R')).toBeCloseTo(6 * 0.2 * 3 * 2 - 0.12, 6);
    // inclinado a 0° e 15°: cada parede mantém o volume da camada vertical (a área do fragmento no plano da base é L·t)
    const t = build([{ ...H, tilt: 15 }, R]);
    expect(area(t, 'H')).toBeCloseTo(3.6, 6);
    expect(area(t, 'R')).toBeCloseTo(3.6, 6);
  });
});
