import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { discretizarNoTeto, FLECHA_PADRAO, flechaValida, polilinhaDaForma, splinePorPontos } from './terrainFormaGeom.ts';

const O: Vec2 = { x: 0, y: 0 };
const raio = (p: Vec2, c: Vec2 = O): number => Math.hypot(p.x - c.x, p.y - c.y);

/** Há dois lados NÃO adjacentes que se cruzam? (cruzamento próprio, orientação estrita) */
function seAutoIntersecta(pts: readonly Vec2[], fechada: boolean): boolean {
  const n = pts.length;
  const lados = fechada ? n : n - 1;
  const o = (a: Vec2, b: Vec2, c: Vec2): number => Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
  for (let i = 0; i < lados; i++) {
    for (let j = i + 2; j < lados; j++) {
      if (fechada && i === 0 && j === lados - 1) continue;
      const a = pts[i]!, b = pts[(i + 1) % n]!, c = pts[j]!, d = pts[(j + 1) % n]!;
      if (o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0) return true;
    }
  }
  return false;
}

describe('flecha: valor padrão e limites', () => {
  it('padrão 0,01 m; fora de 0,001..1 m é limitado; não numérico volta ao padrão', () => {
    expect(FLECHA_PADRAO).toBe(0.01);
    expect(flechaValida(undefined)).toBe(0.01);
    expect(flechaValida(Number.NaN)).toBe(0.01);
    expect(flechaValida(0)).toBe(0.001);
    expect(flechaValida(50)).toBe(1);
    expect(flechaValida(0.02)).toBe(0.02);
  });
});

describe('discretização das formas (flecha em metros)', () => {
  it('círculo de raio 5 m, flecha 0,01 m: 50 vértices (25 cordas por semicírculo), fechado, todos a 5 m do centro', () => {
    // passo = 2·acos(1 − 0,01/5) = 0,12651 rad; π / 0,12651 = 24,83 → 25 cordas por metade → 50.
    const r = polilinhaDaForma('circle', { center: O, radiusPoint: { x: 5, y: 0 } }, {}, 0.01)!;
    expect(r.fechada).toBe(true);
    expect(r.pts).toHaveLength(50);
    for (const p of r.pts) expect(Math.abs(raio(p) - 5)).toBeLessThan(1e-9);
    // Erro de corda: a flecha de cada corda (5 − distância do meio da corda ao centro) fica dentro de 0,01 m (teórico 0,00987).
    for (let i = 0; i < 50; i++) {
      const a = r.pts[i]!, b = r.pts[(i + 1) % 50]!;
      const meio = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      expect(5 - raio(meio)).toBeLessThanOrEqual(0.01);
      expect(5 - raio(meio)).toBeCloseTo(0.009866, 5);
    }
  });

  it('retângulo (0,0)-(4,3): 4 vértices, fechado', () => {
    const r = polilinhaDaForma('rectangle', { p1: O, p2: { x: 4, y: 3 } }, {}, 0.01)!;
    expect(r.fechada).toBe(true);
    expect(r.pts).toEqual([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]);
  });

  it('polígono inscrito de 6 lados, raio 2 m: 6 vértices, o primeiro em (2,0)', () => {
    const r = polilinhaDaForma('inscribedPolygon', { center: O, vertex: { x: 2, y: 0 }, sides: 6 }, {}, 0.01)!;
    expect(r.fechada).toBe(true);
    expect(r.pts).toHaveLength(6);
    expect(r.pts[0]!.x).toBeCloseTo(2, 9);
    expect(r.pts[1]!.x).toBeCloseTo(1, 9);
    expect(r.pts[1]!.y).toBeCloseTo(Math.sqrt(3), 9);
  });

  it('arco por 3 pontos de uma semicircunferência (-5,0), (0,5), (5,0): aberto, 26 vértices, extremos em (-5,0) e (5,0), todos a 5 m', () => {
    const r = polilinhaDaForma('arcThreePoints', { start: { x: -5, y: 0 }, onArc: { x: 0, y: 5 }, end: { x: 5, y: 0 } }, {}, 0.01)!;
    expect(r.fechada).toBe(false);
    expect(r.pts).toHaveLength(26);
    expect(r.pts[0]!.x).toBeCloseTo(-5, 9);
    expect(r.pts[0]!.y).toBeCloseTo(0, 9);
    expect(r.pts[25]!.x).toBeCloseTo(5, 9);
    expect(r.pts[25]!.y).toBeCloseTo(0, 9);
    for (const p of r.pts) expect(Math.abs(raio(p) - 5)).toBeLessThan(1e-9);
    // O ponto do meio do arco (índice 13) está no topo? As 25 cordas dividem 180° em passos de 7,2°: o vértice 12 e o 13 ficam a ±3,6° do eixo y.
    expect(r.pts[12]!.x).toBeCloseTo(-5 * Math.sin((3.6 * Math.PI) / 180), 9);
  });

  it('elipse 6 x 3 m: fechada e todos os vértices sobre a elipse (x²/36 + y²/9 = 1)', () => {
    const r = polilinhaDaForma('ellipse', { center: O, rx: 6, ry: 3, rotation: 0 }, {}, 0.01)!;
    expect(r.fechada).toBe(true);
    expect(r.pts.length).toBeGreaterThanOrEqual(8);
    for (const p of r.pts) expect(p.x * p.x / 36 + p.y * p.y / 9).toBeCloseTo(1, 9);
  });

  it('forma degenerada (raio zero, retângulo sem altura) devolve null', () => {
    expect(polilinhaDaForma('circle', { center: O, radiusPoint: O }, {}, 0.01)).toBeNull();
    expect(polilinhaDaForma('rectangle', { p1: O, p2: { x: 4, y: 0 } }, {}, 0.01)).toBeNull();
  });
});

describe('teto de vértices', () => {
  const circulo = (f: number) => polilinhaDaForma('circle', { center: O, radiusPoint: { x: 5, y: 0 } }, {}, f);

  it('cabe: devolve com a flecha pedida', () => {
    const r = discretizarNoTeto(circulo, 0.01, 200_000)!;
    expect(r.flecha).toBe(0.01);
    expect(r.pts).toHaveLength(50);
  });

  it('não cabe com 0,01: reduz a densidade dobrando a flecha (0,02 dá 36; 0,04 dá 26) até caber em 30', () => {
    const r = discretizarNoTeto(circulo, 0.01, 30)!;
    expect(r.flecha).toBeCloseTo(0.04, 12);
    expect(r.pts).toHaveLength(26);
  });

  it('não cabe de jeito nenhum (2 semicírculos têm no mínimo 4 vértices): null', () => {
    expect(discretizarNoTeto(circulo, 0.01, 3)).toBeNull();
  });

  it('polígono de 64 lados com teto 10: contagem fixa, recusa', () => {
    const g = (f: number) => polilinhaDaForma('inscribedPolygon', { center: O, vertex: { x: 1, y: 0 }, sides: 64 }, {}, f);
    expect(discretizarNoTeto(g, 0.01, 10)).toBeNull();
  });
});

describe('spline por pontos (Catmull-Rom centrípeta)', () => {
  const ctrl: Vec2[] = [{ x: 0, y: 0 }, { x: 4, y: 3 }, { x: 8, y: -1 }, { x: 12, y: 2 }];

  it('aberta: passa EXATAMENTE pelos pontos de controle, na ordem, e as pontas são as primeiras e últimas', () => {
    const r = splinePorPontos(ctrl, false, 0.01)!;
    expect(r.fechada).toBe(false);
    expect(r.pts[0]).toEqual(ctrl[0]);
    expect(r.pts[r.pts.length - 1]).toEqual(ctrl[3]);
    let busca = 0;
    for (const c of ctrl) {
      const k = r.pts.findIndex((p, i) => i >= busca && p.x === c.x && p.y === c.y);
      expect(k).toBeGreaterThanOrEqual(busca);
      busca = k;
    }
    expect(r.pts.length).toBeGreaterThan(30);
  });

  it('erro de corda: o ponto médio de cada corda fica a no máximo 0,01 m da curva (amostragem 4x mais fina)', () => {
    const grossa = splinePorPontos(ctrl, false, 0.01)!;
    const fina = splinePorPontos(ctrl, false, 0.0005)!;
    // Cada vértice da grossa está na curva; a distância do meio de cada corda à fina é a flecha real.
    const dMin = (q: Vec2): number => Math.min(...fina.pts.map((p) => Math.hypot(p.x - q.x, p.y - q.y)));
    for (let i = 1; i < grossa.pts.length; i++) {
      const a = grossa.pts[i - 1]!, b = grossa.pts[i]!;
      expect(dMin({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })).toBeLessThan(0.0105);
    }
  });

  it('fechada: não repete o 1º ponto, fecha, passa pelos 4 cantos e não se cruza', () => {
    const quad: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const r = splinePorPontos(quad, true, 0.01)!;
    expect(r.fechada).toBe(true);
    expect(r.pts[0]).toEqual(quad[0]);
    expect(r.pts[r.pts.length - 1]).not.toEqual(quad[0]);
    for (const c of quad) expect(r.pts.some((p) => p.x === c.x && p.y === c.y)).toBe(true);
    expect(seAutoIntersecta(r.pts, true)).toBe(false);
  });

  it('caso agudo (V fechado e grampo), pontos que não se cruzam: a spline não se autointerseciona', () => {
    const v: Vec2[] = [{ x: 0, y: 0 }, { x: 5, y: 10 }, { x: 10, y: 0 }];
    expect(seAutoIntersecta(splinePorPontos(v, false, 0.01)!.pts, false)).toBe(false);
    expect(seAutoIntersecta(splinePorPontos(v, true, 0.01)!.pts, true)).toBe(false);
    const grampo: Vec2[] = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 1 }, { x: 0, y: 1 }, { x: 0, y: 2 }, { x: 10, y: 2 }];
    expect(seAutoIntersecta(splinePorPontos(grampo, false, 0.01)!.pts, false)).toBe(false);
    const zigue: Vec2[] = [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 2, y: 0 }, { x: 3, y: 5 }, { x: 4, y: 0 }, { x: 5, y: 5 }];
    expect(seAutoIntersecta(splinePorPontos(zigue, false, 0.01)!.pts, false)).toBe(false);
  });

  it('dois pontos viram uma reta; pontos repetidos são ignorados; menos de 2 pontos distintos, null', () => {
    const r = splinePorPontos([{ x: 0, y: 0 }, { x: 3, y: 4 }], false, 0.01)!;
    for (const p of r.pts) expect(Math.abs(4 * p.x - 3 * p.y)).toBeLessThan(1e-9);
    expect(splinePorPontos([{ x: 1, y: 1 }, { x: 1, y: 1 }], false, 0.01)).toBeNull();
    expect(splinePorPontos([{ x: 1, y: 1 }], false, 0.01)).toBeNull();
  });

  it('respeita o teto de vértices: com flecha 0,001 e teto 40, a flecha sobe e a spline cabe', () => {
    const r = discretizarNoTeto((f) => splinePorPontos(ctrl, false, f), 0.001, 40)!;
    expect(r.pts.length).toBeLessThanOrEqual(40);
    expect(r.flecha).toBeGreaterThan(0.001);
    expect(r.pts[0]).toEqual(ctrl[0]);
  });
});
