import { describe, expect, it } from 'vitest';
import { buildTemplate, isOpening, isWall, ProjectStore, wallBaseElevation, type Opening, type Wall } from '@hestia/model';
import { sectionHandleCommand } from './sectionHandles.ts';

/** Janela da casa de teste com um tipo de peitoril 0,90 m e altura 1,20 m (valores fixos para o teste). */
function janela(): { store: ProjectStore; id: string; base: number } {
  const store = new ProjectStore(buildTemplate('house2'));
  const win = Object.values(store.project.elements).find((e): e is Opening => isOpening(e) && e.kind === 'window')!;
  store.exec({ type: 'upsertOpeningType', openingType: { ...store.project.openingTypes['ot_j120']!, id: 'ot_teste', sill: 0.9, height: 1.2 } });
  store.exec({ type: 'updateElements', ids: [win.id], patch: { typeId: 'ot_teste' } });
  const host = store.project.elements[win.hostId];
  if (!isWall(host)) throw new Error('parede de teste ausente');
  return { store, id: win.id, base: wallBaseElevation(store.project, host as Wall) };
}

describe('alças de peitoril e topo no corte', () => {
  it('peitoril igual ao do tipo não grava override', () => {
    const { store, id, base } = janela();
    expect(sectionHandleCommand(store.project, { openingId: id, kind: 'sill', at: { x: 0, y: 0 } }, base + 0.9)).toBeNull();
  });

  it('peitoril diferente do tipo grava o override', () => {
    const { store, id, base } = janela();
    expect(sectionHandleCommand(store.project, { openingId: id, kind: 'sill', at: { x: 0, y: 0 } }, base + 1.25)).toMatchObject({
      type: 'updateElements',
      ids: [id],
      patch: { sillOverride: 1.25 },
    });
  });

  it('peitoril arrastado de volta ao valor do tipo tira o override que havia', () => {
    const { store, id, base } = janela();
    store.exec({ type: 'updateElements', ids: [id], patch: { sillOverride: 1.25 } });
    expect(sectionHandleCommand(store.project, { openingId: id, kind: 'sill', at: { x: 0, y: 0 } }, base + 0.9)).toMatchObject({
      patch: { sillOverride: null },
    });
  });

  it('topo igual ao do tipo (peitoril 0,90 + altura 1,20) não grava override', () => {
    const { store, id, base } = janela();
    expect(sectionHandleCommand(store.project, { openingId: id, kind: 'head', at: { x: 0, y: 0 } }, base + 0.9 + 1.2)).toBeNull();
  });

  it('topo diferente do tipo grava a altura própria', () => {
    const { store, id, base } = janela();
    expect(sectionHandleCommand(store.project, { openingId: id, kind: 'head', at: { x: 0, y: 0 } }, base + 0.9 + 1.5)).toMatchObject({
      patch: { heightOverride: 1.5 },
    });
  });

  it('topo arrastado de volta à altura do tipo tira a altura própria', () => {
    const { store, id, base } = janela();
    store.exec({ type: 'updateElements', ids: [id], patch: { heightOverride: 1.5 } });
    expect(sectionHandleCommand(store.project, { openingId: id, kind: 'head', at: { x: 0, y: 0 } }, base + 0.9 + 1.2)).toMatchObject({
      patch: { heightOverride: null },
    });
  });
});
