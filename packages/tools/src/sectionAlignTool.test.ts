import { describe, expect, it } from 'vitest';
import { makeWall, type Opening } from '@hestia/model';
import { clickAt, makeEnv, P, tool } from './testEnv.ts';
import type { InferContext } from './infer.ts';
import type { SectionToolContext } from './types.ts';

/** Ponto de captura da seção simulada: (t, z) com o dono do elemento. */
type SnapPoint = { x: number; y: number; kind: 'endpoint'; hostId?: string };

/**
 * Porta (topo 2,10) e janela (peitoril 1,10 / topo 2,30) na mesma parede, com uma vista de corte de 0 a 6 m.
 * A seção simulada entrega os topos e o peitoril como capturas de extremidade, cada um com o id da abertura.
 */
const DEFAULT_POINTS: SnapPoint[] = [
  { x: 1.5, y: 2.1, kind: 'endpoint', hostId: 'd' },
  { x: 4, y: 2.3, kind: 'endpoint', hostId: 'j' },
  { x: 4, y: 1.1, kind: 'endpoint', hostId: 'j' },
];

function scene(points: SnapPoint[] = DEFAULT_POINTS) {
  const ctx = makeEnv();
  ctx.store.exec({
    type: 'addWall',
    wall: makeWall({ id: 'h', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }),
  });
  ctx.store.exec({
    type: 'addOpening',
    opening: { id: 'd', kind: 'door', typeId: 'ot_p80', hostId: 'h', offset: 1.5, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
  });
  ctx.store.exec({
    type: 'addOpening',
    opening: { id: 'j', kind: 'window', typeId: 'ot_j120', hostId: 'h', offset: 4, flipHand: false, flipFacing: false, sillOverride: null, mark: '' },
  });
  ctx.store.exec({
    type: 'addView',
    view: { id: 'v1', name: 'Corte A', kind: 'section', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, depth: 3 },
  });
  const messages: string[] = [];
  ctx.env.say = (msg: string) => { messages.push(msg); };
  const sec: SectionToolContext = {
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
      extraPoints: points,
      extraSegments: [],
      ...extra,
    }),
  };
  ctx.env.section = () => sec;
  return { ...ctx, messages };
}

const opening = (ctx: ReturnType<typeof scene>, id: string): Opening => ctx.store.project.elements[id] as Opening;

describe('ferramenta Alinhar no corte (dois passos)', () => {
  it('o primeiro clique só grava a referência e não altera o modelo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    const version = ctx.store.version;
    clickAt(t, 1.5, 2.1); // topo da porta
    expect(opening(ctx, 'd').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'j').sillOverride).toBeNull();
    expect(ctx.store.version).toBe(version);
    expect(ctx.messages.some((m) => m.includes('Clique no alvo'))).toBe(true);
  });

  it('prévia mostra a guia da referência de ponta a ponta e o fantasma até o alvo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1);
    const guide = t.preview().find((i) => i.kind === 'line');
    expect(guide?.kind).toBe('line');
    if (guide?.kind !== 'line') throw new Error('guia ausente');
    expect(guide.dashed).toBe(false);
    expect(guide.a.x).toBe(0);
    expect(guide.a.y).toBeCloseTo(2.1, 9);
    expect(guide.b.x).toBeCloseTo(6, 9);
    expect(guide.b.y).toBeCloseTo(2.1, 9);
    const label = t.preview().find((i) => i.kind === 'label');
    expect(label?.kind === 'label' ? label.text : '').toMatch(/^Referência \+/);

    t.move(P(4, 2.3));
    const ghost = t.preview().find((i) => i.kind === 'line' && i.dashed);
    expect(ghost?.kind).toBe('line');
    if (ghost?.kind !== 'line') throw new Error('fantasma ausente');
    expect(ghost.a.x).toBeCloseTo(4, 9);
    expect(ghost.a.y).toBeCloseTo(2.1, 9);
    expect(ghost.b.x).toBeCloseTo(4, 9);
    expect(ghost.b.y).toBeCloseTo(2.3, 9);
    expect(t.preview().some((i) => i.kind === 'highlight' && i.ids.includes('j'))).toBe(true);
  });

  it('a janela selecionada não serve de referência para si mesma: usa o topo da porta', () => {
    // A janela tem o topo a 10 cm do cursor e a porta a 16 cm (8 px a 0,02 m/px): sem o ignore da seleção,
    // o snap escolheria a janela (+2,30) em vez da porta (+2,10).
    const ctx = scene([
      { x: 1.5, y: 2.1, kind: 'endpoint', hostId: 'd' },
      { x: 1.6, y: 2.3, kind: 'endpoint', hostId: 'j' },
      { x: 4, y: 1.1, kind: 'endpoint', hostId: 'j' },
    ]);
    ctx.env.setSelection(['j']);
    ctx.env.metersPerPixel = () => 0.02;
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.26); // 8 px acima do topo da porta
    const guide = t.preview().find((i) => i.kind === 'line');
    expect(guide?.kind).toBe('line');
    if (guide?.kind !== 'line') throw new Error('guia ausente');
    expect(guide.a.y).toBeCloseTo(2.1, 9);
    expect(ctx.messages.some((m) => m.includes('+2,10'))).toBe(true);

    clickAt(t, 4, 2.3);
    expect(opening(ctx, 'j').heightOverride).toBeCloseTo(1, 9);
  });

  it('sem seleção, o alvo detectado pelo hostId não pode ser a referência dele mesmo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 4, 2.3); // referência: topo da janela (hostId j)
    clickAt(t, 4, 2.3); // alvo sob o cursor: a mesma janela
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
    expect(ctx.messages.some((m) => m.includes('própria abertura alvo'))).toBe(true);
  });

  it('segundo clique alinha o topo da janela ao topo da porta com um único undo', () => {
    const ctx = scene();
    ctx.env.setSelection(['j']);
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // referência: topo da porta (2,10)
    clickAt(t, 4, 2.3); // alvo: janela (peitoril 1,10)
    // Topo 2,10 com peitoril 1,10 => altura por instância 1,00.
    expect(opening(ctx, 'j').heightOverride).toBeCloseTo(1, 9);
    expect(opening(ctx, 'd').heightOverride ?? null).toBeNull();
    expect(ctx.store.undoLabel).toBe('Alinhar no corte');
    ctx.store.undo();
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
  });

  it('com Shift alinha o peitoril da janela à referência', () => {
    const ctx = scene();
    ctx.env.setSelection(['j']);
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // referência: topo da porta
    clickAt(t, 4, 2.3, { shift: true });
    expect(opening(ctx, 'j').sillOverride).toBeCloseTo(2.1, 9);
    expect(opening(ctx, 'j').heightOverride ?? null).toBeNull();
  });

  it('porta com Shift avisa que só o topo alinha e não altera nada', () => {
    const ctx = scene();
    ctx.env.setSelection(['d']);
    const t = tool('align', ctx.env);
    clickAt(t, 4, 2.3); // referência: topo da janela
    clickAt(t, 1.5, 2.1, { shift: true });
    expect(opening(ctx, 'd').heightOverride ?? null).toBeNull();
    expect(opening(ctx, 'd').sillOverride).toBeNull();
    expect(ctx.messages.some((m) => m.includes('Porta só alinha o topo'))).toBe(true);
  });

  it('porta sem Shift alinha o topo normalmente', () => {
    const ctx = scene();
    ctx.env.setSelection(['d']);
    const t = tool('align', ctx.env);
    clickAt(t, 4, 2.3); // referência: topo da janela
    clickAt(t, 1.5, 2.1); // alvo: porta
    expect(opening(ctx, 'd').heightOverride).toBeCloseTo(2.3, 9);
  });

  it('sem seleção, usa a abertura sob o snap (hostId) como alvo', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1); // referência: topo da porta
    clickAt(t, 4, 2.3); // janela sob o cursor, sem seleção
    expect(opening(ctx, 'j').heightOverride).toBeCloseTo(1, 9);
  });

  it('Esc durante a referência limpa o passo sem sair nem fechar a vista; o segundo Esc sai', () => {
    const ctx = scene();
    const t = tool('align', ctx.env);
    clickAt(t, 1.5, 2.1);
    expect(t.preview().length).toBeGreaterThan(0);
    t.cancel();
    expect(ctx.done()).toBe(0);
    expect(t.preview()).toEqual([]);
    expect(ctx.store.project.views).toHaveLength(1);
    t.cancel();
    expect(ctx.done()).toBe(1);
  });

  it('sem snap no primeiro clique, usa o ponto livre, avisa e permite alinhar depois', () => {
    const ctx = scene([]);
    const t = tool('align', ctx.env);
    const version = ctx.store.version;
    clickAt(t, 2.5, 1.75);
    expect(ctx.store.version).toBe(version);
    expect(ctx.messages.some((m) => m.includes('Sem referência de linha'))).toBe(true);
    const label = t.preview().find((i) => i.kind === 'label');
    const text = label?.kind === 'label' ? label.text : '';
    expect(text).toMatch(/^Referência \+/);
    expect(text).toContain('1,75');

    ctx.env.setSelection(['j']);
    clickAt(t, 4, 2.3);
    // Topo 1,75 com peitoril 1,10 => altura 0,65, mesmo sem linha de referência.
    expect(opening(ctx, 'j').heightOverride).toBeCloseTo(0.65, 9);
  });
});
