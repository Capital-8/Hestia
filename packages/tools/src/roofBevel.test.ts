import { describe, expect, it } from 'vitest';
import { intersectSegments, pointInRing, ringArea, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, type Roof } from '@hestia/model';
import { resolveRoofs } from '@hestia/engine';
import { addSegs, newDraft, setSegSlope, type NewSeg } from './perimeterSession.ts';
import { commitPerimeter, draftFromElement } from './perimeterCommit.ts';
import { eaveOutlinePerEdge, eaveProblem, MITER_LIMIT } from './roofGeom.ts';
import { bevelSharpCorners, roofEaveArcsProblem } from './perimeterRoofArcs.ts';
import { roofProblem } from './roofCheck.ts';

/**
 * Canto agudo: em vez de recusar, a esquadria do beiral longa demais vira chanfro (lado de comprimento zero na pegada,
 * lado novo no beiral, vetores por aresta com o mesmo comprimento).
 */

const P = (x: number, y: number): Vec2 => ({ x, y });

function polyline(pts: Vec2[]): NewSeg[] {
  return pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length]! }));
}

function create(segs: NewSeg[], overhang = 0.5, slope = 30) {
  const store = new ProjectStore(createEmptyProject());
  let d = addSegs(newDraft('roof', { slopePct: slope }), segs);
  d.segs.forEach((s) => {
    d = setSegSlope(d, s.id, { definesSlope: true, slopePct: slope });
  });
  const r = commitPerimeter(store.project, d, { typeId: 'rt_ceramica', levelId: 'lv_0', overhang });
  if (!r.ok) return { ok: false as const, message: r.message };
  store.exec(r.commands[0]!);
  const roof = store.project.elements[r.id] as Roof;
  const res = resolveRoofs(store.project, 'lv_0')[0]!;
  return { ok: true as const, id: r.id, roof, res, store };
}

/** Anel que não se corta sozinho. */
function simple(ring: Vec2[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (intersectSegments(ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!)) return false;
    }
  }
  return true;
}

function expectCoherent(roof: Roof): void {
  const n = roof.boundary.length;
  expect(roof.footprint).toBeDefined();
  expect(roof.footprint!.length).toBe(n);
  expect(roof.edgeSlopes.length).toBe(n);
  expect(roof.edgeOverhangs.length).toBe(n);
  if (roof.edgeSag) expect(roof.edgeSag.length).toBe(n);
  expect(simple(roof.boundary)).toBe(true);
  const tol = 1e-6;
  for (const q of roof.footprint!) expect(pointInRing(q, roof.boundary) || q).toBeTruthy();
  expect(Math.abs(ringArea(roof.boundary))).toBeGreaterThan(Math.abs(ringArea(roof.footprint!)) - tol);
}

describe('chanfro de canto agudo', () => {
  it('ponta de 8,5° com balanço 0,5: cria, chanfra a ponta e mantém os vetores por aresta coerentes', () => {
    // Triângulo longo e fino: a ponta em (0; 0) tem ~8,5°, esquadria 1/sin(4,3°) = 13 vezes o balanço (acima de 10).
    const out = create(polyline([P(0, 0), P(8, -0.6), P(8, 0.6)]));
    if (!out.ok) throw new Error(out.message);
    expect(out.roof.boundary.length).toBe(4);
    expectCoherent(out.roof);
    expect(out.res.planes.length).toBeGreaterThan(0);
    expect(roofProblem(out.store.project, [out.roof])).toBeNull();
    // O beiral avança para trás da ponta (eixo x negativo) no máximo MITER_LIMIT x balanço: o chanfro corta a esquadria
    // (sem chanfro ela iria a 0,5/sin(4,3°) = 6,7 m). Só olha o lado da ponta: o lado largo do triângulo fica a 8 m.
    const tip = P(0, 0);
    const recuo = Math.max(...out.roof.boundary.map((q) => tip.x - q.x));
    expect(recuo).toBeGreaterThan(MITER_LIMIT * 0.5 * 0.9);
    expect(recuo).toBeLessThan(MITER_LIMIT * 0.5 * 1.05);
  });

  it('canto de 60° não é chanfrado (esquadria curta)', () => {
    const out = create(polyline([P(0, 0), P(6, 0), P(3, 5.196)]));
    if (!out.ok) throw new Error(out.message);
    expect(out.roof.boundary.length).toBe(3);
  });

  it('entalhe côncavo agudo: canto reentrante não é chanfrado nem recusado', () => {
    // Retângulo com um V estreito (~10°) cortado de cima: o fundo do V é um canto reentrante.
    const ring = [P(0, 0), P(10, 0), P(10, 6), P(5.45, 6), P(5, 2), P(4.55, 6), P(0, 6)];
    const out = create(polyline(ring), 0.2);
    if (!out.ok) throw new Error(out.message);
    expect(out.roof.boundary.length).toBe(ring.length);
    expectCoherent(out.roof);
  });

  it('beiral que se inverte (balanço maior que o entalhe) continua recusado, com mensagem clara', () => {
    const ring = [P(0, 0), P(10, 0), P(10, 6), P(5.45, 6), P(5, 2), P(4.55, 6), P(0, 6)];
    const out = create(polyline(ring), 1.5);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.message).toMatch(/balanço/);
  });

  it('arcos: gota com ponta aguda entre um arco e uma reta', () => {
    const segs: NewSeg[] = [
      { a: P(0, 0), b: P(8, 0), sag: -1.2 },
      { a: P(8, 0), b: P(4, 0.5) },
      { a: P(4, 0.5), b: P(0, 0) },
    ];
    const out = create(segs, 0.4);
    if (!out.ok) throw new Error(out.message);
    expectCoherent(out.roof);
    expect(roofEaveArcsProblem(out.roof)).toBeNull();
    expect(out.res.planes.length).toBeGreaterThan(0);
  });

  it('feijão: pontas afiladas, lado externo em arcos e entalhe côncavo', () => {
    const segs: NewSeg[] = [
      { a: P(0, 0), b: P(5, -2.2), sag: -0.5 },
      { a: P(5, -2.2), b: P(10, 0), sag: -0.5 },
      { a: P(10, 0), b: P(5, 0.9), sag: -1.4 },
      { a: P(5, 0.9), b: P(0, 0), sag: -1.4 },
    ];
    const out = create(segs, 0.4);
    if (!out.ok) throw new Error(out.message);
    expectCoherent(out.roof);
    expect(out.res.planes.length).toBeGreaterThan(0);
  });

  it('o telhado chanfrado reabre no esboço sem o lado de comprimento zero e recompõe o mesmo chanfro', () => {
    const out = create(polyline([P(0, 0), P(8, -0.6), P(8, 0.6)]));
    if (!out.ok) throw new Error(out.message);
    const draft = draftFromElement(out.store.project, out.id);
    expect(draft?.segs.length).toBe(3);
    const again = commitPerimeter(out.store.project, draft!, { typeId: 'rt_ceramica', levelId: 'lv_0', overhang: 0.5 });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    const patch = (again.commands[0] as { patch: Partial<Roof> }).patch;
    expect(patch.boundary!.length).toBe(4);
    expect(patch.edgeOverhangs!.length).toBe(4);
  });

  it('bevelSharpCorners / eaveOutlinePerEdge: o lado de comprimento zero gera um lado perpendicular à bissetriz', () => {
    const ring = [P(0, 0), P(8, -0.6), P(8, 0.6)];
    const bev = bevelSharpCorners(ring, [0, 0, 0], [0.5, 0.5, 0.5], [30, 30, 30]);
    expect(bev.corners).toEqual([0]);
    expect(bev.ring.length).toBe(4);
    const eave = eaveOutlinePerEdge(bev.ring, bev.overhangs);
    expect(eaveProblem(bev.ring, eave, bev.overhangs)).toBeNull();
    // Os dois vértices do chanfro ficam na mesma abscissa (bissetriz = eixo x): a 10 x 0,5 da ponta.
    const [a, b] = [eave[0]!, eave[1]!];
    expect(a.x).toBeCloseTo(-5, 6);
    expect(b.x).toBeCloseTo(-5, 6);
  });
});
