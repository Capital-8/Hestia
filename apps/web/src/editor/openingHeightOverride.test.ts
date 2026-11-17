import { describe, expect, it } from 'vitest';
import { buildTemplate, isOpening, ProjectStore, type Opening } from '@hestia/model';
import { usarAlturaDoTipo } from './openingTypeActions.ts';

describe('usar altura do tipo (altura própria da instância)', () => {
  it('tira a altura própria e um Ctrl+Z a restaura', () => {
    const store = new ProjectStore(buildTemplate('house2'));
    const win = Object.values(store.project.elements).find((e): e is Opening => isOpening(e) && e.kind === 'window')!;
    store.exec({ type: 'updateElements', ids: [win.id], patch: { heightOverride: 1.5 } });
    usarAlturaDoTipo(store, [win.id]);
    expect((store.project.elements[win.id] as Opening).heightOverride).toBeNull();
    store.undo();
    expect((store.project.elements[win.id] as Opening).heightOverride).toBe(1.5);
  });
});
