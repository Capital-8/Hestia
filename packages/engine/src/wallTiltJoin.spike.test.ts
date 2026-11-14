import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, type JoinKind, type Wall } from '@hestia/model';
import type { Vec2 } from '@hestia/geom';
import { buildFrame, computeEnds } from './index.ts';
import { miterPoint } from './joinSides.ts';
import { isFail, joinFaceDeviation, meshVolume, polyArea, wallTiltJoin, wallTiltJoinPlanoB, type Mesh, type TiltWall } from './wallTiltJoin.spike.ts';

/** SPIKE S1 · critérios da METODOLOGIA.md §2 (S1) com valores literais (§4). */

const baseType = createEmptyProject().wallTypes.wt_alv14!;
const typeOf = (t: number) => ({ ...baseType, layers: [{ ...baseType.layers[0]!, function: 'structure' as const, thickness: t }] });

function wall(id: string, order: number, a: Vec2, b: Vec2, kind: JoinKind, sag = 0): Wall {
  const j = { kind, flip: false };
  return { ...makeWall({ id, typeId: 'x', levelId: 'lv_0', a, b, sag, joinStart: j, joinEnd: j }), order };
}
const join = (A: TiltWall, B: TiltWall, H: number, N = 4) => {
  const r = wallTiltJoin(A, B, H, N);
  if (isFail(r)) throw new Error(`falha ${r.fail} em z=${r.z}`);
  return r;
};
const tw = (w: Wall, t: number, tiltDeg: number): TiltWall => ({ frame: buildFrame(w, typeOf(t))!, tiltDeg });

/** Canto da referência: A vai de (4,0) a (0,0) (esquerda = −y); B vai de (0,0) a (0,4) (esquerda = −x). */
const cornerPair = (tA: number, tB: number, kind: JoinKind = 'miter') => [
  tw(wall('A', 1, { x: 4, y: 0 }, { x: 0, y: 0 }, kind), 0.2, tA),
  tw(wall('B', 2, { x: 0, y: 0 }, { x: 0, y: 4 }, kind), 0.2, tB),
] as const;

/** Valores literais (METODOLOGIA §2/S1), com os dígitos que a tabela arredonda: z·tan θ. */
const T15 = 0.2679491924311227;
const T30 = 0.5773502691896257;
const CASES = [
  { nome: '15/15', tA: 15, tB: 15, z15: [-1.5 * T15, -1.5 * T15], z3: [-0.8038475772933681, -0.8038475772933681], tabela: [[-0.4019, -0.4019], [-0.8038, -0.8038]] },
  { nome: '15/30', tA: 15, tB: 30, z15: [-0.8660254037844386, -0.40192378864668405], z3: [-1.7320508075688772, -0.8038475772933681], tabela: [[-0.866, -0.4019], [-1.7321, -0.8038]] },
  { nome: '0/30', tA: 0, tB: 30, z15: [-0.8660254037844386, 0], z3: [-1.7320508075688772, 0], tabela: [[-0.866, 0], [-1.7321, 0]] },
];
void T30;

const mid = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
/** Ponto médio da aresta de junção (vértices lo/hi da ponta b da parede A) = cruzamento dos eixos. */
const cornerOf = (poly: Vec2[]): Vec2 => mid(poly[1]!, poly[2]!);

function meshReport(m: Mesh): { open: number; bad: number; tiny: number; nan: number } {
  const und = new Map<string, number>();
  const dir = new Map<string, number>();
  let tiny = 0, nan = 0;
  for (const [i, j, k] of m.t) {
    for (const [p, q] of [[i, j], [j, k], [k, i]] as const) {
      und.set(p < q ? `${p},${q}` : `${q},${p}`, (und.get(`${p},${q}`) ?? und.get(`${q},${p}`) ?? 0) + 1);
      dir.set(`${p},${q}`, (dir.get(`${p},${q}`) ?? 0) + 1);
    }
    const [a, b, c] = [m.v[i]!, m.v[j]!, m.v[k]!];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cr = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const area = Math.hypot(cr[0]!, cr[1]!, cr[2]!) / 2;
    if (Number.isNaN(area)) nan++;
    else if (area < 1e-12) tiny++;
  }
  const open = [...und.values()].filter((c) => c !== 2).length;
  // orientação consistente: cada aresta dirigida aparece uma vez e a oposta também
  const bad = [...dir.entries()].filter(([k, c]) => c !== 1 || dir.get(k.split(',').reverse().join(',')) !== 1).length;
  return { open, bad, tiny, nan };
}

describe('S1 · reta×reta, canto (exato)', () => {
  for (const c of CASES) {
    it(`(a) cantos em z=0, H/2, H batem com a tabela a 1e-6 e são colineares · ${c.nome}`, () => {
      const [A, B] = cornerPair(c.tA, c.tB);
      const r = join(A, B, 3, 4);
      expect(r).not.toBeNull();
      const p0 = cornerOf(r.plan.z0[0]), p1 = cornerOf(r.plan.zMid[0]), p2 = cornerOf(r.plan.zH[0]);
      expect(p0.x).toBeCloseTo(0, 6);
      expect(p0.y).toBeCloseTo(0, 6);
      expect(p1.x).toBeCloseTo(c.z15[0]!, 6);
      expect(p1.y).toBeCloseTo(c.z15[1]!, 6);
      expect(p2.x).toBeCloseTo(c.z3[0]!, 6);
      expect(p2.y).toBeCloseTo(c.z3[1]!, 6);
      // a tabela do documento (4 casas) é a mesma coisa a 1e-4
      expect(Math.abs(p1.x - c.tabela[0]![0]!)).toBeLessThan(1e-4);
      expect(Math.abs(p2.y - c.tabela[1]![1]!)).toBeLessThan(1e-4);
      const cr = (p1.x - p0.x) * (p2.y - p0.y) - (p1.y - p0.y) * (p2.x - p0.x);
      expect(Math.abs(cr)).toBeLessThan(1e-9);
      // a parede B enxerga o mesmo canto (ponta a: vértices 0 e 3)
      const pb = mid(r.plan.zH[1][0]!, r.plan.zH[1][3]!);
      expect(pb.x).toBeCloseTo(c.z3[0]!, 6);
      expect(pb.y).toBeCloseTo(c.z3[1]!, 6);
    });

    it(`(b) vértices da face de junção a <1e-9 dos dois planos de face (de A e de B) · ${c.nome}`, () => {
      const [A, B] = cornerPair(c.tA, c.tB);
      const r = join(A, B, 3, 4);
      const cA = Math.cos((c.tA * Math.PI) / 180), sA = Math.sin((c.tA * Math.PI) / 180);
      const cB = Math.cos((c.tB * Math.PI) / 180), sB = Math.sin((c.tB * Math.PI) / 180);
      // faces de A: y·cosθ + z·senθ = ±0,1 ; de B: x·cosθ + z·senθ = ±0,1 (espessura 0,2 perpendicular à face)
      const dA = (v: number[]) => Math.min(...[-0.1, 0.1].map((h) => Math.abs(v[1]! * cA + v[2]! * sA - h)));
      const dB = (v: number[]) => Math.min(...[-0.1, 0.1].map((h) => Math.abs(v[0]! * cB + v[2]! * sB - h)));
      const nl = r.A.levels.length;
      let checked = 0;
      for (let l = 0; l < nl; l++) {
        const z = r.zs[l]!;
        for (const [wallSolid, idx] of [[r.A, r.A.endIdx.b], [r.B, r.B.endIdx.a]] as const) {
          for (const i of idx) {
            const p = wallSolid.levels[l]![i]!;
            const v = [p.x, p.y, z];
            expect(dA(v)).toBeLessThan(1e-9);
            expect(dB(v)).toBeLessThan(1e-9);
            checked++;
          }
        }
        // a face é a mesma para as duas paredes: mesmo conjunto de vértices
        const a = r.A.endIdx.b.map((i) => r.A.levels[l]![i]!), b = r.B.endIdx.a.map((i) => r.B.levels[l]![i]!);
        for (const p of a) expect(Math.min(...b.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))).toBeLessThan(1e-9);
      }
      expect(checked).toBe(nl * 4);
    });

    it(`(c) malha fechada, normais para fora · ${c.nome}`, () => {
      const [A, B] = cornerPair(c.tA, c.tB);
      const r = join(A, B, 3, 4);
      for (const s of [r.A, r.B]) {
        const rep = meshReport(s.mesh);
        expect(rep).toEqual({ open: 0, bad: 0, tiny: 0, nan: 0 });
        expect(meshVolume(s.mesh)).toBeGreaterThan(0); // com orientação consistente, volume > 0 = normais para fora
      }
    });

    it(`(d) volume = H/6·(A0+4Am+AH), erro relativo < 1e-9 · ${c.nome}`, () => {
      const [A, B] = cornerPair(c.tA, c.tB);
      const r = join(A, B, 3, 4);
      for (const [k, s] of [[0, r.A], [1, r.B]] as const) {
        const simpson = (3 / 6) * (polyArea(r.plan.z0[k]) + 4 * polyArea(r.plan.zMid[k]) + polyArea(r.plan.zH[k]));
        const v = meshVolume(s.mesh);
        expect(Math.abs(v - simpson) / simpson).toBeLessThan(1e-9);
      }
    });
  }

  it('(d) referência fechada §4.2: parede reta L=4 sem junção, θ=15°, volume 2,4847 (a 1e-4)', () => {
    // Parede isolada (B longe): volume = L·H·t/cosθ = 4·3·0,2/cos15° = 2,4847
    const A = tw(wall('A', 1, { x: 0, y: 0 }, { x: 4, y: 0 }, 'miter'), 0.2, 15);
    const B = tw(wall('B', 2, { x: 0, y: 20 }, { x: 4, y: 20 }, 'miter'), 0.2, 0);
    const r = join(A, B, 3, 4);
    expect(meshVolume(r.A.mesh)).toBeCloseTo(2.4847, 4);
    expect(r.nodes.every((n) => n === null)).toBe(true);
  });

  it('(e) tilt 0/0 idêntico ao resultado atual de computeEnds (miter) e aos valores literais da planta', () => {
    const [A, B] = cornerPair(0, 0);
    const r = join(A, B, 3, 4);
    const ends = computeEnds([A.frame, B.frame]);
    const eA = ends.get('A')!.b.hi;
    expect(eA.kind).toBe('miter');
    if (eA.kind !== 'miter') return;
    const T = eA.self.sHi - eA.self.sLo;
    const ref = [miterPoint(eA.self, eA.other, 0)!, miterPoint(eA.self, eA.other, T)!];
    for (const poly of [r.plan.z0[0], r.plan.zMid[0], r.plan.zH[0]]) {
      const got = [poly[1]!, poly[2]!];
      for (const p of ref) expect(Math.min(...got.map((q) => Math.hypot(p.x - q.x, p.y - q.y)))).toBeLessThan(1e-12);
      // literais: vértices de esquadria do canto 0,2 (±0,1)
      const has = (x: number, y: number) => got.some((q) => Math.hypot(q.x - x, q.y - y) < 1e-9);
      expect(has(-0.1, -0.1)).toBe(true);
      expect(has(0.1, 0.1)).toBe(true);
    }
    // pontas livres: corte reto em x=4 (±0,1) nos três níveis
    for (const poly of [r.plan.z0[0], r.plan.zH[0]]) {
      expect(poly[0]!.x).toBeCloseTo(4, 12);
      expect(Math.abs(poly[0]!.y)).toBeCloseTo(0.1, 12);
    }
    // sem inclinação, o topo é igual à base
    expect(r.plan.zH[0]).toEqual(r.plan.z0[0]);
    expect(r.plan.zH[1]).toEqual(r.plan.z0[1]);
  });
});

describe('S1 · reta×arco e arco×arco (aproximado) · literais §4.2', () => {
  // R=5, φ=90°: corda 5·√2, flecha 5·(1−cos45°). Sag>0 abaula à esquerda (centro à direita): tilt>0 afasta do centro.
  const arcWall = (id: string, tilt: number, sag: number) => tw(wall(id, 1, { x: 0, y: 0 }, { x: 5 * Math.SQRT2, y: 0 }, 'miter', sag), 0.2, tilt);
  const far = { x: 0, y: 50 }, far2 = { x: 4, y: 50 };
  const away = (w: TiltWall) => ({ A: w, B: tw(wall('B', 2, far, far2, 'miter'), 0.2, 0) });
  const SAG = 5 * (1 - Math.SQRT1_2);
  it('volume do arco isolado, afastando: 5,2708 (1e-3)', () => {
    const { A, B } = away(arcWall('A', 15, SAG));
    expect(meshVolume(join(A, B, 3, 16).A.mesh)).toBeCloseTo(5.2708, 2);
    expect(Math.abs(meshVolume(join(A, B, 3, 16).A.mesh) / 5.2708 - 1)).toBeLessThan(1e-3);
  });
  it('volume do arco isolado, aproximando: 4,4865 (1e-3)', () => {
    const { A, B } = away(arcWall('A', -15, SAG));
    expect(Math.abs(meshVolume(join(A, B, 3, 16).A.mesh) / 4.4865 - 1)).toBeLessThan(1e-3);
  });
});

/** PRNG próprio (mulberry32). */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('S1 · fuzz de 500 pares (semente fixa)', () => {
  const rnd = prng(20260514);
  const span = (lo: number, hi: number) => lo + (hi - lo) * rnd();
  interface Case { A: TiltWall; B: TiltWall; H: number; arc: boolean }
  const cases: Case[] = [];
  for (let i = 0; i < 500; i++) {
    const ang0 = span(0, 2 * Math.PI);
    const between = span(20, 160) * (Math.PI / 180) * (rnd() < 0.5 ? 1 : -1);
    const mk = (id: string, order: number, ang: number): TiltWall => {
      const L = span(2, 5);
      const b = { x: L * Math.cos(ang), y: L * Math.sin(ang) };
      const sag = rnd() < 0.5 ? 0 : span(0.02, 0.5) * L * (rnd() < 0.5 ? 1 : -1);
      const kind: JoinKind = rnd() < 0.5 ? 'miter' : 'butt';
      return tw(wall(id, order, { x: 0, y: 0 }, b, kind, sag), span(0.1, 0.4), span(-45, 45));
    };
    const A = mk('A', 1, ang0), B = mk('B', 2, ang0 + between);
    cases.push({ A, B, H: span(2, 6), arc: !!A.frame.arc || !!B.frame.arc });
  }
  /** Volume de referência: Simpson composto (64 faixas) sobre as plantas exatas de cada nível. */
  const refVolume = (c: Case, k: 0 | 1): number | null => {
    const r = wallTiltJoin(c.A, c.B, c.H, 63);
    if (isFail(r)) return null;
    const lv = (k === 0 ? r.A : r.B).levels.map(polyArea);
    const h = c.H / 64;
    let sum = lv[0]! + lv[64]!;
    for (let i = 1; i < 64; i++) sum += (i % 2 ? 4 : 2) * lv[i]!;
    return (h / 3) * sum;
  };
  const novo = () => ({ n: 0, ok: 0, falha: {} as Record<string, number>, malha: 0, vol: 0, volNeg: 0, tiny: 0, nan: 0, maxErr: 0 });

  const medir = () => {
    const cat = { reta: novo(), arco: novo() };
    let tempo = 0, tN = 0;
    for (const c of cases) {
      const g = c.arc ? cat.arco : cat.reta;
      g.n++;
      const t0 = performance.now();
      const r = wallTiltJoin(c.A, c.B, c.H, 4);
      tempo += performance.now() - t0;
      tN++;
      if (isFail(r)) { g.falha[r.fail] = (g.falha[r.fail] ?? 0) + 1; continue; }
      g.ok++;
      for (const [k, s] of [[0, r.A], [1, r.B]] as const) {
        const rep = meshReport(s.mesh);
        g.nan += rep.nan;
        g.tiny += rep.tiny;
        if (rep.open || rep.bad) g.malha++;
        const v = meshVolume(s.mesh);
        if (v <= 0) g.volNeg++;
        // reta: fórmula de Simpson de 3 níveis (exata); arco: Simpson composto de 64 faixas (a de 3 níveis não é exata)
        const ref = c.arc ? refVolume(c, k) : (c.H / 6) * (polyArea(r.plan.z0[k]) + 4 * polyArea(r.plan.zMid[k]) + polyArea(r.plan.zH[k]));
        const err = ref ? Math.abs(v - ref) / Math.abs(ref) : 1;
        g.maxErr = Math.max(g.maxErr, err);
        if (err >= (c.arc ? 1e-3 : 1e-9)) g.vol++;
      }
    }
    console.log(`FUZZ ${JSON.stringify(cat)} ms/par=${(tempo / tN).toFixed(3)}`);
    return { cat, porPar: tempo / tN };
  };
  let memo: ReturnType<typeof medir> | null = null;
  const dados = () => (memo ??= medir());

  it('reta×reta: (c),(d) exatos, sem NaN, sem triângulo < 1e-12, < 2 ms por par (pares viáveis; os demais são limite geométrico relatado)', () => {
    const { cat, porPar } = dados();
    expect(cat.reta).toMatchObject({ malha: 0, vol: 0, volNeg: 0, tiny: 0, nan: 0 });
    expect(cat.reta.ok).toBeGreaterThan(80);
    expect(Object.keys(cat.reta.falha)).toEqual(['no-fora-da-parede']); // única causa: o cruzamento dos eixos sai da parede
    expect(porPar).toBeLessThan(2);
  });

  // S1 NÃO PASSOU em arco (relatório docs/parede-formas/spike-s1.md): estes testes descrevem o critério e FALHAM de propósito
  // (`it.fails`); se um dia passarem, o vitest avisa e o plano B pode ser retirado.
  it.fails('arco: (d) erro de volume < 1e-3 em todos os pares viáveis e nenhum par inviável', () => {
    const { cat } = dados();
    expect(cat.arco).toMatchObject({ malha: 0, vol: 0, volNeg: 0, tiny: 0, nan: 0 });
    expect(cat.arco.falha).toEqual({});
  });

  it('PLANO B: com arco inclinado, corte de topo simples com aviso; malha fechada e volume > 0', () => {
    let n = 0, comAviso = 0, inviavel = 0;
    for (const c of cases.filter((x) => x.arc)) {
      const { r, aviso } = wallTiltJoinPlanoB(c.A, c.B, c.H, 4);
      if (isFail(r)) { inviavel++; expect(r.fail).toBe('cone-invertido'); continue; }
      n++;
      if (aviso) comAviso++;
      for (const s of [r.A, r.B]) {
        expect(meshReport(s.mesh)).toEqual({ open: 0, bad: 0, tiny: 0, nan: 0 });
        expect(meshVolume(s.mesh)).toBeGreaterThan(0);
      }
    }
    console.log(`PLANOB arco: ok=${n} comAviso=${comAviso} coneInvertido=${inviavel}`);
    expect(n).toBeGreaterThan(300);
  });

  it.fails('arco: menor N (níveis intermediários) com desvio da face de junção < 1 mm, nos pares com arco', () => {
    const arcos = cases.filter((c) => c.arc);
    const res: Record<number, number> = {};
    let minN = -1;
    let continuos = 0, quebras = 0, inviaveis = 0;
    for (const N of [1, 2, 4, 8, 16, 32]) {
      let worst = 0;
      continuos = quebras = inviaveis = 0;
      for (const c of arcos) {
        const d = joinFaceDeviation(c.A, c.B, c.H, N);
        if (d === null) { inviaveis++; continue; }
        if (d.quebra) { quebras++; continue; }
        continuos++;
        worst = Math.max(worst, d.dev);
      }
      res[N] = worst;
      if (minN < 0 && worst < 1e-3) minN = N;
    }
    console.log(`ARCO pares=${arcos.length} inviaveis=${inviaveis} quebraDeCorte=${quebras} continuos=${continuos} desvioMax(m) nos continuos por N=${JSON.stringify(res)} menorN=${minN}`);
    expect(minN).toBeGreaterThan(0);
    for (const c of cases.filter((x) => !x.arc)) {
      const d = joinFaceDeviation(c.A, c.B, c.H, 1);
      if (d !== null) {
        expect(d.dev).toBeLessThan(1e-9);
        expect(d.quebra).toBe(false);
      }
    }
  });
});
