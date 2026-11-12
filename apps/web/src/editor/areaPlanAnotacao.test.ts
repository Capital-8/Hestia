import { beforeEach, describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { areaPlanOf, createEmptyProject, floorViewId, viewAnnotationsOf, dimensionGeometry, dimensionPoints, makeRoom, makeWall, ProjectStore } from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { editor } from './controller.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';
import { activateView } from './viewTabActions.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

const clique = (x: number, y: number): { raw: Vec2; shift: boolean; ctrl: boolean; alt: boolean } => ({
  raw: { x, y }, shift: false, ctrl: false, alt: false,
});

/** Clique de mouse como a tela envia: down, up e click (o `selectTool` decide no down e confirma no up). */
const cliqueMouse = (x: number, y: number): void => {
  const p = clique(x, y);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
};

function store(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    const b = pts[(i + 1) % pts.length]!;
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  return s;
}

/** Abre a planta de área no controlador, com a ferramenta pedida. Devolve o id da planta. */
function iniciar(tool: 'select' | 'dimension' | 'text' | 'room' | 'roomsep' = 'select'): string {
  const s = store();
  const planId = createAreaPlanAction(s, 'lv_0');
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', levelId: 'lv_0', planViewId: planId, selection: [], hover: null, options: DEFAULT_OPTIONS });
  editor.setTool(tool);
  return planId;
}

describe('ferramentas de anotação na planta de área', () => {
  beforeEach(() => { useUi.setState({ options: DEFAULT_OPTIONS }); });

  it('com Selecionar, o clique escolhe o ambiente', () => {
    iniciar('select');
    cliqueMouse(2, 2.5);
    expect(useUi.getState().selection).toEqual(['r1']);
  });

  it('com Cota ativa, o clique não seleciona o ambiente e vira ponto da cota', () => {
    const planId = iniciar('dimension');
    editor.pointer('click', clique(0.5, 2));
    expect(useUi.getState().selection).toEqual([]);
    editor.pointer('click', clique(3.5, 2));
    editor.pointer('click', clique(2, 3));
    const plan = areaPlanOf(editor.project, planId)!;
    expect(plan.annotations?.dimensions).toHaveLength(1);
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).dimensions).toHaveLength(0);
  });

  it('ferramenta de modelo entra na planta de área (Fase 3: sem bloqueio); ambiente e separador também', () => {
    iniciar('select');
    editor.setTool('wall');
    expect(useUi.getState().tool).toBe('wall');
    editor.setTool('room');
    expect(useUi.getState().tool).toBe('room');
    editor.setTool('roomsep');
    expect(useUi.getState().tool).toBe('roomsep');
    editor.setTool('text');
    expect(useUi.getState().tool).toBe('text');
  });

  it('cria ambiente e separador de área na planta de área', () => {
    iniciar('room');
    const antes = Object.values(editor.project.elements).filter((e) => e.kind === 'room').length;
    cliqueMouse(2, 2.5);
    const depois = Object.values(editor.project.elements).filter((e) => e.kind === 'room').length;
    expect(depois).toBe(antes + 1);

    iniciar('roomsep');
    cliqueMouse(0, 1);
    cliqueMouse(4, 1);
    expect(editor.project.levels[0]!.roomSeparators ?? []).toHaveLength(1);
  });

  it('cotas automáticas gravam em plan.annotations com o planId, não no nível', () => {
    const planId = iniciar('select');
    editor.cotasAutomaticasDaPlanta({});
    const plan = areaPlanOf(editor.project, planId)!;
    expect(plan.annotations?.dimensions.length ?? 0).toBeGreaterThan(0);
    expect(viewAnnotationsOf(editor.project, floorViewId('lv_0')).dimensions).toHaveLength(0);
  });

  it('com Selecionar, o clique pega a cota e o texto de plan.annotations', () => {
    const planId = iniciar('select');
    editor.store.exec({ type: 'addDimension', levelId: 'lv_0', planId, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    editor.store.exec({ type: 'addText', levelId: 'lv_0', planId, text: { id: 't1', at: { x: 2, y: 2.5 }, text: 'Sala', height: 2.5, rotation: 0 } });
    expect(areaPlanOf(editor.project, planId)!.annotations?.texts).toHaveLength(1);
    const plano = areaPlanOf(editor.project, planId)!;
    const dim = plano.annotations!.dimensions[0]!;
    const pts = dimensionPoints(editor.project, dim);
    const g = dimensionGeometry(pts.a, pts.b, dim.offset, 0.04);
    cliqueMouse(g.textAt.x, g.textAt.y);
    expect(useUi.getState().selection).toEqual(['d1']);
    cliqueMouse(2, 2.5);
    expect(useUi.getState().selection).toEqual(['t1']);
  });

  it('janela de seleção pega cota e texto da planta de área', () => {
    const planId = iniciar('select');
    editor.store.exec({ type: 'addDimension', levelId: 'lv_0', planId, dimension: { id: 'd1', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    editor.store.exec({ type: 'addText', levelId: 'lv_0', planId, text: { id: 't1', at: { x: 2, y: 2.5 }, text: 'Sala', height: 2.5, rotation: 0 } });
    editor.pointer('down', clique(-0.5, -0.5));
    editor.pointer('drag', clique(5, 3));
    editor.pointer('up', clique(5, 3));
    expect(useUi.getState().selection).toEqual(expect.arrayContaining(['d1', 't1']));
  });

  it('abrir uma planta antiga pela aba semeia as anotações antes da seleção', () => {
    const s = store();
    s.exec({ type: 'addDimension', levelId: 'lv_0', dimension: { id: 'd-level', a: { x: 0, y: 0 }, b: { x: 4, y: 0 }, offset: 1 } });
    s.exec({ type: 'addText', levelId: 'lv_0', text: { id: 't-level', at: { x: 2, y: 2.5 }, text: 'Nota', height: 2.5, rotation: 0 } });
    const planId = createAreaPlanAction(s, 'lv_0');
    // Simula o projeto salvo antes das anotações por vista.
    s.exec({ type: 'updateAreaPlan', id: planId, patch: { annotations: undefined } });
    editor.load(s.project, 'teste.hestia.json');
    activateView({ kind: 'plan', viewId: planId });
    const plan = areaPlanOf(editor.project, planId)!;
    expect(plan.annotations).toBeDefined();
    expect(plan.annotations?.dimensions).toHaveLength(1);
    expect(plan.annotations?.texts).toHaveLength(1);
  });
});
