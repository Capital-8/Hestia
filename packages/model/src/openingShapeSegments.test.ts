import { describe, expect, it } from 'vitest';
import { outline, type OpeningShape } from './openingShape.ts';
import { mapaSegmentos, outlineSegments, type OpeningSegment } from './openingShapeSegments.ts';

/** Área com arcos: polígono (shoelace) mais o segmento circular de cada arco (r²/2 (θ − sen θ), sinal pelo bulge). */
function area(segs: readonly OpeningSegment[]): number {
  let poly = 0;
  let extra = 0;
  for (const s of segs) {
    poly += s.a[0] * s.b[1] - s.b[0] * s.a[1];
    if (Math.abs(s.bulge) < 1e-15) continue;
    const c = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
    const th = 4 * Math.atan(Math.abs(s.bulge));
    const r = c / (2 * Math.sin(th / 2));
    const seg = (r * r) / 2 * (th - Math.sin(th));
    extra += s.bulge > 0 ? seg : -seg;
  }
  return poly / 2 + extra;
}

const areaPoligono = (pts: readonly (readonly [number, number])[]): number => Math.abs(pts.reduce((s, p, i) => s + p[0] * pts[(i + 1) % pts.length]![1] - pts[(i + 1) % pts.length]![0] * p[1], 0)) / 2;

function fechado(segs: readonly OpeningSegment[]): boolean {
  return segs.every((s, i) => Math.hypot(s.b[0] - segs[(i + 1) % segs.length]!.a[0], s.b[1] - segs[(i + 1) % segs.length]!.a[1]) < 1e-9);
}

describe('contorno do vão em segmentos (arcos com bulge)', () => {
  it('retângulo: só retas, mesmo anel de outline', () => {
    const shape: OpeningShape = { kind: 'rect', width: 0.9, height: 2.1 };
    const segs = outlineSegments(shape);
    expect(segs.every((s) => s.bulge === 0)).toBe(true);
    expect(fechado(segs)).toBe(true);
    expect(area(segs)).toBeCloseTo(0.9 * 2.1, 12);
  });

  it('arco pleno: semicírculo no topo, área exata (retângulo + meio disco)', () => {
    const w = 0.9;
    const h = 2.4;
    const segs = outlineSegments({ kind: 'round', width: w, height: h });
    expect(fechado(segs)).toBe(true);
    expect(segs.some((s) => Math.abs(s.bulge - 1) < 1e-12)).toBe(true);
    expect(area(segs)).toBeCloseTo(w * (h - w / 2) + (Math.PI * (w / 2) ** 2) / 2, 9);
  });

  it('arco abatido e ogival: fecham e a área bate com o contorno tesselado (erro <= tol)', () => {
    for (const shape of [
      { kind: 'segmental', width: 1.4, height: 2.4, rise: 0.3 },
      { kind: 'pointed', width: 1.0, height: 2.5, rise: 0.8 },
    ] as OpeningShape[]) {
      const segs = outlineSegments(shape);
      expect(fechado(segs)).toBe(true);
      const exata = area(segs);
      const tess = areaPoligono(outline(shape));
      expect(Math.abs(exata - tess) / exata).toBeLessThan(0.002);
    }
  });

  it('círculo (largura = altura): dois semicírculos e área exata pi r²', () => {
    const segs = outlineSegments({ kind: 'circle', width: 1.2, height: 1.2 });
    expect(segs).toHaveLength(2);
    expect(fechado(segs)).toBe(true);
    expect(area(segs)).toBeCloseTo(Math.PI * 0.6 * 0.6, 9);
  });

  it('elipse sem ser círculo: cordas de outline, sem bulge', () => {
    const shape: OpeningShape = { kind: 'circle', width: 1.2, height: 2.0 };
    const segs = outlineSegments(shape);
    expect(segs.every((s) => s.bulge === 0)).toBe(true);
    expect(fechado(segs)).toBe(true);
    expect(segs.length).toBe(outline(shape).length);
  });

  it('forma inválida lança o mesmo erro de outline', () => {
    expect(() => outlineSegments({ kind: 'segmental', width: 1, height: 2, rise: 0.9 })).toThrow();
  });

  it('espelhar troca o sinal do bulge e preserva os vértices (área vira negativa no anel)', () => {
    const segs = outlineSegments({ kind: 'round', width: 0.9, height: 2.4 });
    const espelhados = mapaSegmentos(segs, (p) => [-p[0], p[1]], true);
    expect(espelhados.map((s) => s.bulge)).toEqual(segs.map((s) => -s.bulge));
    expect(espelhados[1]!.a[0]).toBeCloseTo(-segs[1]!.a[0], 12);
    expect(area(espelhados)).toBeCloseTo(-area(segs), 9);
  });
});
