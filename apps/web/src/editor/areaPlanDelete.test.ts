import { describe, expect, it } from 'vitest';
import type { Vec2 } from '@hestia/geom';
import { areaPlanOf, createEmptyProject, levelRoomSeparators, makeRoom, makeWall, ProjectStore } from '@hestia/model';
import { createAreaPlanAction } from './areaPlanActions.ts';
import { deleteSelectionIn } from './deleteIds.ts';
import { resolveText } from './i18n.ts';
import { useUi } from './state.ts';

const ring = (pts: Array<[number, number]>): Vec2[] => pts.map(([x, y]) => ({ x, y }));

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

function abrirPlanta(s: ProjectStore): string {
  const planId = createAreaPlanAction(s, 'lv_0');
  useUi.setState({ view: 'plan', planKind: 'area', areaPlanId: planId, levelId: 'lv_0', selection: [] });
  return planId;
}

describe('excluir na planta de área', () => {
  it('apaga o ambiente selecionado e o desfazer o devolve', async () => {
    const s = store();
    abrirPlanta(s);
    useUi.setState({ selection: ['r1'] });
    await deleteSelectionIn(s);
    expect(s.project.elements.r1).toBeUndefined();
    expect(useUi.getState().selection).toEqual([]);
    s.undo();
    expect(s.project.elements.r1).toBeDefined();
  });

  it('apaga a linha de separador de ambiente/área', async () => {
    const s = store();
    s.exec({ type: 'addRoomSeparator', levelId: 'lv_0', separator: { id: 'sep1', a: { x: 2, y: 0 }, b: { x: 2, y: 5 } } });
    abrirPlanta(s);
    expect(levelRoomSeparators(s.project, 'lv_0')).toHaveLength(1);
    useUi.setState({ selection: ['sep1'] });
    await deleteSelectionIn(s);
    expect(levelRoomSeparators(s.project, 'lv_0')).toHaveLength(0);
  });

  it('continua bloqueando parede e mostra o motivo', async () => {
    const s = store();
    abrirPlanta(s);
    useUi.setState({ selection: ['w0'] });
    await deleteSelectionIn(s);
    expect(s.project.elements.w0).toBeDefined();
    expect(resolveText(useUi.getState().status, 'pt')).toContain('paredes');
  });

  it('apaga anotação da vista junto com ambiente, sem tocar no nível', async () => {
    const s = store();
    const planId = abrirPlanta(s);
    s.exec({ type: 'addText', levelId: 'lv_0', planId, text: { id: 't1', at: { x: 1, y: 1 }, text: 'Nota', height: 2.5, rotation: 0 } });
    useUi.setState({ selection: ['t1', 'r1'] });
    await deleteSelectionIn(s);
    expect(areaPlanOf(s.project, planId)!.annotations?.texts).toHaveLength(0);
    expect(s.project.elements.r1).toBeUndefined();
  });
});
