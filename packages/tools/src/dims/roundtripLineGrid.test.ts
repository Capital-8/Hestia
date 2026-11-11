import { describe, expect, it } from 'vitest';
import { dist } from '@hestia/geom';
import {
  createEmptyProject,
  DEFAULT_GRID_TYPE_ID,
  dimensionSettingsOf,
  floorViewId,
  makeCeiling,
  makeFloor,
  makeRoof,
  makeSlab,
  ProjectStore,
  viewAnnotationsOf,
  type Project,
} from '@hestia/model';
import { detailLineDimProvider, perimeterLineDimProvider } from './providers/line.ts';
import { gridDimProvider } from './providers/grid.ts';
import { outlineDimProvider } from './providers/outline.ts';
import { displacementDimProvider } from './providers/displacement.ts';
import type { DimContext, TempDim } from './types.ts';
import { along, ANGLES, dirOf, normalOf, ORIGIN, readOnly, roundtrip, type EditableCase, type Fixture } from './roundtripSupport.ts';

const ctxOf = (p: Project): DimContext => ({ project: p, levelId: 'lv_0', settings: dimensionSettingsOf(p), overrides: {} });

function store(): ProjectStore {
  return new ProjectStore(createEmptyProject());
}

function lineScene(angle: number): Fixture {
  const s = store();
  const u = dirOf(angle);
  const n = normalOf(u);
  const control = along(along(ORIGIN, u, 3), n, 2);
  s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl', a: ORIGIN, b: along(ORIGIN, u, 6) } });
  s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'ctrl', a: control, b: along(control, n, 6) } });
  const line = (p: Project) => viewAnnotationsOf(p, floorViewId('lv_0')).detailLines.find((x) => x.id === 'dl');
  return {
    store: s,
    dims: () => detailLineDimProvider.compute(ctxOf(s.project), { lineId: 'dl' }),
    targetId: 'dl',
    translation: false,
    ownLength: (p) => {
      const l = line(p);
      return l ? dist(l.a, l.b) : Number.NaN;
    },
    rest: (p) => JSON.stringify({ elements: p.elements, lines: viewAnnotationsOf(p, floorViewId('lv_0')).detailLines.filter((x) => x.id !== 'dl') }),
  };
}

/** Linha `dl` com uma paralela isolada a 2 m no lado +n: a cota lateral editável translada a linha inteira. */
function lateralLineScene(angle: number): Fixture {
  const s = store();
  const u = dirOf(angle);
  const n = normalOf(u);
  s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl', a: ORIGIN, b: along(ORIGIN, u, 6) } });
  s.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'ctrl', a: along(along(ORIGIN, n, 2), u, -2), b: along(along(ORIGIN, n, 2), u, 8) } });
  const line = (p: Project) => viewAnnotationsOf(p, floorViewId('lv_0')).detailLines.find((x) => x.id === 'dl');
  return {
    store: s,
    dims: () => detailLineDimProvider.compute(ctxOf(s.project), { lineId: 'dl' }),
    targetId: 'dl',
    translation: true,
    ownLength: (p) => {
      const l = line(p);
      return l ? dist(l.a, l.b) : Number.NaN;
    },
    rest: (p) => JSON.stringify({ elements: p.elements, lines: viewAnnotationsOf(p, floorViewId('lv_0')).detailLines.filter((x) => x.id !== 'dl') }),
  };
}

function gridScene(angle: number, side: 1 | -1): Fixture {
  const s = store();
  const u = dirOf(angle);
  const n = normalOf(u);
  const add = (id: string, a = ORIGIN, b = along(ORIGIN, u, 6)) =>
    s.exec({ type: 'addGrid', grid: { id, name: id, typeId: DEFAULT_GRID_TYPE_ID, points: [a, b], sag: 0, bubbleStart: false, bubbleEnd: true } });
  add('g1');
  add('g2', along(along(ORIGIN, n, 1.64 * side), u, -2), along(along(ORIGIN, n, 1.64 * side), u, 8));
  const grid = (p: Project) => p.grids?.find((g) => g.id === 'g1');
  return {
    store: s,
    dims: () => gridDimProvider.compute(ctxOf(s.project), { gridId: 'g1' }),
    targetId: 'g1',
    translation: true,
    ownLength: (p) => {
      const g = grid(p);
      if (!g || g.points.length < 2) return Number.NaN;
      return dist(g.points[0]!, g.points[g.points.length - 1]!);
    },
    rest: (p) => JSON.stringify({ elements: p.elements, grids: p.grids?.filter((g) => g.id !== 'g1') }),
  };
}

const cases: EditableCase[] = [];
for (const angle of ANGLES) {
  cases.push({
    provider: 'linha de detalhe',
    variant: 'comprimento',
    angle,
    ref: 'eixo',
    build: () => lineScene(angle),
    keys: ['line:dl:length'],
  });
  cases.push({
    provider: 'linha de detalhe',
    variant: 'distância até paralela',
    angle,
    ref: 'eixo',
    build: () => lateralLineScene(angle),
    keys: ['line:dl:right'],
  });
  for (const side of [1, -1] as const) {
    cases.push({
      provider: 'grade',
      variant: side > 0 ? 'paralela à direita' : 'paralela à esquerda',
      angle,
      ref: 'eixo',
      build: () => gridScene(angle, side),
      keys: [side > 0 ? 'grid:g1:right' : 'grid:g1:left'],
    });
  }
}

describe('ida e volta das cotas editáveis (linha e grade)', () => {
  it.each(cases)('$provider — $variant — $angle° — $ref', (c) => {
    roundtrip(c);
  });
});

interface ReadOnlyCase {
  provider: string;
  angle: number;
  build: () => TempDim[];
}

function outlineScene(kind: 'floor' | 'slab' | 'ceiling' | 'roof', angle: number): TempDim[] {
  const s = store();
  const u = dirOf(angle);
  const n = normalOf(u);
  const boundary = [ORIGIN, along(ORIGIN, u, 4), along(along(ORIGIN, u, 4), n, 3), along(ORIGIN, n, 3)];
  const base = { id: 'e', levelId: 'lv_0', boundary };
  if (kind === 'floor') s.exec({ type: 'addFloor', floor: makeFloor({ ...base, typeId: 'ft_ceram' }) });
  if (kind === 'slab') s.exec({ type: 'addSlab', slab: makeSlab({ ...base, typeId: 'ls_mac12' }) });
  if (kind === 'ceiling') s.exec({ type: 'addCeiling', ceiling: makeCeiling({ ...base, typeId: 'ct_gesso' }) });
  if (kind === 'roof') s.exec({ type: 'addRoof', roof: makeRoof({ ...base, typeId: 'rt_ceramica' }) });
  return outlineDimProvider.compute(ctxOf(s.project), { elementId: 'e' });
}

const readOnlyCases: ReadOnlyCase[] = [];
for (const angle of ANGLES) {
  const u = dirOf(angle);
  readOnlyCases.push({
    provider: 'perímetro',
    angle,
    build: () => perimeterLineDimProvider.compute(ctxOf(store().project), { segs: [{ id: 's', a: ORIGIN, b: along(ORIGIN, u, 6) }] }),
  });
  readOnlyCases.push({
    provider: 'deslocamento (mover/copiar)',
    angle,
    build: () => displacementDimProvider.compute(ctxOf(store().project), { from: ORIGIN, to: along(ORIGIN, u, 6) }),
  });
  for (const kind of ['floor', 'slab', 'ceiling', 'roof'] as const) {
    readOnlyCases.push({ provider: `contorno (${kind})`, angle, build: () => outlineScene(kind, angle) });
  }
}

/*
 * Exclusões explícitas: estas cotas não têm `edit` (por projeto, não por defeito), então não há ida e volta a medir.
 * Perímetro: a digitação do comprimento está na sessão da ferramenta (`perimeterToolInput.ts`).
 * Contorno: `outlineEdit.ts` ainda não oferece operação pura de comprimento (docs/04 §D10.4).
 * Deslocamento: mover/copiar já lê o valor digitado na própria ferramenta e a cota é só leitura.
 */
describe('cotas somente leitura excluídas da ida e volta', () => {
  it.each(readOnlyCases)('$provider — $angle°', (c) => {
    readOnly(c.build());
  });

  it('deslocamento não é um provedor de seleção (só o gesto de mover/copiar)', () => {
    expect(displacementDimProvider.selectionSubject).toBeUndefined();
  });
});
