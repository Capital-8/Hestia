import { describe, expect, it } from 'vitest';
import {
  generateLShape,
  generateSpiralRun,
  generateUShape,
  resolveRampOne,
  resolveStairOne,
  type StairComponentSketch,
} from '@hestia/engine';
import type { MultiPolygon, Ring, Vec2 } from '@hestia/geom';
import {
  ProjectStore,
  createEmptyProject,
  defaultRampTypeId,
  defaultStairTypeId,
  makeLevel,
  makeRamp,
  makeStair,
  type Id,
  type Project,
  type Ramp,
  type Stair,
  type StairCurve,
  type StairLanding,
  type StairRun,
} from '@hestia/model';
import { componentSnapGeometry } from './componentSnap.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const ln = (a: Vec2, b: Vec2): StairCurve => ({ a, b, sag: 0 });

/** Lance reto de `x0` a `x1` entre y = ±`half`, com um espelho em cada ponta. */
function rampRun(id: string, x0: number, x1: number, half = 0.75): StairRun {
  return {
    id,
    kind: 'run',
    boundaryLeft: [ln(v(x0, half), v(x1, half))],
    boundaryRight: [ln(v(x0, -half), v(x1, -half))],
    risers: [ln(v(x0, -half - 0.25), v(x0, half + 0.25)), ln(v(x1, -half - 0.25), v(x1, half + 0.25))],
    path: [],
  };
}

/** Patamar retangular fechado entre `x0` e `x1`, na mesma largura do lance. */
function rampLanding(id: string, x0: number, x1: number, half = 0.75): StairLanding {
  const corners = [v(x0, -half), v(x1, -half), v(x1, half), v(x0, half)];
  return { id, kind: 'landing', boundary: corners.map((q, i) => ln(q, corners[(i + 1) % 4]!)) };
}

/** Croqui do motor com id e kind, como a escada/rampa guarda no modelo. */
function toModel(cs: StairComponentSketch[]): Array<StairRun | StairLanding> {
  return cs.map((c, i) =>
    c.kind === 'run' ? { id: `r_${i}`, kind: 'run', ...c.run } : { id: `p_${i}`, kind: 'landing', boundary: c.landing.boundary },
  );
}

function projectWithStair(id: Id, components: Array<StairRun | StairLanding>, extra: Partial<Stair> = {}): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addStair', stair: makeStair({ id, typeId: defaultStairTypeId, levelId: 'lv_0', components, ...extra }) });
  return store.project;
}

function projectWithRamp(id: Id, components: Array<StairRun | StairLanding>, extra: Partial<Ramp> = {}): Project {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addRamp', ramp: makeRamp({ id, typeId: defaultRampTypeId, levelId: 'lv_0', components, ...extra }) });
  return store.project;
}

/** Chave com 6 casas, a mesma da deduplicação de `componentSnap`. */
const kp = (q: Vec2): string => `${q.x.toFixed(6)},${q.y.toFixed(6)}`;

/** Chave do segmento com o par ordenado normalizado (a captura não se importa com o sentido). */
const ks = (a: Vec2, b: Vec2): string => {
  const ka = kp(a);
  const kb = kp(b);
  return ka <= kb ? `${ka}|${kb}` : `${kb}|${ka}`;
};

/** Pontos e arestas da captura de um elemento no nível, em chaves comparáveis. */
function captured(p: Project, levelId: Id, hostId: Id): { points: Set<string>; segments: Set<string> } {
  const g = componentSnapGeometry(p, levelId);
  return {
    points: new Set(g.points.filter((q) => q.hostId === hostId).map(kp)),
    segments: new Set(g.segments.filter((s) => s.hostId === hostId).map((s) => ks(s.a, s.b))),
  };
}

/** Todos os vértices do anel viram ponto e todas as arestas (inclusive o fechamento) viram segmento. */
function expectRing(ring: Ring, snap: { points: Set<string>; segments: Set<string> }): void {
  for (const q of ring) expect(snap.points.has(kp(q))).toBe(true);
  for (let i = 1; i < ring.length; i++) expect(snap.segments.has(ks(ring[i - 1]!, ring[i]!))).toBe(true);
  if (ring.length > 2) expect(snap.segments.has(ks(ring[ring.length - 1]!, ring[0]!))).toBe(true);
}

function expectMulti(mp: MultiPolygon, snap: { points: Set<string>; segments: Set<string> }): void {
  for (const poly of mp) for (const ring of poly) expectRing(ring, snap);
}

function expectEdge(a: Vec2, b: Vec2, snap: { points: Set<string>; segments: Set<string> }): void {
  expect(snap.points.has(kp(a))).toBe(true);
  expect(snap.points.has(kp(b))).toBe(true);
  expect(snap.segments.has(ks(a, b))).toBe(true);
}

describe('captura da geometria resolvida (componentSnapResolvido)', () => {
  it('escada reta: vértices dos degraus, da pegada e dos espelhos entram na captura', () => {
    const components: StairComponentSketch[] = [
      {
        kind: 'run',
        run: {
          boundaryLeft: [ln(v(0, 0.5), v(4, 0.5))],
          boundaryRight: [ln(v(0, -0.5), v(4, -0.5))],
          risers: [ln(v(1, -1), v(1, 1)), ln(v(2, -1), v(2, 1)), ln(v(3, -1), v(3, 1))],
          path: [],
        },
      },
    ];
    const p = projectWithStair('st_reta', toModel(components));
    const stair = p.elements['st_reta'] as Stair;
    const rs = resolveStairOne(p, stair);
    expect(rs).not.toBeNull();
    expect(rs!.steps.length).toBeGreaterThan(0);
    expect(rs!.footprint.length).toBeGreaterThan(0);

    const snap = captured(p, 'lv_0', stair.id);
    for (const step of rs!.steps) expectRing(step.polygon, snap);
    expectMulti(rs!.footprint, snap);
    for (const r of rs!.risers) expectEdge(r.a, r.b, snap);
  });

  it('escada em L, em U e caracol: nenhum canto dos passos se perde na deduplicação', () => {
    const turn = { start: v(0, 0), dir: v(0, 1), width: 1, tread: 0.28, turn: 'left' as const };
    const shapes: Array<[string, StairComponentSketch[]]> = [
      ['L', generateLShape({ ...turn, risersFirst: 8, risersSecond: 8 })],
      ['U', generateUShape({ ...turn, risersFirst: 9, risersSecond: 9 })],
      [
        'caracol',
        [
          {
            kind: 'run',
            run: generateSpiralRun({ center: v(0, 0), rInner: 0.2, rOuter: 1, startAngle: 0, sweep: 2 * Math.PI, risers: 17 }),
          },
        ],
      ],
    ];
    for (const [name, components] of shapes) {
      const p = projectWithStair(`st_${name}`, toModel(components));
      const stair = p.elements[`st_${name}`] as Stair;
      const rs = resolveStairOne(p, stair);
      expect(rs, name).not.toBeNull();
      expect(rs!.steps.length, name).toBeGreaterThan(0);
      const snap = captured(p, 'lv_0', stair.id);
      for (const step of rs!.steps) expectRing(step.polygon, snap);
      expectMulti(rs!.footprint, snap);
    }
  });

  it('rampa: vértices de lances, patamares, pegada e bordas de início/fim entram na captura', () => {
    const components = [rampRun('r1', 0, 4), rampLanding('p1', 4, 6), rampRun('r2', 6, 10)];
    const p = projectWithRamp('rp_reta', components);
    const ramp = p.elements['rp_reta'] as Ramp;
    const rr = resolveRampOne(p, ramp);
    expect(rr).not.toBeNull();
    expect(rr!.flights).toHaveLength(2);
    expect(rr!.landings).toHaveLength(1);

    const snap = captured(p, 'lv_0', ramp.id);
    for (const f of rr!.flights) {
      expectRing(f.polygon, snap);
      expectEdge(f.startEdge[0], f.startEdge[1], snap);
      expectEdge(f.endEdge[0], f.endEdge[1], snap);
    }
    for (const l of rr!.landings) expectRing(l.polygon, snap);
    expectMulti(rr!.footprint, snap);
  });

  it('a escada/rampa que chega no nível entra na captura; a que só nasce acima não', () => {
    const straight = toModel([
      {
        kind: 'run',
        run: {
          boundaryLeft: [ln(v(0, 0.5), v(4, 0.5))],
          boundaryRight: [ln(v(0, -0.5), v(4, -0.5))],
          risers: [ln(v(0, -1), v(0, 1)), ln(v(2, -1), v(2, 1)), ln(v(4, -1), v(4, 1))],
          path: [],
        },
      },
    ]);
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Pavimento 3', elevation: 6 }) });
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st_baixa', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: straight }) });
    store.exec({
      type: 'addRamp',
      ramp: makeRamp({ id: 'rp_baixa', typeId: defaultRampTypeId, levelId: 'lv_0', topLevelId: 'lv_1', components: [rampRun('rr', 10, 20)] }),
    });
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st_alta', typeId: defaultStairTypeId, levelId: 'lv_1', topLevelId: 'lv_2', components: straight }) });
    // Escada que nasce no térreo e só chega no 3º pavimento atravessa o 2º: entra por sobreposição.
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st_atravessa', typeId: defaultStairTypeId, levelId: 'lv_0', topLevelId: 'lv_2', components: straight }) });
    const p = store.project;

    const lv1 = componentSnapGeometry(p, 'lv_1');
    expect(lv1.points.some((q) => q.hostId === 'st_baixa')).toBe(true);
    expect(lv1.points.some((q) => q.hostId === 'rp_baixa')).toBe(true);
    expect(lv1.points.some((q) => q.hostId === 'st_atravessa')).toBe(true);

    const lv0 = componentSnapGeometry(p, 'lv_0');
    expect(lv0.points.some((q) => q.hostId === 'st_alta')).toBe(false);
  });

  it('escada sem passos (topo não acima da base) ainda gera os pontos e arestas do croqui', () => {
    const components: StairComponentSketch[] = [
      {
        kind: 'run',
        run: {
          boundaryLeft: [ln(v(0, 0.5), v(4, 0.5))],
          boundaryRight: [ln(v(0, -0.5), v(4, -0.5))],
          risers: [ln(v(1, -1), v(1, 1)), ln(v(2, -1), v(2, 1)), ln(v(3, -1), v(3, 1))],
          path: [],
        },
      },
    ];
    // Topo no próprio nível: o resolvedor não gera degrau nenhum; o croqui não pode sumir da captura.
    const p = projectWithStair('st_sem_passo', toModel(components), { topLevelId: 'lv_0' });
    const rs = resolveStairOne(p, p.elements['st_sem_passo'] as Stair);
    expect(rs!.steps).toEqual([]);

    const snap = captured(p, 'lv_0', 'st_sem_passo');
    expect(snap.points.has(kp(v(0, 0.5)))).toBe(true);
    expect(snap.points.has(kp(v(4, -0.5)))).toBe(true);
    expect(snap.segments.has(ks(v(0, 0.5), v(4, 0.5)))).toBe(true);
  });

  it('rampa sem lances resolvidos ainda gera os pontos e arestas do croqui', () => {
    // Lance sem as duas bordas: a rampa não resolve peça, mas o croqui continua na captura.
    const p = projectWithRamp('rp_sem_lance', [
      {
        id: 'r1',
        kind: 'run',
        boundaryLeft: [ln(v(10, 0.5), v(14, 0.5))],
        boundaryRight: [ln(v(10, -0.5), v(14, -0.5))],
        risers: [],
        path: [],
      },
    ]);
    const rr = resolveRampOne(p, p.elements['rp_sem_lance'] as Ramp);
    expect(rr!.flights).toEqual([]);
    expect(rr!.landings).toEqual([]);

    const snap = captured(p, 'lv_0', 'rp_sem_lance');
    expect(snap.points.has(kp(v(10, 0.5)))).toBe(true);
    expect(snap.points.has(kp(v(14, -0.5)))).toBe(true);
    expect(snap.segments.has(ks(v(10, 0.5), v(14, 0.5)))).toBe(true);
  });
});
