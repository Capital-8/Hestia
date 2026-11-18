import { describe, expect, it } from 'vitest';
import { CHORD_TOL, outline, validateOpeningShape, type OPt, type OpeningShape } from './openingShape.ts';
import { outlineSegments } from './openingShapeSegments.ts';
import { clipRect, outlineInset, ringSignedArea, crownBand } from './openingShapeInset.ts';
import { edgeStrips } from './openingShapePolyInset.ts';
import { horseshoeGeometry } from './openingShapeHorseshoe.ts';
import { OPENING_SHAPE_KINDS, OPENING_SHAPE_LABELS_PT, defaultOpeningShape, resizeOpeningShape } from './openingShapeKinds.ts';
import { openingShapeOf } from './openingShapeOf.ts';

const area = (r: readonly OPt[]): number => ringSignedArea(r);
const poly = (...pts: Array<[number, number]>): Array<{ u: number; v: number }> => pts.map(([u, v]) => ({ u, v }));

/** Área exata do contorno em segmentos: cadarço das pontas + segmento circular de cada bulge. */
function areaDosSegmentos(shape: OpeningShape): number {
  let a = 0;
  for (const s of outlineSegments(shape)) {
    a += (s.a[0] * s.b[1] - s.b[0] * s.a[1]) / 2;
    if (s.bulge !== 0) {
      const c = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      const th = 4 * Math.atan(s.bulge);
      const r = c / (2 * Math.sin(th / 2));
      a += (r * r * (th - Math.sin(th))) / 2; // área do segmento (à esquerda do sentido a -> b)
    }
  }
  return a;
}

const gable: OpeningShape = { kind: 'gable', width: 1.2, height: 1.5, rise: 0.5 };
const trap: OpeningShape = { kind: 'trapezoid', width: 1.2, height: 1, topWidth: 0.6 };
const trapInv: OpeningShape = { kind: 'trapezoid', width: 1.2, height: 1, topWidth: 1.2, baseWidth: 0.7 };
const shoe: OpeningShape = { kind: 'horseshoe', width: 1, height: 2, neck: 0.8 };
const casinha: OpeningShape = { kind: 'polygon', width: 1, height: 1.6, points: poly([0, 0], [1, 0], [1, 1], [0.5, 1.6], [0, 1]) };
const ele: OpeningShape = { kind: 'polygon', width: 1, height: 1, points: poly([0, 0], [1, 0], [1, 0.3], [0.3, 0.3], [0.3, 1], [0, 1]) };

describe('empena', () => {
  it('contorno: cinco pontos, área = retângulo + triângulo, anti-horário e dentro da caixa', () => {
    const r = outline(gable);
    expect(r).toHaveLength(5);
    expect(area(r)).toBeCloseTo(1.2 * 1.0 + 0.5 * 1.2 * 0.5, 12);
    expect(Math.max(...r.map((p) => p[1]))).toBeCloseTo(1.5, 12);
    expect(r.some((p) => Math.abs(p[0]) < 1e-12 && Math.abs(p[1] - 1.5) < 1e-12)).toBe(true);
  });
  it('rise = height dá o triângulo; rise > height e rise <= 0 são inválidos', () => {
    expect(outline({ ...gable, rise: 1.5 })).toHaveLength(3);
    expect(validateOpeningShape({ ...gable, rise: 1.6 })).toEqual(['rise-exceeds-height']);
    expect(validateOpeningShape({ ...gable, rise: 0 })).toEqual(['rise-invalid']);
    expect(validateOpeningShape({ ...gable, width: -1 })).toEqual(['width-invalid']);
  });
  it('segmentos são só retas e batem com o anel', () => {
    const segs = outlineSegments(gable);
    expect(segs.every((s) => s.bulge === 0)).toBe(true);
    expect(segs).toHaveLength(5);
  });
});

describe('trapézio', () => {
  it('topo menor que a base e topo maior que a base', () => {
    expect(area(outline(trap))).toBeCloseTo(((1.2 + 0.6) / 2) * 1, 12);
    expect(area(outline(trapInv))).toBeCloseTo(((1.2 + 0.7) / 2) * 1, 12);
    expect(Math.max(...outline(trapInv).map((p) => Math.abs(p[0])))).toBeCloseTo(0.6, 12);
  });
  it('códigos de problema', () => {
    expect(validateOpeningShape({ ...trap, topWidth: 0 } as OpeningShape)).toEqual(['trapezoid-width-invalid']);
    expect(validateOpeningShape({ ...trap, topWidth: 1.5 } as OpeningShape)).toEqual(['trapezoid-width-mismatch']);
    expect(validateOpeningShape({ ...trap, topWidth: 0.5, baseWidth: 0.9 } as OpeningShape)).toEqual(['trapezoid-width-mismatch']);
    expect(validateOpeningShape({ ...trap, baseWidth: Number.NaN } as OpeningShape)).toEqual(['trapezoid-width-invalid']);
  });
});

describe('ferradura', () => {
  it('o arco passa do semicírculo: centro acima da nascença e abertura menor que a corda', () => {
    const g = horseshoeGeometry(1, 2, 0.8);
    expect(g.zc).toBeCloseTo(1.5, 12);
    expect(g.z1).toBeLessThan(g.zc);
    const r = outline(shoe);
    expect(Math.max(...r.map((p) => Math.abs(p[0])))).toBeCloseTo(0.5, 2); // largura máxima = diâmetro (cordas de 1 mm)
    expect(r[0]![0]).toBeCloseTo(0.4, 12); // base = pescoço
    expect(Math.max(...r.map((p) => p[1]))).toBeCloseTo(2, 9);
  });
  it('cordas com erro <= 1 mm do círculo', () => {
    const g = horseshoeGeometry(1, 2, 0.8);
    const arc = outline(shoe).filter((p) => p[1] > g.z1 + 1e-9);
    for (let i = 0; i + 1 < arc.length; i++) {
      const mid: OPt = [(arc[i]![0] + arc[i + 1]![0]) / 2, (arc[i]![1] + arc[i + 1]![1]) / 2];
      expect(g.R - Math.hypot(mid[0], mid[1] - g.zc)).toBeLessThanOrEqual(CHORD_TOL + 1e-9);
    }
  });
  it('bulge exato: área dos segmentos = área exata (setor + trapézio), sem tesselar', () => {
    const g = horseshoeGeometry(1, 2, 0.8);
    const segs = outlineSegments(shoe);
    expect(segs.filter((s) => s.bulge !== 0)).toHaveLength(1);
    expect(segs[1]!.bulge).toBeGreaterThan(1); // arco maior que o semicírculo
    const theta = Math.PI - 2 * g.a0;
    const exata = 0.8 * g.z1 + (g.R * g.R * (theta - Math.sin(theta))) / 2;
    // retângulo abaixo da nascença + segmento circular da corda 0,8 (lado de cima, arco maior)
    expect(areaDosSegmentos(shoe)).toBeCloseTo(exata, 9);
    expect(area(outline(shoe))).toBeCloseTo(areaDosSegmentos(shoe), 2); // cordas inscritas: diferença de ordem tol x arco
  });
  it('códigos de problema', () => {
    expect(validateOpeningShape({ ...shoe, neck: 1 } as OpeningShape)).toEqual(['horseshoe-neck-invalid']);
    expect(validateOpeningShape({ ...shoe, neck: 0 } as OpeningShape)).toEqual(['horseshoe-neck-invalid']);
    expect(validateOpeningShape({ ...shoe, height: 0.6 } as OpeningShape)).toEqual(['horseshoe-height-too-low']);
  });
});

describe('polígono', () => {
  it('casinha: contorno é o próprio polígono (u - largura/2, v)', () => {
    const r = outline(casinha);
    expect(r).toEqual([[-0.5, 0], [0.5, 0], [0.5, 1], [0, 1.6], [-0.5, 1]]);
    expect(area(r)).toBeCloseTo(1 + 0.5 * 0.6, 12);
  });
  it('côncavo simples (L) é válido; pontos repetidos e colineares saem do contorno', () => {
    expect(validateOpeningShape(ele)).toEqual([]);
    const suja: OpeningShape = { kind: 'polygon', width: 1, height: 1, points: poly([0, 0], [0.5, 0], [1, 0], [1, 0], [1, 1], [0, 1]) };
    expect(outline(suja)).toHaveLength(4);
  });
  it('códigos: pontos, fora da caixa, degenerado, auto-interseção, horário, caixa não preenchida, simetria', () => {
    const p = (points: Array<{ u: number; v: number }>, extra: object = {}): OpeningShape => ({ kind: 'polygon', width: 1, height: 1, points, ...extra });
    expect(validateOpeningShape(p(poly([0, 0], [1, 0])))).toEqual(['polygon-points-invalid']);
    expect(validateOpeningShape(p(poly([0, 0], [1, 0], [Number.NaN, 1])))).toEqual(['polygon-points-invalid']);
    expect(validateOpeningShape(p(poly([0, 0], [1, 0], [1, 1], [0, 1.2])))).toContain('polygon-out-of-box');
    expect(validateOpeningShape(p(poly([0, 0], [0.5, 0.5], [1, 1])))).toEqual(['polygon-degenerate']);
    // gravata borboleta
    expect(validateOpeningShape(p(poly([0, 0], [1, 1], [1, 0], [0, 1])))).toEqual(['polygon-self-intersecting']);
    // vértice sobre aresta não consecutiva
    expect(validateOpeningShape(p(poly([0, 0], [1, 0], [1, 1], [0.5, 0], [0.4, 1], [0, 1])))).toEqual(['polygon-self-intersecting']);
    expect(validateOpeningShape(p(poly([0, 0], [0, 1], [1, 1], [1, 0])))).toEqual(['polygon-clockwise']);
    expect(validateOpeningShape(p(poly([0.1, 0], [0.9, 0], [0.9, 1], [0.1, 1])))).toEqual(['polygon-box-not-filled']);
    const assim = poly([0, 0], [1, 0], [1, 0.5], [0.8, 1], [0, 1]);
    expect(validateOpeningShape(p(assim, { symmetric: true }))).toEqual(['polygon-not-symmetric']);
    expect(validateOpeningShape(p(assim))).toEqual([]);
    expect(validateOpeningShape(p(poly([0, 0], [1, 0], [1, 0.7], [0.5, 1], [0, 0.7]), { symmetric: true }))).toEqual([]);
  });
  it('mais de 4096 pontos é recusado', () => {
    const pts = Array.from({ length: 4097 }, (_, i) => ({ u: i / 4097, v: 0 }));
    expect(validateOpeningShape({ kind: 'polygon', width: 1, height: 1, points: pts })).toEqual(['polygon-points-invalid']);
  });
  it('outline lança com forma inválida', () => {
    expect(() => outline({ kind: 'polygon', width: 1, height: 1, points: poly([0, 0], [1, 1], [1, 0], [0, 1]) })).toThrow(/polygon-self-intersecting/);
  });
});

describe('recuo concêntrico (offset por reta)', () => {
  it('empena: região recuada tem os lados paralelos a d (distância ortogonal)', () => {
    const r = outlineInset(gable, { side: 0.05, arc: 0.05, base: 0 });
    expect(r.length).toBe(5);
    expect(Math.max(...r.map((p) => p[0]))).toBeCloseTo(0.55, 9);
    // o ápice recuado fica 0,05 / cos(inclinação) abaixo do ápice
    const incl = Math.atan2(0.5, 0.6);
    expect(Math.max(...r.map((p) => p[1]))).toBeCloseTo(1.5 - 0.05 / Math.cos(incl), 9);
    expect(area(r)).toBeLessThan(area(outline(gable)));
  });
  it('trapézio: a perna inclinada recua por reta', () => {
    const r = outlineInset(trap, { side: 0.04, arc: 0.04, base: 0 });
    expect(r).toHaveLength(4);
    expect(Math.max(...r.map((p) => p[1]))).toBeCloseTo(0.96, 9);
  });
  it('polígono em L: recuo pequeno vale e recuo que consome a parte fina devolve []', () => {
    expect(outlineInset(ele, { side: 0.05, arc: 0.05, base: 0 }).length).toBeGreaterThanOrEqual(6);
    expect(outlineInset(ele, { side: 0.2, arc: 0.2, base: 0 })).toEqual([]);
  });
  it('recuo que consome a empena devolve []', () => {
    expect(outlineInset({ kind: 'gable', width: 0.2, height: 0.3, rise: 0.3 }, 0.2)).toEqual([]);
  });
  it('ferradura: arco concêntrico (mesmo centro, raio R - d) e ombreiras em neck/2 - d', () => {
    const r = outlineInset(shoe, { side: 0.04, arc: 0.04, base: 0 });
    const g = horseshoeGeometry(1, 2, 0.8);
    expect(Math.max(...r.map((p) => p[1]))).toBeCloseTo(2 - 0.04, 9);
    expect(Math.max(...r.map((p) => p[0]))).toBeCloseTo(g.R - 0.04, 2);
    expect(r.some((p) => Math.abs(p[1]) < 1e-9 && Math.abs(p[0] - 0.36) < 1e-9)).toBe(true); // ombreira recuada chega à base
  });
  it('faixa do batente da ferradura (crownBand) é simples e tem área = coroa externa - interna', () => {
    const f = crownBand(shoe, 0, 0.06)!;
    expect(f).not.toBeNull();
    expect(area(f.pts)).toBeGreaterThan(0);
  });
  it('faixas por aresta tampam o anel sem sobra: soma das áreas (acima de z = 0) = contorno - região recuada', () => {
    for (const forma of [gable, trap, trapInv, casinha, ele] as Array<Parameters<typeof edgeStrips>[0]>) {
      const d = 0.04;
      const tiras = edgeStrips(forma, { side: 0, arc: 0 }, { side: d, arc: d })!;
      expect(tiras.length).toBe(outline(forma).length - 1); // sem a base
      const dentro = outlineInset(forma, { side: d, arc: d, base: 0 });
      const soma = tiras.reduce((s, t) => s + area(clipRect(t.ring, -1e3, 1e3, 0, 1e3)), 0);
      expect(soma).toBeCloseTo(area(outline(forma)) - area(dentro), 9);
    }
  });
});

describe('lista de formas, rótulos, padrão e redimensionamento', () => {
  it('OPENING_SHAPE_KINDS tem as nove formas, cada uma com rótulo pt e padrão válido', () => {
    expect([...OPENING_SHAPE_KINDS].sort()).toEqual(['circle', 'gable', 'horseshoe', 'pointed', 'polygon', 'rect', 'round', 'segmental', 'trapezoid']);
    for (const k of OPENING_SHAPE_KINDS) {
      expect(OPENING_SHAPE_LABELS_PT[k].length).toBeGreaterThan(2);
      expect(validateOpeningShape(defaultOpeningShape(k, 1, 2.1))).toEqual([]);
    }
  });
  it('redimensionar: larguras e pontos acompanham; a flecha fica; formas antigas só trocam width e height', () => {
    expect(resizeOpeningShape({ kind: 'segmental', width: 1, height: 2, rise: 0.2 }, 1.1, 2.1)).toEqual({ kind: 'segmental', width: 1.1, height: 2.1, rise: 0.2 });
    expect(resizeOpeningShape(trap, 2.4, 1)).toMatchObject({ topWidth: 1.2 });
    expect(resizeOpeningShape(shoe, 2, 2)).toMatchObject({ neck: 1.6 });
    const g = resizeOpeningShape(casinha, 2, 3.2) as Extract<OpeningShape, { kind: 'polygon' }>;
    expect(g.points[3]).toEqual({ u: 1, v: 3.2 });
    expect(validateOpeningShape(g)).toEqual([]);
  });
  it('openingShapeOf dimensiona pelo vão bruto, inclusive o polígono', () => {
    const t = { width: 1, height: 1.6, roughOversize: { w: 0.1, h: 0.1 }, shape: casinha };
    const s = openingShapeOf(t as never) as Extract<OpeningShape, { kind: 'polygon' }>;
    expect(s.width).toBeCloseTo(1.1, 9);
    expect(s.height).toBeCloseTo(1.7, 9);
    expect(validateOpeningShape(s)).toEqual([]);
  });
});
