import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall } from '@hestia/model';
import { addSegs, newDraft, setSegSlope, type NewSeg } from './perimeterSession.ts';
import { commitPerimeter } from './perimeterCommit.ts';

const P = (x: number, y: number) => ({ x, y });
const ring = [P(0, 0), P(6, 0), P(6, 4), P(0, 4)];
const segs: NewSeg[] = ring.map((a, i) => ({ a, b: ring[(i + 1) % 4]! }));

function commit(attach: boolean) {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: P(0, 0), b: P(6, 0), height: 2.8, attachTopToRoof: attach }) });
  let d = addSegs(newDraft('roof', { slopePct: 30 }), segs);
  d.segs.forEach((s) => { d = setSegSlope(d, s.id, { definesSlope: true, slopePct: 30 }); });
  return commitPerimeter(store.project, d, { typeId: 'rt_ceramica', levelId: 'lv_0', overhang: 0.5 });
}

describe('oferta de anexar paredes ao criar o telhado', () => {
  it('parede sem topo anexado sob o telhado: a mensagem sugere Anexar ao telhado', () => {
    const r = commit(false);
    if (!r.ok) throw new Error(r.message);
    expect(r.message).toMatch(/Anexar ao telhado/);
  });
  it('parede já anexada: sem sugestão', () => {
    const r = commit(true);
    if (!r.ok) throw new Error(r.message);
    expect(r.message).not.toMatch(/Anexar ao telhado/);
  });
});
