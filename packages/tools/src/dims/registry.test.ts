import { beforeEach, describe, expect, it } from 'vitest';
import { dist, type Vec2 } from '@hestia/geom';
import { DEFAULT_GRID_TYPE_ID, ProjectStore, createEmptyProject, dimensionSettingsOf, floorViewId, viewAnnotationsOf, type Id } from '@hestia/model';
import { clearDimProviders, registerDimProvider, selectionDims, subjectDims } from './registry.ts';
import type { DimContext, DimEnd, DimProvider, TempDim } from './types.ts';

function dimOf(key: string, a: Vec2, b: Vec2): TempDim {
  const end = (at: Vec2, slot: string): DimEnd => ({ at, slot, kind: 'wall', current: 'axis', options: ['axis'] });
  return { key, a, b, offset: 0.2, value: dist(a, b), ends: [end(a, 'a'), end(b, 'b')] };
}

const ctxOf = (store: ProjectStore, levelId = 'lv_0'): DimContext => ({
  project: store.project,
  levelId,
  settings: dimensionSettingsOf(store.project),
  overrides: {},
});

// Provedor de linha de detalhe: a linha mora no nível ativo, então a resolução usa o `levelId`.
const detailLineProvider: DimProvider<{ lineId: Id }> = {
  id: 'line',
  selectionSubject(project, id, levelId) {
    return viewAnnotationsOf(project, floorViewId(levelId ?? 'lv_0')).detailLines.some((x) => x.id === id) ? { lineId: id } : null;
  },
  compute(ctx, { lineId }) {
    const line = viewAnnotationsOf(ctx.project, floorViewId(ctx.levelId)).detailLines.find((x) => x.id === lineId);
    return line ? [dimOf(`line:${lineId}:len`, line.a, line.b)] : [];
  },
};

const gridProvider: DimProvider<{ gridId: Id }> = {
  id: 'grid',
  selectionSubject(project, id) {
    return project.grids?.some((g) => g.id === id) ? { gridId: id } : null;
  },
  compute(ctx, { gridId }) {
    const grid = ctx.project.grids?.find((g) => g.id === gridId);
    if (!grid) return [];
    return [dimOf(`grid:${gridId}:len`, grid.points[0]!, grid.points[grid.points.length - 1]!)];
  },
};

const perimeterProvider: DimProvider<{ a: Vec2; b: Vec2 }> = {
  id: 'line',
  compute(_ctx, { a, b }) {
    return [dimOf('line:perimeter:1', a, b)];
  },
};

function projectWithDetailLine(): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } } });
  return store;
}

function projectWithGrid(): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({
    type: 'addGrid',
    grid: {
      id: 'gr1',
      name: '1',
      typeId: DEFAULT_GRID_TYPE_ID,
      points: [{ x: 0, y: 0 }, { x: 0, y: 10 }],
      sag: 0,
      bubbleStart: false,
      bubbleEnd: true,
    },
  });
  return store;
}

describe('registro de cotas para sujeitos fora de project.elements', () => {
  beforeEach(() => clearDimProviders());

  it('linha de detalhe selecionada devolve a cota pelo provedor registrado', () => {
    registerDimProvider('detailLine', detailLineProvider);
    const store = projectWithDetailLine();
    const [dim] = selectionDims(ctxOf(store), ['dl1']);
    expect(dim?.key).toBe('line:dl1:len');
    expect(dim?.value).toBe(2);
  });

  it('a resolução da linha de detalhe recebe o nível ativo: a linha de lv_0 não aparece em lv_1', () => {
    registerDimProvider('detailLine', detailLineProvider);
    const store = projectWithDetailLine();
    expect(selectionDims(ctxOf(store, 'lv_1'), ['dl1'])).toEqual([]);
  });

  it('grade (Grid) selecionada devolve a cota pelo provedor registrado', () => {
    registerDimProvider('grid', gridProvider);
    const [dim] = selectionDims(ctxOf(projectWithGrid()), ['gr1']);
    expect(dim?.key).toBe('grid:gr1:len');
    expect(dim?.value).toBe(10);
  });

  it('id que não é elemento nem sujeito conhecido não devolve cota', () => {
    registerDimProvider('detailLine', detailLineProvider);
    registerDimProvider('grid', gridProvider);
    expect(selectionDims(ctxOf(projectWithGrid()), ['nada'])).toEqual([]);
  });

  it('linha de perímetro do rascunho usa subjectDims com o sujeito montado pela ferramenta', () => {
    registerDimProvider('perimeterLine', perimeterProvider);
    const [dim] = subjectDims(ctxOf(projectWithGrid()), 'perimeterLine', { a: { x: 1, y: 1 }, b: { x: 4, y: 5 } });
    expect(dim?.value).toBe(5);
    expect(subjectDims(ctxOf(projectWithGrid()), 'grid', { gridId: 'gr1' })).toEqual([]);
  });

  it('provedor de elemento não é consultado para id que não está em project.elements', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addDetailLine', levelId: 'lv_0', item: { id: 'dl1', a: { x: 0, y: 0 }, b: { x: 2, y: 0 } } });
    // Provedor de elemento que aceita qualquer id (inclusive o da linha de detalhe).
    registerDimProvider('wall', {
      id: 'elemento',
      selectionSubject: (_project, id) => ({ id }),
      compute: (_ctx, { id }) => [dimOf(`elemento:${id}`, { x: 0, y: 0 }, { x: 1, y: 0 })],
    });
    registerDimProvider('detailLine', detailLineProvider);
    // 'dl1' não está em project.elements: segue para os sujeitos fora dele.
    expect(selectionDims(ctxOf(store), ['dl1'])[0]?.key).toBe('line:dl1:len');
  });
});
