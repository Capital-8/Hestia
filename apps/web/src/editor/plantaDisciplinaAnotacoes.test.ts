import { beforeEach, describe, expect, it } from 'vitest';
import type { ToolEnv } from '@hestia/tools';
import { areaPlanOf, createEmptyProject, levelDimensions, levelTexts, makePlanView, makeWall, planAnnotationsOf, planViewById, ProjectStore, wallsOnLevel } from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { editor } from './controller.ts';
import { cotaParaEditar } from './dimDoubleClick.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { tagAllNotTagged } from './tagActions.ts';
import { findEditDim } from '../ui/dims/dimEditModel.ts';
import { selectedNote } from '../ui/AnnotationProps.tsx';

/*
 * Plantas de disciplina no controlador real (decisão 0060, etapa 2.3C): o ToolEnv do app informa a planta dona das
 * anotações. Cota, texto, etiqueta, Mover, Copiar, Excluir e Colar na planta de disciplina gravam na PlanView, nunca no
 * nível; a planta padrão e a de área seguem como antes. Valores de referência LITERAIS.
 */

const info = (x: number, y: number) => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const clicar = (x: number, y: number): void => {
  const p = info(x, y);
  editor.pointer('move', p);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
};

/** O ToolEnv que o controlador monta (campo privado: o teste lê o contrato, não a implementação). */
const envDoApp = (): ToolEnv => (editor as unknown as { env: ToolEnv }).env;

const DIM_N = { id: 'dN', a: { x: 0, y: -2 }, b: { x: 6, y: -2 }, offset: 0.5 };

/** Projeto de um nível com uma parede, uma cota do nível, duas plantas de disciplina e uma planta de área; vista = `vista`. */
function iniciar(vista: 'padrao' | 'pvA' | 'area'): { areaId: string } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w1', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 6, y: 0 } }) });
  s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: DIM_N });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvA', levelId: 'lv_0', name: 'Arquitetura A', discipline: 'arquitetura' }) });
  s.exec({ type: 'addPlanView', plan: makePlanView({ id: 'pvB', levelId: 'lv_0', name: 'Estrutura B', discipline: 'estrutura' }) });
  const areaId = createAreaPlanAction(s, 'lv_0');
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({
    view: 'plan', levelId: 'lv_0', sectionId: null, selection: [], hover: null, options: DEFAULT_OPTIONS,
    planKind: vista === 'area' ? 'area' : 'floor',
    areaPlanId: vista === 'area' ? areaId : null,
    planViewId: vista === 'pvA' ? 'pvA' : null,
  });
  editor.setTool('select');
  return { areaId };
}

const NOTA = { id: 'tx1', at: { x: 3, y: 6 }, text: 'Nota', height: 2.5, rotation: 0 };

describe('ToolEnv do app: planta dona das anotações', () => {
  beforeEach(() => { useUi.setState({ options: DEFAULT_OPTIONS }); });

  it('planViewId do env: a planta de disciplina na planta de piso; null na padrão, na de área e na cobertura', () => {
    iniciar('pvA');
    expect(envDoApp().planViewId?.()).toBe('pvA');
    expect(envDoApp().areaPlanId?.()).toBeNull();
    expect(editor.plantaDonaDasAnotacoes()).toBe('pvA');
    iniciar('padrao');
    expect(envDoApp().planViewId?.()).toBeNull();
    expect(editor.plantaDonaDasAnotacoes()).toBeNull();
    const { areaId } = iniciar('area');
    expect(envDoApp().planViewId?.()).toBeNull();
    expect(envDoApp().areaPlanId?.()).toBe(areaId);
    expect(editor.plantaDonaDasAnotacoes()).toBe(areaId);
    iniciar('pvA');
    useUi.setState({ planKind: 'roof' });
    expect(envDoApp().planViewId?.()).toBeNull();
    // planta de outro nível ou inexistente vira null (a vista abre na padrão)
    useUi.setState({ planKind: 'floor', planViewId: 'pv-que-nao-existe' });
    expect(envDoApp().planViewId?.()).toBeNull();
  });

  it('cota por três cliques (ferramenta do app) na planta de disciplina grava na PlanView, não no nível', () => {
    iniciar('pvA');
    editor.setTool('dimension');
    clicar(0, 0);
    clicar(6, 0);
    clicar(3, 1);
    const p = editor.project;
    const dims = planAnnotationsOf(planViewById(p, 'pvA')!).dimensions;
    expect(dims).toHaveLength(1);
    expect(dims[0]).toMatchObject({ a: { x: 0, y: 0 }, b: { x: 6, y: 0 } });
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).toEqual(['dN']); // o nível segue só com a dele
    expect(planViewById(p, 'pvB')!.annotations).toBeUndefined();
  });

  it('comando de anotação sem planId (texto, cota, etiqueta): a rede do exec1 roteia para a planta de disciplina', () => {
    iniciar('pvA');
    editor.applyCommand({ type: 'addText', levelId: 'lv_0', text: NOTA });
    editor.applyCommand({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'dA', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 1 } });
    const p = editor.project;
    expect(planAnnotationsOf(planViewById(p, 'pvA')!).texts.map((t) => t.id)).toEqual(['tx1']);
    expect(planAnnotationsOf(planViewById(p, 'pvA')!).dimensions.map((d) => d.id)).toEqual(['dA']);
    expect(levelTexts(p, 'lv_0')).toEqual([]);
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).toEqual(['dN']);
  });

  it('etiquetar tudo (tagAllNotTagged) na planta de disciplina grava as etiquetas na planta', () => {
    iniciar('pvA');
    expect(tagAllNotTagged()).toBe(1);
    const p = editor.project;
    expect(planAnnotationsOf(planViewById(p, 'pvA')!).tags.map((t) => t.hostId)).toEqual(['w1']);
    expect(p.levels[0]!.tags ?? []).toEqual([]);
    // segunda chamada: a planta já tem a etiqueta, não duplica
    expect(tagAllNotTagged()).toBe(0);
  });

  it('planta padrão e planta de área seguem como antes', () => {
    iniciar('padrao');
    editor.applyCommand({ type: 'addText', levelId: 'lv_0', text: NOTA });
    expect(levelTexts(editor.project, 'lv_0').map((t) => t.id)).toEqual(['tx1']);
    expect(planViewById(editor.project, 'pvA')!.annotations).toBeUndefined();
    const { areaId } = iniciar('area');
    editor.applyCommand({ type: 'addText', levelId: 'lv_0', text: NOTA });
    expect(planAnnotationsOf(areaPlanOf(editor.project, areaId)!).texts.map((t) => t.id)).toEqual(['tx1']);
    expect(levelTexts(editor.project, 'lv_0')).toEqual([]);
    expect(planViewById(editor.project, 'pvA')!.annotations).toBeUndefined();
  });
});

describe('Mover, Copiar e Excluir na planta de disciplina (controlador real)', () => {
  function comAnotacoes(): void {
    iniciar('pvA');
    editor.store.exec({ type: 'addDimension', levelId: 'lv_0', planId: 'pvA', dimension: { id: 'dA', a: { x: 0, y: 0 }, b: { x: 6, y: 0 }, offset: 1 } });
    editor.store.exec({ type: 'addText', levelId: 'lv_0', planId: 'pvA', text: NOTA });
  }

  it('a seleção de anotação da planta sobrevive à poda (pruneSelection) após uma edição', () => {
    comAnotacoes();
    useUi.setState({ selection: ['dA', 'tx1'] });
    editor.applyCommand({ type: 'updateText', levelId: 'lv_0', id: 'tx1', patch: { text: 'Outra' } });
    expect(useUi.getState().selection).toEqual(['dA', 'tx1']);
    expect(planAnnotationsOf(planViewById(editor.project, 'pvA')!).texts[0]!.text).toBe('Outra');
  });

  it('Mover com a cota e o texto da planta: movem na planta (0, 1); a cota do nível fica', () => {
    comAnotacoes();
    useUi.setState({ selection: ['dA', 'tx1'] });
    editor.setTool('move');
    clicar(0, 0);
    clicar(0, 1);
    const p = editor.project;
    const a = planAnnotationsOf(planViewById(p, 'pvA')!);
    expect(a.dimensions[0]).toMatchObject({ id: 'dA', a: { x: 0, y: 1 }, b: { x: 6, y: 1 } });
    expect(a.texts[0]).toMatchObject({ id: 'tx1', at: { x: 3, y: 7 } });
    expect(levelDimensions(p, 'lv_0')[0]).toMatchObject({ id: 'dN', a: { x: 0, y: -2 }, b: { x: 6, y: -2 } });
  });

  it('Copiar com parede + cota da planta: a cópia da cota nasce na planta; o nível segue com uma cota', () => {
    comAnotacoes();
    useUi.setState({ selection: ['w1', 'dA'] });
    editor.setTool('copy');
    clicar(0, 0);
    clicar(0, 2);
    editor.setTool('select');
    const p = editor.project;
    const dims = planAnnotationsOf(planViewById(p, 'pvA')!).dimensions;
    expect(dims).toHaveLength(2);
    expect(dims.find((d) => d.id !== 'dA')).toMatchObject({ a: { x: 0, y: 2 }, b: { x: 6, y: 2 } });
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).toEqual(['dN']);
    expect(wallsOnLevel(p, 'lv_0')).toHaveLength(2); // parede copiada no nível (elemento é do nível)
    expect(planViewById(p, 'pvB')!.annotations).toBeUndefined();
  });

  it('Excluir remove a anotação da planta; a do nível fica; o desfazer devolve', () => {
    comAnotacoes();
    useUi.setState({ selection: ['tx1', 'dN'] }); // dN é do nível: não pertence a esta planta
    editor.deleteSelection();
    let p = editor.project;
    expect(planAnnotationsOf(planViewById(p, 'pvA')!).texts).toEqual([]);
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).toEqual(['dN']);
    editor.undo();
    p = editor.project;
    expect(planAnnotationsOf(planViewById(p, 'pvA')!).texts.map((t) => t.id)).toEqual(['tx1']);
  });

  it('seleção por clique, painel de propriedades e duplo clique leem a anotação da planta', () => {
    comAnotacoes();
    clicar(3, 6);
    expect(useUi.getState().selection).toEqual(['tx1']);
    const p = editor.project;
    expect(selectedNote(p, 'lv_0', ['tx1'], 'pvA', null)?.text?.id).toBe('tx1');
    expect(selectedNote(p, 'lv_0', ['tx1'], null, null)).toBeNull(); // padrão não vê a anotação da planta
    expect(findEditDim(p, { view: 'plan', levelId: 'lv_0', areaPlanId: null, planKind: 'floor', sectionId: null, planViewId: 'pvA' }, 'dA')?.dim.id).toBe('dA');
    expect(findEditDim(p, { view: 'plan', levelId: 'lv_0', areaPlanId: null, planKind: 'floor', sectionId: null }, 'dA')).toBeNull();
    expect(cotaParaEditar(p, { vista: 'plan', levelId: 'lv_0', planId: 'pvA', mpp: 0.02 }, { x: 3, y: 1 })).toBe('dA');
  });
});

describe('Colar na planta de disciplina', () => {
  it('Ctrl+V (Colar) na planta de disciplina cola o elemento no nível da planta, sem tocar nas anotações', () => {
    iniciar('pvA');
    useUi.setState({ selection: ['w1'] });
    expect(editor.copySelection()).toBe(true);
    useUi.setState({ selection: [] });
    expect(editor.pasteAligned()).toBe(true);
    clicar(0, 5); // base do buffer
    clicar(0, 6);
    editor.setTool('select');
    const p = editor.project;
    expect(wallsOnLevel(p, 'lv_0')).toHaveLength(2);
    expect(useUi.getState().planViewId).toBe('pvA'); // segue na planta
    expect(planViewById(p, 'pvA')!.annotations).toBeUndefined();
    expect(levelDimensions(p, 'lv_0').map((d) => d.id)).toEqual(['dN']);
  });

  it('Colar alinhado: cancelar o diálogo ou a prévia volta à planta de disciplina de origem', () => {
    iniciar('pvA');
    useUi.setState({ selection: ['w1'] });
    editor.copySelection();
    expect(editor.openPasteLevelsDialog()).toBe(true);
    useUi.setState({ view: '3d' }); // o diálogo pré-aquece o 3D atrás dele
    editor.cancelPasteLevelsDialog();
    let ui = useUi.getState();
    expect([ui.view, ui.planKind, ui.planViewId, ui.levelId]).toEqual(['plan', 'floor', 'pvA', 'lv_0']);

    // prévia: sai da planta (vai para o 3D) e o cancelamento restaura a planta de origem
    const s = new ProjectStore(editor.project);
    s.exec({ type: 'upsertLevel', level: { id: 'lv_1', name: 'Pav. 1', elevation: 3 } as never });
    editor.load(s.project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'floor', areaPlanId: null, planViewId: 'pvA', selection: ['w1'] });
    editor.copySelection();
    expect(editor.previewPasteLevels(['lv_1'], false)).toBe(true);
    expect(useUi.getState().view).toBe('3d');
    editor.cancelPasteLevels();
    ui = useUi.getState();
    expect([ui.view, ui.planKind, ui.planViewId, ui.levelId]).toEqual(['plan', 'floor', 'pvA', 'lv_0']);
  });

  it('Colar alinhado numa planta que foi removida volta à planta padrão (sem erro)', () => {
    iniciar('pvA');
    useUi.setState({ selection: ['w1'] });
    editor.copySelection();
    editor.openPasteLevelsDialog();
    editor.store.exec({ type: 'removePlanView', id: 'pvA' });
    editor.cancelPasteLevelsDialog();
    const ui = useUi.getState();
    expect([ui.view, ui.planViewId]).toEqual(['plan', null]);
  });
});
