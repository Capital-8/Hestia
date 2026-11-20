import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeRoof, type Roof } from '@hestia/model';
import { applyRoofPatch } from './roofEdgeActions.ts';
import { pedidoDegrauTelhado, responderDegrauTelhado } from './roofStepPrompt.ts';
import { resolveText } from './i18n.ts';
import { useUi } from './state.ts';

const rect = [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }];

/** L fictício (degrau de 0,30 x 4 = 1,2 m no canto reentrante em (5,0)). */
const STEP_BOUNDARY = [
  { x: 5, y: 0 },
  { x: 9, y: 0 },
  { x: 9, y: 5 },
  { x: 0, y: 5 },
  { x: 0, y: -1.5 },
  { x: 5, y: -1.5 },
];

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
  beforeEach(() => {
    responderDegrauTelhado(false);
    useUi.setState({ dialog: null });
  });

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

  it('alterar inclinação para formato com degrau pergunta ao usuário e grava closeStepGaps conforme escolha', async () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({
      type: 'addRoof',
      roof: makeRoof({ id: 't_step', typeId: 'rt_ceramica', levelId: 'lv_0', boundary: STEP_BOUNDARY, shape: 'edges', slopePercent: 30, edgeSlopes: [30, 30, 30, 30, 30, 30], edgeOverhangs: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5] }),
    });
    expect(applyRoofPatch(store, ['t_step'], { edgeSlopes: [null, 30, 30, 30, null, 30] })).toBe(true);
    expect(useUi.getState().dialog).toBe('roofStep');
    expect(pedidoDegrauTelhado()).toContain('1,20 m');
    responderDegrauTelhado(true);
    await Promise.resolve();
    expect((store.project.elements.t_step as Roof).closeStepGaps).toBe(true);

    // Quando o usuário já decidiu (closeStepGaps definido), novas edições não reabrem o modal.
    expect(applyRoofPatch(store, ['t_step'], { edgeSlopes: [null, 35, 35, 35, null, 35] })).toBe(true);
    expect(useUi.getState().dialog).toBeNull();
  });
});
