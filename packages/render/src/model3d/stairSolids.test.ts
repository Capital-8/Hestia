import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { generateLShape, generateStraightRun, pieceVolume, resolveStairsOnLevel, stairArrivalTop, stairArrivalTopZ, stairBody, type ResolvedStair, type ResolvedStairStep, type StairComponentSketch } from '@hestia/engine';
import { DEFAULT_STAIR_TYPES, ProjectStore, createEmptyProject, defaultStairTypeId, makeStair, type StairLanding, type StairRun } from '@hestia/model';
import { straightStair } from '../stairFixture.helper.ts';
import { buildStairSolids, riserSlab } from './stairSolids.ts';
import type { SolidBatch } from './solids.ts';

/** Volume por teorema da divergência (malha fechada e bem orientada), como em solids.test.ts. */
function volume(b: { positions: number[]; indices: number[] }): number {
  let v = 0;
  const p = (k: number) => [b.positions[k * 3]!, b.positions[k * 3 + 1]!, b.positions[k * 3 + 2]!] as const;
  for (let i = 0; i < b.indices.length; i += 3) {
    const [p0, p1, p2] = [p(b.indices[i]!), p(b.indices[i + 1]!), p(b.indices[i + 2]!)];
    v += (p0[0] * (p1[1] * p2[2] - p1[2] * p2[1]) - p0[1] * (p1[0] * p2[2] - p1[2] * p2[0]) + p0[2] * (p1[0] * p2[1] - p1[1] * p2[0])) / 6;
  }
  return v;
}

const total = (batches: SolidBatch[]): number => batches.reduce((s, b) => s + Math.abs(volume(b)), 0);

/** Soma dos volumes das peças monolíticas (engine), com a mesma espessura de chegada padrão (0,15 m). */
const piecesVolume = (s: ResolvedStair): number => stairBody(s, { slabThickness: 0.15 }).pieces.reduce((acc, p) => acc + pieceVolume(p), 0);

const N = 10;
const P = 0.28;
const H = 0.175;
const W = 1;
const MONO = { ...DEFAULT_STAIR_TYPES[0]! };
const ASSEMBLED = { ...DEFAULT_STAIR_TYPES[1]! };

/** Degrau de patamar no topo (sem espelho): retângulo de W × 1,2 m na cota final. Só para o estilo piso e espelho. */
function withLanding(s: ResolvedStair): ResolvedStair {
  const landing: ResolvedStairStep = {
    componentIndex: 1,
    kind: 'landing',
    index: 0,
    polygon: [
      { x: 0, y: N * P },
      { x: W, y: N * P },
      { x: W, y: N * P + 1.2 },
      { x: 0, y: N * P + 1.2 },
    ],
    z: s.topZ,
  };
  return { ...s, steps: [...s.steps, landing] };
}

/** Componentes do croqui (engine) com id, como a escada guarda no modelo. */
function toModel(cs: StairComponentSketch[]): Array<StairRun | StairLanding> {
  return cs.map((c, i) => (c.kind === 'run' ? { id: `r_${i}`, kind: 'run', ...c.run } : { id: `p_${i}`, kind: 'landing', boundary: c.landing.boundary }));
}

/** Escada em L de dois lances de 8 espelhos (N = 16, H = 2,80 m) com patamar quadrado, do tipo padrão (monolítico). */
function lStair(): ResolvedStair {
  const comps = generateLShape({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risersFirst: 8, risersSecond: 8, tread: P, turn: 'left' });
  const store = new ProjectStore(createEmptyProject());
  store.exec({
    type: 'addStair',
    stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: toModel(comps) }),
  });
  const [rs] = resolveStairsOnLevel(store.project, 'lv_0');
  expect(rs).toBeDefined();
  expect(rs!.issues.filter((i) => i.severity === 'error')).toEqual([]);
  return rs!;
}

describe('sólidos de escada (3D, decisões 0011 §1 e 0012)', () => {
  it('monolítico liso: volume da malha = Σ volumes das peças de stairBody', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: MONO });
    expect(Math.abs(total(buildStairSolids([s])) - piecesVolume(s))).toBeLessThan(1e-9);
  });

  it('monolítico escalonado: volume da malha = Σ volumes das peças de stairBody', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: { ...MONO, undersideStyle: 'stepped' } });
    expect(Math.abs(total(buildStairSolids([s])) - piecesVolume(s))).toBeLessThan(1e-9);
  });

  it('monolítico: cada peça tem espessura positiva (volume > 0)', () => {
    for (const undersideStyle of ['smooth', 'stepped'] as const) {
      const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: { ...MONO, undersideStyle } });
      const pieces = stairBody(s, { slabThickness: 0.15 }).pieces;
      expect(pieces.length).toBeGreaterThan(0);
      for (const piece of pieces) expect(pieceVolume(piece)).toBeGreaterThan(0);
    }
  });

  it('monolítico: topo contínuo, nenhum vértice abaixo de baseZ (a escada apoia no piso)', () => {
    const baseZ = 0.3;
    for (const undersideStyle of ['smooth', 'stepped'] as const) {
      const s = straightStair({ risers: N, tread: P, riserH: H, width: W, baseZ, type: { ...MONO, undersideStyle } });
      const [b] = buildStairSolids([s]);
      const zs = b!.positions.filter((_, i) => i % 3 === 2);
      // Tolerância de 1e-6 m: os vértices do corte pelo piso base vêm da divisão do polígono no engine (~3e-8 m de erro).
      expect(Math.min(...zs)).toBeGreaterThanOrEqual(baseZ - 1e-6);
    }
  });

  it('monolítico: os espelhos não geram placas à parte (o volume é só o das peças)', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: { ...MONO, riserThickness: 0.02 } });
    expect(Math.abs(total(buildStairSolids([s])) - piecesVolume(s))).toBeLessThan(1e-9);
  });

  it('L com patamar: a peça de patamar está presente, à cota do patamar, com fundo plano em zTop − (h + T)', () => {
    const s = lStair();
    const pieces = stairBody(s, { slabThickness: 0.15 }).pieces;
    const landing = pieces.find((p) => p.kind === 'landing');
    expect(landing).toBeDefined();
    const landingStep = s.steps.find((st) => st.kind === 'landing')!;
    expect(landing!.zTop).toBeCloseTo(landingStep.z, 9);
    const T = (s.type.structuralDepth * Math.hypot(P, s.riserHeight)) / P;
    expect(landing!.bottom.a).toBeCloseTo(0, 12);
    expect(landing!.bottom.b).toBeCloseTo(0, 12);
    expect(landing!.bottom.c).toBeCloseTo(landing!.zTop - (s.riserHeight + T), 9);
  });

  it('L com patamar: volume da malha = Σ volumes das peças de stairBody', () => {
    const s = lStair();
    expect(Math.abs(total(buildStairSolids([s])) - piecesVolume(s))).toBeLessThan(1e-9);
  });

  it('piso e espelho: volume = Σ degraus (área × espessura do piso) + espelhos (área × espessura do espelho × altura)', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: ASSEMBLED });
    const expected = (N - 1) * W * P * ASSEMBLED.treadThickness + N * W * ASSEMBLED.riserThickness * H;
    expect(Math.abs(total(buildStairSolids([s])) - expected)).toBeLessThan(1e-9);
  });

  it('piso e espelho: patamar entra com a espessura do patamar', () => {
    const extra = W * 1.2 * DEFAULT_STAIR_TYPES[0]!.landingThickness;
    const asm = straightStair({ risers: N, tread: P, riserH: H, width: W, type: ASSEMBLED });
    const asmBase = (N - 1) * W * P * ASSEMBLED.treadThickness + N * W * ASSEMBLED.riserThickness * H;
    expect(Math.abs(total(buildStairSolids([withLanding(asm)])) - (asmBase + extra))).toBeLessThan(1e-9);
  });

  it('piso e espelho: o espelho fica atrás da linha (para o lado do degrau anterior), de y = p − t até y = N·p', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: ASSEMBLED });
    const [b] = buildStairSolids([s]);
    const ys = b!.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(P - ASSEMBLED.riserThickness, 9);
    expect(Math.max(...ys)).toBeCloseTo(N * P, 9);
  });

  it('piso e espelho: o espelho de trás não invade o degrau de baixo: sua seção fica acima de z0 e atrás da linha', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: ASSEMBLED });
    const slab = riserSlab(s, s.risers[4]!, 0.02);
    const ys = slab.map((p) => p.y);
    expect(Math.min(...ys)).toBeCloseTo(5 * P - 0.02, 9);
    expect(Math.max(...ys)).toBeCloseTo(5 * P, 9);
  });

  it('agrupa por material do tipo', () => {
    const batches = buildStairSolids([straightStair({ risers: N, tread: P, riserH: H, width: W, type: ASSEMBLED })]);
    expect(batches.map((b) => b.materialId)).toEqual([ASSEMBLED.materialId]);
  });

  it('o topo da chegada vem do callback; sem callback vale o recuo antigo (topo − 0,15 m; `stairArrivalTopZ` dá null)', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: MONO });
    const withDefault = total(buildStairSolids([s]));
    const withSame = total(buildStairSolids([s], () => s.topZ - 0.15));
    expect(Math.abs(withDefault - withSame)).toBeLessThan(1e-12);
    const ph = new ProjectStore(createEmptyProject()).project;
    expect(stairArrivalTopZ(ph, s)).toBeNull();
  });

  it('sem laje (cena passa `stairArrivalTop(...).top` = topZ): a chegada é flush no nível, sem recuo de 0,15 m', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: MONO });
    const ph = new ProjectStore(createEmptyProject()).project;
    const batches = buildStairSolids([s], (st) => stairArrivalTop(ph, st).top);
    const zs = batches.flatMap((b) => b.positions.filter((_, i) => i % 3 === 2));
    expect(Math.max(...zs)).toBeCloseTo(s.topZ, 9);
    const expected = stairBody(s, { arrivalTopZ: s.topZ }).pieces.reduce((acc, p) => acc + pieceVolume(p), 0);
    expect(Math.abs(total(batches) - expected)).toBeLessThan(1e-4);
    expect(unmatchedEdges(batches[0]!)).toBe(0);
  });

  it('um topo de chegada mais baixo (laje mais baixa) entra na malha: a chegada perde volume, igual às peças com essa cota', () => {
    const s = straightStair({ risers: N, tread: P, riserH: H, width: W, type: MONO });
    const low = s.topZ - 0.3;
    const withLow = total(buildStairSolids([s], () => low));
    expect(withLow).toBeLessThan(total(buildStairSolids([s])));
    const expected = stairBody(s, { arrivalTopZ: low }).pieces.reduce((acc, p) => acc + pieceVolume(p), 0);
    // A borda cortada pela cota da laje fica com a folga mínima do fundo (0,1 mm, MIN_PIECE_THICKNESS): erro ~1e-5 m³.
    expect(Math.abs(withLow - expected)).toBeLessThan(1e-4);
    expect(unmatchedEdges(buildStairSolids([s], () => low)[0]!)).toBe(0);
  });

  it('escada com erro (ex.: `stair-riser-too-high`) mantém a malha: o erro fica no painel/validador, não apaga a geometria', () => {
    const issues = [{ code: 'stair-riser-too-high', severity: 'error' as const, message: 'x', stairId: 'st1' }];
    const mono = straightStair({ issues });
    const asm = straightStair({ issues, type: ASSEMBLED });
    for (const s of [mono, asm]) {
      const batches = buildStairSolids([s]);
      expect(batches).toHaveLength(1);
      expect(batches[0]!.materialId).toBe(s.type.materialId);
      expect(batches[0]!.indices.length).toBeGreaterThan(0);
      expect(batches[0]!.ids).toEqual([{ id: s.id, start: 0, count: batches[0]!.indices.length }]);
      // O erro continua nos avisos da escada: o render não o consume nem o remove.
      expect(s.issues).toEqual(issues);
    }
    expect(Math.abs(total(buildStairSolids([mono])) - total(buildStairSolids([straightStair()])))).toBeLessThan(1e-9);
  });

  it('sem degraus e sem croqui não gera malha', () => {
    const empty = { ...straightStair(), steps: [], risers: [] };
    expect(buildStairSolids([empty as ResolvedStair])).toEqual([]);
  });

  it('sem degraus mas com croqui: corpo-placeholder fino (0,20 m) do retângulo envolvente, na cota da base', () => {
    const components: Array<StairRun | StairLanding> = [
      {
        id: 'r1',
        kind: 'run',
        boundaryLeft: [{ a: { x: 0, y: 0 }, b: { x: 0, y: 3 }, sag: 0 }],
        boundaryRight: [{ a: { x: 1.2, y: 0 }, b: { x: 1.2, y: 3 }, sag: 0 }],
        risers: [{ a: { x: 0, y: 0 }, b: { x: 1.2, y: 0 }, sag: 0 }],
        path: [],
      },
      {
        id: 'p1',
        kind: 'landing',
        boundary: [
          { a: { x: 0, y: 3 }, b: { x: 2, y: 3 }, sag: 0 },
          { a: { x: 2, y: 3 }, b: { x: 2, y: 4 }, sag: 0 },
          { a: { x: 2, y: 4 }, b: { x: 0, y: 4 }, sag: 0 },
          { a: { x: 0, y: 4 }, b: { x: 0, y: 3 }, sag: 0 },
        ],
      },
    ];
    const base = straightStair({ baseZ: 0.3 });
    const s = { ...base, steps: [], risers: [], footprint: [], components } as ResolvedStair;
    const [b] = buildStairSolids([s]);
    expect(b).toBeDefined();
    expect(b!.materialId).toBe(base.type.materialId);
    const xs = b!.positions.filter((_, i) => i % 3 === 0);
    const ys = b!.positions.filter((_, i) => i % 3 === 1);
    const zs = b!.positions.filter((_, i) => i % 3 === 2);
    expect(Math.min(...xs)).toBeCloseTo(0, 9);
    expect(Math.max(...xs)).toBeCloseTo(2, 9);
    expect(Math.min(...ys)).toBeCloseTo(0, 9);
    expect(Math.max(...ys)).toBeCloseTo(4, 9);
    expect(Math.min(...zs)).toBeCloseTo(0.3, 9);
    expect(Math.max(...zs)).toBeCloseTo(0.5, 9);
    expect(Math.abs(total([b!]) - 2 * 4 * 0.2)).toBeLessThan(1e-9);
    expect(b!.ids).toEqual([{ id: s.id, start: 0, count: b!.indices.length }]);
    expect(unmatchedEdges(b!)).toBe(0);
  });

  it('topo não acima da base: escada resolvida sem degraus continua no 3D pelo corpo-placeholder', () => {
    const components: StairRun[] = [{ id: 'run', kind: 'run', ...generateStraightRun({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: 1.2, risers: 16, tread: 0.28 }) }];
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addStair', stair: makeStair({ id: 'st1', typeId: defaultStairTypeId, levelId: 'lv_0', topOffset: -5, components }) });
    const [rs] = resolveStairsOnLevel(store.project, 'lv_0');
    expect(rs!.steps).toEqual([]);
    expect(rs!.topZ).toBeLessThanOrEqual(rs!.baseZ);
    const [b] = buildStairSolids([rs!]);
    expect(b).toBeDefined();
    expect(b!.ids.map((r) => r.id)).toEqual(['st1']);
    expect(b!.positions.length).toBeGreaterThan(0);
  });
});

/** Arestas que o 3D desenha no lote (EdgesGeometry 28°, como em scene3d.ts): [xa, ya, za, xb, yb, zb] por segmento. */
function drawnEdges(b: SolidBatch): number[][] {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(b.positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(b.normals, 3));
  g.setIndex(b.indices);
  const pos = new THREE.EdgesGeometry(g, 28).getAttribute('position') as THREE.BufferAttribute;
  const out: number[][] = [];
  for (let i = 0; i < pos.count; i += 2) out.push([pos.getX(i), pos.getY(i), pos.getZ(i), pos.getX(i + 1), pos.getY(i + 1), pos.getZ(i + 1)]);
  g.dispose();
  return out;
}

/** Arestas sem par no sentido oposto (malha aberta ou com emenda), com a tolerância de 1e-4 m do desenho. */
function unmatchedEdges(b: SolidBatch): number {
  const key = (k: number): string => [0, 1, 2].map((c) => Math.round(b.positions[k * 3 + c]! * 1e4)).join(',');
  const count = new Map<string, number>();
  for (let t = 0; t < b.indices.length; t += 3)
    for (let j = 0; j < 3; j++) {
      const a = key(b.indices[t + j]!);
      const c = key(b.indices[t + ((j + 1) % 3)]!);
      if (a !== c) count.set(`${a}|${c}`, (count.get(`${a}|${c}`) ?? 0) + 1);
    }
  let open = 0;
  for (const [k, n] of count) {
    const [a, c] = k.split('|');
    if (count.get(`${c}|${a}`) !== n) open++;
  }
  return open;
}

/** Escada reta de referência (decisão 0012 §4): largura 1,20; passo 0,28; h 0,175; 16 espelhos; profundidade 0,20. */
const REF = { W: 1.2, P: 0.28, H: 0.175, N: 16, sd: 0.2 };
const refStair = (undersideStyle: 'smooth' | 'stepped' = 'smooth'): ResolvedStair =>
  straightStair({ risers: REF.N, tread: REF.P, riserH: REF.H, width: REF.W, type: { ...MONO, structuralDepth: REF.sd, undersideStyle } });

describe('arestas do lance monolítico (3D): só quebras reais de geometria', () => {
  it('corte pelo piso base: o degrau 2 não tem aresta sobre a linha de corte acima do piso, nem no topo nem na lateral', () => {
    const s = refStair();
    const pieces = stairBody(s, { slabThickness: 0.15 }).pieces;
    // Peça do degrau 2 com fundo plano em baseZ: a borda da frente dela é a linha de corte (y*).
    const flat = pieces.find((p) => p.kind === 'tread' && p.index === 2 && p.bottom.a === 0 && p.bottom.b === 0)!;
    const yCut = Math.max(...flat.polygon.map((p) => p.y));
    const edges = drawnEdges(buildStairSolids([s])[0]!);
    const alongCut = edges.filter(([, ya, , , yb]) => Math.abs(ya! - yCut) < 1e-4 && Math.abs(yb! - yCut) < 1e-4);
    // Sobra só a quina do fundo com o piso base (mudança real de 32° entre o plano e o piso).
    expect(alongCut.filter(([, , za, , , zb]) => za! > 1e-4 || zb! > 1e-4)).toEqual([]);
    expect(alongCut).toHaveLength(1);
    expect(Math.abs(alongCut[0]![2]!)).toBeLessThan(1e-4);
  });

  it('o topo do degrau 2 continua desenhado nas quinas reais com o piso e com o espelho', () => {
    const edges = drawnEdges(buildStairSolids([refStair()])[0]!);
    const onTop = (y: number) => edges.some(([xa, ya, za, xb, yb, zb]) => Math.abs(ya! - y) < 1e-4 && Math.abs(yb! - y) < 1e-4 && Math.abs(za! - 2 * REF.H) < 1e-4 && Math.abs(zb! - 2 * REF.H) < 1e-4 && Math.abs(xa! - xb!) > 1);
    expect(onTop(2 * REF.P)).toBe(true);
    expect(onTop(3 * REF.P)).toBe(true);
  });

  it('face lateral: arestas verticais só nas quinas de espelho (piso de baixo até o piso de cima), nunca no interior', () => {
    const s = refStair();
    const pieces = stairBody(s, { slabThickness: 0.15 }).pieces;
    // Quina da frente da chegada: é a face de topo da chegada, e não um espelho.
    const yEnd = Math.max(...pieces.map((p) => Math.max(...p.polygon.map((v) => v.y))));
    const lateral = drawnEdges(buildStairSolids([s])[0]!).filter(
      ([xa, ya, za, xb, yb, zb]) => Math.abs(xa! - xb!) < 1e-4 && Math.abs(ya! - yb!) < 1e-4 && Math.abs(za! - zb!) > 1e-4 && (Math.abs(xa!) < 1e-4 || Math.abs(xa! - REF.W) < 1e-4),
    );
    expect(lateral.length).toBeGreaterThan(0);
    for (const [, ya, za, , , zb] of lateral) {
      const y = ya!;
      const zLo = Math.min(za!, zb!);
      const zHi = Math.max(za!, zb!);
      if (Math.abs(y - yEnd) < 1e-4) continue;
      const k = Math.round(y / REF.P);
      expect(Math.abs(y - k * REF.P)).toBeLessThan(1e-4);
      expect(Math.abs(zLo - (k - 1) * REF.H)).toBeLessThan(1e-4);
      expect(zHi).toBeLessThanOrEqual(k * REF.H + 1e-4);
    }
  });

  it('referência pelo croqui padrão do motor (generateStraightRun, como no app): lateral abaixo de 0,40 m só nas quinas de espelho', () => {
    // Mesmo caminho do app: gerador de lance reto, resolveStairsOnLevel e o tipo padrão (liso, profundidade 0,20).
    // Espelho j (de 1 a N) em y = (j−1)·p; o degrau entre os espelhos j e j+1 começa em (j−1)·h e sobe até j·h.
    const sk = generateStraightRun({ start: { x: 0, y: 0 }, dir: { x: 0, y: 1 }, width: REF.W, risers: REF.N, tread: REF.P });
    const store = new ProjectStore(createEmptyProject());
    store.exec({
      type: 'addStair',
      stair: makeStair({ id: 'st1', typeId: DEFAULT_STAIR_TYPES[0]!.id, levelId: 'lv_0', topOffset: -0.2, height: 2.8, components: [{ id: 'run', kind: 'run', ...sk }] }),
    });
    const [rs] = resolveStairsOnLevel(store.project, 'lv_0');
    expect(rs!.issues.filter((i) => i.severity === 'error')).toEqual([]);
    const lowLateral = drawnEdges(buildStairSolids([rs!])[0]!).filter(
      ([xa, ya, za, xb, yb, zb]) =>
        Math.abs(xa! - xb!) < 1e-4 && Math.abs(ya! - yb!) < 1e-4 && Math.abs(za! - zb!) > 1e-4 && Math.abs(Math.abs(xa!) - REF.W / 2) < 1e-4 && Math.min(za!, zb!) < 0.4,
    );
    expect(lowLateral.length).toBeGreaterThan(0);
    for (const [, ya, za, , , zb] of lowLateral) {
      const k = Math.round(ya! / REF.P);
      expect(Math.abs(ya! - k * REF.P)).toBeLessThan(1e-4);
      expect(Math.abs(Math.min(za!, zb!) - k * REF.H)).toBeLessThan(1e-4);
      expect(Math.max(za!, zb!)).toBeLessThanOrEqual((k + 1) * REF.H + 1e-4);
    }
  });

  it('volume inalterado: malha da referência = Σ volumes das peças, nos dois estilos de fundo', () => {
    for (const undersideStyle of ['smooth', 'stepped'] as const) {
      const s = refStair(undersideStyle);
      expect(Math.abs(total(buildStairSolids([s])) - piecesVolume(s))).toBeLessThan(1e-9);
    }
  });

  it('volume inalterado no lance montado da referência: degraus e espelhos (área × espessura)', () => {
    const s = straightStair({ risers: REF.N, tread: REF.P, riserH: REF.H, width: REF.W, type: { ...ASSEMBLED } });
    const expected = (REF.N - 1) * REF.W * REF.P * ASSEMBLED.treadThickness + REF.N * REF.W * ASSEMBLED.riserThickness * REF.H;
    expect(Math.abs(total(buildStairSolids([s])) - expected)).toBeLessThan(1e-9);
  });

  it('sem buracos: cada aresta da malha tem uma face vizinha no sentido oposto (guarda contra paredes cortadas errado)', () => {
    for (const undersideStyle of ['smooth', 'stepped'] as const) {
      expect(unmatchedEdges(buildStairSolids([refStair(undersideStyle)])[0]!)).toBe(0);
    }
    expect(unmatchedEdges(buildStairSolids([straightStair({ risers: REF.N, tread: REF.P, riserH: REF.H, width: REF.W, type: { ...ASSEMBLED } })])[0]!)).toBe(0);
  });
});

describe('monolítico com face inferior escalonada (3D, decisão 0012 §1 e §2): malha fechada, volume e arestas reais', () => {
  // Geometria (decisão 0012 §2): degrau k (1..N−1) entre os espelhos k e k+1, topo em k·h e fundo plano em (k−1)·h − T.
  // Na linha de espelho m (y = m·P) a face lateral exposta tem duas partes: o espelho [(m−1)h, mh] e o degrau de fundo
  // [(m−2)h − T, (m−1)h − T] (do fundo do degrau anterior ao fundo do seguinte). O corte pelo piso base (baseZ) prende o fundo.
  const T = (REF.sd * Math.hypot(REF.P, REF.H)) / REF.P;
  const stepped = (baseZ = 0): ResolvedStair => straightStair({ risers: REF.N, tread: REF.P, riserH: REF.H, width: REF.W, baseZ, type: { ...MONO, structuralDepth: REF.sd, undersideStyle: 'stepped' } });
  const steppedL = (): ResolvedStair => {
    const base = lStair();
    return { ...base, type: { ...base.type, undersideStyle: 'stepped' } };
  };

  it('malha fechada: nenhuma aresta sem par (reta, reta com base em 0,30 m e L com patamar)', () => {
    for (const s of [stepped(), stepped(0.3), steppedL()]) expect(unmatchedEdges(buildStairSolids([s])[0]!)).toBe(0);
  });

  it('volume da malha = Σ volumes das peças de stairBody (reta, reta com base em 0,30 m e L com patamar)', () => {
    for (const s of [stepped(), stepped(0.3), steppedL()]) expect(Math.abs(total(buildStairSolids([s])) - piecesVolume(s))).toBeLessThan(1e-9);
  });

  it('face lateral: arestas verticais só nas linhas de espelho, no espelho exposto ou no degrau de fundo até o do seguinte', () => {
    const s = stepped();
    const pieces = stairBody(s, { slabThickness: 0.15 }).pieces;
    // Quina da frente da chegada (fora do critério, como no liso): é a face de topo da chegada.
    const yEnd = Math.max(...pieces.map((p) => Math.max(...p.polygon.map((v) => v.y))));
    const lateral = drawnEdges(buildStairSolids([s])[0]!).filter(
      ([xa, ya, za, xb, yb, zb]) => Math.abs(xa! - xb!) < 1e-4 && Math.abs(ya! - yb!) < 1e-4 && Math.abs(za! - zb!) > 1e-4 && (Math.abs(xa!) < 1e-4 || Math.abs(xa! - REF.W) < 1e-4),
    );
    expect(lateral.length).toBeGreaterThan(0);
    for (const [, ya, za, , , zb] of lateral) {
      const y = ya!;
      if (Math.abs(y - yEnd) < 1e-4) continue;
      const m = Math.round(y / REF.P);
      expect(Math.abs(y - m * REF.P)).toBeLessThan(1e-4);
      const lo = Math.min(za!, zb!);
      const hi = Math.max(za!, zb!);
      const inRiser = lo >= (m - 1) * REF.H - 1e-4 && hi <= m * REF.H + 1e-4;
      const inUnder = lo >= (m - 2) * REF.H - T - 1e-4 && hi <= (m - 1) * REF.H - T + 1e-4;
      expect(inRiser || inUnder, `aresta em y=${y.toFixed(4)}, z ${lo.toFixed(4)}..${hi.toFixed(4)}`).toBe(true);
    }
  });

  it('o degrau de fundo é aresta real: no fim do degrau 4 (y = 5·P), do fundo 3 (3h − T) ao fundo 4 (4h − T)', () => {
    const lateral = drawnEdges(buildStairSolids([stepped()])[0]!);
    const found = lateral.some(
      ([xa, ya, za, xb, yb, zb]) =>
        Math.abs(xa!) < 1e-4 && Math.abs(xb!) < 1e-4 && Math.abs(ya! - 5 * REF.P) < 1e-4 && Math.abs(yb! - 5 * REF.P) < 1e-4 &&
        Math.abs(Math.min(za!, zb!) - (3 * REF.H - T)) < 1e-4 && Math.abs(Math.max(za!, zb!) - (4 * REF.H - T)) < 1e-4,
    );
    expect(found).toBe(true);
  });
});
