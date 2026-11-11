import { describe, expect, it } from 'vitest';
import { asMulti, difference, union, intersection, multiArea, offsetMulti, type MultiPolygon, type Ring, type Vec2 } from '@hestia/geom';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, makeStair, type StairCurve, type StairLanding, type StairRun, type StairType } from '@hestia/model';
import {
  generateFanRun,
  generateLShape,
  generateSpiralRun,
  generateUShape,
  generateWinderL,
  pieceBottomZ,
  planStairFree,
  resolveStairs,
  stairBody,
  stairFinishModel,
  type ResolvedStair,
  type StairComponentSketch,
  type StairFinishSolid,
} from './index.ts';

/**
 * Bateria geométrica dos acabamentos em escadas livres (ADR 0011 §8): ângulos quaisquer, leque/balanceada, caracol, L, U,
 * sentido invertido, com e sem bocel, espessuras diferentes. Em TODO caso: nenhum par de sólidos acabados
 * (piso×piso, piso×espelho, espelho×espelho) nem acabado×estrutura tem volume de interseção.
 */
const v = (x: number, y: number): Vec2 => ({ x, y });
const deg = (d: number): number => (d * Math.PI) / 180;
const AREA_TOL = 1e-9;
const Z_TOL = 1e-9;
/**
 * Resolução do Clipper (grade de 1 µm) e a fresta numérica que a própria biblioteca já adota (`closeGaps`, 3 µm): uma
 * aresta oblíqua compartilhada por dois sólidos sai do arredondamento com até alguns µm de diferença, o que não é
 * sobreposição. Só vale ESTA grade; qualquer penetração maior que ela reprova.
 */
const GRID = 3e-6;
const toMulti = (a: Ring | MultiPolygon): MultiPolygon => (Array.isArray(a[0]) ? (a as MultiPolygon) : asMulti(a as Ring));
/** Interseção em planta que penetra mais que a grade: `b` é contraído por `GRID` antes de cruzar com `a`. */
const overlapPlan = (a: Ring | MultiPolygon, b: Ring | MultiPolygon): MultiPolygon => intersection(toMulti(a), offsetMulti(toMulti(b), -GRID));

interface Fin {
  tp: number;
  te: number;
  bocel: number | null;
}
const finOf = (f: Fin): Partial<StairType> => ({
  treadFinishEnabled: true,
  treadFinishThickness: f.tp,
  riserFinishEnabled: true,
  riserFinishThickness: f.te,
  bocelEnabled: f.bocel !== null,
  bocelProjection: f.bocel ?? 0,
});

const fromSketch = (list: StairComponentSketch[]): Array<StairRun | StairLanding> =>
  list.map((c, i) => (c.kind === 'run' ? { id: `run${i}`, kind: 'run' as const, ...c.run } : { id: `land${i}`, kind: 'landing' as const, boundary: c.landing.boundary }));

function resolve(components: Array<StairRun | StairLanding>, f: Fin, height: number, typeId = 'stt_monolitica'): ResolvedStair {
  const s = new ProjectStore(createEmptyProject());
  const base = DEFAULT_STAIR_TYPES.find((t) => t.id === typeId)!;
  s.exec({ type: 'upsertStairType', stairType: { ...base, id: 'stt_teste', ...finOf(f) } as StairType });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: 'stt_teste', levelId: 'lv_0', components, height, topOffset: height - 3, openingMargin: 0 }) });
  return resolveStairs(s.project)[0]!;
}

function overlaps(s: ResolvedStair): string[] {
  const m = stairFinishModel(s);
  expect(m, JSON.stringify(s.issues.map((i) => `${i.code}: ${i.message}`))).not.toBeNull();
  const bad: string[] = [];
  const all: StairFinishSolid[] = m!.solids;
  const name = (f: StairFinishSolid): string => `${f.kind}${f.number}`;
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!;
      const b = all[j]!;
      const area = multiArea(overlapPlan(a.polygon, b.polygon));
      const dz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      if (area > AREA_TOL && dz > Z_TOL) bad.push(`${name(a)} x ${name(b)} area=${area.toExponential(2)} dz=${dz.toExponential(2)}`);
    }
  }
  for (const f of all) {
    for (const piece of stairBody(s).pieces) {
      const inter = overlapPlan(f.polygon, piece.polygon);
      const area = multiArea(inter);
      if (area <= AREA_TOL) continue;
      const bottoms = inter.flatMap((poly) => poly[0]!.map((q) => pieceBottomZ(piece, q.x, q.y)));
      const separado = f.z0 >= piece.zTop - Z_TOL || f.z1 <= Math.min(...bottoms) + Z_TOL;
      if (!separado) bad.push(`${name(f)} x estrutura(${piece.index}) area=${area.toExponential(2)}`);
    }
  }
  return bad;
}

const FINS: Array<[string, Fin]> = [
  ['1,5/1,0 bocel 2', { tp: 0.015, te: 0.01, bocel: 0.02 }],
  ['2,5/2,0 bocel 3', { tp: 0.025, te: 0.02, bocel: 0.03 }],
  ['1,0/1,0 sem bocel', { tp: 0.01, te: 0.01, bocel: null }],
];

const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });
const at2 = (c: Vec2, d: Vec2, s: number): Vec2 => v(c.x + d.x * s, c.y + d.y * s);
/** Lance em paralelogramo: limites retos e espelhos oblíquos a `alpha` graus do eixo (espelho oblíquo em planta). */
function skewRun(alpha: number, n: number, p: number, w: number): StairRun {
  const t = Math.tan(deg(alpha - 90));
  const x = (k: number, y: number): number => k * p + y * t;
  const L = (n - 1) * p;
  return {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(v(-1.5, w / 2), v(L + 1.5, w / 2))],
    boundaryRight: [ln(v(-1.5, -w / 2), v(L + 1.5, -w / 2))],
    risers: Array.from({ length: n }, (_, k) => ln(v(x(k, -w / 2 - 0.2), -w / 2 - 0.2), v(x(k, w / 2 + 0.2), w / 2 + 0.2))),
    path: [],
  } as StairRun;
}
/** Lance com uma curva de `theta` graus SEM patamar: limites em quina e o espelho da curva na bissetriz. */
function bentRun(theta: number, sign: 1 | -1, n1: number, n2: number, p: number, w: number): StairRun {
  const th = deg(theta) * sign;
  const d1 = v(1, 0);
  const d2 = v(Math.cos(th), Math.sin(th));
  const nrm1 = v(0, 1);
  const nrm2 = v(-d2.y, d2.x);
  const B = v(n1 * p, 0);
  const half = w / 2;
  // Bissetriz da curva: direção da quina; a distância até cada borda é `s·half ÷ (bn·nrm1)`.
  const bs = v(d1.x + d2.x, d1.y + d2.y);
  const bl = Math.hypot(bs.x, bs.y);
  const bn = v(-bs.y / bl, bs.x / bl);
  const k = 1 / (bn.x * nrm1.x + bn.y * nrm1.y);
  const E = (j: number): Vec2 => at2(B, d2, j * p);
  const side = (s: 1 | -1): Vec2[] => [at2(v(-0.5, 0), nrm1, s * half), at2(B, bn, s * half * k), at2(E(n2 - 1 + 0.5 / p), nrm2, s * half)];
  const l = side(1);
  const r = side(-1);
  const risers: StairCurve[] = [];
  const gap = half * Math.tan(Math.abs(th) / 2) + 0.03;
  for (let j = 0; j < n1; j++) if ((n1 - j) * p > gap) risers.push(ln(at2(v(j * p, 0), nrm1, -half - 0.2), at2(v(j * p, 0), nrm1, half + 0.2)));
  risers.push(ln(at2(B, bn, -(half + 0.2) * k), at2(B, bn, (half + 0.2) * k)));
  for (let j = 1; j < n2; j++) if (j * p > gap) risers.push(ln(at2(E(j), nrm2, -half - 0.2), at2(E(j), nrm2, half + 0.2)));
  return {
    id: 'run',
    kind: 'run',
    boundaryLeft: [ln(l[0]!, l[1]!), ln(l[1]!, l[2]!)],
    boundaryRight: [ln(r[0]!, r[1]!), ln(r[1]!, r[2]!)],
    risers,
    path: [],
  } as StairRun;
}

const mono = DEFAULT_STAIR_TYPES.find((t) => t.id === 'stt_monolitica')!;
function livre(path: Vec2[], H: number, width: number): Array<StairRun | StairLanding> {
  const r = planStairFree(path, H, mono, { width });
  if ('error' in r) throw new Error(r.error);
  return fromSketch(r.parts);
}

/** Caminho com uma curva de θ graus (sentido dado). */
function turnPath(theta: number, sign: 1 | -1, a = 3, b = 3): Vec2[] {
  const t = deg(theta) * sign;
  return [v(0, 0), v(a, 0), v(a + b * Math.cos(t), b * Math.sin(t))];
}

describe('acabamentos em escada livre: sem interseção de volume', () => {
  const cases: Array<[string, () => Array<StairRun | StairLanding>, number]> = [];
  for (const th of [30, 45, 60, 90, 120, 135]) {
    for (const sg of [1, -1] as const) cases.push([`livre ${th}° ${sg > 0 ? 'esq' : 'dir'}`, () => livre(turnPath(th, sg), 2.8, 1.0), 2.8]);
  }
  cases.push(['livre U', () => livre([v(0, 0), v(3, 0), v(3, 1.3), v(0, 1.3)], 2.8, 1.2), 2.8]);
  cases.push(['livre dois giros 45°+60°', () => livre([v(0, 0), v(2.5, 0), v(4.5, 1.5), v(4.5, 4)], 3.2, 1.0), 3.2]);
  cases.push(['L gerado', () => fromSketch(generateLShape({ start: v(0, 0), dir: v(1, 0), width: 1.2, risersFirst: 8, risersSecond: 8, tread: 0.28, turn: 'left' })), 2.8]);
  cases.push(['U gerado invertido', () => fromSketch(generateUShape({ start: v(0, 0), dir: v(1, 0), width: 1.0, risersFirst: 8, risersSecond: 8, tread: 0.28, turn: 'right' })), 2.8]);
  cases.push(['winder L', () => fromSketch(generateWinderL({ start: v(0, 0), dir: v(1, 0), width: 1.0, risersFirst: 6, risersSecond: 6, tread: 0.28, turn: 'left', winderRisers: 4 })), 2.8]);
  for (const sw of [60, 120, 180]) {
    for (const sg of [1, -1]) {
      cases.push([
        `leque ${sw}° ${sg > 0 ? 'anti-horário' : 'horário'}`,
        () => [{ id: 'run', kind: 'run' as const, ...generateFanRun({ center: v(0, 0), innerRadius: 0.4, outerRadius: 1.4, startAngle: 0.3, endAngle: 0.3 + sg * deg(sw), risers: 10 }) } as StairRun],
        2.8,
      ]);
    }
  }
  for (const al of [30, 45, 60, 120, 135]) cases.push([`oblíquo ${al}°`, () => [skewRun(al, 12, 0.28, 1.0)], 2.1]);
  for (const th of [30, 45, 60, 90, 120]) {
    for (const sg of [1, -1] as const) cases.push([`curva sem patamar ${th}° ${sg > 0 ? 'esq' : 'dir'}`, () => [bentRun(th, sg, 6, 6, 0.28, 1.0)], 2.1]);
  }
  cases.push(['caracol 270°', () => [{ id: 'run', kind: 'run' as const, ...generateSpiralRun({ center: v(0, 0), rInner: 0.1, rOuter: 1, startAngle: 0.3, sweep: deg(270), risers: 16 }) } as StairRun], 2.8]);
  cases.push(['caracol 270° invertido', () => [{ id: 'run', kind: 'run' as const, ...generateSpiralRun({ center: v(0, 0), rInner: 0.1, rOuter: 1, startAngle: 0.3, sweep: -deg(270), risers: 16 }) } as StairRun], 2.8]);

  for (const [nome, build, H] of cases) {
    for (const [fn, f] of FINS) {
      it(`${nome} | ${fn}`, () => {
        const s = resolve(build(), f, H);
        expect(overlaps(s)).toEqual([]);
        // Nada sai da planta da escada além do bocel frontal (piso: bocel; espelho: nada), nem nas laterais e cantos de patamar.
        const mm = stairFinishModel(s)!;
        const plan = union(...s.steps.map((x) => asMulti(x.polygon)), ...[...mm.bands.values()].map((b) => asMulti(b)));
        const fora: string[] = [];
        for (const q of mm.solids) {
          const lim = offsetMulti(plan, (q.kind === 'tread' && f.bocel !== null ? f.bocel : 0) + GRID);
          const out = multiArea(difference(asMulti(q.polygon), lim));
          if (out > 1e-6) fora.push(`${q.kind}${q.number} fora da planta por ${out.toExponential(2)} m2`);
          // O que passa da planta é só o bocel: dentro da faixa de largura `bocel` à frente de um degrau, nunca solto num canto.
          if (q.kind === 'tread' && f.bocel !== null) {
            const sobra = multiArea(difference(asMulti(q.polygon), plan));
            const maxSobra = f.bocel * q.edgeLength * 1.05 + 2 * f.te * f.bocel + 1e-6;
            if (sobra > maxSobra) fora.push(`piso${q.number}: sobra ${sobra.toExponential(2)} > bocel ${maxSobra.toExponential(2)}`);
          }
        }
        expect(fora).toEqual([]);
        // Nada some em silêncio: todo degrau tem piso, todo espelho tem faixa e todo degrau (não patamar) leva bocel.
        const m = stairFinishModel(s)!;
        expect(m.solids.filter((x) => x.kind === 'tread')).toHaveLength(s.steps.length);
        expect(m.solids.filter((x) => x.kind === 'riser')).toHaveLength(s.riserCount);
        if (f.bocel !== null) for (const t of m.solids.filter((x) => x.kind === 'tread' && x.stepKind === 'tread' && x.number >= 1)) expect(t.edgeLength, `bocel do piso ${t.number}`).toBeGreaterThan(0);
      });
    }
  }
});
