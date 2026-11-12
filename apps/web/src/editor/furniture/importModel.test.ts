import { describe, expect, it } from 'vitest';
import { assetParts, createEmptyProject, ProjectStore, newId, type Furniture } from '@hestia/model';
import { assetTriangles, furnitureBudget, saveSizeWarningMb, FURNITURE_TRIANGLE_BUDGET } from './budget.ts';
import { buildAssetFromModel, FURNITURE_CATEGORIES, hexToRgb, initialMaterialEdits, modelDims, rgbToHex, summarizeModel, toFurnitureInput, UNIT_FACTOR, vertexLevel, fileTooBig } from './importModel.ts';
import { boxModel } from './testFixtures.ts';

const opts = (model = boxModel()) => ({ name: 'Mesa', factor: 1, materials: initialMaterialEdits(model) });

describe('ImportedModel -> asset -> comando', () => {
  it('passa as instâncias do arquivo como peças e calcula as dimensões em metros', () => {
    const m = boxModel();
    const a = buildAssetFromModel(m, opts(m));
    expect(a.name).toBe('Mesa');
    expect(assetParts(a)).toHaveLength(1);
    expect(a.parts?.[0]?.transform[12]).toBe(1);
    expect(a.bbox.min).toEqual([1, 2, 0]);
    expect(a.bbox.max[0]).toBeCloseTo(1.8, 5);
    expect(modelDims(m)).toEqual([expect.closeTo(0.8, 5), expect.closeTo(0.4, 5), expect.closeTo(0.5, 5)]);
    expect(a.stats.triangles).toBe(12);
  });

  it('unidade do arquivo recalcula tamanho, posição das peças e tamanho físico da textura', () => {
    const m = boxModel();
    const mm = toFurnitureInput(m, { ...opts(m), factor: UNIT_FACTOR.mm });
    expect(mm.defs[0]!.positions[3]).toBeCloseTo(0.0008, 7);
    expect(mm.instances![0]!.transform[12]).toBeCloseTo(0.001, 7);
    expect(mm.materials[0]!.sizeM![0]).toBeCloseTo(0.001, 7);
    expect(modelDims(m, UNIT_FACTOR.cm)[0]).toBeCloseTo(0.008, 6);
    expect(summarizeModel(m, UNIT_FACTOR.in).dims[0]).toBeCloseTo(0.8 * 0.0254, 6);
    // o modelo lido não é alterado
    expect(m.defs[0]!.positions[3]).toBeCloseTo(0.8, 6);
  });

  it('categoria, cor e "usar a textura do arquivo" por material entram no asset', () => {
    const m = boxModel();
    const edits = initialMaterialEdits(m);
    edits[0] = { category: 'fabric', color: '#112233', useEmbeddedTexture: false };
    const a = buildAssetFromModel(m, { name: 'Sofa', factor: 1, materials: edits });
    expect(a.materials[0]).toMatchObject({ category: 'fabric', color: '#112233', useEmbeddedTexture: false });
    expect(a.materials[1]).toMatchObject({ category: 'metal', useEmbeddedTexture: false });
    const b = buildAssetFromModel(m, opts(m));
    expect(b.materials[0]!.useEmbeddedTexture).toBe(true);
    expect(FURNITURE_CATEGORIES).toHaveLength(17);
    expect(hexToRgb(rgbToHex([0.5, 0.25, 1]))[2]).toBe(1);
  });

  it('addFurnitureAsset é uma entrada de desfazer; desfazer e refazer restauram o projeto', () => {
    const s = new ProjectStore(createEmptyProject());
    const m = boxModel();
    const a = buildAssetFromModel(m, opts(m));
    s.exec({ type: 'addFurnitureAsset', asset: a });
    expect(s.project.furniture?.assets[a.id]?.name).toBe('Mesa');
    expect(Object.keys(s.project.materials)).toEqual(expect.arrayContaining(a.materials.map((x) => x.id)));
    s.undo();
    expect(s.project.furniture?.assets[a.id]).toBeUndefined();
    expect(Object.keys(s.project.materials)).not.toContain(a.materials[0]!.id);
    s.redo();
    expect(s.project.furniture?.assets[a.id]).toBeDefined();
  });

  it('limites: arquivo acima de 50 MB e vértices (aviso 300 mil, recusa 600 mil)', () => {
    expect(fileTooBig(50 * 1024 * 1024)).toBe(false);
    expect(fileTooBig(50 * 1024 * 1024 + 1)).toBe(true);
    expect(vertexLevel(300_000)).toBe('ok');
    expect(vertexLevel(300_001)).toBe('warn');
    expect(vertexLevel(600_001)).toBe('refuse');
  });
});

describe('orçamento de triângulos e tamanho de salvamento', () => {
  it('soma triângulos por instância (peças repetidas contam) e avisa acima de 2 milhões', () => {
    const s = new ProjectStore(createEmptyProject());
    const m = boxModel({ instances: [0, 1, 2].map((i) => ({ defId: 'd1', transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, i, 0, 0, 1] })) });
    const a = buildAssetFromModel(m, opts(m));
    s.exec({ type: 'addFurnitureAsset', asset: a });
    expect(assetTriangles(a)).toBe(36);
    const lv = s.project.levels[0]!.id;
    const put = (x: number): Omit<Furniture, 'order'> => ({ id: newId('fu'), kind: 'furniture', assetId: a.id, levelId: lv, x, y: 0, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'm' });
    s.exec({ type: 'addFurniture', furniture: put(0) });
    s.exec({ type: 'addFurniture', furniture: put(2) });
    expect(furnitureBudget(s.project)).toEqual({ triangles: 72, instances: 2, over: false });
    expect(furnitureBudget(s.project, 71).over).toBe(true);
    expect(FURNITURE_TRIANGLE_BUDGET).toBe(2_000_000);
  });

  it('aviso de salvamento só acima de 40 MB', () => {
    expect(saveSizeWarningMb(40 * 1048576)).toBeNull();
    expect(saveSizeWarningMb(52 * 1048576)).toBe(52);
  });
});
