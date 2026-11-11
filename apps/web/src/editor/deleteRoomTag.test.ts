import { describe, expect, it } from 'vitest';
import { DEFAULT_AREA_GRAPHICS, ProjectStore, createEmptyProject, makeRoom } from '@hestia/model';
import { deleteSelectionIn } from './deleteIds.ts';
import { useUi } from './state.ts';
import { areaPlansOf } from '@hestia/model';

describe('Delete de RoomTag na planta de área', () => {
  it('remove a etiqueta e um único undo a restaura', () => {
    const store = new ProjectStore(createEmptyProject());
    store.exec({ type: 'addRoom', room: makeRoom({ id: 'r1', levelId: 'lv_0', name: 'Sala', number: '1', point: { x: 2, y: 1.5 } }) });
    store.exec({ type: 'addAreaPlan', plan: { id: 'ap1', name: 'A', levelId: 'lv_0', scale: 50, graphics: { ...DEFAULT_AREA_GRAPHICS }, tags: [] } });
    store.exec({ type: 'addRoomTag', planId: 'ap1', tag: { id: 'rt1', planId: 'ap1', roomId: 'r1', at: { x: 1, y: 1 }, orientation: 'horizontal', leader: 'none', fields: ['name'], visible: true } });
    useUi.setState({ selection: ['rt1'], levelId: 'lv_0', view: 'plan', planKind: 'area', planViewId: 'ap1' });
    deleteSelectionIn(store);
    expect(areaPlansOf(store.project)[0]!.tags).toHaveLength(0);
    store.undo();
    expect(areaPlansOf(store.project)[0]!.tags).toHaveLength(1);
  });
});
