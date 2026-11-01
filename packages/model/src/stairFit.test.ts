import { describe, expect, it } from 'vitest';
import {
  ProjectStore,
  createEmptyProject,
  defaultStairTypeId,
  desiredRiserCount,
  makeLevel,
  makeStair,
  stairFitPatch,
  type Project,
  type Stair,
  type StairCurve,
  type StairLanding,
  type StairRun,
} from './index.ts';

const TERREO = 'lv_0';
const COBERTURA = 'lv_2';

const curve = (ax: number, ay: number, bx: number, by: number, sag = 0): StairCurve => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
  sag,
});

/** Lance reto de `count` espelhos verticais (x = x0 + i·dx), subindo em x. */
const flight = (id: string, count: number, x0 = 0, dx = 0.28): StairRun => ({
  id,
  kind: 'run',
  boundaryLeft: [curve(x0, 0, x0 + (count - 1) * dx, 0)],
  boundaryRight: [curve(x0, 1, x0 + (count - 1) * dx, 1)],
  risers: Array.from({ length: count }, (_, i) => curve(x0 + i * dx, 0, x0 + i * dx, 1)),
  path: [],
});

/** Patamar quadrado de 1 × 1 m. */
const landing = (id: string): StairLanding => ({
  id,
  kind: 'landing',
  boundary: [curve(0, 0, 1, 0), curve(1, 0, 1, 1), curve(1, 1, 0, 1), curve(0, 1, 0, 0)],
});

/** Projeto com três níveis: térreo (0 m), pavimento 2 (3 m) e cobertura (6 m). */
function projectWithLevels(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: COBERTURA, name: 'Cobertura', elevation: 6 }) });
  return s;
}

const addStair = (s: ProjectStore, components: Stair['components'], extra: Partial<Stair> = {}): void => {
  s.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: TERREO, components, ...extra }),
  });
};

const stairOf = (p: Project): Stair => p.elements.st1 as Stair;

describe('desiredRiserCount', () => {
  it('acha o menor N com H ÷ N <= maxRiser', () => {
    expect(desiredRiserCount(2.8, 0.18)).toBe(16);
    expect(desiredRiserCount(3.2, 0.18)).toBe(18);
    expect(desiredRiserCount(2.88, 0.18)).toBe(16);
    expect(desiredRiserCount(2.8, 0)).toBe(1);
    expect(desiredRiserCount(0, 0.18)).toBe(1);
    expect(desiredRiserCount(-1, 0.18)).toBe(1);
  });
});

describe('stairFitPatch', () => {
  it('não muda a reta de 16 espelhos quando H = 2,8 cabe no espelho máximo', () => {
    const s = projectWithLevels();
    addStair(s, [flight('r1', 16)], { topOffset: -0.2 });
    expect(stairFitPatch(s.project, stairOf(s.project))).toBeNull();
  });

  it('acrescenta dois espelhos interiores na reta quando H = 3,2', () => {
    const s = projectWithLevels();
    addStair(s, [flight('r1', 16)], { topOffset: 0.2 });
    const before = stairOf(s.project).components[0] as StairRun;
    const patch = stairFitPatch(s.project, stairOf(s.project));

    expect(patch).not.toBeNull();
    expect(patch!.components).toHaveLength(1);
    const after = patch!.components[0] as StairRun;
    expect(after.risers).toHaveLength(18);
    // Fecha a conta: 3,2 ÷ 18 <= 0,18.
    expect(3.2 / after.risers.length).toBeLessThanOrEqual(0.18 + 1e-9);
    // Primeiro e último espelhos intactos.
    expect(after.risers[0]).toEqual(before.risers[0]);
    expect(after.risers[17]).toEqual(before.risers[15]);

    const xs = after.risers.map((r) => r.a.x);
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    const oldXs = before.risers.map((r) => r.a.x);
    const newXs = xs.filter((x) => !oldXs.some((o) => Math.abs(o - x) < 1e-9));
    expect(newXs).toHaveLength(2);
    for (const x of newXs) {
      // Cada espelho novo cai no meio de dois espelhos antigos vizinhos.
      const lo = Math.max(...oldXs.filter((o) => o < x));
      const hi = Math.min(...oldXs.filter((o) => o > x));
      expect(x).toBeCloseTo((lo + hi) / 2, 9);
    }
  });

  it('conta os dois lances em volta do patamar, distribui e não cria espelho no patamar', () => {
    const s = projectWithLevels();
    addStair(s, [flight('r1', 8), landing('p1'), flight('r2', 8, 3)], { topOffset: 0.2 });
    const before = stairOf(s.project).components;
    const patch = stairFitPatch(s.project, stairOf(s.project));

    expect(patch).not.toBeNull();
    const after = patch!.components;
    expect(after.map((c) => c.kind)).toEqual(['run', 'landing', 'run']);
    // N = 8 + 8 = 16; alvo 18: um espelho novo em cada lance.
    expect((after[0] as StairRun).risers).toHaveLength(9);
    expect((after[2] as StairRun).risers).toHaveLength(9);
    expect(3.2 / 18).toBeLessThanOrEqual(0.18 + 1e-9);
    // O patamar (e o resto do lance) fica intacto.
    expect(after[1]).toEqual(before[1]);
    expect((after[0] as StairRun).boundaryLeft).toEqual((before[0] as StairRun).boundaryLeft);
    expect((after[2] as StairRun).boundaryRight).toEqual((before[2] as StairRun).boundaryRight);
  });

  it('emenda sem patamar conta uma vez e preserva o espelho compartilhado', () => {
    const s = projectWithLevels();
    // Dois lances consecutivos: o último espelho do primeiro é o primeiro do segundo (x = 3, mesmas pontas).
    addStair(s, [flight('r1', 4), flight('r2', 4, 0.84)], { topOffset: -1.6 });
    const before = stairOf(s.project).components as StairRun[];
    // H = 1,4, N = 4 + 4 − 1 = 7 => 0,2 > 0,18; alvo 8.
    const patch = stairFitPatch(s.project, stairOf(s.project));

    expect(patch).not.toBeNull();
    const after = patch!.components as StairRun[];
    const joints = after[0]!.risers.length + after[1]!.risers.length - 1;
    expect(joints).toBe(8);
    expect(1.4 / joints).toBeLessThanOrEqual(0.18 + 1e-9);
    expect(after[0]!.risers.at(-1)).toEqual(before[0]!.risers.at(-1));
    expect(after[1]!.risers[0]).toEqual(before[1]!.risers[0]);
  });

  it('completa a capacidade quando o alvo passa do possível, sem inventar espelhos', () => {
    const s = projectWithLevels();
    addStair(s, [flight('r1', 2)], { topOffset: 0.2 });
    const patch = stairFitPatch(s.project, stairOf(s.project));
    expect(patch).not.toBeNull();
    // Só há uma lacuna interior: entra um espelho e o patch volta mesmo assim.
    expect((patch!.components[0] as StairRun).risers).toHaveLength(3);
  });

  it('não reajusta no modo fixo', () => {
    const s = projectWithLevels();
    addStair(s, [flight('r1', 16)], { topOffset: 0.2, riserMode: 'fixed' });
    expect(stairFitPatch(s.project, stairOf(s.project))).toBeNull();
  });

  it('não reajusta sem altura', () => {
    const s = projectWithLevels();
    addStair(s, [flight('r1', 16)], { levelId: COBERTURA, height: 0 });
    expect(stairFitPatch(s.project, stairOf(s.project))).toBeNull();
  });
});
