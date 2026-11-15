import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { wallTiltJoinIssues } from './wallTiltJoinLevel.ts';

const mk = (tA: number, tB: number) => {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_conc15', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, ...(tA ? { tilt: tA } : {}) }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'B', typeId: 'wt_conc15', levelId: 'lv_0', a: { x: 4, y: 0 }, b: { x: 4, y: 4 }, ...(tB ? { tilt: tB } : {}) }) });
  return s.project;
};
describe('repro', () => {
  for (const [a, b] of [[15, 30], [-15, -30], [15, -30], [20, 0], [-20, 0], [0, 20], [0, -20]] as const)
    it(`L ${a}/${b}`, () => { console.log(a, b, wallTiltJoinIssues(mk(a, b), 'pt').map((i) => i.code)); expect(1).toBe(1); });
});
import { levelFrames } from './resolveFrames.ts';
import { levelSet, type Relation } from './wallTiltJoin.ts';
import { tiltRelations } from './wallTiltJoinLevel.ts';
describe('dbg', () => {
  it('x', () => {
    const p = mk(15, 30);
    const fr = levelFrames(p, 'lv_0');
    const rels = tiltRelations(fr);
    console.log(JSON.stringify(rels), fr.map((f) => [f.wall.id, f.length, f.thickness]));
    const m = new Map(fr.map((f) => [f.wall.id, { frame: f, tiltDeg: f.wall.tilt ?? 0 }]));
    for (const z of [0, 1.4, 2.8]) console.log(z, JSON.stringify(levelSet(m, rels as Relation[], z), (k, v) => (k === 'frames' || k === 'ends' ? undefined : v)).slice(0, 200));
  });
});
import { layerSpans } from '@hestia/model';
import { layerQuad } from './layerGeom.ts';
import { sAtDepth } from './frame.ts';
describe('dbg2', () => {
  it('y', () => {
    const p = mk(15, 30);
    const fr = levelFrames(p, 'lv_0');
    const rels = tiltRelations(fr) as Relation[];
    const m = new Map(fr.map((f) => [f.wall.id, { frame: f, tiltDeg: f.wall.tilt ?? 0 }]));
    const m0 = new Map(fr.map((f) => [f.wall.id, { frame: f, tiltDeg: 0 }]));
    const sets = [levelSet(m0, rels, 0), levelSet(m, rels, 0), levelSet(m, rels, 2.8)] as any[];
    for (const id of ['A', 'B']) {
      const row: any[] = [];
      for (const sp of layerSpans(sets[0].frames.get(id).type)) row.push(sets.map((ls) => layerQuad(ls.frames.get(id), ls.ends.get(id), sAtDepth(ls.frames.get(id), sp.from), sAtDepth(ls.frames.get(id), sp.to)).length).join('/'));
      console.log('CNT', id, row.join(' '));
    }
  });
});
