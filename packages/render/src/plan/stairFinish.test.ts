import { describe, expect, it } from 'vitest';
import { resolveLevel, resolveStairs, stairFinishQuantities } from '@hestia/engine';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, makeStair, type Project, type StairRun, type StairType } from '@hestia/model';
import { buildStairSolids } from '../model3d/stairSolids.ts';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

/** Acabamentos da escada no 3D e na planta: material próprio, sólidos fechados e sem acabamento idêntico ao de antes. */
const N = 17;
const P = 0.28;
const W = 1;

function meshVolume(b: { positions: number[]; indices: number[] }): number {
  let v = 0;
  const p = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
  for (let i = 0; i < b.indices.length; i += 3) {
    const [p0, p1, p2] = [p(b.indices[i]!), p(b.indices[i + 1]!), p(b.indices[i + 2]!)];
    v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
  }
  return Math.abs(v);
}

function run(): StairRun {
  const ln = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
  const x1 = (N + 1) * P;
  return {
    id: 'r1',
    kind: 'run',
    boundaryLeft: [ln(0, W / 2, x1, W / 2)],
    boundaryRight: [ln(0, -W / 2, x1, -W / 2)],
    risers: Array.from({ length: N }, (_, i) => ln((i + 1) * P, -1, (i + 1) * P, 1)),
    path: [],
    generatedBy: 'straight',
  };
}

function project(extra?: Partial<StairType>): Project {
  const s = new ProjectStore(createEmptyProject());
  let typeId = 'stt_monolitica';
  if (extra) {
    typeId = 'stt_teste';
    s.exec({ type: 'upsertStairType', stairType: { ...DEFAULT_STAIR_TYPES[0]!, id: typeId, ...extra } as StairType });
  }
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId, levelId: 'lv_0', components: [run()] }) });
  return s.project;
}

const ON: Partial<StairType> = {
  treadFinishEnabled: true,
  treadFinishMaterialId: 'mat_ceramica',
  treadFinishThickness: 0.015,
  riserFinishEnabled: true,
  riserFinishMaterialId: 'mat_madeira',
  riserFinishThickness: 0.01,
  bocelEnabled: true,
  bocelProjection: 0.02,
};

const VIEW: Viewport = { cx: 2, cy: 0, zoom: 100, width: 800, height: 600 };
function draw(p: Project) {
  const input: PlanInput = {
    project: p,
    levelId: 'lv_0',
    resolved: resolveLevel(p, 'lv_0', new Map()),
    below: null,
    viewport: VIEW,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
  };
  return buildPlanDrawList(input);
}

describe('acabamentos da escada no 3D', () => {
  it('sem acabamento: a malha é a mesma com os campos ausentes ou desligados (um lote de concreto)', () => {
    const a = buildStairSolids(resolveStairs(project()));
    const b = buildStairSolids(resolveStairs(project({ treadFinishEnabled: false, riserFinishEnabled: false })));
    expect(a.map((x) => x.materialId)).toEqual(['mat_concreto']);
    expect(b).toEqual(a);
  });

  it('com acabamento: piso e espelho em lotes de material próprio, com o volume dos sólidos do motor', () => {
    const [st] = resolveStairs(project(ON));
    const batches = buildStairSolids([st!]);
    expect(batches.map((x) => x.materialId).sort()).toEqual(['mat_ceramica', 'mat_concreto', 'mat_madeira']);
    const q = stairFinishQuantities(st!);
    const vol = (m: string): number => meshVolume(batches.find((x) => x.materialId === m)!);
    expect(vol('mat_ceramica')).toBeCloseTo(q.volumeByMaterial['mat_ceramica']!, 6);
    expect(vol('mat_madeira')).toBeCloseTo(q.volumeByMaterial['mat_madeira']!, 6);
  });
});

describe('acabamentos da escada na planta', () => {
  it('o piso acabado pinta com o material próprio por cima da estrutura, sem mudar a planta dos degraus', () => {
    const off = draw(project());
    const on = draw(project({ ...ON, riserFinishEnabled: false }));
    expect(on.fills.length).toBeGreaterThan(off.fills.length);
    expect(on.strokes.length).toBe(off.strokes.length);
    const corCeramica = on.fills.map((f) => f.color).filter((c, i, l) => l.indexOf(c) === i);
    expect(corCeramica.length).toBeGreaterThan(new Set(off.fills.map((f) => f.color)).size);
  });
});
