import { textFor, type Lang } from '../i18n.ts';
import type { Id, Material, Project } from '../types.ts';
import { furnitureAssetIssue } from './asset.ts';
import { assetUsage, isFurniture } from './geometry.ts';
import type { Furniture, FurnitureAsset, FurnitureCategory } from './types.ts';

/** Comandos de moveis importados. Todos serializaveis; desfazer/refazer vem do historico (immer). */
export type FurnitureCommand =
  | { type: 'addFurnitureAsset'; asset: FurnitureAsset }
  | { type: 'addFurniture'; furniture: Omit<Furniture, 'order'> }
  | { type: 'updateFurniture'; id: Id; patch: Partial<Pick<Furniture, 'x' | 'y' | 'z' | 'rotation' | 'scale' | 'mirrored' | 'name' | 'quality' | 'levelId'>> }
  | { type: 'deleteFurniture'; id: Id }
  | { type: 'deleteFurnitureAsset'; id: Id }
  | { type: 'setFurnitureMaterial'; assetId: Id; materialId: Id; patch: { category?: FurnitureCategory; color?: string; useEmbeddedTexture?: boolean } };

const TYPES = new Set(['addFurnitureAsset', 'addFurniture', 'updateFurniture', 'deleteFurniture', 'deleteFurnitureAsset', 'setFurnitureMaterial']);

/** Guarda de tipo: usada por `applyCommand` e `labelOf` (uma linha em cada). */
export function isFurnitureCommand(c: { type: string }): c is FurnitureCommand {
  return TYPES.has(c.type);
}

export function furnitureLabel(c: FurnitureCommand, lang: Lang = 'pt'): string {
  switch (c.type) {
    case 'addFurnitureAsset':
      return textFor(lang, 'Importar móvel', 'Import furniture');
    case 'addFurniture':
      return textFor(lang, 'Inserir móvel', 'Place furniture');
    case 'updateFurniture':
      return textFor(lang, 'Editar móvel', 'Edit furniture');
    case 'deleteFurniture':
      return textFor(lang, 'Excluir móvel', 'Delete furniture');
    case 'deleteFurnitureAsset':
      return textFor(lang, 'Excluir móvel importado', 'Delete imported furniture asset');
    case 'setFurnitureMaterial':
      return textFor(lang, 'Material do móvel', 'Furniture material');
  }
}

const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const HEX = /^#[0-9a-fA-F]{6}$/;
const CATEGORY = /^[a-z_]{1,32}$/;

function fail(lang: Lang, pt: string, en: string): never {
  throw new Error(textFor(lang, pt, en));
}

function checkPose(f: Pick<Furniture, 'x' | 'y' | 'z' | 'rotation' | 'scale'>, lang: Lang): void {
  if (![f.x, f.y, f.z, f.rotation].every(finite)) fail(lang, 'Posição ou rotação inválida.', 'Invalid position or rotation.');
  if (!(finite(f.scale) && f.scale > 0)) fail(lang, 'A escala deve ser maior que zero.', 'Scale must be greater than zero.');
}

export function applyFurnitureCommand(p: Project, c: { type: string }, lang: Lang = 'pt'): boolean {
  if (!isFurnitureCommand(c)) return false;
  switch (c.type) {
    case 'addFurnitureAsset': {
      const a = c.asset;
      if (p.furniture?.assets[a.id]) fail(lang, `Móvel importado já existe: ${a.id}`, `Furniture asset already exists: ${a.id}`);
      const issue = furnitureAssetIssue(a);
      if (issue) throw new Error(issue);
      for (const m of a.materials) if (p.materials[m.id]) fail(lang, `Material já existe: ${m.id}`, `Material already exists: ${m.id}`);
      const store = (p.furniture ??= { assets: {} });
      store.assets[a.id] = a;
      for (const m of a.materials) {
        const mat: Material = {
          id: m.id,
          name: m.name,
          color: m.color,
          hatch: 'solid',
          gloss: typeof m.roughness === 'number' ? Math.max(0, Math.min(1, 1 - m.roughness)) : 0.3,
          opacity: m.opacity,
          cost: 0,
          unit: 'm2',
          category: m.category,
        };
        p.materials[m.id] = mat;
      }
      return true;
    }
    case 'addFurniture': {
      const f = c.furniture;
      if (!p.furniture?.assets[f.assetId]) fail(lang, `Móvel importado inexistente: ${f.assetId}`, `Furniture asset not found: ${f.assetId}`);
      if (!p.levels.some((l) => l.id === f.levelId)) fail(lang, `Nível inexistente: ${f.levelId}`, `Level not found: ${f.levelId}`);
      if (p.elements[f.id]) fail(lang, `Elemento já existe: ${f.id}`, `Element already exists: ${f.id}`);
      checkPose(f, lang);
      p.elements[f.id] = { ...f, order: p.nextOrder++ };
      return true;
    }
    case 'updateFurniture': {
      const e = p.elements[c.id];
      if (!isFurniture(e)) fail(lang, `Não é um móvel: ${c.id}`, `Not a furniture element: ${c.id}`);
      const next = { ...e, ...c.patch };
      if (c.patch.levelId !== undefined && !p.levels.some((l) => l.id === c.patch.levelId)) fail(lang, `Nível inexistente: ${c.patch.levelId}`, `Level not found: ${c.patch.levelId}`);
      checkPose(next, lang);
      p.elements[c.id] = next;
      return true;
    }
    case 'deleteFurniture': {
      if (!isFurniture(p.elements[c.id])) fail(lang, `Não é um móvel: ${c.id}`, `Not a furniture element: ${c.id}`);
      delete p.elements[c.id];
      return true;
    }
    case 'deleteFurnitureAsset': {
      const a = p.furniture?.assets[c.id];
      if (!a) fail(lang, `Móvel importado inexistente: ${c.id}`, `Furniture asset not found: ${c.id}`);
      const n = assetUsage(p, c.id).count;
      if (n > 0) fail(lang, `Móvel importado em uso por ${n} instância(s).`, `Furniture asset is used by ${n} instance(s).`);
      delete p.furniture!.assets[c.id];
      for (const m of a.materials) delete p.materials[m.id];
      return true;
    }
    case 'setFurnitureMaterial': {
      const a = p.furniture?.assets[c.assetId];
      if (!a) fail(lang, `Móvel importado inexistente: ${c.assetId}`, `Furniture asset not found: ${c.assetId}`);
      const idx = a.materials.findIndex((m) => m.id === c.materialId);
      if (idx < 0) fail(lang, `Material inexistente no móvel: ${c.materialId}`, `Material not in asset: ${c.materialId}`);
      const { category, color, useEmbeddedTexture } = c.patch;
      if (category !== undefined && !CATEGORY.test(category)) fail(lang, 'Categoria inválida.', 'Invalid category.');
      if (color !== undefined && !HEX.test(color)) fail(lang, 'Cor inválida (use #rrggbb).', 'Invalid color (use #rrggbb).');
      const m = a.materials[idx]!;
      if (category !== undefined) m.category = category;
      if (color !== undefined) m.color = color;
      if (useEmbeddedTexture !== undefined) m.useEmbeddedTexture = useEmbeddedTexture;
      const pm = p.materials[c.materialId];
      if (pm) {
        if (category !== undefined) pm.category = category;
        if (color !== undefined) pm.color = color;
      }
      return true;
    }
  }
}
