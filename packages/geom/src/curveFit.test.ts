import { describe, expect, it } from 'vitest';
import { arcFromSagitta, arcPointAt, arcTangentAt } from './arc.ts';
import { fitArcs, type ArcoAjustado, type CurvaAjustavel } from './curveFit.ts';
import type { Vec2 } from './vec.ts';

const ELIPSE: CurvaAjustavel = { tipo: 'elipse', centro: { x: 0, y: 0 }, rx: 4, ry: 2 };
// Oráculos do S3 (METODOLOGIA.md): perímetro e área da elipse rx=4, ry=2.
const PERIMETRO = 19.3769;
const AREA = 25.1327;

function circulo8(r: number): Vec2[] {
  return Array.from({ length: 8 }, (_, i) => ({ x: r * Math.cos((i * Math.PI) / 4), y: r * Math.sin((i * Math.PI) / 4) }));
}
const raioDe = (s: ArcoAjustado) => {
  const c = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
  const h = Math.abs(s.sag);
  return (c * c) / 4 / (2 * h) + h / 2;
};
const polElipse = (n: number): Vec2[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ x: 4 * Math.cos((2 * Math.PI * i) / n), y: 2 * Math.sin((2 * Math.PI * i) / n) }));
function distPoli(p: Vec2, poly: Vec2[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < poly.length; i++) {
    const a = poly[i]!, b = poly[i + 1]!;
    const dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return best;
}
function comprimentoTotal(arcos: ArcoAjustado[]): number {
  return arcos.reduce((s, a) => s + (arcFromSagitta(a.a, a.b, a.sag)?.length ?? Math.hypot(a.b.x - a.a.x, a.b.y - a.a.y)), 0);
}
function areaCadeia(arcos: ArcoAjustado[]): number {
  let sh = 0, seg = 0;
  for (const s of arcos) {
    sh += (s.a.x * s.b.y - s.b.x * s.a.y) / 2;
    const arc = arcFromSagitta(s.a, s.b, s.sag);
    if (arc) seg += (-Math.sign(s.sag) * (arc.radius ** 2 / 2) * (Math.abs(arc.sweep) - Math.sin(Math.abs(arc.sweep))));
  }
  return sh + seg;
}
function checarTangencia(arcos: ArcoAjustado[], fechada: boolean) {
  const n = arcos.length;
  for (let i = 0; i < (fechada ? n : n - 1); i++) {
    const s0 = arcos[i]!, s1 = arcos[(i + 1) % n]!;
    expect(Math.hypot(s0.b.x - s1.a.x, s0.b.y - s1.a.y)).toBeLessThan(1e-9);
    const a0 = arcFromSagitta(s0.a, s0.b, s0.sag), a1 = arcFromSagitta(s1.a, s1.b, s1.sag);
    const tEnd = a0 ? arcTangentAt(a0, a0.length) : { x: (s0.b.x - s0.a.x) / Math.hypot(s0.b.x - s0.a.x, s0.b.y - s0.a.y), y: (s0.b.y - s0.a.y) / Math.hypot(s0.b.x - s0.a.x, s0.b.y - s0.a.y) };
    const tIni = a1 ? arcTangentAt(a1, 0) : { x: (s1.b.x - s1.a.x) / Math.hypot(s1.b.x - s1.a.x, s1.b.y - s1.a.y), y: (s1.b.y - s1.a.y) / Math.hypot(s1.b.x - s1.a.x, s1.b.y - s1.a.y) };
    expect(Math.abs(Math.atan2(tEnd.x * tIni.y - tEnd.y * tIni.x, tEnd.x * tIni.x + tEnd.y * tIni.y))).toBeLessThan(1e-6);
  }
}

describe('fitArcs S3', () => {
  const r = fitArcs(ELIPSE, 0.005, 64);

  it('(a) desvio máximo curva×arcos ≤ tol (32 pontos por arco)', () => {
    const poly = polElipse(20000);
    let max = 0;
    for (const s of r.arcos) {
      const arc = arcFromSagitta(s.a, s.b, s.sag)!;
      for (let i = 0; i <= 32; i++) max = Math.max(max, distPoli(arcPointAt(arc, (arc.length * i) / 32), poly));
    }
    expect(max).toBeLessThanOrEqual(0.005);
  });

  it('(b) tangência < 1e-6 rad e pontas coincidentes a 1e-9 m', () => checarTangencia(r.arcos, true));

  it('(c) todo arco ≤ 180° e |sag| ≤ corda/2', () => {
    for (const s of r.arcos) {
      expect(Math.abs(s.sag)).toBeLessThanOrEqual(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) / 2 + 1e-12);
    }
  });

  it('(d) número de arcos múltiplo de 4, ≤ 16 e simétrico nos dois eixos', () => {
    expect(r.arcos.length % 4).toBe(0);
    expect(r.arcos.length).toBeLessThanOrEqual(16);
    const chave = (p: Vec2, sx: number, sy: number) => `${(sx * p.x).toFixed(7)},${(sy * p.y).toFixed(7)}`;
    const base = new Set(r.arcos.map((s) => `${chave(s.a, 1, 1)}|${chave(s.b, 1, 1)}|${Math.abs(s.sag).toFixed(7)}`));
    // Espelhar em x troca a ordem das pontas: compara pelo conjunto de vértices e |sag|.
    const vert = new Set(r.arcos.map((s) => chave(s.a, 1, 1)));
    for (const s of r.arcos) {
      expect(vert.has(chave(s.a, -1, 1))).toBe(true);
      expect(vert.has(chave(s.a, 1, -1))).toBe(true);
    }
    expect(base.size).toBe(r.arcos.length);
  });

  it('(e) comprimento 19,3769 e área 25,1327', () => {
    expect(Math.abs(comprimentoTotal(r.arcos) - PERIMETRO)).toBeLessThan(0.02);
    expect(Math.abs(areaCadeia(r.arcos) - AREA)).toBeLessThan(0.1);
  });

  it('(f) determinismo byte a byte e inversão dos pontos dá a cadeia invertida', () => {
    expect(JSON.stringify(fitArcs(ELIPSE))).toBe(JSON.stringify(fitArcs(ELIPSE)));
    const pts: Vec2[] = [{ x: 0, y: 0 }, { x: 1, y: 1.2 }, { x: 2.5, y: 1.5 }, { x: 4, y: 0.2 }, { x: 5, y: -1 }];
    const f = fitArcs({ tipo: 'spline', pontos: pts });
    const g = fitArcs({ tipo: 'spline', pontos: [...pts].reverse() });
    expect(JSON.stringify(f)).toBe(JSON.stringify(fitArcs({ tipo: 'spline', pontos: pts })));
    const inv = [...f.arcos].reverse().map((s) => ({ a: s.b, b: s.a, sag: -s.sag }));
    expect(g.arcos.length).toBe(inv.length);
    g.arcos.forEach((s, i) => {
      expect(Math.hypot(s.a.x - inv[i]!.a.x, s.a.y - inv[i]!.a.y)).toBeLessThan(1e-9);
      expect(Math.hypot(s.b.x - inv[i]!.b.x, s.b.y - inv[i]!.b.y)).toBeLessThan(1e-9);
      expect(Math.abs(s.sag - inv[i]!.sag)).toBeLessThan(1e-9);
    });
    checarTangencia(f.arcos, false);
  });

  it('(g) ao bater maxArcos devolve o melhor ajuste mais aviso, sem lançar', () => {
    const q = fitArcs(ELIPSE, 0.0001, 8);
    expect(q.arcos.length).toBeLessThanOrEqual(8);
    expect(q.arcos.length).toBeGreaterThan(0);
    expect(q.avisos.some((a) => a.codigo === 'max-arcos')).toBe(true);
  });

  it('(h) arco com raio < t/2 + 1 cm gera aviso', () => {
    // Menor raio da elipse = ry²/rx = 1 m: espessura 2,1 m exige raio ≥ 1,06 m.
    expect(fitArcs(ELIPSE, 0.005, 64, { espessura: 2.1 }).avisos.some((a) => a.codigo === 'raio-pequeno')).toBe(true);
    expect(fitArcs(ELIPSE, 0.005, 64, { espessura: 0.2 }).avisos.some((a) => a.codigo === 'raio-pequeno')).toBe(false);
  });

  it('círculo como spline fechada de 8 pontos: raio de cada arco = r ± tol', () => {
    const c = fitArcs({ tipo: 'spline', pontos: circulo8(2), fechada: true }, 0.005);
    expect(c.arcos.length).toBeLessThanOrEqual(64);
    for (const s of c.arcos) expect(Math.abs(raioDe(s) - 2)).toBeLessThanOrEqual(0.005);
    checarTangencia(c.arcos, true);
  });
});
