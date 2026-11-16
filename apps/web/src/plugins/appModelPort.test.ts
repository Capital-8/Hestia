import { createEmptyProject, makeWall, ProjectStore } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { createModelPort, setPluginInfoResolver } from './appModelPort.ts';

const PID = 'dev.exemplo.web';

describe('createModelPort', () => {
  it('lê cópia, emite ids, aplica com rótulo do plugin e mantém dados próprios', () => {
    setPluginInfoResolver(() => ({ name: 'Grade', dataSchema: 2, version: '1.0.0' }));
    const store = new ProjectStore(createEmptyProject());
    const { model, data } = createModelPort(() => store);
    const snap = model.read() as { elements: Record<string, unknown> };
    snap.elements['x'] = 1; // mexer na cópia não afeta o projeto
    expect(store.project.elements['x']).toBeUndefined();

    const id = model.newId(PID, 'w');
    const r = model.apply(PID, 'gerar', [{ type: 'addWall', wall: makeWall({ id, typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) }]);
    expect(r).toEqual({ ok: true, applied: 1 });
    expect(store.undoLabel).toBe('Grade: gerar');

    data.set(PID, 'ultima', { nx: 4 });
    expect(data.get(PID, 'ultima')).toEqual({ nx: 4 });
    expect(data.keys(PID)).toEqual(['ultima']);
    expect(data.readOnly(PID)).toBe(false);
    setPluginInfoResolver(() => ({ name: 'Grade', dataSchema: 1, version: '0.9.0' }));
    expect(data.readOnly(PID)).toBe(true);
    expect(() => data.set(PID, 'ultima', 1)).toThrow(/somente leitura/);
    setPluginInfoResolver((p) => ({ name: p, dataSchema: 1, version: '' }));
  });

  it('id inventado é recusado e nada muda', () => {
    const store = new ProjectStore(createEmptyProject());
    const { model } = createModelPort(() => store);
    const r = model.apply(PID, 'x', [{ type: 'addWall', wall: makeWall({ id: 'inventado', typeId: 'wt_alv14', levelId: 'lv_0', a: { x: 0, y: 0 }, b: { x: 3, y: 0 } }) }]);
    expect(r.ok).toBe(false);
    expect(store.canUndo).toBe(false);
  });
});
