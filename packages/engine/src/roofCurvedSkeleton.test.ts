import { describe, expect, it } from 'vitest';
import { multiArea, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeRoof, type Project } from '@hestia/model';
import { resolveRoofs, roofTopAt, type ResolvedRoof } from './index.ts';

/**
 * Motor com pegada em arco (o contorno já vem amostrado, como o esboço entrega) e com o esqueleto real de @hestia/geom.
 * Os casos de criação pelo esboço estão em packages/tools (roofCurvedCommit); aqui, o motor sozinho.
 */

const P = (x: number, y: number): Vec2 => ({ x, y });

/** Semicírculo de raio `R` (centro (0; R)) de (0; 2R) a (0; 0) abaulado para a esquerda, com 3 retas: (0;0)→(W;0)→(W;2R)→(0;2R). */
function semicircleBoundary(R: number, W: number, samples = 60): Vec2[] {
  const out: Vec2[] = [P(0, 0), P(W, 0), P(W, 2 * R), P(0, 2 * R)];
  // Arco de (0; 2R) a (0; 0) pela esquerda: ângulo de 90° a 270°, sentido anti-horário.
  for (let i = 1; i < samples; i++) {
    const th = Math.PI / 2 + (Math.PI * i) / samples;
    out.push(P(R * Math.cos(th), R + R * Math.sin(th)));
  }
  return out;
}

/** Projeto com um telhado por arestas, com a lista de inclinações e balanços dada. */
function build(boundary: Vec2[], edgeSlopes: Array<number | null>, edgeOverhangs?: number[]): Project {
  const s = new ProjectStore(createEmptyProject());
  s.exec({
    type: 'addRoof',
    roof: makeRoof({
      id: 'r1',
      typeId: 'rt_ceramica',
      levelId: 'lv_0',
      boundary,
      shape: 'edges',
      edgeSlopes,
      edgeOverhangs: edgeOverhangs ?? boundary.map(() => 0),
      slopePercent: 30,
      heightOffset: 2.8,
    }),
  });
  return s.project;
}

const one = (p: Project): ResolvedRoof => resolveRoofs(p, 'lv_0')[0]!;

describe('motor com arco: águas e tempo', () => {
  it('semicírculo de raio 20 m + 3 retas (111 lados de arco) resolve em menos de 1 s, sem problema', () => {
    const b = semicircleBoundary(20, 40, 111);
    const t0 = performance.now();
    const r = one(build(b, b.map(() => 30)));
    const ms = performance.now() - t0;
    expect(r.problem).toBeUndefined();
    expect(r.planes.length).toBeGreaterThan(100);
    expect(ms).toBeLessThan(1000);
  });

  it('cota da água do arco: no beiral é a cota do beiral e sobe para dentro (30 % por metro de planta)', () => {
    const b = semicircleBoundary(3, 10, 40);
    const r = one(build(b, b.map(() => 30)));
    // Ponto logo dentro do beiral do arco (raio 3, centro (0; 3)): cota do beiral (2,80 m) + 30 % × a distância à borda.
    const z = roofTopAt(r, P(-2.9, 3));
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(2.8);
    expect(z!).toBeLessThan(2.8 + 0.3 * 0.2);
  });

  it('as águas do arco ficam acima da cota do beiral (nenhuma abaixo) e a área das águas bate com a planta', () => {
    const b = semicircleBoundary(3, 10, 40);
    const r = one(build(b, b.map(() => 30)));
    const area = r.planes.reduce((s, pl) => s + multiArea(pl.polygon), 0);
    // Planta = retângulo 10 × 6 mais o semicírculo de raio 3 (π · 3² / 2).
    expect(area).toBeCloseTo(10 * 6 + (Math.PI * 9) / 2, 1);
    for (const pl of r.planes) expect(pl.z0).toBeCloseTo(2.8, 9);
  });
});

describe('motor: esqueleto que não fecha cai na envoltória (Revit: aceita)', () => {
  it('L com a empena interna: o esqueleto não fecha, a envoltória fecha a superfície e o telhado tem águas', () => {
    // Base, braço de baixo e topo definem; a interna é empena. Contorno é o beiral (L com 0,5 m de balanço em volta).
    const eave = [P(-0.5, -0.5), P(10.5, -0.5), P(10.5, 4.5), P(5.5, 4.5), P(5.5, 8.5), P(-0.5, 8.5)];
    const r = one(build(eave, [30, 30, null, null, 30, null]));
    expect(r.problem).toBeUndefined();
    expect(r.planes.length).toBeGreaterThan(0);
    expect(r.steps).toBeUndefined();
  });

  it('L com degrau entre água e empena: preserva o resultado do esqueleto e reporta o degrau em steps', () => {
    const L = [P(0, 0), P(10, 0), P(10, 4), P(5, 4), P(5, 8), P(0, 8)];
    const r = one(build(L, [30, 30, null, 30, null, null]));
    expect(r.problem).toBeUndefined();
    expect(r.steps?.length).toBeGreaterThan(0);
    expect(r.planes.length).toBeGreaterThan(0);
  });
});
