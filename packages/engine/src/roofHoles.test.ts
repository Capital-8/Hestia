import { describe, expect, it } from 'vitest';
import { multiArea, ringArea, sub, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoof, type Project } from '@hestia/model';
import { resolveRoofs, roofTopAt, type ResolvedRoof, type RoofLine } from './index.ts';

/**
 * Furos (claraboia/shaft) no telhado por esqueleto (decisão 0008 item 8, tarefa D): o contorno é resolvido sem o furo e
 * a empena (testeira) do furo é construída à parte como prisma vertical até o plano das águas (`holeGableLines`). O furo
 * é recortado da superfície (`difference` em roofs.ts), então a área real desconta o furo e a cota longe dele não muda.
 */

const R86: Vec2[] = [
  { x: 0, y: 0 },
  { x: 8, y: 0 },
  { x: 8, y: 6 },
  { x: 0, y: 6 },
];
const ML = (lines: RoofLine[], kind: RoofLine['kind']): RoofLine[] => lines.filter((l) => l.kind === kind);
const len = (l: RoofLine): number => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);
const planArea = (r: ResolvedRoof): number => sum(r.planes.map((pl) => multiArea(pl.polygon)));
/** Perímetro de um anel em planta. */
const ringLen = (ring: Vec2[]): number => ring.reduce((s, p, i) => s + Math.hypot(ring[(i + 1) % ring.length]!.x - p.x, ring[(i + 1) % ring.length]!.y - p.y), 0);

/** Projeto com um telhado `hip` 8 x 6 a 30 % (sem empena no contorno) e os furos dados. */
function build(boundary: Vec2[], holes: Vec2[][] = []): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary, holes, shape: 'hip', slopePercent: 30 }) });
  return s.project;
}
const solve = (boundary: Vec2[], holes: Vec2[][] = []): ResolvedRoof => resolveRoofs(build(boundary, holes), 'lv_0')[0]!;

describe('furos no esqueleto reto (tarefa D)', () => {
  it('furo retangular central 2 x 2: área desconta o furo, cota some no furo e a testeira tem o perímetro do furo', () => {
    const hole: Vec2[] = [
      { x: 3, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 4 },
      { x: 3, y: 4 },
    ];
    const r = solve(R86, [hole]);
    expect(r.problem).toBeUndefined();
    expect(planArea(r)).toBeCloseTo(44, 9);
    expect(roofTopAt(r, { x: 4, y: 3 })).toBeNull();
    // Empena em volta do furo: a soma dos trechos de testeira é o perímetro do furo (sem empena de contorno no hip).
    expect(sum(ML(r.lines, 'gable').map(len))).toBeCloseTo(ringLen(hole), 9);
  });

  it('furo triangular: resolve sem exceção, desconta a área e gera a testeira do perímetro', () => {
    const hole: Vec2[] = [
      { x: 3, y: 2 },
      { x: 5, y: 2 },
      { x: 4, y: 4 },
    ];
    const r = solve(R86, [hole]);
    expect(r.problem).toBeUndefined();
    expect(planArea(r)).toBeCloseTo(48 - Math.abs(ringArea(hole)), 9);
    expect(roofTopAt(r, { x: 4, y: 3 })).toBeNull();
    expect(sum(ML(r.lines, 'gable').map(len))).toBeCloseTo(ringLen(hole), 9);
  });

  it('furo fora do centro: resolve sem exceção e desconta a área', () => {
    const hole: Vec2[] = [
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
    ];
    const r = solve(R86, [hole]);
    expect(r.problem).toBeUndefined();
    expect(planArea(r)).toBeCloseTo(47, 9);
    expect(roofTopAt(r, { x: 1.5, y: 1.5 })).toBeNull();
  });

  it('furo girado (quadrado a 30°): resolve sem exceção, desconta a área e a testeira tem o perímetro', () => {
    const c = { x: 4, y: 3 };
    const t = Math.PI / 6;
    const rot = (dx: number, dy: number): Vec2 => ({ x: c.x + dx * Math.cos(t) - dy * Math.sin(t), y: c.y + dx * Math.sin(t) + dy * Math.cos(t) });
    const hole: Vec2[] = [rot(1, 1), rot(1, -1), rot(-1, -1), rot(-1, 1)];
    const r = solve(R86, [hole]);
    expect(r.problem).toBeUndefined();
    expect(planArea(r)).toBeCloseTo(48 - 4, 6);
    expect(sum(ML(r.lines, 'gable').map(len))).toBeCloseTo(ringLen(hole), 6);
  });

  it('a cota das águas longe do furo não muda em relação ao telhado sem furo', () => {
    const hole: Vec2[] = [
      { x: 3, y: 2 },
      { x: 5, y: 2 },
      { x: 5, y: 4 },
      { x: 3, y: 4 },
    ];
    const com = solve(R86, [hole]);
    const sem = solve(R86);
    for (const p of [
      { x: 1, y: 1 },
      { x: 7, y: 1 },
      { x: 1, y: 5 },
      { x: 7, y: 5 },
      { x: 4, y: 0.5 },
    ]) {
      expect(roofTopAt(com, p)).toBeCloseTo(roofTopAt(sem, p)!, 9);
    }
  });
});

/** PRNG determinístico (mulberry32) para semente fixa. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Polígono convexo: pontos num círculo de raio 5–10, ordenados por ângulo (anti-horário). */
function convex(r: () => number): Vec2[] {
  const n = 5 + Math.floor(r() * 5);
  const angs = Array.from({ length: n }, () => r() * Math.PI * 2).sort((a, b) => a - b);
  const R = 5 + r() * 5;
  return angs.map((a) => ({ x: R * Math.cos(a), y: R * Math.sin(a) }));
}

/** Distância de um ponto à reta a–b (em módulo). */
function distToEdge(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  return Math.abs(((p.x - a.x) * -d.y + (p.y - a.y) * d.x) / Math.hypot(d.x, d.y));
}

/** Furo regular (n = 3 ou 4) centrado no centroide do contorno, com raio 0,4 × a menor distância à borda: fica dentro. */
function holeInside(boundary: Vec2[], r: () => number): Vec2[] {
  const c = { x: boundary.reduce((s, p) => s + p.x, 0) / boundary.length, y: boundary.reduce((s, p) => s + p.y, 0) / boundary.length };
  let d = Infinity;
  for (let i = 0; i < boundary.length; i++) d = Math.min(d, distToEdge(c, boundary[i]!, boundary[(i + 1) % boundary.length]!));
  const n = r() < 0.5 ? 3 : 4;
  const rad = d * 0.4;
  const off = r() * Math.PI * 2;
  return Array.from({ length: n }, (_, k) => {
    const a = off + (k * Math.PI * 2) / n;
    return { x: c.x + rad * Math.cos(a), y: c.y + rad * Math.sin(a) };
  });
}

describe('propriedade: 30 telhados convexos com furo aleatório (semente fixa)', () => {
  it('resolvem sem exceção, desconta a área e a superfície é contínua', () => {
    const r = rng(20261022);
    for (let i = 0; i < 30; i++) {
      const boundary = convex(r);
      const hole = holeInside(boundary, r);
      const roof = resolveRoofs(build(boundary, [hole]), 'lv_0')[0]!;
      expect(roof.problem).toBeUndefined();
      expect(roof.planes.length).toBeGreaterThan(0);
      expect(roof.steps).toBeUndefined();
      // Área com a mesma tolerância da soma das águas em roofProperty.test.ts (o esqueleto e o recorte do furo têm erro de ponto flutuante).
      expect(planArea(roof)).toBeCloseTo(Math.abs(ringArea(boundary)) - Math.abs(ringArea(hole)), 4);
    }
  });
});

describe('pátio interno (courtyard) com águas caindo para dentro do furo', () => {
  it('quadrado 12×12 com pátio interno 4×4 a 30 %: 8 águas em anel, área = 144 − 16 = 128 m²', () => {
    const outer: Vec2[] = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 12 },
      { x: 0, y: 12 },
    ];
    const hole: Vec2[] = [
      { x: 4, y: 4 },
      { x: 8, y: 4 },
      { x: 8, y: 8 },
      { x: 4, y: 8 },
    ];
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addRoof',
      roof: makeRoof({
        id: 'r_patio',
        typeId: 'rt_ceramica',
        levelId: 'lv_0',
        boundary: outer,
        holes: [hole],
        shape: 'hip',
        slopePercent: 30,
        holeSlopes: [[30, 30, 30, 30]],
      }),
    });
    const r = resolveRoofs(s.project, 'lv_0')[0]!;
    expect(r.problem).toBeUndefined();
    expect(r.planes).toHaveLength(8);
    expect(planArea(r)).toBeCloseTo(144 - 16, 6);
    expect(roofTopAt(r, { x: 6, y: 6 })).toBeNull();
    // Beiral do pátio na cota 0 e cumeeira em anel a 2 m da borda com cota 0,60 m.
    expect(roofTopAt(r, { x: 4, y: 6 })).toBeCloseTo(0, 6);
    expect(roofTopAt(r, { x: 2, y: 6 })).toBeCloseTo(0.6, 6);
    expect(roofTopAt(r, { x: 3, y: 6 })).toBeCloseTo(0.3, 6);
    expect(ML(r.lines, 'gable')).toHaveLength(0);
    expect(sum(ML(r.lines, 'eave').map(len))).toBeCloseTo(ringLen(outer) + ringLen(hole), 6);
  });

  it('retângulo 12×8 com pátio interno retangular 4×2 (furo horário): 8 águas e área = 96 − 8 = 88 m²', () => {
    const outer: Vec2[] = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 8 },
      { x: 0, y: 8 },
    ];
    const holeCW: Vec2[] = [
      { x: 4, y: 3 },
      { x: 4, y: 5 },
      { x: 8, y: 5 },
      { x: 8, y: 3 },
    ];
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addRoof',
      roof: makeRoof({
        id: 'r_patio_ret',
        typeId: 'rt_ceramica',
        levelId: 'lv_0',
        boundary: outer,
        holes: [holeCW],
        shape: 'hip',
        slopePercent: 30,
        holeSlopes: [[30, 30, 30, 30]],
      }),
    });
    const r = resolveRoofs(s.project, 'lv_0')[0]!;
    expect(r.problem).toBeUndefined();
    expect(r.planes).toHaveLength(8);
    expect(planArea(r)).toBeCloseTo(96 - 8, 6);
    expect(roofTopAt(r, { x: 6, y: 4 })).toBeNull();
    expect(roofTopAt(r, { x: 6, y: 1.5 })).toBeCloseTo(0.45, 6);
    expect(roofTopAt(r, { x: 2, y: 4 })).toBeCloseTo(0.6, 6);
  });

  it('pátio interno com uma empena no furo (holeSlopes: [30, 30, null, 30]): 7 águas, área preservada e beiral/empena corretos', () => {
    const outer: Vec2[] = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 12 },
      { x: 0, y: 12 },
    ];
    const hole: Vec2[] = [
      { x: 4, y: 4 },
      { x: 4, y: 8 },
      { x: 8, y: 8 },
      { x: 8, y: 4 },
    ];
    const s = new ProjectStore(createEmptyProject());
    s.exec({
      type: 'addRoof',
      roof: makeRoof({
        id: 'r_patio_empena',
        typeId: 'rt_ceramica',
        levelId: 'lv_0',
        boundary: outer,
        holes: [hole],
        shape: 'hip',
        slopePercent: 30,
        holeSlopes: [[30, null, 30, 30]],
      }),
    });
    const r = resolveRoofs(s.project, 'lv_0')[0]!;
    expect(r.problem).toBeUndefined();
    expect(r.planes).toHaveLength(7);
    expect(planArea(r)).toBeCloseTo(144 - 16, 6);
    expect(sum(ML(r.lines, 'gable').map(len))).toBeCloseTo(4, 6);
  });
});
