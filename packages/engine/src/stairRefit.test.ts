import { describe, expect, it } from 'vitest';
import { mid, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, defaultStairTypeId, makeLevel, makeStair, type Stair, type StairLanding, type StairRun } from '@hestia/model';
import { generateFanRun, generateLShape, generateUShape, generateWinderL, type StairComponentSketch } from './stairGenerators.ts';
import { generateSpiralRun } from './stairSpiral.ts';
import { regenStairFree } from './stairFreeEdit.ts';
import { MAX_FLIGHT_RISE, refitStairToHeight, riserCountOf, stairFlightHeights } from './stairRefit.ts';
import { resolveStairs } from './stairs.ts';
import { stairQuantities } from './stairQuantities.ts';

const curve = (ax: number, ay: number, bx: number, by: number) => ({ a: { x: ax, y: ay }, b: { x: bx, y: by }, sag: 0 });

/** Lance reto de `n` espelhos, pisos de 0,28 m, entre x=0 e x=1. */
const runN = (n: number): StairRun => ({
  id: 'r1',
  kind: 'run',
  boundaryLeft: [curve(0, 0, 0, (n - 1) * 0.28)],
  boundaryRight: [curve(1, 0, 1, (n - 1) * 0.28)],
  risers: Array.from({ length: n }, (_, i) => curve(0, i * 0.28, 1, i * 0.28)),
  path: [],
});

function storeWith(stair: Partial<Stair> & Pick<Stair, 'components'>, top: number): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_top', name: 'Topo', elevation: top }) });
  s.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_top', ...stair }) });
  return s;
}

const stairOf = (s: ProjectStore): Stair => s.project.elements.st1 as Stair;
const qty = (s: ProjectStore) => stairQuantities(resolveStairs(s.project).find((r) => r.id === 'st1')!);
const firstLast = (run: StairRun): { first: Vec2; last: Vec2 } => ({
  first: mid(run.risers[0]!.a, run.risers[0]!.b),
  last: mid(run.risers[run.risers.length - 1]!.a, run.risers[run.risers.length - 1]!.b),
});

describe('refitStairToHeight (fórmula do tipo, sem acrescentar espelhos)', () => {
  it('estica o lance para o piso da regra 2R + T e mantém o primeiro espelho e o nº de espelhos', () => {
    const s = storeWith({ components: [runN(18)] }, 3);
    const before = firstLast(runN(18));
    const r = refitStairToHeight(s.project, stairOf(s));
    expect(r.skipped).toBeUndefined();
    expect(r.risers).toBe(18);
    expect(r.components).toBeDefined();
    const after = firstLast(r.components![0] as StairRun);
    expect(after.first.y).toBeCloseTo(before.first.y, 9);
    expect(after.last.y).toBeCloseTo(17 * (0.63 - 2 * (3 / 18)), 6);
    expect(after.last.y).toBeGreaterThan(before.last.y);
    expect(riserCountOf({ ...stairOf(s), components: r.components! })).toBe(18);
  });

  it('acima do máximo, recalcula N e acrescenta os degraus no último lance', () => {
    const s = storeWith({ components: [runN(16)] }, 3.2);
    const r = refitStairToHeight(s.project, stairOf(s));
    expect(r).toMatchObject({ risers: 18, added: 2 });
    expect(r.skipped).toBeUndefined();
    expect(r.components).toBeDefined();
    const run = r.components![0] as StairRun;
    expect(run.risers).toHaveLength(18);
    expect(r.riserHeight).toBeCloseTo(3.2 / 18, 9);
    // R = 0,1778 m → T = 0,63 − 2R = 0,2744 m, limitado ao piso mínimo do tipo (0,28 m).
    expect(r.tread).toBeCloseTo(0.28, 6);
    expect(firstLast(run).last.y).toBeCloseTo(17 * 0.28, 6);
  });

  it('modo fixo não mexe', () => {
    const s = storeWith({ components: [runN(18)], riserMode: 'fixed' }, 3.2);
    expect(refitStairToHeight(s.project, stairOf(s)).skipped).toBe('fixed');
  });

  it('caracol/leque: continua com um lance reto novo emendado no último espelho', () => {
    const run: StairRun = { ...runN(18), generatedBy: 'winder' };
    const s = storeWith({ components: [run] }, 3.6);
    const r = refitStairToHeight(s.project, stairOf(s));
    expect(r).toMatchObject({ risers: 20, added: 2 });
    expect(r.components).toHaveLength(2);
    const novo = r.components![1] as StairRun;
    expect(novo.kind).toBe('run');
    expect(novo.risers).toHaveLength(3);
    expect(novo.risers[0]!.a).toEqual(run.risers[17]!.a);
    expect(novo.risers[0]!.b).toEqual(run.risers[17]!.b);
  });

  it('em L: os dois lances esticam e o patamar acompanha o fim do primeiro lance', () => {
    const parts = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, risersFirst: 9, risersSecond: 9, tread: 0.28 });
    const components: Array<StairRun | StairLanding> = parts.map((p, i) =>
      p.kind === 'run' ? { id: `c${i}`, kind: 'run', ...p.run } : { id: `c${i}`, kind: 'landing', ...p.landing },
    );
    const s = storeWith({ components }, 3);
    const first = components[0] as StairRun;
    const landing = components[1] as StairLanding;
    const beforeRunEnd = firstLast(first).last;
    const beforeLanding = landing.boundary[0]!.a;
    const r = refitStairToHeight(s.project, stairOf(s));
    expect(r.components).toHaveLength(3);
    const nextFirst = r.components![0] as StairRun;
    const nextLanding = r.components![1] as StairLanding;
    const afterRunEnd = firstLast(nextFirst).last;
    const afterLanding = nextLanding.boundary[0]!.a;
    expect((nextFirst as StairRun).risers).toHaveLength(9);
    expect(((r.components![2] as StairRun).risers)).toHaveLength(9);
    expect(afterLanding.x - beforeLanding.x).toBeCloseTo(afterRunEnd.x - beforeRunEnd.x, 6);
    expect(afterLanding.y - beforeLanding.y).toBeCloseTo(afterRunEnd.y - beforeRunEnd.y, 6);
    expect(qty(s).riserCount).toBe(18);
  });
});

// ───────────────────────── Matriz forma × cenário (faixa [minRiser, maxRiser] e patamar NBR 9050) ─────────────────────────
//
// Tipo padrão: maxRiser 0,18 / minRiser 0,16 → N_min = ceil(H/0,18), N_max = floor(H/0,16).
// Comportamento escolhido por forma:
// - RETA: sobe acrescentando degraus no fim; desce aparando o fim (≥ 2 espelhos); trecho > 3,20 m é dividido em dois (ou
//   mais) lances com patamar de 1,20 m no ponto que melhor equilibra os trechos, empurrando o resto.
// - L / U: patamares existentes são preservados; degraus novos/removidos vão no ÚLTIMO lance (e, se faltar, no anterior).
//   Trecho > 3,20 m dentro de um lance é dividido por patamar extra (cada lance é reto). Isso mantém o giro original.
// - WINDER (reta + leque + reta): o leque nunca perde espelhos (geometria radial); só as retas são aparadas. Sem patamar,
//   o conjunto é UM trecho contínuo: acima de 3,20 m divide-se uma das retas.
// - LEQUE puro / CARACOL: não há lance reto para aparar nem dividir. Sobe com lance reto novo emendado; desce →
//   `unsupported-shape`; trecho > 3,20 m → `landingNeeded` + message, sem inventar geometria.
// - LIVRE: o planejador regenera com o novo N (remoção/acréscimo são dele); trecho > 3,20 m sem patamar marcado →
//   `landingNeeded` (patamar de croqui livre é decisão do usuário).

const toComps = (parts: StairComponentSketch[]): Array<StairRun | StairLanding> =>
  parts.map((p, i) => (p.kind === 'run' ? { id: `c${i}`, kind: 'run', ...p.run } : { id: `c${i}`, kind: 'landing', ...p.landing }));

const retaN = (n: number): Array<StairRun | StairLanding> => [runN(n)];
const lN = (a: number, b: number) => toComps(generateLShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, risersFirst: a, risersSecond: b, tread: 0.28 }));
const uN = (a: number, b: number) => toComps(generateUShape({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, risersFirst: a, risersSecond: b, tread: 0.28 }));
const winderN = (a: number, b: number) => {
  const c = toComps(generateWinderL({ start: { x: 0, y: 0 }, dir: { x: 1, y: 0 }, turn: 'left', width: 1.2, risersFirst: a, risersSecond: b, tread: 0.28 }));
  return c.map((x, i) => (i === 1 && x.kind === 'run' ? { ...x, generatedBy: 'winder' as const } : x));
};
const lequeN = (n: number): Array<StairRun | StairLanding> => [
  { id: 'lq', kind: 'run', ...generateFanRun({ center: { x: 0, y: 0 }, innerRadius: 0.4, outerRadius: 1.4, startAngle: 0, endAngle: Math.PI, risers: n }), generatedBy: 'winder' },
];
const caracolN = (n: number): Array<StairRun | StairLanding> => [
  { id: 'cr', kind: 'run', ...generateSpiralRun({ center: { x: 0, y: 0 }, rInner: 0.1, rOuter: 0.9, startAngle: 0, sweep: Math.PI * 2, risers: n }) },
];

const fit = (s: ProjectStore) => refitStairToHeight(s.project, stairOf(s));
const heightsOf = (s: ProjectStore, r: { components?: Array<StairRun | StairLanding> }, H: number) =>
  stairFlightHeights({ ...stairOf(s), components: r.components! }, H);
const useType = (s: ProjectStore, patch: { id: string; maxRiser: number; minRiser: number }) => {
  s.exec({ type: 'upsertStairType', stairType: { ...s.project.stairTypes[defaultStairTypeId]!, ...patch } });
  s.exec({ type: 'updateElements', ids: ['st1'], patch: { typeId: patch.id } });
};

describe('refitStairToHeight: faixa de N [minRiser, maxRiser]', () => {
  it('RETA — H sobe pouco: sobe para N_min; sobe muito: acrescenta vários', () => {
    expect(fit(storeWith({ components: retaN(16) }, 3))).toMatchObject({ risers: 17, added: 1, removed: 0 });
    expect(fit(storeWith({ components: retaN(10) }, 3))).toMatchObject({ risers: 17, added: 7, removed: 0 });
  });

  it('RETA — N atual dentro da faixa: mantém o nº, só o espelho/piso variam', () => {
    // H = 2,9: N_min = 17, N_max = 18 → 18 fica.
    const r = fit(storeWith({ components: retaN(18) }, 2.9));
    expect(r).toMatchObject({ risers: 18, added: 0, removed: 0 });
    expect(r.riserHeight).toBeCloseTo(2.9 / 18, 9);
  });

  it('RETA — H desce muito: remove do fim até N_max e reposiciona o último espelho', () => {
    const s = storeWith({ components: retaN(18) }, 2.4);
    const r = fit(s);
    expect(r).toMatchObject({ risers: 15, added: 0, removed: 3 });
    expect(r.skipped).toBeUndefined();
    const run = r.components![0] as StairRun;
    expect(run.risers).toHaveLength(15);
    expect(riserCountOf({ ...stairOf(s), components: r.components! })).toBe(15);
    expect(r.riserHeight).toBeCloseTo(2.4 / 15, 9);
    // Os limites acompanham o último espelho (nada sobra além dele).
    const lastY = firstLast(run).last.y;
    expect(run.boundaryLeft.at(-1)!.b.y).toBeCloseTo(lastY, 6);
    expect(run.boundaryRight.at(-1)!.b.y).toBeCloseTo(lastY, 6);
  });

  it('RETA — H > 3,20 m sem patamar: insere patamar de 1,20 m e divide o lance', () => {
    const s = storeWith({ components: retaN(20) }, 3.6);
    expect(stairFlightHeights(stairOf(s), 3.6)).toEqual([expect.closeTo(3.6, 9)]);
    const r = fit(s);
    expect(r).toMatchObject({ risers: 20, landingsInserted: 1 });
    expect(r.landingNeeded).toBeUndefined();
    const [lo, land, up] = r.components as [StairRun, StairLanding, StairRun];
    expect([lo.kind, land.kind, up.kind]).toEqual(['run', 'landing', 'run']);
    expect(lo.risers.length + up.risers.length).toBe(20);
    expect(Math.min(lo.risers.length, up.risers.length)).toBeGreaterThanOrEqual(2);
    // Patamar: 1,20 m na direção da subida.
    const ys = land.boundary.flatMap((c) => [c.a.y, c.b.y]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1.2, 6);
    // O primeiro espelho do lance de cima fica na borda do patamar.
    expect(Math.min(...up.risers.map((q) => q.a.y))).toBeCloseTo(Math.max(...ys), 6);
    const heights = heightsOf(s, r, 3.6);
    expect(heights.every((h) => h <= MAX_FLIGHT_RISE + 1e-6)).toBe(true);
    expect(heights.reduce((a, b) => a + b, 0)).toBeCloseTo(3.6, 6);
  });

  it('RETA — desnível muito alto: vários patamares, todos os trechos ≤ 3,20 m', () => {
    const s = storeWith({ components: retaN(10) }, 7);
    const r = fit(s);
    expect(r.landingNeeded).toBeUndefined();
    expect(r.landingsInserted).toBeGreaterThanOrEqual(2);
    expect(Math.max(...heightsOf(s, r, 7))).toBeLessThanOrEqual(MAX_FLIGHT_RISE + 1e-6);
    expect(riserCountOf({ ...stairOf(s), components: r.components! })).toBe(r.risers);
  });

  it('modo fixo não acrescenta, remove nem insere patamar', () => {
    const r = fit(storeWith({ components: retaN(20), riserMode: 'fixed' }, 7));
    expect(r.skipped).toBe('fixed');
    expect(r.components).toBeUndefined();
    expect(r.removed).toBe(0);
  });

  it('tipo com minRiser/maxRiser customizados define a faixa', () => {
    const s = storeWith({ components: retaN(21) }, 3);
    useType(s, { id: 'stt_custom', maxRiser: 0.17, minRiser: 0.15 });
    // N_min = ceil(3/0,17) = 18, N_max = floor(3/0,15) = 20 → 21 desce para 20.
    expect(fit(s)).toMatchObject({ risers: 20, removed: 1 });
  });

  it('sem N que cumpra a faixa: skipped com mensagem', () => {
    const s = storeWith({ components: retaN(3) }, 0.35);
    useType(s, { id: 'stt_apertado', maxRiser: 0.17, minRiser: 0.16 });
    const r = fit(s);
    expect(r.skipped).toBe('error');
    expect(r.message).toMatch(/Nenhum nº de espelhos/);
    expect(r.components).toBeUndefined();
  });

  it('L — sobe: degraus novos no último lance, patamar preservado', () => {
    const r = fit(storeWith({ components: lN(9, 9) }, 3.4));
    expect(r).toMatchObject({ risers: 19, added: 1 });
    expect(r.components).toHaveLength(3);
    expect((r.components![2] as StairRun).risers).toHaveLength(10);
    expect(r.landingsInserted).toBeUndefined();
  });

  it('L — desce muito: remove do último lance e, se faltar, do primeiro (≥ 2 por lance), mantendo o patamar', () => {
    const r = fit(storeWith({ components: lN(9, 9) }, 2.0));
    // N_min = 12, N_max = 12 → remove 6, todos do 2º lance (9 → 3).
    expect(r).toMatchObject({ risers: 12, removed: 6 });
    expect((r.components![2] as StairRun).risers).toHaveLength(3);
    expect(r.components![1]!.kind).toBe('landing');
    const s2 = storeWith({ components: lN(9, 9) }, 1.0);
    // N = 6: remove 12; o último lance cede 7 (→ 2) e o primeiro 5 (→ 4).
    const r2 = fit(s2);
    expect(r2).toMatchObject({ risers: 6, removed: 12 });
    expect((r2.components![0] as StairRun).risers).toHaveLength(4);
    expect((r2.components![2] as StairRun).risers).toHaveLength(2);
    expect(riserCountOf({ ...stairOf(s2), components: r2.components! })).toBe(6);
  });

  it('L — lance > 3,20 m: o patamar do giro é mantido e o lance longo ganha patamar extra', () => {
    const s = storeWith({ components: lN(9, 9) }, 6.5);
    const r = fit(s);
    expect(r.risers).toBe(37);
    expect(r.landingNeeded).toBeUndefined();
    expect(Math.max(...heightsOf(s, r, 6.5))).toBeLessThanOrEqual(MAX_FLIGHT_RISE + 1e-6);
    expect(r.components!.filter((c) => c.kind === 'landing').length).toBeGreaterThanOrEqual(2);
  });

  it('U — sobe e desce preservando o patamar', () => {
    expect(fit(storeWith({ components: uN(9, 9) }, 3.4))).toMatchObject({ risers: 19, added: 1 });
    const r2 = fit(storeWith({ components: uN(9, 9) }, 2.4));
    expect(r2).toMatchObject({ risers: 15, removed: 3 });
    expect(r2.components!.map((c) => c.kind)).toEqual(['run', 'landing', 'run']);
  });

  it('U — H > 3,20 m em lance longo divide com patamar', () => {
    const s = storeWith({ components: uN(9, 9) }, 6.5);
    const r = fit(s);
    expect(r.landingNeeded).toBeUndefined();
    expect(Math.max(...heightsOf(s, r, 6.5))).toBeLessThanOrEqual(MAX_FLIGHT_RISE + 1e-6);
  });

  it('WINDER L — o leque não perde espelhos; remoção só nas retas', () => {
    const s = storeWith({ components: winderN(9, 9) }, 2.4);
    // A emenda do leque é reconhecida pelas pontas aparadas (como no resolvedor): N0 = 9 + 3 + 9 − 2 = 19.
    const n0 = riserCountOf(stairOf(s));
    const r = fit(s);
    expect(r).toMatchObject({ risers: 15, removed: n0 - 15 });
    expect((r.components![1] as StairRun).risers).toHaveLength(3);
    expect(riserCountOf({ ...stairOf(s), components: r.components! })).toBe(15);
  });

  it('WINDER L — trecho contínuo > 3,20 m: divide uma das retas com patamar', () => {
    const s = storeWith({ components: winderN(9, 9) }, 3.6);
    const r = fit(s);
    expect(r).toMatchObject({ risers: 20, added: 1, landingsInserted: 1 });
    expect(r.landingNeeded).toBeUndefined();
    expect(Math.max(...heightsOf(s, r, 3.6))).toBeLessThanOrEqual(MAX_FLIGHT_RISE + 1e-6);
    expect(riserCountOf({ ...stairOf(s), components: r.components! })).toBe(20);
  });

  it('LEQUE — sobe com lance reto novo; desce é unsupported-shape; > 3,20 m pede patamar (landingNeeded)', () => {
    expect(fit(storeWith({ components: lequeN(16) }, 3.0))).toMatchObject({ risers: 17, added: 1 });
    const d = fit(storeWith({ components: lequeN(18) }, 2.0));
    expect(d.skipped).toBe('unsupported-shape');
    expect(d.message).toMatch(/remover/);
    const t = fit(storeWith({ components: lequeN(20) }, 3.6));
    expect(t.landingNeeded).toBe(true);
    expect(t.message).toMatch(/patamar/);
    expect(t.landingsInserted).toBeUndefined();
  });

  it('CARACOL — nunca insere patamar nem remove', () => {
    const t = fit(storeWith({ components: caracolN(18) }, 3.6));
    expect(t.landingNeeded).toBe(true);
    expect(t.landingsInserted).toBeUndefined();
    expect(fit(storeWith({ components: caracolN(18) }, 2.0)).skipped).toBe('unsupported-shape');
    const o = fit(storeWith({ components: caracolN(18) }, 3.0));
    expect(o.landingNeeded).toBeUndefined();
    expect(o.removed).toBe(0);
  });

  it('LIVRE — o planejador refaz com o novo N; remove quando a altura cai', () => {
    const base = storeWith({ components: retaN(2) }, 3.0);
    const gen = regenStairFree(stairOf(base), base.project, { freePath: [{ x: 0, y: 0 }, { x: 0, y: 9 }], width: 1, fixed: 'auto' });
    expect('error' in gen).toBe(false);
    if ('error' in gen) return;
    const livre = (top: number) => {
      const s = storeWith({ components: gen.components }, top);
      return refitStairToHeight(s.project, { ...stairOf(s), freePath: gen.freePath });
    };
    const n0 = riserCountOf({ ...stairOf(base), components: gen.components });
    const u = livre(3.6);
    expect(u.skipped).toBeUndefined();
    expect(u.risers).toBeGreaterThanOrEqual(n0);
    const d = livre(2.0);
    expect(d.risers).toBeLessThan(n0);
    expect(d.removed).toBeGreaterThan(0);
  });
});
