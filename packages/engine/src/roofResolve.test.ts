import { describe, expect, it } from 'vitest';
import { multiArea, ringArea, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoof, type Project, type Roof } from '@hestia/model';
import { resolveRoofs, roofThickness, roofTopAt, type ResolvedRoof, type RoofLine } from './index.ts';

const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
];
/** Retângulo 8 x 6 (x 0..8, y 0..6) usado nos casos à mão. */
const R86 = rect(0, 0, 8, 6);
const ML = (lines: RoofLine[], kind: RoofLine['kind']): RoofLine[] => lines.filter((l) => l.kind === kind);
const len = (l: RoofLine): number => Math.hypot(l.b.x - l.a.x, l.b.y - l.a.y);
const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);

/** Projeto com um telhado (criado pelo comando addRoof, como na aplicação). */
function build(extra: Partial<Roof>, levelId = 'lv_0'): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addRoof', roof: makeRoof({ id: 'r1', typeId: 'rt_ceramica', levelId, boundary: R86, ...extra }) });
  return s.project;
}
const one = (extra: Partial<Roof>, levelId = 'lv_0'): ResolvedRoof => resolveRoofs(build(extra, levelId), levelId)[0]!;

describe('telhado de uma água (shed)', () => {
  // dir (0,1): sobe em y; menor projeção em y é y = 0, então o beiral baixo é y = 0 e a cota máxima é 0,30 × 6 = 1,80 m.
  const r = one({ shape: 'shed', slopePercent: 30, dir: { x: 0, y: 1 } });

  it('uma água cobre o retângulo, com origem no beiral baixo e subida na direção dir', () => {
    expect(r.planes).toHaveLength(1);
    expect(r.planes[0]!.origin).toEqual({ x: 0, y: 0 });
    expect(r.planes[0]!.up).toEqual({ x: 0, y: 1 });
    expect(r.planes[0]!.z0).toBe(0);
  });

  it('cotas: 0 no beiral baixo, 0,90 no meio, 1,80 no beiral alto e nula fora', () => {
    expect(roofTopAt(r, { x: 4, y: 0 })).toBeCloseTo(0, 9);
    expect(roofTopAt(r, { x: 4, y: 3 })).toBeCloseTo(0.9, 9);
    expect(roofTopAt(r, { x: 4, y: 6 })).toBeCloseTo(1.8, 9);
    expect(roofTopAt(r, { x: 9, y: 3 })).toBeNull();
  });

  it('a aresta alta é empena (sem cumeeira); a de baixo é beiral e as laterais são empenas', () => {
    expect(ML(r.lines, 'ridge')).toHaveLength(0);
    expect(ML(r.lines, 'eave')).toHaveLength(1);
    expect(ML(r.lines, 'gable')).toHaveLength(3);
  });
});

describe('telhado de duas águas (gable)', () => {
  // dir (1,0): cumeeira ao longo de x em y = 3; altura 0,30 × 3 = 0,90 m.
  const r = one({ shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 } });

  it('duas águas de 24 m² cada, com a cumeeira no meio', () => {
    expect(r.planes).toHaveLength(2);
    expect(r.planes.map((pl) => multiArea(pl.polygon)).sort((a, b) => a - b)).toEqual([24, 24].map((v) => expect.closeTo(v, 9)));
    expect(roofTopAt(r, { x: 4, y: 3 })).toBeCloseTo(0.9, 9);
    expect(roofTopAt(r, { x: 4, y: 0 })).toBeCloseTo(0, 9);
    expect(roofTopAt(r, { x: 4, y: 1.5 })).toBeCloseTo(0.45, 9);
  });

  it('cumeeira de (0,3) a (8,3), comprimento 8 m, e beiral nas demais arestas', () => {
    const ridges = ML(r.lines, 'ridge');
    expect(ridges).toHaveLength(1);
    expect(sum(ridges.map(len))).toBeCloseTo(8, 9);
    expect(ML(r.lines, 'eave')).toHaveLength(2);
    expect(sum(ML(r.lines, 'gable').map(len))).toBeCloseTo(12, 9);
  });
});

describe('telhado de quatro águas (hip)', () => {
  const r = one({ shape: 'hip', slopePercent: 30 });

  it('quatro águas com áreas 15, 15, 9 e 9 (soma 48 m²)', () => {
    expect(r.planes).toHaveLength(4);
    expect(r.planes.map((pl) => multiArea(pl.polygon)).sort((a, b) => a - b)).toEqual([9, 9, 15, 15].map((v) => expect.closeTo(v, 9)));
  });

  it('altura máxima 0,90 m no centro da cumeeira, e 0,30 m a 1 m da borda', () => {
    expect(roofTopAt(r, { x: 4, y: 3 })).toBeCloseTo(0.9, 9);
    expect(roofTopAt(r, { x: 1, y: 3 })).toBeCloseTo(0.3, 9);
    expect(roofTopAt(r, { x: 9, y: 3 })).toBeNull();
  });

  it('cumeeira de 2 m (de x = 3 a x = 5, em y = 3); quatro espigões de 4,2426 m em planta', () => {
    const ridges = ML(r.lines, 'ridge');
    expect(ridges).toHaveLength(1);
    expect(len(ridges[0]!)).toBeCloseTo(2, 9);
    const hips = ML(r.lines, 'hip');
    expect(hips).toHaveLength(4);
    hips.forEach((h) => expect(len(h)).toBeCloseTo(Math.sqrt(18), 9));
  });

  it('contorno não convexo (L) em quatro águas: uma água por aresta que define (seis), sem motivo de falha; área 33 m²', () => {
    const L: Vec2[] = [
      { x: 0, y: 0 },
      { x: 8, y: 0 },
      { x: 8, y: 3 },
      { x: 3, y: 3 },
      { x: 3, y: 6 },
      { x: 0, y: 6 },
    ];
    const got = one({ shape: 'hip', slopePercent: 30, boundary: L });
    expect(got.problem).toBeUndefined();
    expect(got.planes).toHaveLength(6);
    expect(sum(got.planes.map((pl) => multiArea(pl.polygon)))).toBeCloseTo(33, 6);
    expect(ML(got.lines, 'valley')).toHaveLength(1);
  });
});

describe('águas livres (free)', () => {
  it('a água é o polígono recortado pelo contorno, com a cota eaveZ + z0 do plano', () => {
    const r = one({
      shape: 'free',
      planes: [{ polygon: rect(0, 0, 4, 6), origin: { x: 0, y: 0 }, up: { x: 1, y: 0 }, percent: 20, z0: 0.5 }],
    });
    expect(r.planes).toHaveLength(1);
    expect(multiArea(r.planes[0]!.polygon)).toBeCloseTo(24, 9);
    expect(roofTopAt(r, { x: 2, y: 3 })).toBeCloseTo(0.9, 9);
    expect(roofTopAt(r, { x: 6, y: 3 })).toBeNull();
  });
});

describe('furos, deslocamento, camadas e tipo ausente', () => {
  it('furo de 1 m² sai da água que o contém (área total 47 m²); dentro do furo a cota é nula', () => {
    const r = one({ shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 }, holes: [rect(1, 1, 2, 2)] });
    expect(sum(r.planes.map((pl) => multiArea(pl.polygon)))).toBeCloseTo(47, 9);
    expect(roofTopAt(r, { x: 1.5, y: 1.5 })).toBeNull();
    expect(roofTopAt(r, { x: 1.5, y: 0.5 })).toBeCloseTo(0.15, 9);
  });

  it('deslocamento do beiral: lv_1 (3 m) com +0,50 m soma 3,50 m à cota do beiral', () => {
    const r = one({ shape: 'gable', slopePercent: 30, dir: { x: 1, y: 0 }, heightOffset: 0.5 }, 'lv_1');
    expect(r.eaveZ).toBeCloseTo(3.5, 9);
    expect(roofTopAt(r, { x: 4, y: 3 })).toBeCloseTo(4.4, 9);
  });

  it('camadas do tipo rt_ceramica de cima para baixo, com "abaixo" acumulado; espessura total 0,095 m', () => {
    const r = one({ shape: 'hip', slopePercent: 30 });
    expect(r.layers.map((l) => [l.materialId, l.thickness, l.below])).toEqual([
      ['mat_telha_ceramica', 0.015, 0],
      ['mat_madeira', 0.03, 0.015],
      ['mat_madeira', 0.05, 0.045],
    ]);
    expect(roofThickness(r)).toBeCloseTo(0.095, 9);
  });

  it('telhado com tipo inexistente não é resolvido', () => {
    const p = build({ shape: 'hip', slopePercent: 30 });
    const bad = { ...p, elements: { r1: { ...(p.elements.r1 as Roof), typeId: 'rt_nao_existe' } } };
    expect(resolveRoofs(bad, 'lv_0')).toEqual([]);
  });
});

describe('regressão · contorno côncavo com degrau (projeto fictício em L)', () => {
  // L inventado, anti-horário; P0 (5,0) é o canto reentrante. Arestas e0 (P0-P1) e e4 (P4-P5) são empenas; as demais têm 30 %.
  const L_BOUNDARY: Vec2[] = [
    { x: 5, y: 0 },
    { x: 9, y: 0 },
    { x: 9, y: 5 },
    { x: 0, y: 5 },
    { x: 0, y: -1.5 },
    { x: 5, y: -1.5 },
  ];
  const L_SLOPES: Array<number | null> = [null, 30, 30, 30, null, 30];

  it('gera 4 águas limpas sem filetes nem buracos, área total = contorno e degrau dz = 1,2 m', () => {
    const r = one({
      shape: 'edges',
      boundary: L_BOUNDARY,
      edgeSlopes: L_SLOPES,
      edgeOverhangs: L_BOUNDARY.map(() => 0.5),
      heightOffset: 2.8,
    });
    expect(r.problem).toBeUndefined();
    expect(r.planes).toHaveLength(4);
    for (const pl of r.planes) {
      expect(pl.polygon.length).toBeGreaterThan(0);
      for (const poly of pl.polygon) {
        for (const ring of poly) expect(Math.abs(ringArea(ring))).toBeGreaterThan(1e-6);
      }
    }
    // Área do contorno à mão: ala direita 4 x 5 = 20 mais ala esquerda 5 x 6,5 = 32,5: 52,5 m².
    const total = r.planes.reduce((s, pl) => s + multiArea(pl.polygon), 0);
    expect(total).toBeCloseTo(52.5, 5);
    expect(r.steps).toBeDefined();
    expect(r.steps!.length).toBeGreaterThan(0);
    // Degrau: 0,30 x 4 m (largura da ala direita, de x = 5 a x = 9) = 1,2 m.
    expect(Math.max(...r.steps!.map((s) => s.dz))).toBeCloseTo(1.2, 2);
    expect(r.stepGaps).toBeDefined();
    expect(r.stepGaps!.length).toBeGreaterThan(0);
  });
});
