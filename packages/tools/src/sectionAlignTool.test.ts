import { describe, expect, it } from 'vitest';
import { makeWall, type Opening } from '@hestia/model';
import type { SectionOpening, SectionResult } from '@hestia/engine';
import type { MultiPolygon } from '@hestia/geom';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { InferContext } from './infer.ts';
import type { SectionToolContext } from './types.ts';

/** Caixa do vão na vista: (t0..t1) × (z0..z1). `internal` é um retângulo interno (travessa/montante) da esquadria. */
interface Box { id: string; kind: 'door' | 'window'; t0: number; t1: number; z0: number; z1: number; depth: number; internal?: [number, number, number, number] }

const BOXES: Box[] = [
  { id: 'd', kind: 'door', t0: 1.1, t1: 1.9, z0: 0, z1: 2.1, depth: 0 }, // porta 80 × 210
  { id: 'j', kind: 'window', t0: 3.4, t1: 4.6, z0: 1.1, z1: 2.3, depth: 1.5, internal: [3.5, 1.65, 4.5, 1.75] }, // janela com travessa interna
  { id: 'k', kind: 'window', t0: 6.4, t1: 7.6, z0: 0.8, z1: 2.0, depth: 1.5 }, // janela com peitoril por instância 0,80
];

const rect = (t0: number, z0: number, t1: number, z1: number): MultiPolygon =>
  [[[{ x: t0, y: z0 }, { x: t1, y: z0 }, { x: t1, y: z1 }, { x: t0, y: z1 }]]];

const sectionOpening = (b: Box): SectionOpening => {
  const polygons = rect(b.t0, b.z0, b.t1, b.z1);
  if (b.internal) polygons.push(...rect(...b.internal));
  return ({ ...b, openingId: b.id, cut: true, polygons } as unknown as SectionOpening);
};

/** Seção simulada: parede cortada de 0 a 10 m, três vãos e a guia da vista inteira. */
function fakeResult(withWall = true): SectionResult {
  const wall = rect(0, 0, 10, 2.8);
  return {
    length: 10,
    zMin: 0,
    zMax: 2.8,
    cut: withWall ? [{ materialId: 'mat_alv', polygons: wall, sources: [{ wallId: 'h' }], parts: [{ origin: { wallId: 'h' }, polygons: wall }] }] : [],
    silhouette: [],
    beyond: [],
    openings: BOXES.map(sectionOpening),
    membranes: [],
    levels: [],
  } as unknown as SectionResult;
}

/** Pontos de captura da vista: cantos e centros dos vãos (o clique também acha a geometria por `result()`). */
const snapPoints = BOXES.flatMap((b) => [
  { x: b.t0, y: b.z0, kind: 'endpoint' as const, hostId: b.id },
  { x: b.t1, y: b.z0, kind: 'endpoint' as const, hostId: b.id },
  { x: b.t0, y: b.z1, kind: 'endpoint' as const, hostId: b.id },
  { x: b.t1, y: b.z1, kind: 'endpoint' as const, hostId: b.id },
  { x: (b.t0 + b.t1) / 2, y: b.z1, kind: 'midpoint' as const, hostId: b.id },
]);

function scene({ withResult = true, withWall = true }: { withResult?: boolean; withWall?: boolean } = {}) {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addWall', wall: makeWall({ id: 'h', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 10, y: 0 } }) });
  ctx.store.exec({ type: 'addOpening', opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  ctx.store.exec({ type: 'addOpening', opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'h', offset: 4, flipHand: false, flipFacing: false, sillOverride: null, mark: '' } });
  ctx.store.exec({ type: 'addOpening', opening: { id: 'k', kind: 'window', typeId: 'ot_j120', hostId: 'h', offset: 7, flipHand: false, flipFacing: false, sillOverride: 0.8, mark: '' } });
  ctx.store.exec({ type: 'addView', view: { id: 'v1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, depth: 3 } });
  const messages: string[] = [];
  ctx.env.say = (msg: string) => { messages.push(msg); };
  const sec = {
    id: 'v1',
    annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
    setAnnotations: () => {},
    inferContext: (extra: Partial<InferContext> = {}) => ({
      project: ctx.store.project,
      levelId: 'lv_0',
      mpp: ctx.env.metersPerPixel(),
      gridStep: ctx.env.gridStep(),
      section: true,
      noGrid: true,
      extraPoints: snapPoints,
      extraSegments: [],
      ...extra,
    }),
    ...(withResult ? { result: () => fakeResult(withWall) } : {}),
  } as unknown as SectionToolContext;
  ctx.env.section = () => sec;
  return { ...ctx, messages };
}

const opening = (ctx: ReturnType<typeof scene>, id: string): Opening => ctx.store.project.elements[id] as Opening;

describe('ferramenta Alinhar no corte (referência e alvo por clique)', () => {
  it('começa sem exigir seleção e pede a referência', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    expect(ctx.env.selection()).toEqual([]);
    expect(ctx.messages.some((m) => /clique na referência/i.test(m))).toBe(true);
    expect(t.preview()).toEqual([]);
  });

  it('o primeiro clique no topo da porta só grava a referência, sem alterar o modelo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    const version = ctx.store.version;
    clickAt(t, 1.5, 2.1);
    expect(ctx.store.version).toBe(version);
    expect(opening(ctx, 'd').heightOverride ?? null).toBeNull();
    expect(ctx.messages.some((m) => m.includes('Clique no alvo'))).toBe(true);
    expect(ctx.messages.some((m) => m.includes('topo') && m.includes('+2,10'))).toBe(true);
  });

  it('a guia persistente entra em inference() e o preview não desenha linha própria de referência', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // referência: topo da porta
    const guides = t.inference()?.guides ?? [];
    const guide = guides.find((g) => g.kind === 'alignment' && Math.abs(g.from.y - 2.1) < 1e-9);
    expect(guide).toBeDefined();
    expect(guide?.from.x).toBeCloseTo(0, 9);
    expect(guide?.to.x).toBeCloseTo(10, 9);
    expect(guide?.to.y).toBeCloseTo(2.1, 9);
    // A referência é só a guia da inferência: nenhuma linha própria no preview.
    expect(t.preview().some((i) => i.kind === 'line')).toBe(false);

    t.move(P(4, 2.3)); // sobre o topo da janela
    const fullReference = t.preview().find((i) => i.kind === 'line' && i.a.x === 0 && i.a.y === 2.1 && i.b.x === 10);
    expect(fullReference).toBeUndefined();
    expect(t.preview().some((i) => i.kind === 'highlight' && i.ids.includes('j'))).toBe(true);
    expect(t.preview().some((i) => i.kind === 'line' && i.dashed)).toBe(true);
  });

  it('cada linha interna da janela é referência: clique na travessa, não no topo/peitoril da caixa', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 4, 1.75); // aresta superior da travessa interna de j (também sobre o centro vertical)
    const guides = t.inference()?.guides ?? [];
    const guide = guides.find((g) => g.kind === 'alignment' && Math.abs(g.from.y - 1.75) < 1e-9);
    expect(guide).toBeDefined();
    expect(guide?.from.x).toBeCloseTo(0, 9);
    expect(guide?.to.x).toBeCloseTo(10, 9);
    // Não pode ter caído no topo (2,30), no peitoril (1,10) nem no centro horizontal (1,70) da caixa.
    expect(guides.some((g) => g.kind === 'alignment' && [2.3, 1.1, 1.7].some((z) => Math.abs(g.from.y - z) < 1e-9))).toBe(false);
    expect(ctx.messages.some((m) => m.includes('aresta'))).toBe(true);
  });

  it('alvo numa linha interna da janela: avisa e não altera, pois não há operação segura', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // referência: topo da porta
    clickAt(t, 4, 1.75); // alvo: travessa interna da janela j
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'j').sillOverride).toBeNull();
    expect(opening(ctx, 'j').offset).toBeCloseTo(4, 9);
    expect(ctx.messages.some((m) => m.includes('não é topo, peitoril, ombreira ou centro'))).toBe(true);
  });

  it('referência no topo da porta e alvo no topo da janela: reposiciona o peitoril sem mudar a altura', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // topo da porta (2,10)
    clickAt(t, 4, 2.3); // topo da janela
    // Topo 2,10 com altura de família 1,20 => peitoril 0,90; a altura não muda.
    expect(opening(ctx, 'j').sillOverride).toBeCloseTo(0.9, 9);
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'd').heightOverride ?? null).toBeNull();
    expect(ctx.store.undoLabel).toBe('Alinhar no corte');
    ctx.store.undo();
    expect(opening(ctx, 'j').sillOverride).toBeNull();
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
  });

  it('referência em ombreira de uma janela e alvo em ombreira de outra: ajusta o offset', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 4.6, 1.7); // ombreira direita da janela j
    clickAt(t, 6.4, 1.4); // ombreira esquerda da janela k
    // A ombreira esquerda de k (6,40) vai para 4,60: o centro sai de 7,00 para 5,20.
    expect(opening(ctx, 'k').offset).toBeCloseTo(5.2, 9);
    expect(opening(ctx, 'j').offset).toBeCloseTo(4, 9);
    expect(ctx.store.undoLabel).toBe('Alinhar no corte');
    ctx.store.undo();
    expect(opening(ctx, 'k').offset).toBeCloseTo(7, 9);
  });

  it('referência no peitoril e alvo no peitoril: a feição decide, sem Shift', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 4, 1.1); // peitoril da janela j (1,10)
    clickAt(t, 7, 0.8, { shift: true }); // peitoril da janela k (0,80); Shift não muda a feição
    expect(opening(ctx, 'k').sillOverride).toBeCloseTo(1.1, 9);
    expect(opening(ctx, 'k').heightOverride ?? null).toBeNull();
  });

  it('referência e alvo na mesma abertura: avisa e não altera', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 4, 2.3); // referência no topo de j
    clickAt(t, 4, 2.3); // alvo na mesma janela
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'j').sillOverride).toBeNull();
    expect(ctx.messages.some((m) => m.includes('própria abertura alvo'))).toBe(true);
  });

  it('porta com a linha do peitoril: avisa que porta só alinha o topo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 4, 1.1); // referência: peitoril da janela
    clickAt(t, 1.5, 0); // alvo: linha inferior (peitoril) da porta
    expect(opening(ctx, 'd').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'd').sillOverride).toBeNull();
    expect(ctx.messages.some((m) => m.includes('Porta só alinha o topo'))).toBe(true);
  });

  it('alvo parede: move o topo da parede até a referência, num único undo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // referência: topo da porta (2,10)
    clickAt(t, 5.5, 2.8); // alvo: topo da parede (base 0, altura 2,80)
    const wall = ctx.store.project.elements.h;
    expect(wall && 'height' in wall ? wall.height : 0).toBeCloseTo(2.1, 9);
    expect(ctx.store.undoLabel).toBe('Alinhar no corte');
    ctx.store.undo();
    const back = ctx.store.project.elements.h;
    expect(back && 'height' in back ? back.height : 0).toBeCloseTo(2.8, 9);
  });

  it('sem resultado da vista: avisa e não cria referência', () => {
    const ctx = scene({ withResult: false });
    const t = tool('align', ctx.env);
    expect(ctx.messages.some((m) => m.includes('não tem resultado'))).toBe(true);
    clickAt(t, 1.5, 2.1);
    expect(ctx.messages.some((m) => m.includes('não tem resultado'))).toBe(true);
    expect(t.inference()).toBeNull();
    expect(t.preview()).toEqual([]);
  });

  it('segundo clique no vazio: avisa que não há alvo e não altera', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    const version = ctx.store.version;
    clickAt(t, 1.5, 2.1); // referência
    clickAt(t, 5.5, 3.6); // fora da parede e dos vãos
    expect(ctx.store.version).toBe(version);
    expect(ctx.messages.some((m) => m.includes('Nenhuma janela'))).toBe(true);
  });
});
