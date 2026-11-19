import { describe, expect, it } from 'vitest';
import type { MultiPolygon } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, type Project } from '@hestia/model';
import { resolveLevel } from './resolve.ts';
import { wallFaces } from './faces.ts';
import { wallTopFaces } from './wallTopFaces.ts';
import { LevelResolveCache } from './resolveLevels.ts';

const butt = { kind: 'butt', flip: false } as const;

/** Projeto do dono (4 níveis, tipo wt_alv14 de 0,184 m): W1 no térreo, W2 em `nivelW2`; W2 vai de lv_1 a lv_2 (3 a 6 m). */
function build(o: { nivelW2?: string; topoW1?: string; extra?: boolean } = {}): Project {
  const base = createEmptyProject();
  base.levels = [
    makeLevel({ id: 'lv_0', name: 'Térreo', elevation: 0 }),
    makeLevel({ id: 'lv_1', name: 'Pavimento 2', elevation: 3 }),
    makeLevel({ id: 'lv_2', name: 'Pavimento 3', elevation: 6 }),
    makeLevel({ id: 'lv_3', name: 'Pavimento 4', elevation: 9 }),
  ];
  const s = new ProjectStore(base);
  s.exec({ type: 'addWall', wall: makeWall({ id: 'W1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 1.03, y: 3.96 }, b: { x: 7.1, y: 3.96 }, topLevelId: o.topoW1 ?? 'lv_3', joinStart: butt, joinEnd: butt }) });
  const nv = o.nivelW2 ?? 'lv_1';
  s.exec({ type: 'addWall', wall: makeWall({ id: 'W2', typeId: 'wt_alv14', levelId: nv, a: { x: 6.86, y: 2.57 }, b: { x: 7.1, y: 3.96 }, topLevelId: nv === 'lv_0' ? 'lv_3' : 'lv_2', joinStart: butt, joinEnd: butt }) });
  if (o.extra) s.exec({ type: 'addWall', wall: makeWall({ id: 'W3', typeId: 'wt_alv14', levelId: 'lv_2', a: { x: 7.1, y: 3.96 }, b: { x: 7.2, y: 6 }, topLevelId: 'lv_3', joinStart: butt, joinEnd: butt }) });
  return s.project;
}

const maxY = (mp: MultiPolygon): number => Math.max(...mp.flat(2).map((pt) => pt.y));
/** Maior y da camada `k` (0 = acabamento de dentro, 4 = acabamento de fora) da parede. */
const camadaMaxY = (p: Project, lv: string, id: string, k: number): number => maxY(resolveLevel(p, lv, new Map()).walls[id]!.layers[k]!.fragment);

describe('junção entre níveis (parede de outro nível com altura em comum)', () => {
  it('referência no mesmo nível (W1 também chega a x = 7,2092): W1 domina, W2 (butt) para na face de W1 em a primeira camada termina em y = 3,96 - 0,092 = 3,868 (face de W1)', () => {
    expect(camadaMaxY(build({ nivelW2: 'lv_0' }), 'lv_0', 'W2', 0)).toBeCloseTo(3.868, 6);
    const xs = resolveLevel(build({ nivelW2: 'lv_0' }), 'lv_0', new Map()).walls['W1']!.layers.flatMap((l) => l.fragment.flat(2).map((pt) => pt.x));
    expect(Math.max(...xs)).toBeCloseTo(7.2092, 3);
  });

  it('W2 em lv_1 e W1 em lv_0 (3 a 6 m em comum): o corte de W2 é o mesmo da referência, calculado à mão', () => {
    const p = build();
    expect(camadaMaxY(p, 'lv_1', 'W2', 0)).toBeCloseTo(3.868, 6);
    expect(camadaMaxY(p, 'lv_1', 'W2', 4)).toBeCloseTo(4.05, 6);
    // W1 é a mais antiga e domina: atravessa o canto, até a face de fora de W2 (x = 7,2092, como no mesmo nível).
    const xs = resolveLevel(p, 'lv_0', new Map()).walls['W1']!.layers.flatMap((l) => l.fragment.flat(2).map((pt) => pt.x));
    expect(Math.max(...xs)).toBeCloseTo(7.2092, 3);
  });

  it('cada parede aparece uma só vez, no nível dono; clusters sem parede de fora', () => {
    const p = build();
    const r0 = resolveLevel(p, 'lv_0', new Map());
    const r1 = resolveLevel(p, 'lv_1', new Map());
    expect(Object.keys(r0.walls)).toEqual(['W1']);
    expect(Object.keys(r1.walls)).toEqual(['W2']);
    expect(r0.clusters.flatMap((c) => c.wallIds)).toEqual(['W1']);
    expect(r1.clusters.flatMap((c) => c.wallIds)).toEqual(['W2']);
    expect(wallFaces(p, 'lv_1').map((f) => f.wallId)).toEqual(['W2']);
    expect(wallTopFaces(p, 'lv_1').map((f) => f.wallId)).toEqual(['W2']);
  });

  it('topo de W1 em 3,0 (encosta na base de W2 em 3,0): não se unem; W2 fica livre (ponta em y = 3,96)', () => {
    const p = build({ topoW1: 'lv_1' });
    expect(camadaMaxY(p, 'lv_1', 'W2', 0)).toBeCloseTo(3.9757, 3);
  });

  it('parede de lv_2 (6 a 9 m) não se une a W2 (3 a 6 m): só encosta no topo', () => {
    const p = build({ extra: true });
    // W3 sai de (7,10; 3,96); W2 termina ali. Sem faixa em comum, W2 segue só unida a W1 (y = 3,868).
    expect(camadaMaxY(p, 'lv_1', 'W2', 0)).toBeCloseTo(3.868, 6);
    const r2 = resolveLevel(p, 'lv_2', new Map());
    expect(Object.keys(r2.walls)).toEqual(['W3']);
  });

  it('a planta (cutZ) fica como antes: sem parceira de outro nível', () => {
    const p = build();
    expect(camadaMaxY(p, 'lv_1', 'W2', 0)).toBeCloseTo(3.868, 6);
    const planta = resolveLevel(p, 'lv_1', new Map(), { cutZ: 4.2 });
    expect(Object.keys(planta.walls)).toEqual(['W2']);
    expect(maxY(planta.walls['W2']!.layers[0]!.cut)).toBeCloseTo(3.9757, 3);
  });

  it('cache por nível: mexer em W1 (outro nível) refaz lv_1, e mexer em parede sem relação não', () => {
    const p = build();
    const c = new LevelResolveCache();
    c.get(p, 'lv_1');
    c.get(p, 'lv_2');
    const s = new ProjectStore(p);
    s.exec({ type: 'setWallEnds', id: 'W1', b: { x: 7.1, y: 4.5 } });
    const antes = c.recalculated;
    c.get(s.project, 'lv_1');
    expect(c.recalculated).toBe(antes + 1);
    c.get(s.project, 'lv_2');
    expect(c.recalculated).toBe(antes + 1);
  });
});
