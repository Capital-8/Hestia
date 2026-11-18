import { describe, expect, it } from 'vitest';
import {
  generateLShape,
  generateStraightRun,
  generateUShape,
  pieceVolume,
  resolveLevel,
  resolveStairs,
  resolveStairsOnLevel,
  stairBody,
  type StairComponentSketch,
} from '@hestia/engine';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeSlab, makeStair, type Project, type StairLanding, type StairRun } from '@hestia/model';
import { pointInMulti } from '@hestia/geom';
import { buildStairSolids } from '../model3d/stairSolids.ts';
import { buildPlanDrawList, type PlanInput } from './build.ts';
import { stairFills } from './stairs.ts';
import { defaultPaint } from './style.ts';
import { LIGHT } from './types.ts';
import type { Viewport } from '../viewport.ts';

const N = 17;
const P = 0.28;
const W = 1;

/** Volume por teorema da divergência (malha fechada e bem orientada), como em solids.test.ts. */
function meshVolume(b: { positions: number[]; indices: number[] }): number {
  let v = 0;
  const p = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
  for (let i = 0; i < b.indices.length; i += 3) {
    const [p0, p1, p2] = [p(b.indices[i]!), p(b.indices[i + 1]!), p(b.indices[i + 2]!)];
    v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
  }
  return Math.abs(v);
}

/** Lance reto de N espelhos subindo em +x (croqui do motor): limites em y = ±W/2, espelhos verticais em x = k·P. */
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

function project(): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run()] }) });
  return s.project;
}

const VIEW: Viewport = { cx: 2, cy: 0, zoom: 100, width: 800, height: 600 };

function draw(p: Project, levelId: string, opts: Partial<PlanInput> = {}) {
  const input: PlanInput = {
    project: p,
    levelId,
    resolved: resolveLevel(p, levelId, new Map()),
    below: null,
    viewport: VIEW,
    theme: LIGHT,
    dark: false,
    selection: [],
    hover: null,
    preview: [],
    inference: null,
    showGrid: false,
    ...opts,
  };
  return buildPlanDrawList(input);
}

describe('escadas do projeto na planta e no 3D (integração com o motor)', () => {
  it('o motor resolve a escada com N espelhos e N−1 degraus, sem erro de geometria', () => {
    const [st] = resolveStairsOnLevel(project(), 'lv_0');
    expect(st!.riserCount).toBe(N);
    expect(st!.risers).toHaveLength(N);
    expect(st!.steps.filter((s) => s.kind === 'tread')).toHaveLength(N - 1);
    expect(st!.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('a planta do nível da escada traz a seta SOBE, o corte e os espelhos; degraus acima de 1,20 m tracejados', () => {
    // A escada sobe até ~2,98 m, acima do topo padrão (2,30 m): com o topo subido, todos os espelhos entram na vista.
    const s = new ProjectStore(project());
    s.exec({ type: 'setLevelViewRange', levelId: 'lv_0', patch: { top: 3.5 } });
    const dl = draw(s.project, 'lv_0');
    expect(dl.labels.map((l) => l.text)).toContain('SOBE');
    const lines = dl.strokes.filter((s) => !s.closed && s.pts.length === 2 && !s.dash && s.widthPx === defaultPaint('stair', 100).cutPx);
    expect(lines.length).toBeGreaterThanOrEqual(N);
    expect(dl.strokes.some((s) => s.closed && s.dash)).toBe(true);
  });

  it('o nível de cima mostra a escada do nível de baixo esmaecida, sem seta nem rótulo', () => {
    const p = project();
    const below = resolveLevel(p, 'lv_0', new Map());
    const up = draw(p, 'lv_1', { below });
    const alphas = up.fills.map((f) => f.alpha);
    expect(alphas).toContain(0.22);
    expect(up.labels.map((l) => l.text)).not.toContain('SOBE');
    expect(draw(p, 'lv_1').labels.map((l) => l.text)).not.toContain('SOBE');
  });

  it('seleção da escada: destaque azul sobre a pegada', () => {
    const dl = draw(project(), 'lv_0', { selection: ['st1'] });
    expect(dl.fills.some((f) => f.color === LIGHT.select && f.alpha === 0.26)).toBe(true);
  });

  it('a malha 3D sai por material do tipo (concreto, no monolítico padrão), sem escada com erro', () => {
    const p = project();
    const batches = buildStairSolids(resolveStairs(p));
    expect(batches.map((b) => b.materialId)).toEqual(['mat_concreto']);
    expect(batches[0]!.indices.length).toBeGreaterThan(0);
  });

  it('volume da malha monolítica do motor = Σ volumes das peças de stairBody (decisão 0012)', () => {
    const [st] = resolveStairs(project());
    const piecesSum = stairBody(st!, { slabThickness: 0.15 }).pieces.reduce((s, piece) => s + pieceVolume(piece), 0);
    const [b] = buildStairSolids([st!]);
    expect(Math.abs(meshVolume(b!) - piecesSum)).toBeLessThan(1e-9);
  });
});

/** Componentes do croqui (engine) com id, como a escada guarda no modelo. */
function toModel(cs: StairComponentSketch[]): Array<StairRun | StairLanding> {
  return cs.map((c, i) => (c.kind === 'run' ? { id: `r_${i}`, kind: 'run', ...c.run } : { id: `p_${i}`, kind: 'landing', boundary: c.landing.boundary }));
}

/** Escada com o croqui dado: topo no pavimento 2 (3,00 m) menos 0,20 m, como nos testes de sólidos. */
function stairProject(components: Array<StairRun | StairLanding>, baseOffset = 0): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', baseOffset, topOffset: -0.2, height: 2.8, components }),
  });
  return s.project;
}

/** Números dos degraus rotulados na planta, na ordem em que saem (o SOBE e a etiqueta do tipo ficam de fora). */
function treadLabels(p: Project): number[] {
  const [st] = resolveStairsOnLevel(p, 'lv_0');
  const { labels } = stairFills(p, [st!], LIGHT, false, 'fine', VIEW);
  return labels.map((l) => l.text).filter((t) => /^\d+$/.test(t)).map(Number);
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe('numeração contínua dos degraus na planta (decisão 0011 §1 item 6)', () => {
  const P = 0.28;

  it('L com patamar, 8 + 8 espelhos: lance 1 = 1..7, o patamar é o degrau 8 (com número, como no Revit), lance 2 = 9..15 e a chegada 16', () => {
    const comps = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risersFirst: 8, risersSecond: 8, tread: P, turn: 'left' });
    const p = stairProject(toModel(comps));
    expect(resolveStairsOnLevel(p, 'lv_0')[0]!.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(treadLabels(p)).toEqual(range(1, 16));
  });

  it('U com patamar, 8 + 8 espelhos: mesma regra (1..16 contínuo, o patamar é o 8)', () => {
    const comps = generateUShape({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risersFirst: 8, risersSecond: 8, tread: P, turn: 'left' });
    const p = stairProject(toModel(comps));
    expect(resolveStairsOnLevel(p, 'lv_0')[0]!.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(treadLabels(p)).toEqual(range(1, 16));
  });

  it('L com a base do lance em 0,30 m (baseOffset): a numeração segue a cota, igual à da base no piso', () => {
    const comps = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risersFirst: 8, risersSecond: 8, tread: P, turn: 'left' });
    const p = stairProject(toModel(comps), 0.3);
    const [st] = resolveStairsOnLevel(p, 'lv_0');
    expect(st!.baseZ).toBeCloseTo(0.3, 9);
    expect(treadLabels(p)).toEqual(range(1, 16));
  });

  it('lance 1 com erro de croqui (espelho repetido): sem degraus nele, mas o patamar (8) e o 2º lance (9..) seguem pela cota, não em 1', () => {
    const comps = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risersFirst: 8, risersSecond: 8, tread: P, turn: 'left' });
    const first = comps[0]!;
    if (first.kind !== 'run') throw new Error('o 1º componente do L é um lance');
    first.run.risers[7] = first.run.risers[6]!;
    const p = stairProject(toModel(comps));
    const [st] = resolveStairsOnLevel(p, 'lv_0');
    expect(st!.issues).toContainEqual(expect.objectContaining({ severity: 'error', componentIndex: 0 }));
    expect(st!.riserCount).toBe(16);
    expect(treadLabels(p)).toEqual(range(8, 16));
  });

  it('reta de 16 espelhos pelo gerador (como no app): rótulos 1..15', () => {
    const sk = generateStraightRun({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risers: 16, tread: P });
    const p = stairProject([{ id: 'run', kind: 'run', ...sk }]);
    expect(treadLabels(p)).toEqual(range(1, 16));
  });

  /** O mesmo projeto com laje no nível de topo cobrindo a faixa à frente do último espelho (o lance sobe em +x). */
  function coveredProject(): Project {
    const s = new ProjectStore(project());
    s.exec({
      type: 'addSlab',
      slab: makeSlab({ id: 'laje', typeId: 'ls_mac15', levelId: 'lv_1', boundary: [{ x: -1, y: -1 }, { x: 6, y: -1 }, { x: 6, y: 1 }, { x: -1, y: 1 }] }),
    });
    return s.project;
  }

  it('sem laje sobre o último espelho: 17 espelhos numeram 1..17 (a chegada é o último degrau)', () => {
    expect(treadLabels(project())).toEqual(range(1, 17));
  });

  it('com laje sobre o último espelho: 17 espelhos numeram 1..16 (o piso do nível é o degrau de chegada)', () => {
    expect(treadLabels(coveredProject())).toEqual(range(1, 16));
  });

  it('com laje sobre o último espelho: a chegada não é desenhada e a seta termina no último espelho', () => {
    const p = coveredProject();
    const [st] = resolveStairsOnLevel(p, 'lv_0');
    const o = stairFills(p, [st!], LIGHT, false, 'medium', VIEW);
    // Centro da chegada: a faixa de N·P a (N+1)·P, na largura do lance (y = 0).
    const centroChegada = { x: N * P + P / 2, y: 0 };
    expect(o.fills.some((f) => pointInMulti(centroChegada, f.polygons))).toBe(false);
    expect(o.strokes.some((t) => t.closed && pointInMulti(centroChegada, [[t.pts]]))).toBe(false);
    const shaft = o.strokes.find((t) => !t.closed && t.pts.length === N)!;
    expect(Math.max(...shaft.pts.map((q) => q.x))).toBeCloseTo(N * P, 9);
  });
});
