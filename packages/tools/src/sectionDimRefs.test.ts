import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { sectionAnnotationsOf, setSectionDimensionResolver, type SectionView } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import { createTool } from './index.ts';
import { resolveSectionAnnotations, resolveSectionDimRef, sectionDimRefAt } from './sectionDimRefs.ts';
import { sectionInferContext } from './sectionContext.ts';
import { buildSectionSnapIndex } from './sectionSnapIndex.ts';
import { clickAt, makeEnv } from './testEnv.ts';
import type { SectionToolContext } from './types.ts';

const v = (x: number, y: number): Vec2 => ({ x, y });
const rect = (x0: number, y0: number, x1: number, y1: number): Vec2[] => [v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)];

/** Seção com uma escada `st1` (degrau e espelho) cujo degrau superior fica na cota `z`: mudar `z` é "a escada mudou". */
const secao = (z: number, dx = 0): SectionResult => ({
  length: 10,
  zMin: 0,
  zMax: 6,
  cut: [],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
  snapRings: [
    { hostId: 'st1', ring: rect(dx, 0, dx + 1, 0.2) },
    { hostId: 'st1', ring: rect(dx + 1, 0.2, dx + 2, z) },
  ],
});

describe('cota de corte ligada ao elemento', () => {
  it('a referência guarda o elemento e o ponto, e a leitura acompanha a escada quando ela muda', () => {
    const antes = buildSectionSnapIndex(secao(0.4));
    const topoDoDegrau = v(2, 0.4);
    const ref = sectionDimRefAt(antes, topoDoDegrau)!;
    expect(ref).toMatchObject({ hostId: 'st1', kind: 'endpoint' });
    expect(resolveSectionDimRef(antes, ref)).toEqual(topoDoDegrau);
    // A escada ficou mais alta (degrau superior de 0,4 para 0,55): o MESMO ponto do mesmo elemento está em outro lugar.
    const depois = buildSectionSnapIndex(secao(0.55));
    expect(resolveSectionDimRef(depois, ref)).toEqual(v(2, 0.55));
    // A escada andou 1 m para o lado.
    expect(resolveSectionDimRef(buildSectionSnapIndex(secao(0.4, 1)), ref)).toEqual(v(3, 0.4));
  });

  it('sem o elemento (ou sem o ponto) a ponta mantém a última coordenada', () => {
    const index = buildSectionSnapIndex(secao(0.4));
    const dim = { id: 'd1', a: v(2, 0.4), b: v(2, 0), offset: 0.2, secRefs: { a: { hostId: 'st1', kind: 'endpoint' as const, ord: 5 }, b: { hostId: 'sumiu', kind: 'endpoint' as const, ord: 0 } } };
    const a = { dimensions: [dim], texts: [], detailLines: [], detailRegions: [], tags: [] };
    const out = resolveSectionAnnotations(a, buildSectionSnapIndex({ ...secao(0.4), snapRings: [] }));
    expect(out.dimensions[0]!.a).toEqual(v(2, 0.4));
    expect(out.dimensions[0]!.b).toEqual(v(2, 0));
    // Nada mudou de lugar: o mesmo objeto (sem realocar a cada quadro).
    expect(resolveSectionAnnotations(a, index)).toBe(a);
  });

  it('a ferramenta Cota grava a ponta ligada quando o ponto é de um elemento e a cota acompanha a escada', () => {
    const { env, store } = makeEnv();
    let result = secao(0.4);
    store.exec({ type: 'addView', view: { id: 'v1', name: 'Corte', kind: 'section', a: v(0, 0), b: v(10, 0), depth: 3 } });
    const view = (): SectionView => store.project.views.find((x) => x.id === 'v1')!;
    const sec: SectionToolContext = {
      id: 'v1',
      annotations: () => sectionAnnotationsOf(view()),
      setAnnotations: () => {},
      inferContext: (extra = {}) => sectionInferContext(result, store.project, 'lv_0', 0.01, 0.1, { line: { a: v(0, 0), b: v(10, 0) } }, extra),
      result: () => result,
    };
    env.section = () => sec;
    const t = createTool('dimension', env);
    t.start();
    clickAt(t, 2, 0.4); // topo do degrau (ponto da escada)
    clickAt(t, 2, 0); // base da escada
    clickAt(t, 3, 0.2); // lado
    const dims = sectionAnnotationsOf(view()).dimensions;
    expect(dims).toHaveLength(1);
    const d = dims[0]!;
    expect(d.secRefs?.a).toMatchObject({ hostId: 'st1', kind: 'endpoint' });
    expect(d.refs).toBeUndefined();
    expect(d.a).toEqual(v(2, 0.4));
    // A leitura da vista (o resolvedor do app) segue a escada nova.
    result = secao(0.55);
    setSectionDimensionResolver((_v, anot) => resolveSectionAnnotations(anot, buildSectionSnapIndex(result)));
    try {
      const lido = sectionAnnotationsOf(view()).dimensions[0]!;
      expect(lido.a).toEqual(v(2, 0.55));
      expect(lido.b.y).toBe(0);
    } finally {
      setSectionDimensionResolver(null);
    }
    // Sem resolvedor, a anotação sai como foi gravada.
    expect(sectionAnnotationsOf(view()).dimensions[0]!.a).toEqual(v(2, 0.4));
  });
});
