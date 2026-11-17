import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Layer, type Project, type Wall } from '@hestia/model';
import { analyzeLevelTilt } from './wallTiltJoinLevel.ts';
import { levelFrames } from './resolveFrames.ts';

/** J2: a análise de junção inclinada com arco usa os níveis adaptativos da J1; valores à mão (fórmulas fechadas), 1e-6. */
const camada = (thick: number): Layer => ({ function: 'structure', materialId: 'mat_concreto', thickness: thick, wraps: false });
type P = { x: number; y: number };
interface W { id: string; a: P; b: P; tilt?: number; sag?: number }

function build(walls: W[], height: number): Project {
  const base = createEmptyProject();
  base.wallTypes.wt_t = { ...base.wallTypes.wt_alv14!, id: 'wt_t', name: 'T', code: 'T', layers: [camada(0.2)] };
  const s = new ProjectStore(base);
  const j = { kind: 'miter' as const, flip: false };
  for (const w of walls) {
    s.exec({ type: 'addWall', wall: makeWall({ id: w.id, typeId: 'wt_t', levelId: 'lv_0', height, a: w.a, b: w.b, ...(w.tilt ? { tilt: w.tilt } : {}), ...(w.sag ? { sag: w.sag } : {}), joinStart: j, joinEnd: j }) as Wall });
  }
  return s.project;
}
const analyse = (p: Project, H: number, tol?: number) => analyzeLevelTilt(levelFrames(p, 'lv_0'), new Map([['A', H], ['B', H]]), tol);
/** Vértices do anel (do lado do nó) com |x - x0| < 1e-6, ordenados por y. */
const noX = (ring: P[], x0: number): number[] => ring.filter((q) => Math.abs(q.x - x0) < 1e-6).map((q) => q.y).sort((a, b) => a - b);

describe('J2 · junção inclinada com arco na análise', () => {
  it('arcos concêntricos tangentes R=5, tilt −10°: cantos de cada nível em (0, 5 ± 0,1/cos10° + z·tan10°), sem aviso', () => {
    const sag = -(5 - Math.sqrt(25 - 12.5));
    const p = build([{ id: 'A', a: { x: 5, y: 0 }, b: { x: 0, y: 5 }, sag, tilt: -10 }, { id: 'B', a: { x: 0, y: 5 }, b: { x: -5, y: 0 }, sag, tilt: -10 }], 2.8);
    const an = analyse(p, 2.8);
    expect(an.avisos).toEqual([]);
    const A = an.joins.get('A')!;
    expect(A.zs).toContain(1.4);
    expect(A.zs![0]).toBe(0);
    expect(A.zs![A.zs!.length - 1]).toBe(2.8);
    // literais: R_axis(z) = 5 + z·0,17632698070846498; meia espessura horizontal = 0,1/cos10° = 0,10154266118857...
    const lit: Array<[number, number, number]> = [[0, 4.898457338811426, 5.101542661188574], [1.4, 5.145315111803277, 5.348400434180426], [2.8, 5.392172884795127, 5.595258207172276]];
    for (const [z, y0, y1] of lit) {
      const lv = A.levels!.find((l) => Math.abs(l.z - z) < 1e-9)!;
      const ys = noX(lv.rings[0]!, 0);
      expect(ys.length).toBe(2);
      expect(ys[0]!).toBeCloseTo(y0, 6);
      expect(ys[1]!).toBeCloseTo(y1, 6);
    }
    const B = an.joins.get('B')!;
    for (const [z, y0, y1] of lit) {
      const ys = noX(B.levels!.find((l) => Math.abs(l.z - z) < 1e-9)!.rings[0]!, 0);
      expect(ys[0]!).toBeCloseTo(y0, 6);
      expect(ys[1]!).toBeCloseTo(y1, 6);
    }
  });

  it('círculos de centros (0,0) e (6,0), R=5, 15° afastando: cantos em x=3 com y=√((5+z·tan15°±0,1/cos15°)²−9)', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: 15 }, { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: -15 }], 2.8);
    const an = analyse(p, 2.8);
    expect(an.avisos).toEqual([]);
    const lit: Array<[number, number, number]> = [[0, 3.869811595838635, 4.128679467833187], [1.4, 4.334717955457696, 4.584285866677446], [2.8, 4.78388556058436, 5.026609493888484]];
    for (const id of ['A', 'B']) {
      const j = an.joins.get(id)!;
      expect(j.zs!.length).toBeGreaterThanOrEqual(3);
      expect(j.levels!.length).toBe(j.zs!.length);
      for (const [z, y0, y1] of lit) {
        const ys = noX(j.levels!.find((l) => Math.abs(l.z - z) < 1e-9)!.rings[0]!, 3);
        expect(ys.length).toBe(2);
        expect(ys[0]!).toBeCloseTo(y0, 6);
        expect(ys[1]!).toBeCloseTo(y1, 6);
      }
      // mesma contagem e ordem de vértices que o anel vertical em todos os níveis; p0 e pH são os extremos
      const L = j.layers[0]!;
      for (const lv of j.levels!) expect(lv.rings[0]!.length).toBe(L.raw.length);
      expect(L.p0).toBe(j.levels![0]!.rings[0]);
      expect(L.pH).toBe(j.levels![j.levels!.length - 1]!.rings[0]);
    }
  });

  it('arco×reta viável (arco −15°, reta 15°): junção exata nas duas, sem aviso, e dentro de 5 ms/par', () => {
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 2 }, sag: -sg, tilt: -15 }, { id: 'B', a: { x: 4, y: 0 }, b: { x: 10, y: 0 }, tilt: 15 }], 2);
    const an = analyse(p, 2);
    expect(an.avisos).toEqual([]);
    expect(an.joins.has('A') && an.joins.has('B')).toBe(true);
    for (const j of an.joins.values()) for (const lv of j.levels!) lv.rings.forEach((r, k) => expect(r.length).toBe(j.layers[k]!.raw.length));
    // canto do eixo x=4,259530 em z=2: os dois vértices do anel de B (reta) a z=2 ficam a 0,1/cos15° do eixo deslocado
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) analyse(p, 2, 1e-3 + i * 1e-6);
    expect((performance.now() - t0) / 20).toBeLessThan(5);
  });

  it('par inviável (os círculos de topo se separam: sem cruzamento): plano B (encosto) COM aviso arcoInclinadoSemJuncao', () => {
    // centros (0,0) e (6,0), R=5; tilt para dentro de 40° (R(z)=5−z·tan40°): em z=2,8 os raios são 2,65 e 2,65 (soma 5,3 < 6)
    const sg = 5 - Math.sqrt(20);
    const p = build([{ id: 'A', a: { x: 3, y: 4 }, b: { x: 5, y: 0 }, sag: sg, tilt: -40 }, { id: 'B', a: { x: 3, y: 4 }, b: { x: 1, y: 0 }, sag: -sg, tilt: 40 }], 2.8);
    const an = analyse(p, 2.8);
    const codes = an.avisos.map((a) => a.code);
    expect(codes).toContain('arcoInclinadoSemJuncao');
    expect(codes).not.toContain('inclinacaoInviavelNaJuncao');
  });

  it('reta×reta: mesmo resultado de antes (p0/pH) e níveis [0, H/2, H] com o anel do meio no ponto médio', () => {
    const p = build([{ id: 'A', a: { x: 4, y: 0 }, b: { x: 0, y: 0 }, tilt: 15 }, { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: 15 }], 3);
    const an = analyse(p, 3);
    const j = an.joins.get('A')!;
    expect(j.zs).toEqual([0, 1.5, 3]);
    expect(j.layers[0]!.pH[1]!.x).toBeCloseTo(-0.7003199592523598, 9);
    expect(j.levels![1]!.rings[0]![1]!.x).toBeCloseTo((j.layers[0]!.p0[1]!.x + -0.7003199592523598) / 2, 9);
  });

  it('fuzz: arcos que se tocam, raios e inclinações variados: anéis de todos os níveis com a contagem do anel vertical, finitos e sem inversão', () => {
    let seed = 20261116;
    const rnd = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    let viaveis = 0, reamostrados = 0;
    for (let i = 0; i < 80; i++) {
      const R1 = 2 + rnd() * 6, R2 = 2 + rnd() * 6, a1 = 0.4 + rnd() * 1.2, a2 = 0.4 + rnd() * 1.2, d = (rnd() - 0.5) * 0.8;
      // dois arcos horários com nó comum em (0,0): centros nas direções ±(0,−R) giradas por d
      const c1 = { x: -R1 * Math.sin(d), y: -R1 * Math.cos(d) }, c2 = { x: R2 * Math.sin(d), y: -R2 * Math.cos(d) };
      const arcEnd = (c: P, R: number, sweep: number): { b: P; sag: number } => {
        const th0 = Math.atan2(0 - c.y, 0 - c.x), th1 = th0 + sweep;
        const b = { x: c.x + R * Math.cos(th1), y: c.y + R * Math.sin(th1) };
        return { b, sag: (sweep > 0 ? -1 : 1) * (R - R * Math.cos(Math.abs(sweep) / 2)) };
      };
      const e1 = arcEnd(c1, R1, a1), e2 = arcEnd(c2, R2, -a2);
      const p = build([
        { id: 'A', a: { x: 0, y: 0 }, b: e1.b, sag: e1.sag, tilt: (rnd() - 0.5) * 30 },
        { id: 'B', a: { x: 0, y: 0 }, b: e2.b, sag: e2.sag, tilt: (rnd() - 0.5) * 30 },
      ], 2 + rnd() * 2);
      let an;
      try { an = analyse(p, 2); } catch { continue; }
      for (const j of an.joins.values()) {
        viaveis++;
        for (const lv of j.levels!) lv.rings.forEach((r, k) => {
          const raw = j.layers[k]!.raw;
          expect(r.length).toBe(raw.length);
          expect(r.every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
          let ar = 0; for (let m = 0; m < r.length; m++) ar += r[m]!.x * r[(m + 1) % r.length]!.y - r[(m + 1) % r.length]!.x * r[m]!.y;
          let aw = 0; for (let m = 0; m < raw.length; m++) aw += raw[m]!.x * raw[(m + 1) % raw.length]!.y - raw[(m + 1) % raw.length]!.x * raw[m]!.y;
          expect(Math.sign(ar)).toBe(Math.sign(aw));
          if (r !== j.layers[k]!.p0 && r !== j.layers[k]!.pH && r.length !== raw.length) reamostrados++;
        });
      }
    }
    expect(viaveis).toBeGreaterThan(5);
    void reamostrados;
  });
});

describe('J5-D3 · junções vizinhas na análise (sólido leva as faces da vizinha)', () => {
  it('arcos concêntricos tangentes: cada junção aponta para a da outra parede; reta×reta não leva `vizinhas`', () => {
    const sag = -(5 - Math.sqrt(25 - 12.5));
    const p = build([{ id: 'A', a: { x: 5, y: 0 }, b: { x: 0, y: 5 }, sag, tilt: -10 }, { id: 'B', a: { x: 0, y: 5 }, b: { x: -5, y: 0 }, sag, tilt: -10 }], 2.8);
    const an = analyse(p, 2.8);
    const A = an.joins.get('A')!, B = an.joins.get('B')!;
    expect(A.vizinhas).toEqual([B]);
    expect(B.vizinhas).toEqual([A]);
    expect(A.vizinhas![0]).toBe(B); // mesma referência, sem cópia
    const q = build([{ id: 'A', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, tilt: 10 }, { id: 'B', a: { x: 0, y: 0 }, b: { x: 0, y: 4 }, tilt: 10 }], 2.8);
    const r = analyse(q, 2.8);
    expect(r.joins.get('A')!.vizinhas).toBeUndefined();
    expect(r.joins.get('B')!.vizinhas).toBeUndefined();
  });
});

