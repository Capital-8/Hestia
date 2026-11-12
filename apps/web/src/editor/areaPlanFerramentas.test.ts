import { beforeEach, describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { areaPlanOf, createEmptyProject, levelRoomSeparators, makeRoom, makeWall, ProjectStore } from '@hestia/model';
import type { ToolId } from '@hestia/tools';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { editor } from './controller.ts';
import { DEFAULT_OPTIONS, useUi } from './state.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));
const info = (x: number, y: number) => ({ raw: { x, y }, shift: false, ctrl: false, alt: false });
const clicar = (x: number, y: number): void => {
  const p = info(x, y);
  editor.pointer('down', p);
  editor.pointer('up', p);
  editor.pointer('click', p);
};

function iniciar(): { planId: string; s: ProjectStore } {
  const s = new ProjectStore(createEmptyProject());
  const pts = ring([[0, 0], [0, 5], [4, 5], [4, 0]]);
  pts.forEach((a, i) => {
    s.exec({ type: 'addWall', wall: makeWall({ id: `w${i}`, typeId: 'wt_alv14', levelId: 'lv_0', a, b: pts[(i + 1) % pts.length]!, locationLine: 'finishInterior' }) });
  });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '101', point: { x: 2, y: 2.5 } }) });
  s.exec({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 'rs1', a: { x: 1, y: 1 }, b: { x: 3, y: 1 } } });
  const planId = createAreaPlanAction(s, 'lv_0');
  editor.load(s.project, 'teste.hestia.json');
  useUi.setState({ view: 'plan', levelId: 'lv_0', planViewId: planId, selection: [], hover: null, options: DEFAULT_OPTIONS });
  editor.setTool('select');
  return { planId, s };
}

describe('ferramentas liberadas na planta de área', () => {
  beforeEach(() => { useUi.setState({ options: DEFAULT_OPTIONS }); });

  it('ferramentas de anotação, de área e de modelo entram (Fase 3: nada é bloqueado)', () => {
    iniciar();
    const tools: ToolId[] = ['room', 'dimension', 'text', 'tag', 'roomsep', 'detailLine', 'filledRegion', 'measure', 'wall', 'door', 'window', 'stair', 'ramp'];
    for (const t of tools) {
      editor.setTool('select');
      editor.setTool(t);
      expect(useUi.getState().tool, t).toBe(t);
      expect(useUi.getState().status, t).not.toEqual({ key: 'eds_msg_tool_not_in_view' });
    }
  });

  it('seleção mista: anotação sob o cursor vence; sem anotação, seleciona parede e separador', () => {
    const { planId } = iniciar();
    editor.store.exec({ type: 'addText', levelId: 'lv_0', planId, text: { id: 'tx1', at: { x: 2, y: 3.5 }, text: 'Nota', height: 2.5, rotation: 0 } });
    clicar(2, 3.5);
    expect(useUi.getState().selection).toEqual(['tx1']);
    clicar(0, 2.5);
    expect(useUi.getState().selection).toEqual(['w0']);
    clicar(2, 1);
    expect(useUi.getState().selection).toEqual(['rs1']);
  });

  it('Delete remove anotação da vista, parede (modelo, como no piso) e separador num único undo', () => {
    const { planId } = iniciar();
    editor.store.exec({ type: 'addText', levelId: 'lv_0', planId, text: { id: 'tx1', at: { x: 2, y: 3.5 }, text: 'Nota', height: 2.5, rotation: 0 } });
    useUi.setState({ selection: ['tx1', 'w0', 'rs1'] });
    editor.deleteSelection();
    const p = editor.project;
    expect(p.elements['w0']).toBeUndefined();
    expect(p.elements['w1']).toBeDefined();
    expect(areaPlanOf(p, planId)!.annotations?.texts ?? []).toHaveLength(0);
    expect(levelRoomSeparators(p, 'lv_0')).toHaveLength(0);
    editor.undo();
    const q = editor.project;
    expect(q.elements['w0']).toBeDefined();
    expect(areaPlanOf(q, planId)!.annotations?.texts).toHaveLength(1);
    expect(levelRoomSeparators(q, 'lv_0')).toHaveLength(1);
  });
});
