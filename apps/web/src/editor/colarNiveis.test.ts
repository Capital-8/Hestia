import { beforeEach, describe, expect, it } from 'vitest';
import { ProjectStore, createEmptyProject, makeLevel, makeWall, wallsOnLevel } from '@hestia/model';
import { editor } from './controller.ts';
import { useUi } from './state.ts';

/** Projeto com Térreo, Pav. 1 e Pav. 2, uma parede no Térreo, e a área de transferência já preenchida. */
function setup(): void {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_1', name: 'Pav. 1', elevation: 3 }) });
  s.exec({ type: 'upsertLevel', level: makeLevel({ id: 'lv_2', name: 'Pav. 2', elevation: 6 }) });
  s.exec({ type: 'addWall', wall: makeWall({ id: 'A', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }) });
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({
    view: 'plan',
    planKind: 'floor',
    levelId: 'lv_0',
    areaPlanId: null,
    sectionId: null,
    selection: ['A'],
    dialog: null,
    dialogArg: null,
    pastePreview: null,
    tool: 'select',
    typed: '',
    prompt: null,
  });
  editor.copySelection();
}

describe('colar alinhado aos níveis selecionados (controlador)', () => {
  beforeEach(setup);

  it('a seta do Colar abre o diálogo "Selecionar níveis"', () => {
    expect(editor.openPasteLevelsDialog()).toBe(true);
    expect(useUi.getState().dialog).toBe('selectLevels');
  });

  it('pré-visualizar troca para o 3D e X cancela voltando à planta, sem tocar no modelo', () => {
    expect(editor.previewPasteLevels(['lv_1', 'lv_2'], false)).toBe(true);
    const previa = useUi.getState();
    expect(previa.view).toBe('3d');
    expect(previa.pastePreview?.levelIds).toEqual(['lv_1', 'lv_2']);
    expect(previa.pastePreview?.count).toBe(2);
    expect(previa.selection).toEqual([]);

    editor.cancelPasteLevels();
    const volta = useUi.getState();
    expect(volta.view).toBe('plan');
    expect(volta.levelId).toBe('lv_0');
    expect(volta.pastePreview).toBeNull();
    expect(wallsOnLevel(editor.project, 'lv_1')).toHaveLength(0);
    expect(wallsOnLevel(editor.project, 'lv_2')).toHaveLength(0);
  });

  it('V confirma em um passo de desfazer e mantém o 3D com o resultado', () => {
    editor.previewPasteLevels(['lv_1', 'lv_2'], false);
    expect(editor.confirmPasteLevels()).toBe(true);
    expect(useUi.getState().pastePreview).toBeNull();
    expect(useUi.getState().view).toBe('3d');
    expect(wallsOnLevel(editor.project, 'lv_1')).toHaveLength(1);
    expect(wallsOnLevel(editor.project, 'lv_2')).toHaveLength(1);

    editor.undo();
    expect(wallsOnLevel(editor.project, 'lv_1')).toHaveLength(0);
    expect(wallsOnLevel(editor.project, 'lv_2')).toHaveLength(0);
  });

  it('cancelar a partir de um corte volta para o mesmo corte', () => {
    useUi.setState({ view: 'section', sectionId: 'sec_teste', levelId: 'lv_1' });
    editor.previewPasteLevels(['lv_2'], false);
    editor.cancelPasteLevels();
    const volta = useUi.getState();
    expect(volta.view).toBe('section');
    expect(volta.sectionId).toBe('sec_teste');
    expect(volta.levelId).toBe('lv_1');
  });

  it('colar direto aplica sem trocar de vista e sem abrir prévia', () => {
    expect(editor.pasteLevelsDirect(['lv_1'], false)).toBe(true);
    expect(useUi.getState().view).toBe('plan');
    expect(useUi.getState().pastePreview).toBeNull();
    expect(wallsOnLevel(editor.project, 'lv_1')).toHaveLength(1);
  });

  it('com vínculo, a colagem guarda o andar-tipo', () => {
    editor.previewPasteLevels(['lv_1', 'lv_2'], true);
    editor.confirmPasteLevels();
    expect(editor.project.copyLinks).toHaveLength(1);
    expect(editor.project.copyLinks?.[0]?.members.map((m) => m.levelId)).toEqual(['lv_1', 'lv_2']);
  });

  it('sincroniza a alteração da origem nas cópias e desvincula', () => {
    editor.previewPasteLevels(['lv_1', 'lv_2'], true);
    editor.confirmPasteLevels();
    editor.store.exec({ type: 'updateElements', ids: ['A'], patch: { height: 3.2 } });
    useUi.setState({ selection: ['A'] });

    expect(editor.syncLinkedSelection()).toBe(true);
    expect(wallsOnLevel(editor.project, 'lv_1')[0]?.height).toBe(3.2);
    expect(wallsOnLevel(editor.project, 'lv_2')[0]?.height).toBe(3.2);

    expect(editor.unlinkLinkedSelection()).toBe(true);
    expect(editor.project.copyLinks).toHaveLength(0);
  });
});
