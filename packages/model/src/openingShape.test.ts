import { describe, expect, it } from 'vitest';
import { CHORD_TOL, outline, validateOpeningShape, type OPt, type OpeningShape } from './openingShape.ts';

/** Área assinada do anel (cadarço): positiva para anti-horário. */
const signedArea = (r: readonly OPt[]): number => {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
};
/** Área absoluta do anel. */
const ringArea = (r: readonly OPt[]): number => Math.abs(signedArea(r));
const top = (r: readonly OPt[]): number => Math.max(...r.map((p) => p[1]));
/** Comprimento do arco de meia (perímetro curvo) para o limite do erro de área. */
const perimeterOf = (r: readonly OPt[]): number => {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!;
    const q = r[(i + 1) % r.length]!;
    s += Math.hypot(q[0] - p[0], q[1] - p[1]);
  }
  return s;
};

/** Área exata do arco abatido (meia-lua incluída, f = w/2): retângulo abaixo da nascença + segmento circular. */
const segmentalArea = (w: number, h: number, f: number): number => {
  const half = w / 2;
  const R = (half * half + f * f) / (2 * f);
  const alpha = Math.asin(half / R);
  return w * (h - f) + R * R * alpha - half * (R - f);
};
/** Área exata da ogival: retângulo abaixo da nascença + duas metades de arco centradas do lado oposto. */
const pointedArea = (w: number, h: number, f: number): number => {
  const half = w / 2;
  const r = (f * f + half * half) / (2 * half);
  const d = r - half;
  return w * (h - f) + (Math.PI * r * r) / 2 - d * f - r * r * Math.asin(d / r);
};
/** Comprimento do arco abatido (perímetro curvo). */
const segmentalArc = (w: number, f: number): number => {
  const half = w / 2;
  const R = (half * half + f * f) / (2 * f);
  return 2 * R * Math.asin(half / R);
};

/** Simetria: cada ponto tem o espelhado (x -> -x) no anel. */
const isSymmetric = (r: readonly OPt[]): boolean =>
  r.every((p) => r.some((q) => Math.abs(q[0] + p[0]) < 1e-9 && Math.abs(q[1] - p[1]) < 1e-9));
const insideBox = (r: readonly OPt[], w: number, h: number): boolean =>
  r.every((p) => Math.abs(p[0]) <= w / 2 + 1e-9 && p[1] >= -1e-9 && p[1] <= h + 1e-9);

/** Maior erro radial das cordas em relação ao arco de centro c e raio R (cordas com as duas pontas em `keep`). */
function maxChordError(ring: readonly OPt[], c: readonly [number, number], R: number, keep: (p: OPt) => boolean): number {
  let worst = 0;
  let n = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    if (!keep(p) || !keep(q)) continue;
    n++;
    const mx = (p[0] + q[0]) / 2;
    const mz = (p[1] + q[1]) / 2;
    worst = Math.max(worst, Math.abs(Math.hypot(mx - c[0], mz - c[1]) - R));
  }
  expect(n).toBeGreaterThan(0);
  return worst;
}

describe('outline: retângulo', () => {
  it('área = w x h, topo = h, simétrico', () => {
    const shape: OpeningShape = { kind: 'rect', width: 1.2, height: 2.0 };
    const r = outline(shape);
    expect(ringArea(r)).toBeCloseTo(1.2 * 2.0, 12);
    expect(top(r)).toBe(2.0);
    expect(isSymmetric(r)).toBe(true);
    expect(signedArea(r)).toBeGreaterThan(0);
  });
});

describe('outline: meia-lua e arco pleno (round)', () => {
  for (const w of [0.6, 0.9, 1.2, 2.4]) {
    it(`w=${w}, h=w/2: área = πw²/8, topo = h, simétrico`, () => {
      const r = outline({ kind: 'round', width: w, height: w / 2 });
      expect(Math.abs(ringArea(r) - (Math.PI * w * w) / 8)).toBeLessThanOrEqual(perimeterOf(r) * CHORD_TOL);
      expect(top(r)).toBeCloseTo(w / 2, 12);
      expect(isSymmetric(r)).toBe(true);
      expect(insideBox(r, w, w / 2)).toBe(true);
    });
  }

  it('w=1.2, h=2.0 (arco pleno sobre parede): área = w(h - w/2) + πw²/8, topo = h', () => {
    const w = 1.2;
    const h = 2.0;
    const r = outline({ kind: 'round', width: w, height: h });
    const exact = w * (h - w / 2) + (Math.PI * w * w) / 8;
    expect(Math.abs(ringArea(r) - exact)).toBeLessThanOrEqual(perimeterOf(r) * CHORD_TOL);
    expect(top(r)).toBeCloseTo(h, 12);
    expect(isSymmetric(r)).toBe(true);
    expect(insideBox(r, w, h)).toBe(true);
  });
});

describe('outline: arco abatido (segmental)', () => {
  const cases: Array<[number, number, number]> = [
    [1.2, 2.0, 0.2],
    [0.9, 1.5, 0.45],
    [2.4, 2.4, 0.3],
    [1.2, 2.0, 0.6], // flecha = w/2: meia-lua
  ];
  for (const [w, h, f] of cases) {
    it(`w=${w}, h=${h}, flecha=${f}: área exata, topo = h, simétrico`, () => {
      const r = outline({ kind: 'segmental', width: w, height: h, rise: f });
      const exact = segmentalArea(w, h, f);
      expect(Math.abs(ringArea(r) - exact)).toBeLessThanOrEqual(segmentalArc(w, f) * CHORD_TOL);
      expect(top(r)).toBeCloseTo(h, 12);
      expect(isSymmetric(r)).toBe(true);
      expect(insideBox(r, w, h)).toBe(true);
    });
  }

  it('a nascença fica em h - flecha (ombreira reta até ali)', () => {
    const r = outline({ kind: 'segmental', width: 1.2, height: 2.0, rise: 0.2 });
    expect(r.some((p) => Math.abs(p[0] - 0.6) < 1e-9 && Math.abs(p[1] - 1.8) < 1e-9)).toBe(true);
  });
});

describe('outline: ogival (pointed)', () => {
  const equilateral = (1.2 * Math.sqrt(3)) / 2;
  const cases: Array<[number, number, number]> = [
    [1.2, 2.0, 0.6], // flecha = w/2: semicírculo
    [1.2, 2.0, equilateral], // triângulo equilátero
    [0.9, 2.2, 1.5], // lanceta alta
  ];
  for (const [w, h, f] of cases) {
    it(`w=${w}, h=${h}, flecha=${f.toFixed(4)}: área exata, topo = h, simétrico`, () => {
      const r = outline({ kind: 'pointed', width: w, height: h, rise: f });
      const exact = pointedArea(w, h, f);
      const half = w / 2;
      const rad = (f * f + half * half) / (2 * half);
      const perim = 2 * rad * Math.atan2(f, rad - half); // duas metades, cada uma de comprimento rad · ângulo do ápice
      expect(Math.abs(ringArea(r) - exact)).toBeLessThanOrEqual(perim * CHORD_TOL);
      expect(top(r)).toBeCloseTo(h, 12);
      expect(isSymmetric(r)).toBe(true);
      expect(insideBox(r, w, h)).toBe(true);
    });
  }

  it('equilátero: o ápice fica em x = 0 e a cota h; as duas metades tem raio w', () => {
    const w = 1.2;
    const f = (w * Math.sqrt(3)) / 2;
    const r = outline({ kind: 'pointed', width: w, height: 2.0, rise: f });
    const apex = r.filter((p) => Math.abs(p[1] - 2.0) < 1e-9);
    expect(apex.length).toBeGreaterThan(0);
    for (const p of apex) expect(Math.abs(p[0])).toBeLessThan(1e-9);
  });
});

describe('outline: elipse (circle)', () => {
  const cases: Array<[number, number]> = [
    [1.0, 1.0],
    [1.2, 2.0],
    [0.8, 0.5],
  ];
  for (const [w, h] of cases) {
    it(`w=${w}, h=${h}: área = π·(w/2)·(h/2), topo = h, simétrico`, () => {
      const r = outline({ kind: 'circle', width: w, height: h });
      const exact = Math.PI * (w / 2) * (h / 2);
      expect(Math.abs(ringArea(r) - exact)).toBeLessThanOrEqual(perimeterOf(r) * CHORD_TOL);
      expect(top(r)).toBeCloseTo(h, 12);
      expect(isSymmetric(r)).toBe(true);
      expect(insideBox(r, w, h)).toBe(true);
    });
  }
});

describe('outline: erro de corda <= 1 mm', () => {
  it('círculo: distância do ponto médio de cada corda ao centro dentro de tol do raio', () => {
    const w = 1.0;
    const r = outline({ kind: 'circle', width: w, height: w });
    expect(maxChordError(r, [0, w / 2], w / 2, () => true)).toBeLessThanOrEqual(CHORD_TOL + 1e-9);
  });

  it('arco abatido (metade direita): erro radial das cordas <= tol', () => {
    const w = 1.2;
    const h = 2.0;
    const f = 0.2;
    const R = (w * w / 4 + f * f) / (2 * f);
    const zs = h - f;
    const r = outline({ kind: 'segmental', width: w, height: h, rise: f });
    const err = maxChordError(r, [0, h - R], R, (p) => p[0] >= -1e-9 && p[1] >= zs - 1e-9);
    expect(err).toBeLessThanOrEqual(CHORD_TOL + 1e-9);
  });

  it('ogival (metade direita): erro radial das cordas <= tol', () => {
    const w = 1.2;
    const h = 2.0;
    const f = 1.2;
    const half = w / 2;
    const zs = h - f;
    const rad = (f * f + half * half) / (2 * half);
    const cx = half - rad;
    const r = outline({ kind: 'pointed', width: w, height: h, rise: f });
    const err = maxChordError(r, [cx, zs], rad, (p) => p[0] >= -1e-9 && p[1] >= zs - 1e-9);
    expect(err).toBeLessThanOrEqual(CHORD_TOL + 1e-9);
  });

  it('outline recusa forma inválida (ogival com vale, flecha abaixo de w/2)', () => {
    expect(() => outline({ kind: 'pointed', width: 1.2, height: 2.0, rise: 0.36 })).toThrow(/pointed-rise-below-half/);
  });
});

describe('validateOpeningShape', () => {
  it('formas válidas devolvem lista vazia', () => {
    expect(validateOpeningShape({ kind: 'rect', width: 0.9, height: 2.1 })).toEqual([]);
    expect(validateOpeningShape({ kind: 'circle', width: 1, height: 1 })).toEqual([]);
    expect(validateOpeningShape({ kind: 'round', width: 1.2, height: 0.6 })).toEqual([]); // meia-lua
    expect(validateOpeningShape({ kind: 'round', width: 1.2, height: 2.0 })).toEqual([]);
    expect(validateOpeningShape({ kind: 'segmental', width: 1.2, height: 2.0, rise: 0.6 })).toEqual([]); // = w/2
    expect(validateOpeningShape({ kind: 'segmental', width: 1.2, height: 2.0, rise: 0.2 })).toEqual([]);
    expect(validateOpeningShape({ kind: 'pointed', width: 1.2, height: 2.0, rise: 0.6 })).toEqual([]); // = w/2
    expect(validateOpeningShape({ kind: 'pointed', width: 1.2, height: 2.0, rise: 1.0392304845413265 })).toEqual([]);
  });

  describe('dimensões', () => {
    it('largura <= 0 ou não finita', () => {
      for (const width of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(validateOpeningShape({ kind: 'rect', width, height: 2 })).toEqual(['width-invalid']);
      }
    });
    it('altura <= 0 ou não finita', () => {
      for (const height of [0, -0.5, Number.NaN]) {
        expect(validateOpeningShape({ kind: 'circle', width: 1, height })).toEqual(['height-invalid']);
      }
    });
    it('dimensão inválida encerra a validação (não mistura com regras de flecha)', () => {
      expect(validateOpeningShape({ kind: 'segmental', width: 0, height: 2, rise: 5 })).toEqual(['width-invalid']);
      expect(validateOpeningShape({ kind: 'pointed', width: 1.2, height: -1, rise: 0.1 })).toEqual(['height-invalid']);
    });
  });

  describe('arco abatido (segmental)', () => {
    it('flecha 0 ou negativa é inválida', () => {
      expect(validateOpeningShape({ kind: 'segmental', width: 1.2, height: 2, rise: 0 })).toEqual(['rise-invalid']);
      expect(validateOpeningShape({ kind: 'segmental', width: 1.2, height: 2, rise: -0.1 })).toEqual(['rise-invalid']);
    });
    it('flecha acima de w/2 é inválida', () => {
      expect(validateOpeningShape({ kind: 'segmental', width: 1.2, height: 2, rise: 0.61 })).toEqual(['rise-invalid']);
    });
    it('flecha acima da altura: nascença abaixo da base', () => {
      expect(validateOpeningShape({ kind: 'segmental', width: 2.4, height: 0.3, rise: 0.5 })).toEqual(['rise-exceeds-height']);
    });
  });

  describe('ogival (pointed)', () => {
    it('flecha 0 ou negativa é inválida (rise-invalid, não vale)', () => {
      expect(validateOpeningShape({ kind: 'pointed', width: 1.2, height: 2, rise: 0 })).toEqual(['rise-invalid']);
    });
    it('flecha abaixo de w/2 é o defeito do Lapin (preset Tudor, 0,3 w)', () => {
      expect(validateOpeningShape({ kind: 'pointed', width: 1.2, height: 2, rise: 0.36 })).toEqual(['pointed-rise-below-half']);
      expect(validateOpeningShape({ kind: 'pointed', width: 1.2, height: 2, rise: 0.5999 })).toEqual(['pointed-rise-below-half']);
    });
    it('flecha acima da altura: estouro', () => {
      expect(validateOpeningShape({ kind: 'pointed', width: 0.9, height: 1.0, rise: 1.2 })).toEqual(['rise-exceeds-height']);
    });
    it('flecha abaixo de w/2 e acima da altura acusa os dois problemas', () => {
      expect(validateOpeningShape({ kind: 'pointed', width: 2.4, height: 0.5, rise: 0.8 })).toEqual([
        'pointed-rise-below-half',
        'rise-exceeds-height',
      ]);
    });
  });

  describe('arco pleno (round)', () => {
    it('altura abaixo de w/2 não comporta o semicírculo', () => {
      expect(validateOpeningShape({ kind: 'round', width: 1.2, height: 0.55 })).toEqual(['round-height-below-half']);
    });
    it('altura = w/2 (meia-lua) é válida', () => {
      expect(validateOpeningShape({ kind: 'round', width: 1.2, height: 0.6 })).toEqual([]);
    });
  });
});
