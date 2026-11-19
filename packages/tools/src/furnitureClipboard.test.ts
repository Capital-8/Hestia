import { describe, expect, it } from 'vitest';
import { buildFurnitureAsset, createEmptyProject, isFurniture, ProjectStore } from '@hestia/model';
import { clipboardFrom, copyableIds, pasteAlignedCommand } from './clipboard.ts';
import { makeEnv } from './testEnv.ts';

function asset() {
  const positions = new Float32Array([0, 0, 0, 2, 0, 0, 2, 1, 0, 0, 1, 0, 0, 0, 0.5, 2, 0, 0.5, 2, 1, 0.5, 0, 1, 0.5]);
  return buildFurnitureAsset({
    name: 'Mesa',
    sourceFileName: 'mesa.glb',
    sourceFormat: 'glb',
    defs: [{ id: 'd', name: 'd', positions, normals: new Float32Array(24), uvs: new Float32Array(0), indices: new Uint32Array([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]), groups: [{ start: 0, count: 12, materialIndex: 0 }] }],
    materials: [{ name: 'm', color: [1, 1, 1], opacity: 1 }],
    textures: [],
  });
}

function comMovel() {
  const ctx = makeEnv();
  const a = asset();
  ctx.store.exec({ type: 'addFurnitureAsset', asset: a });
  ctx.store.exec({ type: 'addFurniture', furniture: { id: 'f1', kind: 'furniture', assetId: a.id, levelId: 'lv_0', x: 3, y: 4, z: 0, rotation: Math.PI / 2, scale: 0.5, mirrored: true, name: 'Mesa' } });
  return { ...ctx, a };
}

describe('copiar e colar móvel importado', () => {
  it('clipboardFrom leva o móvel e o bloco; copyableIds o inclui', () => {
    const ctx = comMovel();
    const clip = clipboardFrom(ctx.store.project, ['f1'])!;
    expect(clip.furnitures).toHaveLength(1);
    expect(clip.furnitureAssets?.map((x) => x.id)).toEqual([ctx.a.id]);
    expect(copyableIds(ctx.store.project, ['f1'])).toEqual(['f1']);
  });

  it('cola no mesmo projeto: id novo, mesma pose, sem repetir o bloco; um desfazer', () => {
    const ctx = comMovel();
    const clip = clipboardFrom(ctx.store.project, ['f1'])!;
    const r = pasteAlignedCommand(ctx.store.project, clip, 'lv_0')!;
    expect(r.furnitureIds).toHaveLength(1);
    ctx.store.exec(r.command);
    const lista = Object.values(ctx.store.project.elements).filter(isFurniture);
    expect(lista).toHaveLength(2);
    const novo = lista.find((f) => f.id === r.furnitureIds[0])!;
    expect(novo).toMatchObject({ assetId: ctx.a.id, x: 3, y: 4, rotation: Math.PI / 2, scale: 0.5, mirrored: true });
    expect(Object.keys(ctx.store.project.furniture!.assets)).toHaveLength(1);
    ctx.store.undo();
    expect(Object.values(ctx.store.project.elements).filter(isFurniture)).toHaveLength(1);
  });

  it('cola em outro projeto: o bloco viaja junto', () => {
    const ctx = comMovel();
    const clip = clipboardFrom(ctx.store.project, ['f1'])!;
    const dest = new ProjectStore(createEmptyProject());
    const lv = dest.project.levels[0]!.id;
    const r = pasteAlignedCommand(dest.project, clip, lv)!;
    dest.exec(r.command);
    expect(dest.project.furniture?.assets[ctx.a.id]?.name).toBe('Mesa');
    expect(Object.values(dest.project.elements).filter(isFurniture)).toHaveLength(1);
  });

  it('móvel cujo bloco não está no buffer nem no destino é descartado', () => {
    const ctx = comMovel();
    const clip = clipboardFrom(ctx.store.project, ['f1'])!;
    delete clip.furnitureAssets;
    const dest = new ProjectStore(createEmptyProject());
    expect(pasteAlignedCommand(dest.project, clip, dest.project.levels[0]!.id)).toBeNull();
  });
});
