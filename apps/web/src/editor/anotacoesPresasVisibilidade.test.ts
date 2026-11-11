import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeWall, type Dimension } from '@hestia/model';
import { executaComandoDoMenu } from '../ui/useCanvasContextMenu.ts';
import { editor } from './controller.ts';
import { useUi } from './state.ts';
import { hiddenInActiveView, temporaryHideSelection, visibilityOf } from './viewVisibility.ts';

/*
 * Etapa 7 da regra 4.5 no editor: ocultar um elemento na vista esconde também a cota presa a ele e a etiqueta dele (o
 * conjunto que o desenho recebe, o que as ferramentas não capturam e o que "revelar" mostra de novo).
 */

const camera = { fit: () => {}, orbit: { zoom: () => {} } };
const centro = { x: 0, y: 0 };
const cota = (id: string, y: number, over: Partial<Dimension> = {}): Dimension => ({ id, a: { x: 0, y }, b: { x: 2, y }, offset: 0.5, ...over });

function novoProjeto(): ProjectStore {
  const store = new ProjectStore(createEmptyProject());
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 2, y: 0 }, height: 3 }) });
  store.exec({ type: 'addWall', wall: makeWall({ id: 'w2', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 4 }, b: { x: 2, y: 4 }, height: 3 }) });
  store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: cota('d_w1', 1, { refs: { a: { wallId: 'w1', end: 'a' } } }) });
  store.exec({ type: 'addDimension', levelId: 'lv_0', dimension: cota('d_livre', 6) });
  store.exec({ type: 'addTag', levelId: 'lv_0', item: { id: 'tg_w1', hostId: 'w1', at: { x: 1, y: -1 }, property: 'type' } });
  store.exec({ type: 'addTag', levelId: 'lv_0', item: { id: 'tg_w2', hostId: 'w2', at: { x: 1, y: 5 }, property: 'type' } });
  return store;
}

const sets = (): ReturnType<typeof visibilityOf> => visibilityOf(editor.project, useUi.getState());
const ids = (s: ReadonlySet<string>): string[] => [...s].sort();

describe('ocultar um elemento na vista de planta esconde a cota e a etiqueta presas a ele', () => {
  beforeEach(() => {
    editor.load(novoProjeto().project, 'teste.hestia.json');
    editor.closeSection();
    useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0' });
    editor.ensureViewport(800, 600);
    useUi.setState({ viewTemp: {}, selection: [], tool: 'select' });
  });

  it('Hide in View da parede: o conjunto de ocultos traz a parede, a cota presa e a etiqueta dela', () => {
    useUi.setState({ selection: ['w1'] });
    executaComandoDoMenu('hideElements', 'plan', camera, centro);
    expect(ids(sets().hidden)).toEqual(['d_w1', 'tg_w1', 'w1']);
    expect(ids(hiddenInActiveView(editor.project, useUi.getState()))).toEqual(['d_w1', 'tg_w1', 'w1']);
  });

  it('revelar mostra tudo de novo e o que estava oculto vira "revelado" (inclusive a cota e a etiqueta)', () => {
    useUi.setState({ selection: ['w1'] });
    executaComandoDoMenu('hideElements', 'plan', camera, centro);
    executaComandoDoMenu('revealHidden', 'plan', camera, centro);
    expect(sets().hidden.size).toBe(0);
    expect(ids(sets().revealed)).toEqual(['d_w1', 'tg_w1', 'w1']);
    expect(hiddenInActiveView(editor.project, useUi.getState()).size).toBe(0);
  });

  it('ocultar temporário (HH) da parede também esconde a cota e a etiqueta, sem salvar nada na vista', () => {
    useUi.setState({ selection: ['w2'] });
    temporaryHideSelection();
    expect(ids(sets().hidden)).toEqual(['tg_w2', 'w2']);
    expect(ids(hiddenInActiveView(editor.project, useUi.getState()))).toEqual(['tg_w2', 'w2']);
  });

  it('"Selecionar todas as visíveis" da mesma categoria não traz a cota que depende do oculto', () => {
    useUi.setState({ selection: ['w1'] });
    executaComandoDoMenu('hideElements', 'plan', camera, centro);
    useUi.setState({ selection: ['d_livre'] });
    executaComandoDoMenu('selectAllVisible', 'plan', camera, centro);
    expect(ids(new Set(useUi.getState().selection))).toEqual(['d_livre']);
  });
});
