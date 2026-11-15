import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { analyzeLevelTilt } from './wallTiltJoinLevel.ts';
import { levelFrames } from './resolveFrames.ts';

/** D2: viabilidade decidida por par (e não pela componente); camada fina no casamento de anéis. Valores à mão, 1e-6. */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number }
function build(walls: W[], height: number, camadas: number[] = [0.2]): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: camadas.map(camada) };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) {
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}
const analyse = (p: Project, H: number) => analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map(['A', 'B', 'C', 'D'].map((i) => [i, H] as const)));

const perto = (r1: P[], r2: P[]): number => r1.filter((q) => r2.some((w) => Math.hypot(q.x - w.x, q.y - w.y) < 1e-6)).length;

describe('D2 · decisão por par', () => {
  it('arco −10° + arco −10° (exatos) + reta 15° em linha com a ponta de B (par B×C inviável, degrau de 1,24 m): só B×C degrada; A×B segue exato (antes a componente inteira caía no plano B)', () => {
    const sag = -(5 - Math.sqrt(25 - 12.5));
    const p = build([
      { id: 'A', a: { x: 5, y: 0 }, b: { x: 0, y: 5 }, sag, tilt: -10 },
      { id: 'B', a: { x: 0, y: 5 }, b: { x: -5, y: 0 }, sag, tilt: -10 },
      { id: 'C', a: { x: -5, y: 0 }, b: { x: -5, y: -4 }, tilt: 15 },
    ], 2.8, [0.2, 0.002]);
    const an = analyse(p, 2.8);
    expect([...new Set(an.avisos.map((a) => `${a.code}|${a.wallId}`))].sort()).toEqual(['arcoInclinadoSemJuncao|B', 'arcoInclinadoSemJuncao|C', 'inclinacoesDiferentesEmContinuacao|B']);
    expect([...an.joins.keys()].sort()).toEqual(['A', 'B']);
    // A×B segue exato: concêntricos R=5 −10° (J2): cantos em x=0 de A no topo y = 5 + 2,8·tan10° ± 0,101/cos10° (espessura 0,202)
    const ys = an.joins.get('A')!.levels!.at(-1)!.rings[0]!.filter((q) => Math.abs(q.x) < 1e-6).map((q) => q.y).sort((x, y) => x - y);
    expect(ys[0]!).toBeCloseTo(5.39115748, 6);
    expect(ys[1]!).toBeCloseTo(5.5942428, 6);
  });

  it('reta 15° → reta 15° (dobra de 14°) com camada fina de 2 mm: exata, sem aviso (o casamento por vértice mais próximo reprovava a camada fina)', () => {
    const p = build([
      { id: 'A', a: { x: 0, y: 5 }, b: { x: -4, y: 6 }, tilt: 15 },
      { id: 'B', a: { x: -4, y: 6 }, b: { x: -8, y: 6 }, tilt: 15 },
    ], 2.8, [0.2, 0.002]);
    const an = analyse(p, 2.8);
    expect(an.avisos).toEqual([]);
    expect([...an.joins.keys()].sort()).toEqual(['A', 'B']);
    // as duas camadas vêm com a contagem do anel vertical e anéis não degenerados
    for (const j of an.joins.values()) for (const l of j.layers) { expect(l.p0.length).toBe(l.raw.length); expect(l.pH.length).toBe(l.raw.length); }
  });

  it('cadeia de 3 paredes, um par inviável (círculos que se separam, ±40°) e outro viável (reta 15° na ponta de B): só o par inviável degrada, o viável fica exato', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([
      { id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: -40 },
      { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: 40 },
      { id: 'C', a: { x: 1, y: 0 }, b: { x: -3, y: 0 }, tilt: 15 },
    ], 2.8);
    const an = analyse(p, 2.8);
    expect([...new Set(an.avisos.map((a) => `${a.code}|${a.wallId}`))].sort()).toEqual(['arcoInclinadoSemJuncao|A', 'arcoInclinadoSemJuncao|B']);
    // o par B×C (viável) tem junção exata: cantos dos dois lados coincidem em todos os níveis (fresta 0); A segue sem junção
    expect([...an.joins.keys()].sort()).toEqual(['B', 'C']);
    const B = an.joins.get('B')!, C = an.joins.get('C')!;
    expect(C.zs).toBeDefined();
    for (const lv of C.levels!) {
      const lb = B.levels!.reduce((m, q) => (Math.abs(q.z - lv.z) < Math.abs(m.z - lv.z) ? q : m));
      if (Math.abs(lb.z - lv.z) < 1e-9) expect(perto(lb.rings[0]!, lv.rings[0]!)).toBeGreaterThanOrEqual(2);
    }
  });
});
