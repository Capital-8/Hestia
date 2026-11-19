import { describe, expect, it } from 'vitest';
import { createEmptyProject, furniturePersistReport, migrateProject, ProjectStore, type Furniture } from '@hestia/model';
import { buildAssetFromModel, initialMaterialEdits } from './importModel.ts';
import { boxModel } from './testFixtures.ts';

describe('Project.furniture no salvar e abrir', () => {
  it('o mesmo JSON que o app grava (JSON.stringify com recuo 1) reabre idêntico, com instância, material e textura', () => {
    const s = new ProjectStore(createEmptyProject());
    const m = boxModel();
    const asset = buildAssetFromModel(m, { name: 'Mesa', factor: 1, materials: initialMaterialEdits(m) });
    s.exec({ type: 'addFurnitureAsset', asset });
    const f: Omit<Furniture, 'order'> = { id: 'F1', kind: 'furniture', assetId: asset.id, levelId: s.project.levels[0]!.id, x: 1, y: 2, z: 0, rotation: 0.5, scale: 1, mirrored: false, name: 'Mesa' };
    s.exec({ type: 'addFurniture', furniture: f });
    const texto = JSON.stringify(s.project, null, 1);
    const reaberto = migrateProject(JSON.parse(texto));
    expect(JSON.stringify(reaberto, null, 1)).toBe(texto);
    expect(reaberto.furniture?.assets[asset.id]?.textures[0]?.bytes).toBe(asset.textures[0]!.bytes);
    expect(reaberto.elements.F1).toMatchObject({ kind: 'furniture', assetId: asset.id, rotation: 0.5 });
    expect(furniturePersistReport(reaberto).absolutePaths).toEqual([]);
  });

  it('projeto antigo, sem o campo, abre igual', () => {
    const antigo = JSON.parse(JSON.stringify(createEmptyProject()));
    expect(migrateProject(antigo).furniture).toBeUndefined();
  });
});
