import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, type Project, type SectionAnnotations } from '@hestia/model';
import type { SectionOpening, SectionResult } from '@hestia/engine';
import { infer } from './infer.ts';
import { sectionInferContext } from './sectionContext.ts';
import { sectionSnapIndex } from './sectionSnapIndex.ts';
import { makeEnv, P, clickAt, tool } from './testEnv.ts';
import { DimensionTool } from './dimensionTool.ts';

const v = (x: number, y: number) => ({ x, y });

const ring = (x0: number, y0: number, x1: number, y1: number) => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];

function baseSection(over: Partial<SectionResult> = {}): SectionResult {
  const opening = {
    openingId: 'op1',
    kind: 'window',
    t0: 1,
    t1: 2,
    z0: 0.9,
    z1: 2.1,
    depth: 1,
    cut: true,
    polygons: [[ring(1, 0.9, 2, 2.1)]],
    model: {},
    openingLine: 'AB',
    viewSide: 1,
    sSign: 1,
    cutT: 1.5,
    frameMaterialId: 'm_frame',
    glassMaterialId: 'm_glass',
  } as unknown as SectionOpening;
  return {
    length: 4,
    zMin: 0,
    zMax: 3,
    cut: [{ materialId: 'm1', polygons: [[ring(0, 0, 4, 3)]], sources: [{ wallId: 'w1' }] }],
    silhouette: [],
    beyond: [],
    openings: [opening],
    membranes: [{ materialId: 'm2', slabId: 'sl1', pts: [v(0, 2.9), v(4, 2.9)] }],
    levels: [
      { levelId: 'lv_0', name: 'Nível 0', z: 0 },
      { levelId: 'lv_1', name: 'Nível 1', z: 1.5 },
      { levelId: 'lv_2', name: 'Cobertura', z: 3 },
    ],
    ...over,
  };
}

const opts = { line: { a: v(0, 0), b: v(4, 0), depth: 6 } };
const emptyProject = createEmptyProject();

const ctxOf = (section: SectionResult, project: Project = emptyProject, over: Parameters<typeof sectionInferContext>[5] = {}) =>
  sectionInferContext(section, project, 'lv_0', 0.01, 0.1, { ...opts, ...over });

describe('inferência na vista de corte (t, z)', () => {
  it('captura a extremidade de um contorno do corte', () => {
    const ctx = ctxOf(baseSection());
    const hit = infer(v(4.02, 2.98), ctx);
    expect(hit.kind).toBe('endpoint');
    expect(hit.point.x).toBeCloseTo(4);
    expect(hit.point.y).toBeCloseTo(3);
  });

  it('captura o ponto médio de uma aresta', () => {
    const ctx = ctxOf(baseSection());
    const hit = infer(v(2.02, 0.01), ctx);
    expect(hit.kind).toBe('midpoint');
    expect(hit.point.x).toBeCloseTo(2);
    expect(hit.point.y).toBeCloseTo(0);
  });

  it('captura o canto da caixa de um vão (peitoril/topo)', () => {
    const ctx = ctxOf(baseSection());
    const hit = infer(v(1.99, 2.09), ctx);
    expect(hit.kind).toBe('endpoint');
    expect(hit.point.x).toBeCloseTo(2);
    expect(hit.point.y).toBeCloseTo(2.1);
  });

  it('captura o cruzamento entre duas arestas da vista', () => {
    const section = baseSection({
      beyond: [{ materialId: 'm3', layerIndex: 0, depth: 2, wallId: 'w2', polygons: [[ring(2.4, 0.5, 2.6, 2.5)]] }],
    });
    const ctx = ctxOf(section);
    const hit = infer(v(2.41, 1.51), ctx);
    expect(hit.kind).toBe('intersection');
    expect(hit.point.x).toBeCloseTo(2.4);
    expect(hit.point.y).toBeCloseTo(1.5);
  });

  it('captura a linha de nível na cota', () => {
    const ctx = ctxOf(baseSection({ cut: [], openings: [], membranes: [], levels: [{ levelId: 'lv_1', name: 'N1', z: 1.5 }] }));
    const hit = infer(v(1.02, 1.54), ctx);
    expect(hit.kind).toBe('nearest');
    expect(hit.point.y).toBeCloseTo(1.5);
    expect(hit.point.x).toBeCloseTo(1.02);
  });

  it('projeta as grades do projeto como verticais em t', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({
      type: 'addGrid',
      grid: { id: 'gr1', name: '1', typeId: 'gt_6mm', points: [v(2, -1), v(2, 5)], sag: 0, bubbleStart: false, bubbleEnd: true },
    });
    const section = baseSection({ cut: [], openings: [], membranes: [], levels: [] });
    const hit = infer(v(2.02, 2.0), ctxOf(section, store.project));
    expect(hit.kind).toBe('nearest');
    expect(hit.point.x).toBeCloseTo(2);
    expect(hit.point.y).toBeCloseTo(2);
  });

  it('não captura grade oculta na vista', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({
      type: 'addGrid',
      grid: { id: 'gr1', name: '1', typeId: 'gt_6mm', points: [v(2, -1), v(2, 5)], sag: 0, bubbleStart: false, bubbleEnd: true },
    });
    const section = baseSection({ cut: [], openings: [], membranes: [], levels: [] });
    const hit = infer(v(2.02, 2.0), ctxOf(section, store.project, { hidden: new Set(['gr1']) }));
    expect(hit.kind).toBe('none');
  });

  it('não captura paredes da planta que caem nas mesmas coordenadas (t, z)', () => {
    const { env, store } = makeEnv();
    const wall = tool('wall', env);
    clickAt(wall, 1, 1);
    clickAt(wall, 3, 1);
    wall.cancel();
    expect(Object.keys(store.project.elements)).toHaveLength(1);
    const section = baseSection({ cut: [], beyond: [], openings: [], membranes: [], levels: [] });
    const hit = infer(v(1, 1), ctxOf(section, env.project()));
    expect(hit.kind).toBe('none');
    expect(hit.point).toEqual(v(1, 1));
  });

  it('não altera o SectionResult', () => {
    const section = baseSection();
    const before = JSON.stringify(section);
    ctxOf(section);
    expect(JSON.stringify(section)).toBe(before);
  });

  it('aceita os campos de inferência vindos nas opções (como o editor passa)', () => {
    const previous = { point: v(0, 0), kind: 'endpoint' as const, guides: [] };
    const ctx = sectionInferContext(baseSection(), emptyProject, 'lv_0', 0.01, 0.1, { ...opts, from: v(0, 0), previous, cycle: 1 });
    expect(ctx.from).toEqual(v(0, 0));
    expect(ctx.previous).toBe(previous);
    expect(ctx.cycle).toBe(1);
    expect(ctx.orthoLock).toBe(false);
  });

  it('captura o topo e a ombreira do vão', () => {
    const ctx = ctxOf(baseSection());
    const top = infer(v(1.25, 2.11), ctx);
    expect(top.kind).toBe('nearest');
    expect(top.point.x).toBeCloseTo(1.25);
    expect(top.point.y).toBeCloseTo(2.1);
    const jamb = infer(v(1.02, 1.7), ctx);
    expect(jamb.kind).toBe('nearest');
    expect(jamb.point.x).toBeCloseTo(1);
    expect(jamb.point.y).toBeCloseTo(1.7);
  });

  it('estende a trilha horizontal do topo do vão com guia de alinhamento', () => {
    const section = baseSection();
    const ctx = ctxOf(section);
    // Fora do segmento (o topo vai de t=1 a t=2), na mesma cota: a reta é estendida.
    const hit = infer(v(2.5, 2.11), ctx);
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(2.5);
    expect(hit.point.y).toBeCloseTo(2.1);
    expect(hit.guides).toHaveLength(1);
    expect(hit.guides[0]).toMatchObject({ kind: 'alignment' });
    expect(hit.guides[0]!.from).toEqual(v(2, 2.1));
    // O índice da vista tem a aresta como trilha h/v, com o dono (o vão).
    const tracks = sectionSnapIndex(section).tracks;
    expect(tracks.some((tr) => tr.axis === 'h' && tr.hostId === 'op1' && Math.abs(tr.a.y - 2.1) < 1e-9)).toBe(true);
    expect(tracks.every((tr) => tr.axis === 'h' || tr.axis === 'v')).toBe(true);
  });

  it('estende a trilha vertical da ombreira e projeta o cursor sobre ela', () => {
    const hit = infer(v(1.03, 2.5), ctxOf(baseSection()));
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(1);
    expect(hit.point.y).toBeCloseTo(2.5);
    expect(hit.guides[0]?.kind).toBe('alignment');
    expect(hit.guides[0]?.from).toEqual(v(1, 2.1));
  });

  it('8 px acima do meio do topo do vão: a aresta vence o alinhamento simples do midpoint', () => {
    // mpp 0,01 → 8 px = 0,08 m. Sem a trilha, o alinhamento vertical do midpoint puxaria para z = 2,18.
    const hit = infer(v(1.5, 2.18), ctxOf(baseSection()));
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(1.5);
    expect(hit.point.y).toBeCloseTo(2.1);
    expect(hit.guides[0]?.kind).toBe('alignment');
    expect(hit.guides[0]?.to.y).toBeCloseTo(2.1);
    expect(hit.hostId).toBe('op1');
  });

  it('8 px ao lado do meio da ombreira: a trilha vertical mantém o x da aresta', () => {
    const hit = infer(v(1.08, 1.7), ctxOf(baseSection()));
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(1);
    expect(hit.point.y).toBeCloseTo(1.7);
    expect(hit.guides[0]?.kind).toBe('alignment');
    expect(hit.hostId).toBe('op1');
  });

  it('não cria cruzamento falso do midpoint do topo com outra linha (8 px no zoom do caso central)', () => {
    // mpp 0,025 → 8 px = 0,20 m. Cursor em 2,30 com uma referência de cota em 2,30 (membrana vertical distante):
    // antes o x do midpoint do topo cruzava com esse y e puxava para 2,30 em vez da trilha horizontal do vão em 2,10.
    const base = baseSection();
    const section = baseSection({
      membranes: [
        ...base.membranes,
        { materialId: 'm2', slabId: 'sl1', pts: [v(3, 2.2), v(3, 2.3)] },
      ],
    });
    const ctx = sectionInferContext(section, emptyProject, 'lv_0', 0.025, 0.1, opts);
    const hit = infer(v(1.5, 2.3), ctx);
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(1.5);
    expect(hit.point.y).toBeCloseTo(2.1);
    expect(hit.guides[0]?.kind).toBe('alignment');
    expect(hit.guides[0]?.to.y).toBeCloseTo(2.1);
    expect(hit.hostId).toBe('op1');
  });

  it('não cria cruzamento falso do midpoint da ombreira com outra linha no modo seção', () => {
    // A aresta longe (x 0..2,4 em y≈2,8) só tem midpoint em x=1,2; a ombreira tem midpoint em y=1,5. Antes os dois
    // eixos de midpoint cruzavam perto do cursor e venciam a trilha vertical da ombreira.
    const section = baseSection({
      levels: [],
      membranes: [],
      beyond: [{ materialId: 'm3', layerIndex: 0, depth: 2, wallId: 'wOut', polygons: [[ring(0, 2.7, 2.4, 2.8)]] }],
    });
    const ctx = sectionInferContext(section, emptyProject, 'lv_0', 0.025, 0.1, opts);
    const hit = infer(v(1.2, 1.58), ctx);
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(1);
    expect(hit.point.y).toBeCloseTo(1.58);
    expect(hit.guides[0]?.kind).toBe('alignment');
    expect(hit.hostId).toBe('op1');
  });

  it('captura o cruzamento de duas retas estendidas fora dos segmentos', () => {
    const section = baseSection({
      cut: [],
      openings: [],
      membranes: [],
      levels: [],
      beyond: [
        { materialId: 'm3', layerIndex: 0, depth: 2, wallId: 'wA', polygons: [[ring(3, 0.5, 3.4, 0.7)]] },
        { materialId: 'm3', layerIndex: 0, depth: 2, wallId: 'wB', polygons: [[ring(3.6, 1, 3.9, 1.4)]] },
      ],
    });
    const hit = infer(v(3.61, 0.51), ctxOf(section));
    expect(hit.kind).toBe('alignment');
    expect(hit.point.x).toBeCloseTo(3.6);
    expect(hit.point.y).toBeCloseTo(0.5);
    expect(hit.guides.length).toBeGreaterThanOrEqual(1);
    expect(hit.guides.every((g) => g.kind === 'alignment')).toBe(true);
  });

  it('exclui o vão oculto dos pontos, arestas e trilhas', () => {
    const section = baseSection({ cut: [], membranes: [], levels: [] });
    const ctx = ctxOf(section, emptyProject, { hidden: new Set(['op1']) });
    expect(ctx.extraTracks?.some((tr) => tr.hostId === 'op1')).toBe(false);
    expect(ctx.extraSegments?.some((e) => e.hostId === 'op1')).toBe(false);
    expect(ctx.extraPoints?.some((p) => p.hostId === 'op1')).toBe(false);
    expect(infer(v(2.5, 2.11), ctx).kind).toBe('none');
  });

  it('exclui a parede oculta da captura do corte', () => {
    const section = baseSection({ openings: [], membranes: [], levels: [] });
    const ctx = ctxOf(section, emptyProject, { hidden: new Set(['w1']) });
    expect(infer(v(0.01, 0.01), ctx).kind).toBe('none');
  });

  it('reaproveita o índice entre movimentos (mesmos arrays no contexto)', () => {
    const section = baseSection();
    const first = ctxOf(section);
    const second = ctxOf(section);
    expect(first.extraPoints).toBe(second.extraPoints);
    expect(first.extraSegments).toBe(second.extraSegments);
    expect(first.extraTracks).toBe(second.extraTracks);
  });
});

describe('MeasureTool na vista de corte', () => {
  it('mede dois pontos da seção e não emite comando', () => {
    const { env } = makeEnv();
    let commands = 0;
    env.exec = () => {
      commands += 1;
    };
    const section = baseSection();
    env.section = () => ({
      id: 'v1',
      annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
      setAnnotations: () => {},
      inferContext: (extra = {}) => ctxOf(section, env.project(), extra),
    });
    const project = env.project();
    const measure = tool('measure', env);
    clickAt(measure, 0.02, 0.02);
    expect(measure.inference()?.point).toEqual(v(0, 0));
    clickAt(measure, 3.98, 2.98);
    expect(measure.inference()?.point).toEqual(v(4, 3));
    const labels = measure.preview().filter((i) => i.kind === 'label');
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ kind: 'label' });
    expect(commands).toBe(0);
    expect(env.project()).toBe(project);
  });

  it('mantém a captura da planta quando não há seção', () => {
    const { env } = makeEnv();
    const wall = tool('wall', env);
    clickAt(wall, 1, 1);
    clickAt(wall, 3, 1);
    wall.cancel();
    const measure = tool('measure', env);
    measure.move(P(1.01, 1.01));
    expect(measure.inference()?.kind).toBe('endpoint');
    expect(measure.inference()?.point).toEqual(v(1, 1));
  });

  it('DimensionTool usa a captura da seção nos pontos medidos', () => {
    const { env } = makeEnv();
    let commands = 0;
    env.exec = () => {
      commands += 1;
    };
    const section = baseSection();
    env.section = () => ({
      id: 'v1',
      annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
      setAnnotations: () => {},
      inferContext: (extra = {}) => ctxOf(section, env.project(), extra),
    });
    const dim = new DimensionTool(env);
    dim.start();
    clickAt(dim, 0.02, 0.02);
    dim.move(P(3.98, 2.98));
    const line = dim.preview().find((i) => i.kind === 'line');
    expect(line).toMatchObject({ kind: 'line', a: v(0, 0), b: v(4, 3) });
    // Ainda não houve clique no lado da linha de cota: nada foi emitido.
    expect(commands).toBe(0);
  });

  it('DimensionTool grava a cota nas anotações da vista, não no modelo', () => {
    const { env } = makeEnv();
    let commands = 0;
    env.exec = () => {
      commands += 1;
    };
    const section = baseSection();
    let saved: SectionAnnotations = { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] };
    env.section = () => ({
      id: 'v1',
      annotations: () => saved,
      setAnnotations: (next) => {
        saved = next ?? { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] };
      },
      inferContext: (extra = {}) => ctxOf(section, env.project(), extra),
    });
    const project = env.project();
    const dim = new DimensionTool(env);
    dim.start();
    clickAt(dim, 0.02, 0.02);
    clickAt(dim, 3.98, 2.98);
    clickAt(dim, 2, -1);
    expect(saved.dimensions).toHaveLength(1);
    expect(saved.dimensions[0]).toMatchObject({ a: v(0, 0), b: v(4, 3) });
    expect(saved.dimensions[0]?.refs).toBeUndefined();
    expect(commands).toBe(0);
    expect(env.project()).toBe(project);
  });
});
