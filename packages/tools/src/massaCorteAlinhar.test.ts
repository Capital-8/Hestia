import { afterEach, describe, expect, it, vi } from 'vitest';
import { ESTILO_CORTE_MASSA, computeSection, servicoMassa, type LinhaCorteMassaProjeto, type SectionResult } from '@hestia/engine';
import { massaM1 } from '@hestia/engine/src/fixtureMassa.ts';
import type { Vec2 } from '@hestia/geom';
import type { Mass } from '@hestia/model';
import type { InferContext } from './infer.ts';
import { pickSectionElement } from './sectionEditTools.ts';
import { massaCortePieces } from './massCortePecas.ts';
import { fantasmaDoMover, SEM_NOTAS } from './sectionMoverPrevia.ts';
import { clickAt, makeEnv, tool } from './testEnv.ts';
import type { SectionToolContext } from './types.ts';

/**
 * Massa no CORTE e na ELEVAÇÃO (ficha T1c, item d): as linhas que o kernel desenha (consulta 143, simulada) entram como peças para o clique,
 * para o Alinhar da vista e para o fantasma do Mover e do Copiar, no molde do guarda-corpo.
 */
afterEach(() => vi.restoreAllMocks());

const ring = (s0: number, z0: number, s1: number, z1: number): Vec2[] => [{ x: s0, y: z0 }, { x: s1, y: z0 }, { x: s1, y: z1 }, { x: s0, y: z1 }, { x: s0, y: z0 }];

/** Duas massas no plano do corte: m1 (s 0..10, z 0..9) e m2 (s 12..20, z 0..5). O kernel repete o primeiro ponto no fim. */
const LINHAS: LinhaCorteMassaProjeto[] = [
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: ring(0, 0, 10, 9).map((q) => ({ s: q.x, z: q.y })) },
  { massaId: 'm2', copia: 0, estilo: ESTILO_CORTE_MASSA.cortado, pontos: ring(12, 0, 20, 5).map((q) => ({ s: q.x, z: q.y })) },
  { massaId: 'm1', copia: 0, estilo: ESTILO_CORTE_MASSA.feicao, pontos: [{ s: 5, z: 0 }, { s: 5, z: 9 }] },
];

/** Cena: duas massas (a m2 é a referência do Alinhar) e a vista de corte pelo eixo x; o resultado é o mesmo objeto (cache da vista). */
function cena() {
  const ctx = makeEnv();
  ctx.store.exec({ type: 'addMass', mass: massaM1() });
  ctx.store.exec({ type: 'addMass', mass: { ...massaM1(), id: 'm2', name: 'M2', origem: { x: 16, y: 0 } } as Mass });
  ctx.store.exec({ type: 'addView', view: { id: 'v1', name: 'Corte A', kind: 'section', a: { x: -20, y: 0 }, b: { x: 20, y: 0 }, depth: 3 } });
  const resultado: SectionResult = computeSection(ctx.store.project, { a: { x: -20, y: 0 }, b: { x: 20, y: 0 }, depth: 3 });
  const sec = {
    id: 'v1',
    annotations: () => ({ dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }),
    setAnnotations: () => {},
    inferContext: (extra: Partial<InferContext> = {}) => ({
      project: ctx.store.project, levelId: 'lv_0', mpp: ctx.env.metersPerPixel(), gridStep: ctx.env.gridStep(),
      section: true, noGrid: true, extraPoints: [], extraSegments: [], ...extra,
    }),
    result: () => resultado,
  } as unknown as SectionToolContext;
  ctx.env.section = () => sec;
  ctx.env.say = () => {};
  return { ctx, resultado };
}

describe('massa no corte: peças para o clique, o Alinhar e o fantasma', () => {
  it('uma peça por massa, com os contornos cortados dela; a feição não vira peça', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { ctx, resultado } = cena();
    const pecas = massaCortePieces(ctx.store.project, resultado);
    expect(pecas.map((q) => q.hostId)).toEqual(['m1', 'm2']);
    expect(pecas[0]!.polygons).toHaveLength(1);
  });

  it('o clique no corte escolhe a massa sob o cursor (sem kernel não há peça)', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { ctx } = cena();
    expect(pickSectionElement(ctx.env, { x: 5, y: 4.5 })).toBe('m1');
    expect(pickSectionElement(ctx.env, { x: 16, y: 2 })).toBe('m2');
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(null);
    expect(pickSectionElement(ctx.env, { x: 5, y: 4.5 })).toBeNull();
  });

  it('o fantasma do Mover no corte desloca o anel da massa pelo deslocamento inteiro (dt ao longo do corte, dz na vertical)', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { ctx, resultado } = cena();
    const itens = fantasmaDoMover(ctx.store.project, resultado, [], [], { movidos: ['m1'], aberturas: [], notas: SEM_NOTAS }, { x: 1, y: 0 }, 2, 1);
    const poligonos = itens.filter((i) => i.kind === 'polygon');
    expect(poligonos).toHaveLength(1);
    const anel = poligonos[0]!;
    if (anel.kind !== 'polygon') throw new Error('sem polígono');
    expect(Math.min(...anel.ring.map((q) => q.x))).toBeCloseTo(2, 9);
    expect(Math.max(...anel.ring.map((q) => q.y))).toBeCloseTo(10, 9);
  });

  it('Alinhar no corte: a aresta de cima de m1 (z 9) sobe/desce até a de m2 (z 5) pelo `baseOffset`; um passo de desfazer', () => {
    vi.spyOn(servicoMassa(), 'corte').mockReturnValue(LINHAS);
    const { ctx } = cena();
    const t = tool('align', ctx.env);
    clickAt(t, 16, 5); // referência: topo da m2 (z 5)
    clickAt(t, 5, 9); // alvo: topo da m1 (z 9)
    const m1 = ctx.store.project.elements['m1'] as Mass;
    expect(m1.baseOffset).toBeCloseTo(-4, 9);
    expect(m1.origem).toEqual({ x: 0, y: 0 });
    ctx.store.undo();
    expect((ctx.store.project.elements['m1'] as Mass).baseOffset).toBe(0);
  });
});
