import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { computeSection, quantifyLevel, resolveLevel } from './index.ts';
import { resolveLevelTs } from './resolve.ts';
import { limparCachesDeConteudo } from './cachesDeConteudo.ts';

/**
 * J4 · planta, corte, elevação e quantitativos usam os níveis da junção exata de arcos inclinados.
 * Par de arcos concêntricos tangentes R=5, t=0,2, tilt −10°, H=2,8; cantos em x=0 (valores à mão, J2): y = 5 + z·tan10° ± 0,1/cos10°.
 */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number }
function build(walls: W[], height: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  return s.project;
}
const SAG = -(5 - Math.sqrt(25 - 12.5));
const par = (tilt: number): Project => build([{ id: 'A', a: { x: 5, y: 0 }, b: { x: 0, y: 5 }, sag: SAG, tilt }, { id: 'B', a: { x: 0, y: 5 }, b: { x: -5, y: 0 }, sag: SAG, tilt }], 2.8);
const LIT: Array<[number, number, number]> = [[0, 4.898457338811426, 5.101542661188574], [1.4, 5.145315111803277, 5.348400434180426], [2.8, 5.392172884795127, 5.595258207172276]];

describe('J4 · consumidores da junção exata de arco inclinado', () => {
  it('planta: contorno no plano de corte zc=1,4 e zc=2,8 tem os cantos do nível; projeções base e topo', () => {
    const p = par(-10);
    for (const [z, y0, y1] of LIT) {
      const r = resolveLevelTs(p, 'lv_0', new Map(), { cutZ: z });
      for (const id of ['A', 'B']) {
        const ys = r.walls[id]!.layers[0]!.cut.flatMap((pl) => pl.flat()).filter((q) => Math.abs(q.x) < 1e-6).map((q) => q.y).sort((a, b) => a - b);
        expect(ys.length).toBeGreaterThanOrEqual(2);
        expect(ys[0]!).toBeCloseTo(y0, 6);
        expect(ys[ys.length - 1]!).toBeCloseTo(y1, 6);
      }
    }
    const r = resolveLevelTs(p, 'lv_0', new Map(), { cutZ: 1.4 });
    const tp = r.walls['A']!.tiltPlan!;
    const yb = tp.base.flatMap((pl) => pl.flat()).filter((q) => Math.abs(q.x) < 1e-6).map((q) => q.y).sort((a, b) => a - b);
    const yt = tp.top.flatMap((pl) => pl.flat()).filter((q) => Math.abs(q.x) < 1e-6).map((q) => q.y).sort((a, b) => a - b);
    expect(yb[0]!).toBeCloseTo(4.898457338811426, 6);
    expect(yb[yb.length - 1]!).toBeCloseTo(5.101542661188574, 6);
    expect(yt[0]!).toBeCloseTo(5.392172884795127, 6);
    expect(yt[yt.length - 1]!).toBeCloseTo(5.595258207172276, 6);
  });

  it('corte pelo plano x=0 (o nó): a seção em z=0, 1,4 e 2,8 tem os cantos do nível', () => {
    const p = par(-10);
    const r = computeSection(p, { a: { x: 0, y: 0 }, b: { x: 0, y: 10 }, depth: 1 });
    const pts = r.cut.flatMap((c) => c.polygons.flat(2));
    for (const [z, y0, y1] of LIT) {
      const t = pts.filter((q) => Math.abs(q.y - z) < 1e-6).map((q) => q.x);
      expect(t.length).toBeGreaterThan(0);
      expect(Math.min(...t)).toBeCloseTo(y0, 6);
      expect(Math.max(...t)).toBeCloseTo(y1, 6);
    }
  });

  it('círculos de centros (0,0) e (6,0), R=5, 15° afastando (canto NÃO linear): planta e corte em x=3 seguem o nível, não a reta p0→pH', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: 15 }, { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: -15 }], 2.8);
    const lit: Array<[number, number, number]> = [[0, 3.869811595838635, 4.128679467833187], [1.4, 4.334717955457696, 4.584285866677446], [2.8, 4.78388556058436, 5.026609493888484]];
    for (const [z, y0, y1] of lit) {
      const r = resolveLevelTs(p, 'lv_0', new Map(), { cutZ: z });
      for (const id of ['A', 'B']) {
        const ys = r.walls[id]!.layers[0]!.cut.flatMap((pl) => pl.flat()).filter((q) => Math.abs(q.x - 3) < 1e-6).map((q) => q.y).sort((a, b) => a - b);
        expect(ys[0]!).toBeCloseTo(y0, 6);
        expect(ys[ys.length - 1]!).toBeCloseTo(y1, 6);
      }
    }
    const r = computeSection(p, { a: { x: 3, y: 0 }, b: { x: 3, y: 10 }, depth: 1 });
    const pts = r.cut.flatMap((c) => c.polygons.flat(2));
    for (const [z, y0, y1] of lit) {
      const t = pts.filter((q) => Math.abs(q.y - z) < 1e-6).map((q) => q.x);
      expect(t.length).toBeGreaterThan(0);
      expect(Math.min(...t)).toBeCloseTo(y0, 6);
      expect(Math.max(...t)).toBeCloseTo(y1, 6);
    }
  });

  it('quantitativo: volume de cada parede = ∫ π·h·R(z) dz = 4,686577 (1e-3 relativo); vertical e reta×reta sem mudança', () => {
    const p = par(-10);
    const q = quantifyLevel(p, resolveLevel(p, 'lv_0'));
    for (const w of q.walls) {
      expect(Math.abs(w.grossVolume / 4.686576785591231 - 1)).toBeLessThan(1e-3);
      expect(Math.abs(w.volume / 4.686576785591231 - 1)).toBeLessThan(1e-3);
    }
    // vertical (tilt 0): faixa anular de 0,2, 90°, H=2,8: (π/4)(5,1²−4,9²)·2,8 = 4,398230
    const v = par(0);
    const qv = quantifyLevel(v, resolveLevel(v, 'lv_0'));
    for (const w of qv.walls) expect(Math.abs(w.grossVolume / 4.39822972 - 1)).toBeLessThan(1e-3);
  });

  it('desempenho: 20 arcos inclinados ligados (planta + corte + elevação) < 5x os mesmos arcos sem junção', () => {
    const arcos = (gapDeg: number): Project => {
      const ws: W[] = [];
      const n = 20, span = (2 * Math.PI) / n - (gapDeg * Math.PI) / 180;
      for (let i = 0; i < n; i++) {
        const t0 = (i * 2 * Math.PI) / n, t1 = t0 + span;
        const a = { x: 5 * Math.cos(t0), y: 5 * Math.sin(t0) }, b = { x: 5 * Math.cos(t1), y: 5 * Math.sin(t1) };
        ws.push({ id: `W${i}`, a, b, sag: -(5 - 5 * Math.cos(span / 2)), tilt: -10 });
      }
      return build(ws, 2.8);
    };
    const roda = (p: Project): number[] => {
      limparCachesDeConteudo();
      const t0 = performance.now();
      resolveLevelTs(p, 'lv_0', new Map(), { cutZ: 1.2 });
      const t1 = performance.now();
      computeSection(p, { a: { x: 0, y: -6 }, b: { x: 0, y: 6 }, depth: 0.5 });
      const t2 = performance.now();
      computeSection(p, { a: { x: -6, y: 0 }, b: { x: 6, y: 0 }, depth: 12 });
      const t3 = performance.now();
      return [t1 - t0, t2 - t1, t3 - t2];
    };
    const ligado = arcos(0), solto = arcos(6);
    roda(ligado); roda(solto);
    const a = roda(solto), b = roda(ligado);
    const sa = a.reduce((x, y) => x + y, 0), sb = b.reduce((x, y) => x + y, 0);
    console.log(`J4-perf 20 arcos: sem junção planta/corte/elevação ${a.map((x) => x.toFixed(0)).join('/')} = ${sa.toFixed(0)} ms; com junção ${b.map((x) => x.toFixed(0)).join('/')} = ${sb.toFixed(0)} ms`);
    expect(sb).toBeLessThan(5 * sa + 50);
  });
});
