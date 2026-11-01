import { describe, expect, it } from 'vitest';
import { asMulti, dist, multiArea, ringArea, union, type Vec2 } from '@hestia/geom';
import { createEmptyProject, defaultStairTypeId, makeStair, type Project, type Stair, type StairLanding, type StairRun, type StairType } from '@hestia/model';
import { generateFanRun, generateLShape, generateStraightRun, generateUShape, generateWinderL, riserCountFor, treadFor, treadRuleOf, type StairComponentSketch } from './stairGenerators.ts';
import { generateSpiralRun } from './stairSpiral.ts';
import { regenStairFree } from './stairFreeEdit.ts';
import { MAX_FLIGHT_RISE, refitStairToHeight, riserCountOf, stairFlightHeights, type StairRefitResult } from './stairRefit.ts';
import { orderRisers, trimRisers } from './stairSketchGeom.ts';
import { resolveStairs } from './stairs.ts';

/**
 * Matriz de integração do reajuste por cota: escadas REAIS (geradores do motor) × alturas × tipos × modos. Cada combinação
 * é conferida contra invariantes; as falhas são agrupadas por causa (uma causa = um defeito) e o teste final exige zero.
 */

type Comp = StairRun | StairLanding;

// ───────────────────────────── Tipos de escada ─────────────────────────────

const base = (): StairType => ({ ...createEmptyProject().stairTypes[defaultStairTypeId]! });
const mkType = (id: string, patch: Partial<StairType>): StairType => ({ ...base(), id, ...patch });

const TYPES: StairType[] = [
  mkType('t_nbr', {}),
  mkType('t_custom', { maxRiser: 0.175, minRiser: 0.15, minTread: 0.25, calcRiserFactor: 2, calcTreadFactor: 1, calcTarget: 0.64, maxTread: 0.35 }),
  mkType('t_ab', { maxRiser: 0.19, minRiser: 0.17, minTread: 0.26, calcRiserFactor: 1, calcTreadFactor: 1, calcTarget: 0.46, maxTread: 0.30 }),
  mkType('t_estreito', { maxRiser: 0.18, minRiser: 0.175 }),
];

// ───────────────────────────── Construção ─────────────────────────────

const toComps = (parts: StairComponentSketch[], tag = 'c'): Comp[] =>
  parts.map((p, i) => (p.kind === 'run' ? { id: `${tag}${i}`, kind: 'run', ...p.run } : { id: `${tag}${i}`, kind: 'landing', ...p.landing }));

const O = { x: 0, y: 0 };
const X = { x: 1, y: 0 };
const TR = 0.28;

const reta = (n: number, w: number): Comp[] => [{ id: 'r0', kind: 'run', ...generateStraightRun({ start: O, dir: X, width: w, risers: n, tread: TR }), generatedBy: 'straight' }];
const L = (a: number, b: number, w: number): Comp[] => toComps(generateLShape({ start: O, dir: X, turn: 'left', width: w, risersFirst: a, risersSecond: b, tread: TR }));
const U = (a: number, b: number, w: number): Comp[] => toComps(generateUShape({ start: O, dir: X, turn: 'right', width: w, risersFirst: a, risersSecond: b, tread: TR }));
const winder = (a: number, b: number, w: number, W = 3): Comp[] =>
  toComps(generateWinderL({ start: O, dir: X, turn: 'left', width: w, risersFirst: a, risersSecond: b, tread: TR, winderRisers: W })).map((c, i) =>
    i === 1 && c.kind === 'run' ? { ...c, generatedBy: 'winder' as const } : c,
  );
const leque = (n: number, w: number): Comp[] => [
  { id: 'lq', kind: 'run', ...generateFanRun({ center: O, innerRadius: 0.4, outerRadius: 0.4 + w, startAngle: 0, endAngle: Math.PI, risers: n }), generatedBy: 'winder' },
];
const caracol = (n: number, w: number, sweep = Math.PI * 2): Comp[] => [
  { id: 'cr', kind: 'run', ...generateSpiralRun({ center: O, rInner: 0.1, rOuter: 0.1 + w, startAngle: 0, sweep, risers: n }) },
];

/** Lances retos em linha (+x). `landing`: patamar de 1,20 m entre eles; senão dividem o espelho de emenda. */
function cadeia(ns: number[], w: number, landing: boolean): Comp[] {
  const out: Comp[] = [];
  let x = 0;
  ns.forEach((n, i) => {
    const run = { id: `r${i}`, kind: 'run' as const, ...generateStraightRun({ start: { x, y: 0 }, dir: X, width: w, risers: n, tread: TR }), generatedBy: 'straight' as const };
    out.push(run);
    const end = x + (n - 1) * TR;
    if (i < ns.length - 1) {
      if (landing) {
        const D = 1.2;
        out.push({
          id: `p${i}`,
          kind: 'landing',
          boundary: [
            { a: { x: end, y: -w / 2 }, b: { x: end, y: w / 2 }, sag: 0 },
            { a: { x: end, y: w / 2 }, b: { x: end + D, y: w / 2 }, sag: 0 },
            { a: { x: end + D, y: w / 2 }, b: { x: end + D, y: -w / 2 }, sag: 0 },
            { a: { x: end + D, y: -w / 2 }, b: { x: end, y: -w / 2 }, sag: 0 },
          ],
        });
        x = end + D;
      } else x = end;
    }
  });
  return out;
}

// ───────────────────────────── Projeto por altura ─────────────────────────────

function mkProject(type: StairType, H: number, comps: Comp[], mode: 'auto' | 'fixed', freePath?: Vec2[]): { p: Project; s: Stair } {
  const p0 = createEmptyProject();
  const s = { ...makeStair({ id: 'st1', typeId: type.id, levelId: 'lv_0', topLevelId: 'lv_1', components: comps, riserMode: mode, ...(freePath ? { freePath } : {}) }), order: 1 } as Stair;
  const p: Project = {
    ...p0,
    levels: p0.levels.map((l) => (l.id === 'lv_1' ? { ...l, elevation: H } : l)),
    stairTypes: { ...p0.stairTypes, [type.id]: type },
    elements: { st1: s },
  };
  return { p, s };
}

// ───────────────────────────── Medidas auxiliares ─────────────────────────────

const mid2 = (a: Vec2, b: Vec2): Vec2 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const isRun = (c: Comp): c is StairRun => c.kind === 'run';

function distToSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Pontas aparadas (mesmo critério do resolvedor) do primeiro/último espelho de subida. */
function endR(run: StairRun, which: 'first' | 'last'): { a: Vec2; b: Vec2 } {
  const o = orderRisers(run);
  const g = trimRisers(run)[which === 'first' ? o[0]! : o[o.length - 1]!]!;
  return { a: g.a, b: g.b };
}
const sameLine = (p: { a: Vec2; b: Vec2 }, q: { a: Vec2; b: Vec2 }): boolean =>
  (dist(p.a, q.a) <= 2e-3 && dist(p.b, q.b) <= 2e-3) || (dist(p.a, q.b) <= 2e-3 && dist(p.b, q.a) <= 2e-3);
const onBoundary = (pt: Vec2, l: StairLanding): boolean => l.boundary.some((c) => distToSeg(pt, c.a, c.b) <= 3e-3);

function shapeHeights(s: Stair, H: number): number[] {
  return stairFlightHeights(s, H);
}

// ───────────────────────────── Conferência ─────────────────────────────

type Failures = Map<string, string[]>;
const note = (f: Failures, cause: string, label: string): void => {
  const list = f.get(cause) ?? [];
  if (list.length < 6) list.push(label);
  else if (list.length === 6) list.push('…');
  f.set(cause, list);
  counts.set(cause, (counts.get(cause) ?? 0) + 1);
};
const counts = new Map<string, number>();
/** Casos que o motor recusa por limitação conhecida do croqui (não é defeito): contagem informativa. */
const infos = new Map<string, number>();
const info = (k: string): void => void infos.set(k, (infos.get(k) ?? 0) + 1);

interface Case {
  shape: string;
  type: StairType;
  H: number;
  comps: Comp[];
  mode: 'auto' | 'fixed';
  freePath?: Vec2[];
  width: number;
  /** Forma sem lance reto para aparar (leque/caracol/livre): a remoção pode ser recusada. */
  fan?: boolean;
}

function checkCase(f: Failures, c: Case): void {
  const label = `${c.shape} w=${c.width} N0=? tipo=${c.type.id} H=${c.H.toFixed(4)} ${c.mode}`;
  const fail = (cause: string): void => note(f, `${c.shape}: ${cause}`, label);
  const { p, s } = mkProject(c.type, c.H, c.comps, c.mode, c.freePath);
  let r: StairRefitResult;
  try {
    r = refitStairToHeight(p, s);
  } catch (e) {
    fail(`lançou ${(e as Error).message}`);
    return;
  }
  if (c.mode === 'fixed') {
    if (r.skipped !== 'fixed' || r.components) fail('modo fixo mexeu');
    return;
  }
  const t = c.type;
  const nMin = riserCountFor(c.H, t.maxRiser);
  const nMax = Math.floor(c.H / t.minRiser + 1e-9);
  if (nMin > nMax) {
    if (r.skipped !== 'error' || r.components) fail('sem N válido mas não recusou');
    return;
  }
  if (r.skipped === 'unsupported-shape') {
    info(`${c.shape}: unsupported-shape`);
    if (r.components) fail('unsupported-shape devolveu componentes');
    if (!c.fan && r.removed === 0) fail('unsupported-shape sem remoção (inesperado)');
    return;
  }
  if (r.skipped === 'error') {
    fail(`error inesperado: ${r.message}`);
    return;
  }
  const comps = r.components ?? c.comps;
  const s2: Stair = { ...s, components: comps, ...(r.freePath ? { freePath: r.freePath } : {}), ...(r.manualLandings ? { manualLandings: r.manualLandings } : {}) };
  const { p: p2 } = mkProject(t, c.H, comps, 'auto', s2.freePath);
  const N = riserCountOf(s2);
  const res = resolveStairs({ ...p2, elements: { st1: { ...s2, order: 1 } as Stair } }).find((x) => x.id === 'st1');
  if (N !== r.risers) fail('riserCountOf != r.risers');
  if (res && res.riserCount !== N) fail(`riserCountOf (${N}) != resolveStairs.riserCount (${res.riserCount})`);
  // N na faixa e R dentro de [minRiser, maxRiser].
  if (N < nMin || N > nMax) fail('N fora de [N_min, N_max]');
  const R = c.H / N;
  if (R > t.maxRiser + 1e-9 || R < t.minRiser - 1e-9) fail('R fora de [minRiser, maxRiser]');
  if (Math.abs(r.riserHeight - R) > 1e-9) fail('riserHeight != H/N');
  const T = treadFor(R, treadRuleOf(t));
  if (Math.abs(r.tread - T) > 1e-9) fail('tread != fórmula do tipo');
  // Piso real nos lances retos gerados pelo refit (não livre).
  if (!c.freePath && r.components) {
    for (const k of r.components) {
      if (!isRun(k) || k.generatedBy === 'winder' || k.generatedBy === 'spiral' || (k as { spiral?: unknown }).spiral) continue;
      const o = orderRisers(k);
      for (let i = 1; i < o.length; i++) {
        const d = dist(mid2(k.risers[o[i]!]!.a, k.risers[o[i]!]!.b), mid2(k.risers[o[i - 1]!]!.a, k.risers[o[i - 1]!]!.b));
        if (Math.abs(d - T) > 1e-6) {
          fail('piso real do lance reto != T');
          break;
        }
      }
    }
  }
  // Lances: ≥ 2 espelhos; contiguidade; largura.
  comps.forEach((k, i) => {
    if (!isRun(k)) return;
    if (k.risers.length < 2) fail('lance com < 2 espelhos');
    const prev = comps[i - 1];
    if (prev && isRun(prev)) {
      if (!sameLine(endR(prev, 'last'), endR(k, 'first'))) fail('lances consecutivos sem patamar não emendam');
    } else if (prev && !isRun(prev)) {
      const before = comps[i - 2];
      if (before && isRun(before)) {
        const a = endR(before, 'last');
        if (!onBoundary(a.a, prev) || !onBoundary(a.b, prev)) fail('lance anterior não toca o patamar');
      }
      const b = endR(k, 'first');
      if (!onBoundary(b.a, prev) || !onBoundary(b.b, prev)) fail('lance seguinte não sai da borda do patamar');
    }
  });
  if (!c.freePath) {
    const w0 = c.comps.filter(isRun).map((k) => dist(k.risers[0]!.a, k.risers[0]!.b));
    const w1 = comps.filter(isRun).map((k) => dist(k.risers[0]!.a, k.risers[0]!.b));
    if (w1.some((w) => Math.abs(w - w0[0]!) > 0.03)) fail('largura mudou');
    // Primeiro espelho imóvel.
    const f0 = c.comps[0]!;
    const f1 = comps[0]!;
    if (isRun(f0) && isRun(f1)) {
      const a = endR(f0, 'first');
      const b = endR(f1, 'first');
      if (!sameLine(a, b)) fail('primeiro espelho se moveu');
    }
  }
  // Sobreposição: soma das áreas dos degraus = área da união (tolerância de arredondamento).
  if (res && res.steps.length > 0 && !c.freePath) {
    const sum = res.steps.reduce((a, st) => a + Math.abs(ringArea(st.polygon)), 0);
    const un = multiArea(union(...res.steps.map((st) => asMulti(st.polygon))));
    if (sum - un > 0.02 + 0.01 * sum) fail(`degraus/patamares sobrepostos (soma ${sum.toFixed(3)} união ${un.toFixed(3)})`);
  }
  // Trechos contínuos ≤ 3,20 m (exceto landingNeeded).
  const worst = Math.max(0, ...shapeHeights(s2, c.H));
  if (worst > MAX_FLIGHT_RISE + 1e-6 && !r.landingNeeded) fail(`trecho de ${worst.toFixed(3)} m sem landingNeeded`);
  if (r.landingNeeded && worst <= MAX_FLIGHT_RISE + 1e-6) fail('landingNeeded sem trecho > 3,20 m');
  // Idempotência.
  try {
    const r2 = refitStairToHeight({ ...p2, elements: { st1: { ...s2, order: 1 } as Stair } }, s2);
    if (r2.components) {
      // Admite pequena deriva numérica, mas não mudança de contagem.
      if (r2.risers !== r.risers || r2.components.length !== comps.length) fail('não idempotente (estrutura)');
      else if (!c.freePath) {
        const a = r2.components.flatMap((k) => (isRun(k) ? k.risers : [])).map((q) => mid2(q.a, q.b));
        const b = comps.flatMap((k) => (isRun(k) ? k.risers : [])).map((q) => mid2(q.a, q.b));
        if (a.length !== b.length || a.some((q, i) => dist(q, b[i]!) > 1e-6)) fail('não idempotente (geometria)');
      }
    } else if (r2.skipped !== 'no-change') fail(`2º reajuste: ${r2.skipped}`);
    if (r2.risers !== r.risers) fail('2º reajuste mudou N');
  } catch (e) {
    fail(`2º reajuste lançou ${(e as Error).message}`);
  }
}

// ───────────────────────────── Alturas ─────────────────────────────

function heightsFor(t: StairType): number[] {
  const hs = new Set<number>();
  for (let h = 0.5; h <= 6.01; h += 0.5) hs.add(Math.round(h * 1e4) / 1e4);
  for (let h = 0.55; h <= 6.01; h += 0.85) hs.add(Math.round(h * 1e4) / 1e4);
  for (const h of [3.2, 3.2 + 1e-4, 3.21, 3.25, 3.0, 2.8, 2.9, 2.99]) hs.add(h);
  for (const n of [3, 10, 17, 18, 19, 24]) {
    hs.add(n * t.maxRiser);
    hs.add(n * t.minRiser);
    hs.add(n * t.maxRiser + 1e-3);
  }
  return [...hs].filter((h) => h > 0.3 && h < 6.2).sort((a, b) => a - b);
}

// ───────────────────────────── Famílias ─────────────────────────────

interface Family {
  name: string;
  fan?: boolean;
  /** Variantes (rótulo, construtor por largura). */
  variants: Array<{ tag: string; build: (w: number) => Comp[] }>;
}

const freeComps = (path: Vec2[], w: number): { comps: Comp[]; path: Vec2[] } | null => {
  const t = TYPES[0]!;
  const { p, s } = mkProject(t, 3.0, [reta(2, w)[0]!], 'auto');
  const g = regenStairFree(s, p, { freePath: path, width: w, fixed: 'auto' });
  return 'error' in g ? null : { comps: g.components, path: g.freePath };
};

const FAMILIES: Family[] = [
  { name: 'RETA', variants: [8, 14, 18, 22, 30].map((n) => ({ tag: `n${n}`, build: (w: number) => reta(n, w) })) },
  { name: 'RETAS-EMENDADAS', variants: [[8, 8], [10, 9, 8]].map((ns) => ({ tag: ns.join('+'), build: (w: number) => cadeia(ns, w, false) })) },
  { name: 'RETAS-PATAMAR', variants: [[8, 8], [9, 9, 9], [6, 12]].map((ns) => ({ tag: ns.join('+'), build: (w: number) => cadeia(ns, w, true) })) },
  { name: 'L', variants: [[6, 6], [9, 9], [12, 6], [4, 14]].map(([a, b]) => ({ tag: `${a}+${b}`, build: (w: number) => L(a!, b!, w) })) },
  { name: 'U', variants: [[6, 6], [9, 9], [12, 6]].map(([a, b]) => ({ tag: `${a}+${b}`, build: (w: number) => U(a!, b!, w) })) },
  { name: 'WINDER', variants: [[6, 6, 3], [9, 9, 3], [3, 3, 2]].map(([a, b, W]) => ({ tag: `${a}+W${W}+${b}`, build: (w: number) => winder(a!, b!, w, W) })) },
  { name: 'LEQUE', fan: true, variants: [8, 18, 22].map((n) => ({ tag: `n${n}`, build: (w: number) => leque(n, w) })) },
  { name: 'CARACOL', fan: true, variants: [10, 20].map((n) => ({ tag: `n${n}`, build: (w: number) => caracol(n, w, n * 0.35) })) },
];

const LIVRE_PATHS: Array<{ tag: string; path: Vec2[] }> = [
  { tag: 'reta', path: [{ x: 0, y: 0 }, { x: 9, y: 0 }] },
  { tag: 'L', path: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 5 }] },
  { tag: 'U', path: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 2.2 }, { x: 0, y: 2.2 }] },
];

const WIDTHS = [0.9, 1.5];

describe('regressões da matriz', () => {
  it('winder gerado: riserCountOf bate com o resolvedor (emenda do leque reconhecida pelas pontas aparadas)', () => {
    const comps = winder(9, 9, 1.2);
    const { p, s } = mkProject(TYPES[0]!, 3.4, comps, 'auto');
    expect(riserCountOf(s)).toBe(9 + 3 + 9 - 2);
    expect(resolveStairs(p)[0]!.riserCount).toBe(19);
  });

  it('leque/caracol: o lance reto novo emenda no último espelho (N do reajuste == N do resolvedor)', () => {
    for (const comps of [leque(14, 1.2), caracol(16, 1.2, 5)]) {
      const { p, s } = mkProject(TYPES[0]!, 3.6, comps, 'auto');
      const r = refitStairToHeight(p, s);
      expect(r.components!.length).toBeGreaterThanOrEqual(2);
      const s2 = { ...s, components: r.components! };
      expect(riserCountOf(s2)).toBe(r.risers);
      expect(resolveStairs({ ...p, elements: { st1: s2 } })[0]!.riserCount).toBe(r.risers);
    }
  });

  it('livre: N = 18 com no máximo 17 espelhos por lance não deixa 1 espelho sobrando', () => {
    const g = freeComps([{ x: 0, y: 0 }, { x: 9, y: 0 }], 0.9)!;
    const { p, s } = mkProject(TYPES[0]!, 3.2001, g.comps, 'auto', g.path);
    const r = refitStairToHeight(p, s);
    expect(r.skipped).toBeUndefined();
    expect(r.risers).toBe(18);
  });

  // Decisão de produto em aberto: lance seguido de outro lance sem patamar (emenda) não é aparado no meio; só o último lance
  // cede espelhos (≥ 2 por lance). Aparar o lance anterior exigiria deslocar o seguinte e a emenda. Hoje devolve
  // `unsupported-shape` com mensagem.
  it.todo('retas emendadas: ceder espelhos também do lance anterior quando o último não basta');
});

describe('matriz de reajuste por cota', () => {
  const failures: Failures = new Map();
  const tested = new Map<string, number>();
  const bump = (k: string): void => void tested.set(k, (tested.get(k) ?? 0) + 1);

  it.each(FAMILIES.map((f) => [f.name, f] as const))('%s', (_n, fam) => {
    for (const t of TYPES) {
      const hs = heightsFor(t);
      for (const v of fam.variants) {
        for (const w of WIDTHS) {
          const comps = v.build(w);
          for (const H of hs) {
            checkCase(failures, { shape: fam.name, type: t, H, comps, mode: 'auto', width: w, fan: fam.fan });
            bump(fam.name);
          }
          for (const H of [3.2]) {
            checkCase(failures, { shape: fam.name, type: t, H, comps, mode: 'fixed', width: w, fan: fam.fan });
            bump(fam.name);
          }
        }
      }
    }
  }, 600_000);

  it('LIVRE', () => {
    for (const t of TYPES) {
      const hs = heightsFor(t);
      for (const lp of LIVRE_PATHS) {
        for (const w of WIDTHS) {
          const g = freeComps(lp.path, w);
          if (!g) continue;
          for (const H of hs) {
            checkCase(failures, { shape: `LIVRE-${lp.tag}`, type: t, H, comps: g.comps, mode: 'auto', freePath: g.path, width: w, fan: true });
            bump('LIVRE');
          }
        }
      }
    }
  }, 600_000);

  it('relatório e zero falhas', () => {
    const resumo: Record<string, unknown> = { combinacoes: Object.fromEntries(tested), infos: Object.fromEntries(infos) };
    const causas = [...failures.entries()].map(([k, v]) => ({ causa: k, n: counts.get(k), exemplos: v.slice(0, 2) }));
    if (process.env.MATRIZ_VERBOSE) console.log(JSON.stringify({ resumo, causas }, null, 1));
    expect(causas).toEqual([]);
  });
});
