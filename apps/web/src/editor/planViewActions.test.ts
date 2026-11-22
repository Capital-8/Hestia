import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyProject, makeWall, planViewById, ProjectStore } from '@hestia/model';
import { editor } from './controller.ts';
import { resolveText, useI18n } from './i18n.ts';
import { criarPlantaDeDisciplina, duplicarPlanta, excluirPlanta, renomearPlanta } from './planViewActions.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

/*
 * Ações de planta por disciplina no controlador real (decisão 0060 §12, etapa 3.3): criar e duplicar ativam a
 * planta nova pelo mesmo caminho de `selectLevel`; excluir a planta ativa volta para a planta padrão do nível.
 * Valores de referência LITERAIS.
 */

function iniciar(): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({
    view: 'plan', levelId: 'lv_0', sectionId: null, selection: [], hover: null, options: DEFAULT_OPTIONS,
    planKind: 'floor', areaPlanId: null, planViewId: null,
  });
  editor.setTool('select');
}

describe('ações de planta por disciplina', () => {
  beforeEach(() => {
    useI18n.setState({ lang: 'pt' });
    iniciar();
  });

  it('criar ativa a planta nova e grava o nome padrão único por nível', () => {
    const store = editor.store;
    const id = criarPlantaDeDisciplina(store, 'lv_0', 'estrutura');
    expect(useUi.getState().planViewId).toBe(id);
    expect(useUi.getState().levelId).toBe('lv_0');
    expect(planViewById(store.project, id)).toMatchObject({ levelId: 'lv_0', discipline: 'estrutura', name: 'Térreo - Estrutura' });
    expect(resolveText(store.undoLabel!, 'pt')).toBe('Criar planta por disciplina');

    const id2 = criarPlantaDeDisciplina(store, 'lv_0', 'estrutura');
    expect(useUi.getState().planViewId).toBe(id2);
    expect(planViewById(store.project, id2)!.name).toBe('Térreo - Estrutura (2)');

    store.undo();
    expect(planViewById(store.project, id2)).toBeUndefined();
    expect(planViewById(store.project, id)).toBeDefined();
  });

  it('duplicar ativa a cópia; com anotações, os ids são novos', () => {
    const store = editor.store;
    const id = criarPlantaDeDisciplina(store, 'lv_0', 'estrutura');
    store.exec({ type: 'addDimension', levelId: 'lv_0', planId: id, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 0.5 } });
    const copia = duplicarPlanta(store, id, { withAnnotations: true })!;
    expect(copia).not.toBe(id);
    expect(useUi.getState().planViewId).toBe(copia);
    expect(planViewById(store.project, copia)!.name).toBe('Térreo - Estrutura (2)');
    expect(planViewById(store.project, copia)!.annotations!.dimensions.map((d) => d.id)).not.toContain('d1');
    expect(resolveText(store.undoLabel!, 'pt')).toBe('Duplicar planta');
    store.undo();
    expect(planViewById(store.project, copia)).toBeUndefined();
  });

  it('renomear grava o nome pedido e desvia do nome já usado no nível com sufixo numérico', () => {
    const store = editor.store;
    const a = criarPlantaDeDisciplina(store, 'lv_0', 'estrutura');
    const b = criarPlantaDeDisciplina(store, 'lv_0', 'eletrico');
    expect(renomearPlanta(store, a, 'Fôrmas')).toBe('Fôrmas');
    expect(resolveText(store.undoLabel!, 'pt')).toBe('Renomear planta');
    expect(renomearPlanta(store, b, 'Fôrmas')).toBe('Fôrmas (2)');
    // Renomear para o mesmo nome não entra no histórico.
    const rotulo = store.undoLabel;
    expect(renomearPlanta(store, a, 'Fôrmas')).toBe('Fôrmas');
    expect(store.undoLabel).toBe(rotulo);
  });

  it('excluir a planta ativa volta para a planta padrão do nível', () => {
    const store = editor.store;
    const id = criarPlantaDeDisciplina(store, 'lv_0', 'estrutura');
    expect(useUi.getState().planViewId).toBe(id);
    expect(excluirPlanta(store, id)).toBe(true);
    expect(useUi.getState().levelId).toBe('lv_0');
    expect(useUi.getState().planViewId).toBeNull();
    expect(planViewById(store.project, id)).toBeUndefined();
    expect(resolveText(store.undoLabel!, 'pt')).toBe('Excluir planta');
  });

  it('excluir uma planta que não está ativa não muda a vista ativa', () => {
    const store = editor.store;
    const a = criarPlantaDeDisciplina(store, 'lv_0', 'estrutura');
    const b = criarPlantaDeDisciplina(store, 'lv_0', 'eletrico');
    expect(useUi.getState().planViewId).toBe(b);
    expect(excluirPlanta(store, a)).toBe(true);
    expect(useUi.getState().planViewId).toBe(b);
    expect(planViewById(store.project, b)).toBeDefined();
  });
});
