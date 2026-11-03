import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoof, type Roof } from '@hestia/model';
import { applyRoofPatch } from './roofEdgeActions.ts';
import { resolveText } from './i18n.ts';
import { useUi } from './state.ts';

const rect = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }];

/** Telhado por arestas 8 × 6 com as arestas longas definindo inclinação (duas águas com empenas). */
function storeWithRoof(): { store: ProjectStore; roof: () => Roof } {
  const store = new ProjectStore(createEmptyProject());
  store.exec({
    type: 'addRoof',
    roof: makeRoof({ id: 't1', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: rect, shape: 'edges', slopePercent: 30, dir: { x: 1, y: 0 }, edgeSlopes: [30, null, 30, null], edgeOverhangs: [0, 0, 0, 0] }),
  });
  return { store, roof: () => store.project.elements.t1 as Roof };
}

describe('alteração de telhado pelas Propriedades (applyRoofPatch)', () => {
  it('altera a inclinação de uma aresta que continua com águas', () => {
    const { store, roof } = storeWithRoof();
    expect(applyRoofPatch(store, ['t1'], { edgeSlopes: [40, null, 30, null] })).toBe(true);
    expect(roof().edgeSlopes).toEqual([40, null, 30, null]);
  });

  it('desligar a última aresta que define inclinação aplica: o telhado vira plano, como no Revit', () => {
    const { store, roof } = storeWithRoof();
    expect(applyRoofPatch(store, ['t1'], { edgeSlopes: [null, null, null, null] })).toBe(true);
    expect(resolveText(useUi.getState().status, 'pt')).not.toMatch(/Alteração não aplicada/);
    expect(roof().edgeSlopes).toEqual([null, null, null, null]);
  });

  it('patch vazio é aceito sem tocar no telhado', () => {
    const { store, roof } = storeWithRoof();
    expect(applyRoofPatch(store, ['t1'], {})).toBe(true);
    expect(roof().edgeSlopes).toEqual([30, null, 30, null]);
  });
});
