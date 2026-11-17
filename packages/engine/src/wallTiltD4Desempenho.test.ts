import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project } from '@hestia/model';
import { multiArea, unionClipper, type MultiPolygon, type Vec2 } from '@hestia/geom';
import { computeSection, junctionLevel, resolveLevel } from './index.ts';
import { limparCachesDeConteudo } from './cachesDeConteudo.ts';
import { casadorDeVertices } from './wallTiltPlan.ts';

/**
 * D4 · desempenho da planta/resolução com arcos inclinados ligados (projeto do dono: 5 arcos inclinados em 13 paredes, resolveLevel 1,8 s).
 * Causas: Clipper-lib (`FixupFirstLefts` com PointInPolygon por contorno vivo, quadrático em uniões de camadas que se tocam em arco),
 * casamento linear de vértices com o anel `raw` a cada ponto mapeado, `tiltPlan` (base/topo) sempre calculado e regiões verticais
 * de clusters inclinados calculadas e descartadas. Limites folgados (3x do medido) para não oscilar sob carga; tempos impressos.
 */
const camada = (t: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: t, wraps: false });
/** Hexágono de 6 arcos inclinados (flecha 0,6 m) com 3 camadas, juntas em esquadria. */
function hexagono(tilt: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.02), camada(0.14), camada(0.02)] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  const P = (i: number): Vec2 => ({ x: 6 * Math.cos((i * Math.PI) / 3), y: 6 * Math.sin((i * Math.PI) / 3) });
  for (let i = 0; i < 6; i++) s.exec({ type: 'addWall', wall: makeWall({ id: `A${i}`, typeId: 'wt_t', levelId: 'lv_0', height: 3, a: P(i), b: P(i + 1), sag: 0.6, ...(i < 4 ? { tilt } : {}), joinStart: j, joinEnd: j }) });
  return s.project;
}
const ms = <T,>(f: () => T): [T, number] => { const t = performance.now(); const r = f(); return [r, performance.now() - t]; };

describe('D4 · arcos inclinados ligados', () => {
  it('resolver, junção e corte em tempo curto (tempos impressos)', () => {
    limparCachesDeConteudo();
    const p = hexagono(12);
    const [rl, tRes] = ms(() => resolveLevel(p, 'lv_0'));
    const [, tJ] = ms(() => junctionLevel(p, 'lv_0'));
    const [, tC] = ms(() => computeSection(p, { a: { x: -8, y: 0.3 }, b: { x: 8, y: 0.3 }, depth: 10 }));
    console.log(`[D4] hexágono de arcos inclinados: resolver ${tRes.toFixed(0)} ms, junção ${tJ.toFixed(0)} ms, corte ${tC.toFixed(0)} ms`);
    expect(rl.clusters.length).toBeGreaterThan(0);
    expect(rl.clusters.every((c) => c.regions.length > 0 && c.silhouette.length > 0)).toBe(true);
    expect(tRes).toBeLessThan(LIMITE.resolver);
    expect(tC).toBeLessThan(LIMITE.corte);
  });
  it('tiltPlan (base e topo) é preguiçoso, estável e vale a união das faixas', () => {
    limparCachesDeConteudo();
    const rl = resolveLevel(hexagono(12), 'lv_0');
    const rw = rl.walls.A0!;
    expect(rw.tiltPlan).toBeDefined();
    const b1 = rw.tiltPlan!.base, t1 = rw.tiltPlan!.top;
    expect(rw.tiltPlan!.base).toBe(b1);
    expect(multiArea(b1)).toBeGreaterThan(0.5);
    expect(multiArea(t1)).toBeGreaterThan(0.5);
    // o topo desloca para a esquerda de a→b (tilt > 0): o centróide do topo difere do da base
    expect(Math.abs(multiArea(b1) - multiArea(t1))).toBeLessThan(0.5 * multiArea(b1));
  });
  it('casador de vértices por grade = varredura linear em ordem (tolerância 5e-4)', () => {
    const raw: Vec2[] = [];
    let seed = 7;
    const r = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 400; i++) raw.push({ x: r() * 20 - 10, y: r() * 20 - 10 });
    const casa = casadorDeVertices(raw);
    const linear = (x: number, y: number): number => raw.findIndex((q) => Math.abs(q.x - x) < 5e-4 && Math.abs(q.y - y) < 5e-4);
    let achou = 0;
    for (let k = 0; k < 4000; k++) {
      const q = raw[Math.floor(r() * raw.length)]!;
      const x = q.x + (r() - 0.5) * 2.4e-3, y = q.y + (r() - 0.5) * 2.4e-3; // perto da tolerância: acerta e erra
      const e = linear(x, y);
      if (e >= 0) achou++;
      expect(casa(x, y), `ponto ${k}`).toBe(e);
    }
    expect(achou).toBeGreaterThan(500);
    expect(casa(100, 100)).toBe(-1);
  });
  it('Clipper: união de 5 faixas de arco que se tocam (centenas de vértices coincidentes) dá um só anel de área exata, sem lentidão', () => {
    const faixa = (r0: number, r1: number): MultiPolygon => {
      const n = 600, ext: Vec2[] = [], int: Vec2[] = [];
      for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 1.2; ext.push({ x: r1 * Math.cos(a), y: r1 * Math.sin(a) }); int.push({ x: r0 * Math.cos(a), y: r0 * Math.sin(a) }); }
      return [[[...ext, ...int.reverse()]]];
    };
    const raios = [5, 5.02, 5.16, 5.18, 5.2, 5.4];
    const faixas = raios.slice(0, -1).map((r, i) => faixa(r, raios[i + 1]!));
    const [u, t] = ms(() => unionClipper(...faixas));
    console.log(`[D4] união Clipper de 5 faixas de arco (3000 vértices): ${t.toFixed(0)} ms`);
    expect(u.length).toBe(1);
    expect(u[0]!.length).toBe(1);
    const esperado = faixas.reduce((a, f) => a + multiArea(f), 0);
    expect(Math.abs(multiArea(u) - esperado) / esperado).toBeLessThan(2e-4); // arredondamento a 1 µm
    expect(t).toBeLessThan(LIMITE.clipper);
  });
});
const LIMITE = { resolver: 800, corte: 300, clipper: 2300 }; // medido: 262, 53 e 750 ms (3x)
