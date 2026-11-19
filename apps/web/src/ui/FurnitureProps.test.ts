import { describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createEmptyProject, isFurniture, ProjectStore, type Furniture } from '@hestia/model';
import { buildAssetFromModel, initialMaterialEdits } from '../editor/furniture/importModel.ts';
import { boxModel } from '../editor/furniture/testFixtures.ts';

const holder = vi.hoisted(() => ({ store: null as unknown as ProjectStore }));
vi.mock('../editor/controller.ts', () => ({
  useProject: () => holder.store.project,
  editor: {
    get store() {
      return holder.store;
    },
  },
}));

const { FurnitureProps } = await import('./FurnitureProps.tsx');
const { selectionLabel } = await import('./GenericProps.tsx');
const { FurnitureBudgetChip } = await import('./FurnitureBudgetChip.tsx');

function setup() {
  const store = new ProjectStore(createEmptyProject());
  holder.store = store;
  const m = boxModel();
  const asset = buildAssetFromModel(m, { name: 'Mesa', factor: 1, materials: initialMaterialEdits(m) });
  store.exec({ type: 'addFurnitureAsset', asset });
  const lv = store.project.levels[0]!.id;
  const f: Omit<Furniture, 'order'> = { id: 'F1', kind: 'furniture', assetId: asset.id, levelId: lv, x: 1.5, y: 2, z: 0, rotation: Math.PI / 2, scale: 1, mirrored: true, name: 'Mesa de jantar', quality: 'completo' };
  store.exec({ type: 'addFurniture', furniture: f });
  return { store, asset, inst: store.project.elements.F1 as Furniture };
}

describe('Propriedades do móvel importado', () => {
  it('mostra nome, bloco, posição, rotação em graus, escala, espelho e qualidade', () => {
    const { inst } = setup();
    const html = renderToStaticMarkup(createElement(FurnitureProps, { items: [inst] }));
    expect(html).toContain('Móvel importado');
    expect(html).toContain('value="Mesa de jantar"');
    expect(html).toContain('id="fu-x"');
    expect(html).toContain('id="fu-y"');
    expect(html).toContain('id="fu-z"');
    expect(html).toMatch(/id="fu-rot"[^>]*value="90,00"/);
    expect(html).toContain('id="fu-scale"');
    expect(html).toMatch(/id="fu-mirror"[^>]*checked/);
    expect(html).toMatch(/<option value="completo" selected/);
    expect(html).toContain('Colocar outra cópia');
    expect(html).toContain('Excluir móvel');
  });

  it('lista os materiais do bloco com categoria, cor e usar a textura do arquivo', () => {
    const { inst, asset } = setup();
    const html = renderToStaticMarkup(createElement(FurnitureProps, { items: [inst] }));
    expect(html).toContain('Materiais do bloco');
    expect(html).toContain('madeira');
    expect(html).toContain(asset.materials[0]!.color);
    expect((html.match(/<option value="leather"/g) ?? []).length).toBe(2);
    expect(html).toContain('Usar a textura do arquivo');
  });

  it('seleção múltipla não mostra posição nem nome', () => {
    const { store, inst, asset } = setup();
    store.exec({ type: 'addFurniture', furniture: { id: 'F2', kind: 'furniture', assetId: asset.id, levelId: inst.levelId, x: 5, y: 5, z: 0, rotation: 0, scale: 1, mirrored: false, name: 'Outra' } });
    const dois = Object.values(store.project.elements).filter(isFurniture);
    const html = renderToStaticMarkup(createElement(FurnitureProps, { items: dois }));
    expect(html).not.toContain('id="fu-x"');
    expect(html).not.toContain('id="fu-name"');
    expect(html).toContain('id="fu-rot"');
    expect(selectionLabel({ walls: 0, ops: 0, floors: 0, slabs: 0, ceilings: 0, roofs: 0, stairs: 0, ramps: 0, rooms: 0, generics: 0, furnitures: 2, grade: null, view: null }, 'pt')).toBe('2 móveis');
  });
});

describe('edições das propriedades e desfazer', () => {
  it('updateFurniture (posição, rotação, escala, espelho, nome, qualidade) desfaz e refaz', () => {
    const { store } = setup();
    store.exec({ type: 'updateFurniture', id: 'F1', patch: { x: 9, rotation: 0, scale: 1.5, mirrored: false, name: 'Nova', quality: 'leve' } });
    expect(store.project.elements.F1).toMatchObject({ x: 9, rotation: 0, scale: 1.5, mirrored: false, name: 'Nova', quality: 'leve' });
    store.undo();
    expect(store.project.elements.F1).toMatchObject({ x: 1.5, scale: 1, mirrored: true, name: 'Mesa de jantar' });
    store.redo();
    expect((store.project.elements.F1 as Furniture).x).toBe(9);
  });

  it('setFurnitureMaterial atualiza o bloco e o Material do projeto; desfaz', () => {
    const { store, asset } = setup();
    const mid = asset.materials[0]!.id;
    store.exec({ type: 'setFurnitureMaterial', assetId: asset.id, materialId: mid, patch: { category: 'fabric', color: '#ff0000', useEmbeddedTexture: false } });
    expect(store.project.furniture!.assets[asset.id]!.materials[0]).toMatchObject({ category: 'fabric', color: '#ff0000', useEmbeddedTexture: false });
    expect(store.project.materials[mid]).toMatchObject({ category: 'fabric', color: '#ff0000' });
    store.undo();
    expect(store.project.furniture!.assets[asset.id]!.materials[0]).toMatchObject({ category: 'wood', useEmbeddedTexture: true });
  });

  it('excluir a cópia (deleteElements, como a tecla Delete) e o bloco sem uso; bloco em uso é recusado', () => {
    const { store, asset } = setup();
    expect(() => store.exec({ type: 'deleteFurnitureAsset', id: asset.id })).toThrow();
    store.exec({ type: 'deleteElements', ids: ['F1'] });
    expect(store.project.elements.F1).toBeUndefined();
    store.exec({ type: 'deleteFurnitureAsset', id: asset.id });
    expect(store.project.furniture!.assets[asset.id]).toBeUndefined();
    store.undo();
    expect(store.project.furniture!.assets[asset.id]).toBeDefined();
  });
});

describe('aviso de orçamento na barra', () => {
  it('não aparece com poucos triângulos', () => {
    setup();
    expect(renderToStaticMarkup(createElement(FurnitureBudgetChip))).toBe('');
  });
});
