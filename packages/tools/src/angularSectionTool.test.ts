import { describe, expect, it } from 'vitest';
import { createEmptyProject, levelDimensions, type SectionAnnotations } from '@hestia/model';
import type { SectionResult } from '@hestia/engine';
import { makeEnv, clickAt } from './testEnv.ts';
import { createTool } from './registry.ts';
import { sectionInferContext } from './sectionContext.ts';
import type { SectionToolContext } from './types.ts';

const v = (x: number, y: number) => ({ x, y });

/** Corte com um retângulo 4 x 3: o canto (0,0) tem arestas horizontal e vertical (90°). */
const rectSection: SectionResult = {
  length: 4,
  zMin: 0,
  zMax: 3,
  cut: [{ materialId: 'm1', polygons: [[[v(0, 0), v(4, 0), v(4, 3), v(0, 3)]]], sources: [] }],
  silhouette: [],
  beyond: [],
  openings: [],
  membranes: [],
  levels: [],
};

/** Corte com um triângulo: o canto (4,0) junta a base horizontal e a hipotenusa (45°). */
const triSection: SectionResult = {
  ...rectSection,
  length: 4,
  zMax: 4,
  cut: [{ materialId: 'm1', polygons: [[[v(0, 0), v(4, 0), v(0, 4)]]], sources: [] }],
};

/** Vista de corte falsa: guarda as anotações em memória, como a vista real faria. */
function sectionView(result: SectionResult) {
  let annotations: SectionAnnotations = { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] };
  const sec: SectionToolContext = {
    id: 'v_corte',
    annotations: () => annotations,
    setAnnotations: (next) => { annotations = next ?? { dimensions: [], texts: [], detailLines: [], detailRegions: [], tags: [] }; },
    inferContext: (extra = {}) => sectionInferContext(result, createEmptyProject(), 'lv_0', 0.01, 0.1, {}, extra),
    result: () => result,
  };
  return { sec, annotations: () => annotations };
}

describe('Cota angular no corte', () => {
  it('duas arestas em ângulo reto geram 90° na vista, não no nível', () => {
    const { env } = makeEnv();
    const view = sectionView(rectSection);
    env.section = () => view.sec;
    const tool = createTool('angularDimension', env);
    tool.start();
    clickAt(tool, 2, 0.005);      // aresta horizontal inferior
    clickAt(tool, 0.005, 1.5);    // aresta vertical esquerda
    clickAt(tool, 1, 1);          // lado menor, raio pelo cursor
    const sectionDims = view.annotations().dimensions;
    expect(sectionDims).toHaveLength(1);
    expect(sectionDims[0]!.angular!.value).toBeCloseTo(Math.PI / 2, 6);
    expect(sectionDims[0]!.angular!.center.x).toBeCloseTo(0, 6);
    expect(sectionDims[0]!.angular!.center.y).toBeCloseTo(0, 6);
  });

  it('grava na vista e não no nível do projeto', () => {
    const { env, store } = makeEnv();
    const view = sectionView(rectSection);
    env.section = () => view.sec;
    const tool = createTool('angularDimension', env);
    tool.start();
    clickAt(tool, 2, 0.005);
    clickAt(tool, 0.005, 1.5);
    clickAt(tool, 1, 1);
    expect(view.annotations().dimensions).toHaveLength(1);
    expect(levelDimensions(store.project, 'lv_0')).toHaveLength(0);
  });

  it('aresta inclinada: canto de base e hipotenusa dá 45°', () => {
    const { env } = makeEnv();
    const view = sectionView(triSection);
    env.section = () => view.sec;
    const tool = createTool('angularDimension', env);
    tool.start();
    clickAt(tool, 3, 0.005);      // base
    clickAt(tool, 2, 2.005);      // hipotenusa
    clickAt(tool, 3.08, 0.38);    // cursor no setor entre as duas (lado menor)
    const dim = view.annotations().dimensions[0]!;
    expect(dim.angular!.value).toBeCloseTo(Math.PI / 4, 6);
    expect(dim.angular!.center.x).toBeCloseTo(4, 6);
    expect(dim.angular!.center.y).toBeCloseTo(0, 6);
  });

  it('lado externo (reflexo) do mesmo canto dá a volta de 315°', () => {
    const { env } = makeEnv();
    const view = sectionView(triSection);
    env.section = () => view.sec;
    const tool = createTool('angularDimension', env);
    tool.start();
    clickAt(tool, 3, 0.005);
    clickAt(tool, 2, 2.005);
    clickAt(tool, 5, 0);          // cursor do lado de fora do setor
    const dim = view.annotations().dimensions[0]!;
    expect(dim.angular!.side).toBe('reflex');
    expect(dim.angular!.value).toBeCloseTo((7 * Math.PI) / 4, 6);
  });

  it('clique longe de qualquer aresta da vista não escolhe referência', () => {
    const { env } = makeEnv();
    const view = sectionView(rectSection);
    env.section = () => view.sec;
    const tool = createTool('angularDimension', env);
    tool.start();
    clickAt(tool, 2, 1.5);        // centro do retângulo, longe de tudo
    clickAt(tool, 0.005, 1.5);
    expect(view.annotations().dimensions).toHaveLength(0);
  });

  it('referências paralelas não geram cota', () => {
    const { env } = makeEnv();
    const view = sectionView(rectSection);
    env.section = () => view.sec;
    const tool = createTool('angularDimension', env);
    tool.start();
    clickAt(tool, 2, 0.005);      // base inferior
    clickAt(tool, 2, 3.005);      // topo: paralela à base
    clickAt(tool, 1, 1);
    expect(view.annotations().dimensions).toHaveLength(0);
  });
});
