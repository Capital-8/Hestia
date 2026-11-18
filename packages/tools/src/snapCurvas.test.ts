import { afterEach, describe, expect, it, vi } from 'vitest';
import { adicionarFixtureTerreno, servicoTerreno, type CurvaNivelTN } from '@hestia/engine';
import { ProjectStore, createEmptyProject, type Terrain } from '@hestia/model';
import { infer, type InferContext } from './infer.ts';
import { arestasDasCurvas, curvasSnapIndexes } from './snapCurvas.ts';
import { createTool } from './registry.ts';
import { clickAt, makeEnv, P } from './testEnv.ts';

const reta = (z: number, y: number, terrenoId = 'tn_t3'): CurvaNivelTN => ({ terrenoId, z, mestra: false, fechada: false, pontos: [{ x: 0, y }, { x: 10, y }] });
const quadrado: CurvaNivelTN = { terrenoId: 'tn_t3', z: 7, mestra: true, fechada: true, pontos: [{ x: 20, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 20, y: 30 }] };

function simular(existente: CurvaNivelTN[] | null, proposta: CurvaNivelTN[] | null) {
  return vi.spyOn(servicoTerreno(), 'curvas').mockImplementation((_p, sup) => (sup === 0 ? existente : proposta));
}

const base = (store: ProjectStore, extra: Partial<InferContext> = {}): InferContext => ({ project: store.project, levelId: 'lv_0', mpp: 0.01, gridStep: 0.1, ...extra });

afterEach(() => vi.restoreAllMocks());

describe('captura nas curvas de nível (contour)', () => {
  it('arestas: curva aberta não fecha; curva fechada ganha a aresta de fecho; todas levam z e o terreno dono', () => {
    const ar = arestasDasCurvas([reta(5, 3), quadrado]);
    expect(ar).toHaveLength(1 + 4);
    expect(ar.every((e) => e.kind === 'contour' && e.hostId === 'tn_t3')).toBe(true);
    expect(ar.at(-1)).toMatchObject({ a: { x: 20, y: 30 }, b: { x: 20, y: 20 }, z: 7 });
  });

  it('cursor a poucos px da curva: o ponto cai exatamente sobre ela, com a cota z; vence a grade', () => {
    const s = new ProjectStore(createEmptyProject());
    simular([reta(5, 3.07)], []);
    const ix = curvasSnapIndexes(s.project, 'lv_0');
    const r = infer({ x: 4.03, y: 3.12 }, base(s, { indexed: ix }));
    expect(r.kind).toBe('contour');
    expect(r.point.x).toBeCloseTo(4.03, 12);
    expect(r.point.y).toBeCloseTo(3.07, 12);
    expect(r.z).toBe(5);
    expect(r.hostId).toBe('tn_t3');
    // Longe da curva (> 10 px): volta à grade.
    expect(infer({ x: 4.03, y: 3.5 }, base(s, { indexed: ix })).kind).toBe('grid');
  });

  it('curva fechada: o lado de fecho também é alvo', () => {
    const s = new ProjectStore(createEmptyProject());
    simular([], [quadrado]);
    const r = infer({ x: 20.04, y: 25 }, base(s, { indexed: curvasSnapIndexes(s.project, 'lv_0') }));
    expect(r.kind).toBe('contour');
    expect(r.point).toEqual({ x: 20, y: 25 });
  });

  it('as duas superfícies (existente e proposta) entram', () => {
    const s = new ProjectStore(createEmptyProject());
    simular([reta(5, 3)], [reta(6, 8)]);
    const ix = curvasSnapIndexes(s.project, 'lv_0');
    expect(ix).toHaveLength(2);
    expect(infer({ x: 5, y: 3.03 }, base(s, { indexed: ix })).z).toBe(5);
    expect(infer({ x: 5, y: 8.03 }, base(s, { indexed: ix })).z).toBe(6);
  });

  it('kernel indisponível (curvas = null) não dá alvo; terreno oculto na vista também não', () => {
    const s = new ProjectStore(createEmptyProject());
    simular(null, null);
    expect(curvasSnapIndexes(s.project, 'lv_0')).toEqual([]);
    vi.restoreAllMocks();
    simular([reta(5, 3)], []);
    const ix = curvasSnapIndexes(s.project, 'lv_0');
    expect(infer({ x: 5, y: 3.03 }, base(s, { indexed: ix, hiddenIds: new Set(['tn_t3']) })).kind).toBe('grid');
    expect(infer({ x: 5, y: 3.03 }, base(s, { indexed: ix })).kind).toBe('contour');
  });

  it('captura desligada (F3) não captura; extremidade vizinha continua mandando', () => {
    const s = new ProjectStore(createEmptyProject());
    simular([reta(5, 3)], []);
    const ix = curvasSnapIndexes(s.project, 'lv_0');
    const off = { enabled: false, grid: true, axis: true, faces: true, core: true, intersections: true, perpendicular: true, alignment: true };
    expect(infer({ x: 5, y: 3.03 }, base(s, { indexed: ix, snap: off })).kind).toBe('none');
    expect(infer({ x: 5.01, y: 3.01 }, base(s, { indexed: ix, extraPoints: [{ x: 5, y: 3 }] })).kind).toBe('endpoint');
  });

  it('cache: a mesma lista do serviço reaproveita o índice; lista nova (fontes editadas / kernel pronto) refaz', () => {
    const s = new ProjectStore(createEmptyProject());
    const spy = simular([reta(5, 3)], []);
    const i0 = curvasSnapIndexes(s.project, 'lv_0')[0];
    expect(curvasSnapIndexes(s.project, 'lv_0')[0]).toBe(i0);
    spy.mockImplementation((_p, sup) => (sup === 0 ? [reta(5, 4)] : []));
    const i1 = curvasSnapIndexes(s.project, 'lv_0')[0];
    expect(i1).not.toBe(i0);
    expect(infer({ x: 5, y: 4.03 }, base(s, { indexed: [i1!] })).kind).toBe('contour');
    expect(infer({ x: 5, y: 3.03 }, base(s, { indexed: [i1!] })).kind).toBe('grid');
  });

  it('desempenho: milhares de arestas, consulta por quadro barata', () => {
    const s = new ProjectStore(createEmptyProject());
    const curvas: CurvaNivelTN[] = [];
    for (let k = 0; k < 40; k++) curvas.push({ terrenoId: 'tn_t3', z: k, mestra: k % 5 === 0, fechada: false, pontos: Array.from({ length: 200 }, (_, i) => ({ x: i * 0.5, y: k * 2 + Math.sin(i / 7) })) });
    simular(curvas, []);
    const ix = curvasSnapIndexes(s.project, 'lv_0');
    expect(ix[0]!.arestas.length).toBe(40 * 199);
    const t0 = performance.now();
    for (let q = 0; q < 300; q++) infer({ x: (q % 90) + 0.3, y: ((q * 7) % 80) + 0.2 }, base(s, { indexed: ix }));
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});

describe('Rótulo de curva e Cota de ponto gravam o ponto exato sobre a curva', () => {
  function cena() {
    const ctx = makeEnv(new ProjectStore(createEmptyProject()));
    adicionarFixtureTerreno(ctx.store, 'T3');
    const tn = (): Terrain => ctx.store.project.elements['tn_t3'] as Terrain;
    return { ctx, tn };
  }

  it('terrainLabel: as duas pontas da linha travam nas curvas', () => {
    const { ctx, tn } = cena();
    simular([reta(5, 3.07)], [reta(6, 8.5)]);
    const f = createTool('terrainLabel', ctx.env);
    f.start();
    clickAt(f, 2.04, 3.12);
    clickAt(f, 7.02, 8.46);
    expect(tn().linhasRotulo).toHaveLength(4);
    expect(tn().linhasRotulo[0]).toBeCloseTo(2.04, 12);
    expect(tn().linhasRotulo[1]).toBeCloseTo(3.07, 12);
    expect(tn().linhasRotulo[2]).toBeCloseTo(7.02, 12);
    expect(tn().linhasRotulo[3]).toBeCloseTo(8.5, 12);
  });

  it('terrainSpot: o ponto cotado cai exatamente sobre a curva', () => {
    const { ctx, tn } = cena();
    simular([], [reta(6, 8.5)]);
    const f = createTool('terrainSpot', ctx.env);
    f.start();
    clickAt(f, 4.5, 8.55);
    expect(f.inference()?.kind).toBe('contour');
    expect(tn().pontosCotados[0]).toBeCloseTo(4.5, 12);
    expect(tn().pontosCotados[1]).toBeCloseTo(8.5, 12);
  });

  it('sem kernel (curvas = null) as duas ferramentas continuam com a captura comum', () => {
    const { ctx, tn } = cena();
    simular(null, null);
    const f = createTool('terrainSpot', ctx.env);
    f.start();
    clickAt(f, 4.5, 8.54);
    expect(tn().pontosCotados[1]).toBeCloseTo(8.5, 12);
    expect(f.inference()?.kind).not.toBe('contour');
  });

  it('as outras ferramentas NÃO capturam as curvas (o snap do resto do programa não muda)', () => {
    const { ctx } = cena();
    const spy = simular([reta(5, 3.07)], []);
    const w = createTool('wall', ctx.env);
    w.start();
    w.move(P(4.03, 3.12));
    expect(w.inference()?.kind).not.toBe('contour');
    expect(spy).not.toHaveBeenCalled();
  });
});
