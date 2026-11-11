import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { DEFAULT_AREA_GRAPHICS, DEFAULT_TAG_FIELDS, ProjectStore, createEmptyProject, defaultStairTypeId, makeFloor, makeLevel, makeRoom, makeRoof, makeStair, makeWall, type AreaPlan, type Project, type StairRun, withFloorPatchOfTest, planViewRangeOf } from '@hestia/model';
import { resolveLevel } from '@hestia/engine';
import { buildPlanGeometry, type PlanInput } from './build.ts';
import { planFrameUpdateOf, type PlanViewState } from './planFrame.ts';
import { LIGHT } from './types.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

const plan = (over: Partial<AreaPlan> = {}): AreaPlan => ({
  id: 'ap1',
  name: 'Planta de área',
  levelId: 'lv_0',
  scale: 50,
  graphics: { ...DEFAULT_AREA_GRAPHICS, tagDefault: { ...DEFAULT_AREA_GRAPHICS.tagDefault, fields: [...DEFAULT_TAG_FIELDS] } },
  tags: [],
  ...over,
});

const entrada = (p: Project, areaPlan?: AreaPlan): PlanInput => ({
  project: p,
  levelId: 'lv_0',
  resolved: resolveLevel(p, 'lv_0'),
  below: null,
  areaPlan,
  viewport: { cx: 2, cy: 2.5, zoom: 100, width: 600, height: 400 },
  theme: LIGHT,
  dark: false,
  selection: [],
  hover: null,
  preview: [],
  inference: null,
  showGrid: false,
});

function base(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  return s;
}

const run = (): StairRun => {
  const ln = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });
  return {
    id: 'r1',
    kind: 'run',
    boundaryLeft: [ln(0, 0.5, 5.04, 0.5)],
    boundaryRight: [ln(0, -0.5, 5.04, -0.5)],
    risers: Array.from({ length: 17 }, (_, i) => ln((i + 1) * 0.28, -1, (i + 1) * 0.28, 1)),
    path: [],
    generatedBy: 'straight',
  };
};

describe('planta de área · geometria do motor único (A2)', () => {
  it('desenha escada do nível', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run()] }) });
    const ops = buildPlanGeometry(entrada(s.project, plan()));
    expect(ops.fills.length + ops.strokes.length).toBeGreaterThan(0);
  });

  it('mostra aberturas conforme o intervalo de vista e a categoria', () => {
    const s = base();
    s.exec({ type: 'addOpening', opening: { id: 'd1', kind: 'door', typeId: 'ot_p90', hostId: 'w0', offset: 2, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
    const a = plan({ graphics: { ...DEFAULT_AREA_GRAPHICS, showOpenings: true } });
    expect(buildPlanGeometry(entrada(s.project, a)).strokes.filter((x) => x.role).length).toBeGreaterThan(0);
    s.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { door: { visible: false } } } });
    expect(buildPlanGeometry(entrada(s.project, a)).strokes.filter((x) => x.role)).toHaveLength(0);
  });

  it('mostra contorno de parede fora do corte', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    const p = withFloorPatchOfTest(s.project, 'lv_0', { viewRange: { ...planViewRangeOf(s.project, 'pv_lv_0'), cut: -1 } });
    expect(buildPlanGeometry(entrada(p, plan())).strokes.length).toBeGreaterThan(0);
  });

  it('aplica a sobrescrita de cor da parede', () => {
    const s = base();
    const antes = buildPlanGeometry(entrada(s.project, plan()));
    const t = new ProjectStore(s.project);
    t.exec({ type: 'setLevelGraphics', levelId: 'lv_0', patch: { overrides: { wall: { color: '#ff0000' } } } });
    const depois = buildPlanGeometry(entrada(t.project, plan()));
    expect(JSON.stringify(depois.fills)).not.toBe(JSON.stringify(antes.fills));
  });

  it('telhado entra só como projeção e pode ser desligado', () => {
    const s = base();
    s.exec({ type: 'addRoof', roof: makeRoof({ id: 'rf1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: ring([[-0.3, -0.3], [4.3, -0.3], [4.3, 5.3], [-0.3, 5.3]]), heightOffset: 2.8, shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 } }) });
    const com = buildPlanGeometry(entrada(s.project, plan()));
    const sem = buildPlanGeometry(entrada(s.project, plan({ graphics: { ...DEFAULT_AREA_GRAPHICS, showRoofs: false } })));
    expect(com.strokes.length).toBeGreaterThan(sem.strokes.length);
    expect(com.fills.length).toBeGreaterThan(sem.fills.length);
  });

  it('showStairs desliga escada/rampa', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', components: [run()] }) });
    const com = buildPlanGeometry(entrada(s.project, plan()));
    const sem = buildPlanGeometry(entrada(s.project, plan({ graphics: { ...DEFAULT_AREA_GRAPHICS, showStairs: false } })));
    expect(com.fills.length + com.strokes.length).toBeGreaterThan(sem.fills.length + sem.strokes.length);
  });

  it('subpavimento da área usa showBelowLevel, não a opção global', () => {
    const s = new ProjectStore(createEmptyProject());
    s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }) });
    s.exec({ type: 'addFloor', floor: makeFloor({ id: 'f0', typeId: 'ft_ceram', levelId: 'lv_0', boundary: ring([[0, 0], [4, 0], [4, 5], [0, 5]]) }) });
    s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
    const p = s.project;
    const estado = (showBelowLevel: boolean): PlanViewState => ({
      project: p, version: 1, levelId: 'lv_1',
      v: { cx: 2, cy: 2.5, zoom: 100, width: 600, height: 400 },
      theme: LIGHT, dark: false, gpu: false, showGrid: false,
      showUnderlay: false, showRoofProjection: true, thinLines: false,
      selection: [], hover: null, preview: [], inference: null,
      resolve: (id) => resolveLevel(p, id),
      areaPlan: plan({ levelId: 'lv_1', graphics: { ...DEFAULT_AREA_GRAPHICS, showBelowLevel } }),
    });
    const com = planFrameUpdateOf(estado(true)).geometry();
    const sem = planFrameUpdateOf(estado(false)).geometry();
    expect(com.fills.length + com.strokes.length).toBeGreaterThan(sem.fills.length + sem.strokes.length);
  });
});
