import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  areaPlanOf,
  createEmptyProject,
  floorViewId,
  hiddenTargetOfView,
  makeWall,
  planViewHiddenOf,
  ProjectStore,
  roofViewId,
  viewAnnotationsOf,
  viewOfTest,
  type Command,
  type Project,
  type TextNote,
} from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { editor } from './controller.ts';
import { planViewIdDaAba } from './openViews.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { hideInView, unhideInView, viewHiddenTargetOf, visibilityKeyOf } from './viewVisibility.ts';
import { areaViewIdAtivo, chaveDeViewportDePlanta, tipoDeVistaDeFundo } from './vistaAtiva.ts';

/** Projeto com uma parede no nível e uma planta de área (sem anotações próprias não: `createAreaPlanAction` semeia). */
function montar(): { project: Project; planId: string } {
  const s = new ProjectStore(createEmptyProject());
  s.exec({ type: 'addWall', wall: makeWall({ id: 'w0', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, locationLine: 'finishInterior' }) });
  const planId = createAreaPlanAction(s, 'lv_0');
  return { project: s.project, planId };
}

const nota = (id: string): TextNote => ({ id, at: { x: 1, y: 1 }, text: id, height: 0.2, rotation: 0 });

const piso = { view: 'plan', planKind: 'floor', areaPlanId: null } as const;
const cobertura = { view: 'plan', planKind: 'roof', areaPlanId: null } as const;

beforeEach(() => useUi.setState({ options: DEFAULT_OPTIONS, tool: 'select', status: '', viewTemp: {}, selection: [] }));
afterEach(() => useUi.setState({ view: 'plan', planKind: 'floor', levelId: 'lv_0', areaPlanId: null, sectionId: null, viewTemp: {}, selection: [] }));

describe('permissão de ferramenta pela tabela (setTool)', () => {
  const ir = (estado: Partial<ReturnType<typeof useUi.getState>>): void => {
    const { project } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ levelId: 'lv_0', selection: [], hover: null, tool: 'select', status: '', ...estado });
  };

  it('piso aceita ferramenta de modelo', () => {
    ir({ ...piso });
    editor.setTool('wall');
    expect(useUi.getState().tool).toBe('wall');
  });

  it('cobertura aceita ferramenta de modelo (a tabela não restringe a cobertura hoje)', () => {
    ir({ ...cobertura });
    editor.setTool('wall');
    expect(useUi.getState().tool).toBe('wall');
  });

  it('planta de área recusa parede e avisa; aceita anotação e ambiente', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: planId, selection: [], tool: 'select', status: '' });
    editor.setTool('wall');
    expect(useUi.getState().tool).toBe('select');
    expect(useUi.getState().status).toEqual({ key: 'eds_msg_area_tools_only' });
    for (const id of ['dimension', 'text', 'room', 'roomsep', 'detailLine'] as const) {
      editor.setTool(id);
      expect(useUi.getState().tool, id).toBe(id);
    }
  });

  it('3D com planta de área "de fundo" não restringe (só a planta ativa decide)', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: '3d', levelId: 'lv_0', planKind: 'area', areaPlanId: planId, selection: [], tool: 'select', status: '' });
    editor.setTool('wall');
    expect(useUi.getState().tool).toBe('wall');
  });

  it('corte com planta de área "de fundo" continua restrito pela tabela da área (comportamento antigo)', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'section', sectionId: null, levelId: 'lv_0', planKind: 'area', areaPlanId: planId, selection: [], tool: 'select', status: '' });
    editor.setTool('wall');
    expect(useUi.getState().status).toEqual({ key: 'eds_msg_area_tools_only' });
  });
});

describe('comando de anotação emitido pelo editor, por viewId', () => {
  /** Mesmo resultado do caminho antigo: o comando com `planId` aplicado direto no armazenamento. */
  function esperado(project: Project, comando: Command): Project {
    const s = new ProjectStore(structuredClone(project));
    s.exec(comando);
    return s.project;
  }

  it('planta de área: grava em plan.annotations (igual ao comando antigo com planId), não no nível', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: planId });
    const antes = editor.project;
    editor.applyCommand({ type: 'addText', levelId: 'lv_0', text: nota('t1') });
    const velho = esperado(antes, { type: 'addText', levelId: 'lv_0', planId, text: nota('t1') });
    expect(editor.project.levels).toEqual(velho.levels);
    expect(editor.project.planViews).toEqual(velho.planViews);
    expect(areaPlanOf(editor.project, planId)!.annotations?.texts.map((t) => t.id)).toEqual(['t1']);
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).texts).toHaveLength(0);
  });

  it('piso: grava no nível, como sempre', () => {
    const { project } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ ...piso, levelId: 'lv_0' });
    const antes = editor.project;
    editor.applyCommand({ type: 'addText', levelId: 'lv_0', text: nota('t2') });
    const velho = esperado(antes, { type: 'addText', levelId: 'lv_0', text: nota('t2') });
    expect(editor.project.levels).toEqual(velho.levels);
    expect(editor.project.planViews).toEqual(velho.planViews);
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).texts.map((t) => t.id)).toEqual(['t2']);
  });

  it('comando que já traz planId ou viewId não é reescrito', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: planId });
    editor.applyCommand({ type: 'addText', levelId: 'lv_0', viewId: floorViewId('lv_0'), text: nota('t3') });
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).texts.map((t) => t.id)).toEqual(['t3']);
    expect(areaPlanOf(editor.project, planId)!.annotations?.texts ?? []).toHaveLength(0);
  });

  it('cotas automáticas na planta de área entram na vista (viewId), no mesmo passo de desfazer', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: planId });
    editor.cotasAutomaticasDaPlanta();
    const n = areaPlanOf(editor.project, planId)!.annotations?.dimensions.length ?? 0;
    expect(n).toBeGreaterThan(0);
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).dimensions).toHaveLength(0);
  });
});

describe('ocultar e reexibir na vista, por viewId', () => {
  const casos = [
    { nome: 'piso', estado: () => ({ ...piso }), viewId: () => floorViewId('lv_0'), alvo: { kind: 'plan', levelId: 'lv_0' } },
    { nome: 'cobertura', estado: () => ({ ...cobertura }), viewId: () => roofViewId('lv_0'), alvo: { kind: 'roof', levelId: 'lv_0' } },
  ] as const;

  for (const c of casos) {
    it(`${c.nome}: o alvo é o de hiddenTargetOfView e o ciclo ocultar/reexibir fecha`, () => {
      const { project } = montar();
      editor.load(project, 'teste.hestia.json');
      useUi.setState({ ...c.estado(), levelId: 'lv_0' });
      expect(viewHiddenTargetOf(useUi.getState(), editor.project)).toEqual(c.alvo);
      expect(viewHiddenTargetOf(useUi.getState(), editor.project)).toEqual(hiddenTargetOfView(editor.project, c.viewId()));
      expect(viewHiddenTargetOf(useUi.getState())).toEqual(c.alvo);
      hideInView(['w0']);
      expect(planViewHiddenOf(editor.project, c.viewId()).elements).toEqual(['w0']);
      // Cada vista guarda no seu `hidden` (`pv_`/`pvr_`); a outra não é tocada.
      const doPiso = viewOfTest(editor.project, floorViewId('lv_0'));
      const daCobertura = viewOfTest(editor.project, roofViewId('lv_0'));
      expect(c.nome === 'piso' ? doPiso.hidden?.elements : daCobertura.hidden?.elements).toEqual(['w0']);
      expect(c.nome === 'piso' ? daCobertura.hidden : doPiso.hidden).toBeUndefined();
      unhideInView(['w0']);
      expect(planViewHiddenOf(editor.project, c.viewId()).elements).toBeUndefined();
    });
  }

  it('planta de área: grava em hidden da vista de área e não toca nas vistas do nível', () => {
    const { project, planId } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: planId });
    expect(viewHiddenTargetOf(useUi.getState(), editor.project)).toEqual({ kind: 'area', planId });
    hideInView(['w0']);
    expect(areaPlanOf(editor.project, planId)!.hidden?.elements).toEqual(['w0']);
    expect(planViewHiddenOf(editor.project, planId).elements).toEqual(['w0']);
    expect(viewOfTest(editor.project, floorViewId('lv_0')).hidden).toBeUndefined();
    unhideInView(['w0']);
    expect(areaPlanOf(editor.project, planId)!.hidden).toBeUndefined();
  });

  it('vista que não existe no projeto: o alvo cai no tipo da vista ativa, sem lançar', () => {
    const { project } = montar();
    editor.load(project, 'teste.hestia.json');
    useUi.setState({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: 'ap_inexistente' });
    expect(viewHiddenTargetOf(useUi.getState(), editor.project)).toEqual({ kind: 'area', planId: 'ap_inexistente' });
  });
});

describe('seletores acrescentados em vistaAtiva e openViews', () => {
  it('tipoDeVistaDeFundo ignora `view` e `areaPlanId`', () => {
    expect(tipoDeVistaDeFundo({ planKind: 'roof' })).toBe('roof');
    expect(tipoDeVistaDeFundo({ planKind: 'area' })).toBe('area');
  });

  it('areaViewIdAtivo só na planta de área ativa', () => {
    const ui = { view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: 'ap1' } as const;
    expect(areaViewIdAtivo(ui)).toBe('ap1');
    expect(areaViewIdAtivo({ ...ui, view: '3d' })).toBeNull();
    expect(areaViewIdAtivo({ ...ui, areaPlanId: null })).toBeNull();
    expect(areaViewIdAtivo({ ...ui, planKind: 'floor' })).toBeNull();
  });

  it('chaveDeViewportDePlanta: piso é o nível; cobertura e área têm prefixo', () => {
    expect(chaveDeViewportDePlanta({ levelId: 'lv_0', planKind: 'floor', areaPlanId: null })).toBe('lv_0');
    expect(chaveDeViewportDePlanta({ levelId: 'lv_0', planKind: 'roof', areaPlanId: null })).toBe('roof:lv_0');
    expect(chaveDeViewportDePlanta({ levelId: 'lv_0', planKind: 'area', areaPlanId: 'ap1' })).toBe('area:ap1');
    expect(chaveDeViewportDePlanta({ levelId: 'lv_0', planKind: 'area', areaPlanId: null })).toBe('area:lv_0');
  });

  it('planViewIdDaAba: id da vista da aba', () => {
    expect(planViewIdDaAba({ levelId: 'lv_0' })).toBe(floorViewId('lv_0'));
    expect(planViewIdDaAba({ levelId: 'lv_0', planKind: 'roof' })).toBe(roofViewId('lv_0'));
    expect(planViewIdDaAba({ levelId: 'lv_0', planKind: 'area', areaPlanId: 'ap1' })).toBe('ap1');
    expect(planViewIdDaAba({ levelId: 'lv_0', planKind: 'area' })).toBeNull();
  });

  it('visibilityKeyOf continua com os mesmos prefixos', () => {
    expect(visibilityKeyOf({ view: 'plan', levelId: 'lv_0', planKind: 'area', areaPlanId: null, sectionId: null })).toBeNull();
  });
});
