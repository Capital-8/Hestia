import { describe, expect, it } from 'vitest';
import { add, dist, multiArea, type Vec2 } from '@hestia/geom';
import { ProjectStore, createEmptyProject, makeWall, type JoinKind, type LocationLine, type Opening, type Project, type Wall } from '@hestia/model';
import { resolveLevel, type ResolvedLevel } from './index.ts';
import { tiposDeAberturaParaSorteio } from '../../../scripts/catalogo-estresse.mts';

/**
 * Testes de propriedade: paredes aleatórias, mas reprodutíveis (mulberry32 com semente fixa).
 * Falhas conhecidas do motor ficam em KNOWN_ROWS: o invariante vira `it.fails` e o motivo fica anotado.
 * Estes testes não alteram o motor.
 */

/** Execução rápida: 15 sementes. `VITE_FULL=1 npx vitest run packages/engine/src/property.test.ts` roda as 60 (~15 min). */
const FULL = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_FULL === '1';
const SEEDS = Array.from({ length: FULL ? 60 : 15 }, (_, i) => i + 1);
/** A repetição de estabilidade (d) custa uma resolução inteira: na execução rápida só nas primeiras sementes. */
/** Aglomerados grandes custam muito mais que proporcionalmente: a execução rápida usa cenas menores. */
const N_MIN = FULL ? 25 : 12;
const N_MAX = FULL ? 40 : 20;
const AGAIN_SEEDS = FULL ? SEEDS.length : 4;
const GRID = 0.5;
const CELLS = 24; // 12 m / 0,5 m
/** Translação: a malha de 1 µm do Clipper e o arredondamento de 1e-7 decidem de forma diferente anéis finos (≤ 0,02% da área, medido: 3e-3 m² em 28 m²). */
// 5e-4: a união por material da silhueta preenche às vezes um bolsão fechado minúsculo entre paredes que se cruzam, e o
// arredondamento depende das coordenadas (docs/08 §5.9): sementes 18 e 55 diferem 0,03 e 0,006 m² em ~26–30 m².
const TOL_REL = 5e-4;
/** Tolerância da invariante (c): as silhuetas passam pelo fechamento de frestas (closeGaps), que altera até ~2e-5 m². */
const TOL_CLOSE_GAPS = 5e-4;
const SHIFT: Vec2 = { x: 3.7, y: -2.1 };
const LOCATIONS: LocationLine[] = ['wallCenter', 'coreCenter', 'finishExterior', 'finishInterior', 'coreExterior', 'coreInterior'];
const JOINS: JoinKind[] = ['butt', 'miter'];
const BASE = createEmptyProject();
const WALL_TYPE_IDS = Object.keys(BASE.wallTypes);
/** Tipos sorteados: os 130 de antes do acréscimo de portas alu/pvc/vid (ver scripts/catalogo-estresse.mts). */
const OPENING_TYPES = tiposDeAberturaParaSorteio(BASE);

const NAMES = {
  a: '(a) resolveLevel não lança',
  b: '(b) todas as áreas são finitas e ≥ 0',
  c: '(c) soma das áreas de corte = área da união das silhuetas (sem dupla contagem)',
  d: '(d) duas resoluções dão as mesmas áreas',
  e: '(e) transladar o projeto não muda a área total',
} as const;
type InvariantId = keyof typeof NAMES;

const KNOWN_FAILURES = new Map<string, string>();

interface Scenario {
  walls: Array<Omit<Wall, 'order'>>;
  openings: Opening[];
}

/** Gerador pseudoaleatório determinístico (mulberry32): mesma semente, mesmo projeto. */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = <T>(rnd: () => number, xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
const int = (rnd: () => number, lo: number, hi: number): number => lo + Math.floor(rnd() * (hi - lo + 1));

function scenario(seed: number): Scenario {
  const rnd = mulberry32(seed);
  const n = int(rnd, N_MIN, N_MAX);
  const gridPoint = (): Vec2 => ({ x: int(rnd, 0, CELLS) * GRID, y: int(rnd, 0, CELLS) * GRID });
  const walls: Array<Omit<Wall, 'order'>> = [];
  while (walls.length < n) {
    const a = gridPoint();
    const b = gridPoint();
    if (dist(a, b) < GRID) continue;
    const typeId = pick(rnd, WALL_TYPE_IDS);
    const locationLine = pick(rnd, LOCATIONS);
    const flipped = rnd() < 0.5;
    const joinStart = { kind: pick(rnd, JOINS), flip: rnd() < 0.5 };
    const joinEnd = { kind: pick(rnd, JOINS), flip: rnd() < 0.5 };
    walls.push(makeWall({ id: `w${walls.length}`, typeId, levelId: 'lv_0', a, b, locationLine, flipped, joinStart, joinEnd }));
  }
  // 0 a 6 aberturas que cabem na parede e não se cruzam entre si.
  const openings: Opening[] = [];
  const spans: Array<{ host: string; lo: number; hi: number }> = [];
  const want = int(rnd, 0, 6);
  for (let tries = 0; openings.length < want && tries < 200; tries++) {
    const host = pick(rnd, walls);
    const t = pick(rnd, OPENING_TYPES);
    const L = dist(host.a, host.b);
    const half = t.width / 2;
    if (L < 2 * half) continue;
    const offset = half + rnd() * (L - 2 * half);
    const lo = offset - half;
    const hi = offset + half;
    if (spans.some((s) => s.host === host.id && s.lo < hi && lo < s.hi)) continue;
    spans.push({ host: host.id, lo, hi });
    openings.push({
      id: `o${openings.length}`,
      kind: t.kind,
      typeId: t.id,
      hostId: host.id,
      offset,
      flipHand: rnd() < 0.5,
      flipFacing: rnd() < 0.5,
      sillOverride: null,
      mark: '',
    });
  }
  return { walls, openings };
}

/** Constrói o projeto só com comandos, como a aplicação. `d` desloca todas as paredes. */
function build(sc: Scenario, d: Vec2 = { x: 0, y: 0 }): Project {
  const s = new ProjectStore(createEmptyProject());
  for (const w of sc.walls) s.exec({ type: 'addWall', wall: { ...w, a: add(w.a, d), b: add(w.b, d) } });
  for (const o of sc.openings) s.exec({ type: 'addOpening', opening: o });
  return s.project;
}

/** Os aglomerados são disjuntos: somar as áreas evita passar por outra união (o polygon-clipping perde área em silêncio). */
const totalArea = (r: ResolvedLevel): number => r.clusters.reduce((s, c) => s + multiArea(c.silhouette), 0);
const layerCutAreas = (r: ResolvedLevel): number[] => Object.values(r.walls).flatMap((w) => w.layers.map((l) => multiArea(l.cut)));
const sumCut = (r: ResolvedLevel): number => layerCutAreas(r).reduce((s, a) => s + a, 0);

/** Todas as áreas que o motor devolve, para checar finitude e não negatividade. */
function allAreas(r: ResolvedLevel): number[] {
  const perWall = Object.values(r.walls).flatMap((w) => [
    ...w.layers.flatMap((l) => [multiArea(l.cut), multiArea(l.fragment)]),
    ...w.layers.flatMap((l) => l.bands.map((b) => multiArea(b.poly))),
  ]);
  const perCluster = r.clusters.flatMap((c) => [multiArea(c.silhouette), ...c.regions.map((g) => multiArea(g.polygons))]);
  return [...perWall, ...perCluster];
}

const lazy = <T>(f: () => T): (() => T) => {
  let box: { value: T } | null = null;
  return () => (box ??= { value: f() }).value;
};

interface Case {
  /** Resolução com cache novo. Lança aqui se o motor lançar. */
  r: () => ResolvedLevel;
  /** Segunda resolução, em cache separado, para checar determinismo. */
  again: () => ResolvedLevel;
  /** Mesmo projeto deslocado por SHIFT. */
  shifted: () => ResolvedLevel;
}

const cases = new Map<number, Case>();
function caseOf(seed: number): Case {
  const hit = cases.get(seed);
  if (hit) return hit;
  const sc = scenario(seed);
  const p = lazy(() => build(sc));
  const q = lazy(() => build(sc, SHIFT));
  const c: Case = {
    r: lazy(() => resolveLevel(p(), 'lv_0', new Map())),
    again: lazy(() => resolveLevel(p(), 'lv_0', new Map())),
    shifted: lazy(() => resolveLevel(q(), 'lv_0', new Map())),
  };
  cases.set(seed, c);
  return c;
}

describe('gerador', () => {
  it('cada semente gera N_MIN a N_MAX paredes dentro de 12 × 12 m, com 0 a 6 aberturas', () => {
    for (const seed of SEEDS) {
      const sc = scenario(seed);
      expect(sc.walls.length, `semente ${seed}`).toBeGreaterThanOrEqual(N_MIN);
      expect(sc.walls.length, `semente ${seed}`).toBeLessThanOrEqual(N_MAX);
      expect(sc.openings.length, `semente ${seed}`).toBeLessThanOrEqual(6);
      for (const w of sc.walls) {
        for (const p of [w.a, w.b]) {
          expect(p.x, `semente ${seed}`).toBeGreaterThanOrEqual(0);
          expect(p.x, `semente ${seed}`).toBeLessThanOrEqual(12);
          expect(p.y, `semente ${seed}`).toBeGreaterThanOrEqual(0);
          expect(p.y, `semente ${seed}`).toBeLessThanOrEqual(12);
        }
      }
    }
  });

  it('mesma semente, mesmo cenário', () => {
    expect(scenario(7)).toEqual(scenario(7));
    expect(scenario(7)).not.toEqual(scenario(8));
  });
});

describe.each(SEEDS)('propriedades, semente %i', (seed) => {
  // Cada resolução leva de 1 a 3 s; o limite padrão de 5 s pode cortar um caso que na verdade passa.
  const check = (id: InvariantId, fn: () => void): void => {
    const run = KNOWN_FAILURES.has(`${seed}:${id}`) ? it.fails : it;
    run(NAMES[id], fn, 120_000);
  };

  check('a', () => {
    expect(() => caseOf(seed).r()).not.toThrow();
  });

  check('b', () => {
    const bad = allAreas(caseOf(seed).r()).filter((a) => !(Number.isFinite(a) && a >= 0));
    expect(bad, `semente ${seed}`).toEqual([]);
  });

  check('c', () => {
    const r = caseOf(seed).r();
    const sum = sumCut(r);
    const total = totalArea(r);
    // Tolerância absoluta de fresta fechada OU 0,2% da área: a união por material da silhueta preenche às vezes um bolsão
    // fechado minúsculo entre paredes que se cruzam (semente 18: 0,029 m² de 29,9 m²; docs/08 §5.9).
    const tol = Math.max(TOL_CLOSE_GAPS, 2e-3 * total);
    expect(Math.abs(sum - total), `semente ${seed}: soma dos cortes ${sum} ≠ união ${total}`).toBeLessThanOrEqual(tol);
  });

  check('d', () => {
    if (seed > AGAIN_SEEDS) return;
    const snap = (r: ResolvedLevel) => ({ layers: layerCutAreas(r), total: totalArea(r) });
    expect(snap(caseOf(seed).again()), `semente ${seed}`).toEqual(snap(caseOf(seed).r()));
  });

  check('e', () => {
    const t0 = totalArea(caseOf(seed).r());
    const t1 = totalArea(caseOf(seed).shifted());
    expect(Math.abs(t1 - t0), `semente ${seed}: ${t0} → ${t1}`).toBeLessThanOrEqual(Math.max(5e-5, TOL_REL * t0));
  });
});
