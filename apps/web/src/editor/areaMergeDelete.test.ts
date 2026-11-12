import { describe, expect, it } from 'vitest';
import { createEmptyProject, makeRoom, makeWall, ProjectStore } from '@hestia/model';
import { deleteSelectionIn } from './deleteIds.ts';
import { pedidoAreaMerge, responderAreaMerge } from './areaMergePrompt.ts';
import { useUi } from './state.ts';

/** Duas salas separadas por uma parede interna (3 × 5 e 5 × 5). */
function store(): ProjectStore {
  const s = new ProjectStore(createEmptyProject());
  for (const [id, a, b] of [
    ['w0', { x: 0, y: 0 }, { x: 8, y: 0 }],
    ['w1', { x: 8, y: 0 }, { x: 8, y: 5 }],
    ['w2', { x: 8, y: 5 }, { x: 0, y: 5 }],
    ['w3', { x: 0, y: 5 }, { x: 0, y: 0 }],
    ['wmid', { x: 3, y: 0 }, { x: 3, y: 5 }],
  ] as Array<[string, { x: number; y: number }, { x: number; y: number }]>) {
    s.exec({ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a, b, locationLine: 'finishInterior' }) });
  }
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Depósito', number: '101', point: { x: 1.5, y: 2.5 } }) });
  s.exec({ type: 'addRoom', room: makeRoom({ id: 'r2', levelId: 'lv_0', name: 'Sala', number: '102', point: { x: 5.5, y: 2.5 } }) });
  useUi.setState({ view: 'plan', planViewId: 'pv_lv_0', levelId: 'lv_0', selection: ['wmid'] });
  return s;
}

describe('exclusão de parede com fusão de áreas', () => {
  it('cancelar não apaga a parede nem os ambientes', async () => {
    const s = store();
    const promessa = deleteSelectionIn(s);
    expect(pedidoAreaMerge()).not.toBeNull();
    responderAreaMerge(false);
    await promessa;
    expect(s.project.elements.wmid).toBeDefined();
    expect(s.project.elements.r1).toBeDefined();
    expect(s.project.elements.r2).toBeDefined();
  });

  it('confirmar apaga a parede e a área menor, mantendo a maior', async () => {
    const s = store();
    const promessa = deleteSelectionIn(s);
    responderAreaMerge(true);
    await promessa;
    expect(s.project.elements.wmid).toBeUndefined();
    expect(s.project.elements.r1).toBeUndefined();
    expect(s.project.elements.r2).toBeDefined();
  });
});
