import { describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Wall } from '@hestia/model';
import { avisoSemNivelAcima, proximoNivelAcima, setBaseNoPiso, setTopoNoPiso } from './wallFloorActions.ts';
import { resolveText } from './i18n.ts';
import { useUi } from './state.ts';

/** Projeto com uma parede no térreo (lv_0) e o pavimento 2 (lv_1) acima. */
function storeWithWall(extra: Partial<Wall> = {}): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, height: 3, ...extra }) });
  return store;
}

const wall = (store: ProjectStore): Wall => store.project.elements.w1 as Wall;

describe('P9 · controles de anexo da parede nas Propriedades', () => {
  it('base: liga e desliga, e cada passo desfaz', () => {
    const store = storeWithWall();
    setBaseNoPiso(store, ['w1'], true);
    expect(wall(store).attachBottomToFloor).toBe(true);
    setBaseNoPiso(store, ['w1'], false);
    expect(wall(store).attachBottomToFloor).toBe(false);
    store.undo();
    expect(wall(store).attachBottomToFloor).toBe(true);
    store.undo();
    expect(wall(store).attachBottomToFloor).toBeFalsy();
  });

  it('topo: ligar usa o nível logo acima e mostra o nível; desligar mantém o nível e desfaz em um passo', () => {
    const store = storeWithWall();
    expect(proximoNivelAcima(store.project, 'lv_0')).toBe('lv_1');
    expect(setTopoNoPiso(store, ['w1'], true)).toEqual([]);
    expect(wall(store)).toMatchObject({ attachTopToFloor: true, topLevelId: 'lv_1' });
    setTopoNoPiso(store, ['w1'], false);
    expect(wall(store).attachTopToFloor).toBe(false);
    expect(wall(store).topLevelId).toBe('lv_1');
    store.undo();
    expect(wall(store).attachTopToFloor).toBe(true);
  });

  it('topo sem nível acima: não liga e devolve a parede', () => {
    const store = storeWithWall({ levelId: 'lv_1' });
    expect(proximoNivelAcima(store.project, 'lv_1')).toBeNull();
    expect(setTopoNoPiso(store, ['w1'], true)).toEqual(['w1']);
    expect(wall(store).attachTopToFloor).toBeFalsy();
  });

  it('topo com nível de topo já escolhido: não troca o nível', () => {
    const store = storeWithWall({ topLevelId: 'lv_1' });
    setTopoNoPiso(store, ['w1'], true);
    expect(wall(store).topLevelId).toBe('lv_1');
  });

  it('topo sem nível acima: a barra de status diz o motivo', () => {
    avisoSemNivelAcima(['w1']);
    expect(resolveText(useUi.getState().status, 'pt')).toContain('nível mais alto');
  });
});
