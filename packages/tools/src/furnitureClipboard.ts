import { newId, type Command, type Id, type Project } from '@hestia/model';
import type { ClipBuffer, MintId } from './clipboard.ts';

/** Comando de colar móveis importados: o lote e os ids novos das instâncias. */
export interface PasteFurnituresResult {
  command: Command;
  furnitureIds: Id[];
}

/**
 * Cola os móveis importados do buffer no nível `levelId`, nas MESMAS coordenadas, com ids novos. O bloco (asset) entra
 * antes, por `addFurnitureAsset`, só quando o projeto de destino ainda não o tem; móvel cujo bloco não está nem no destino
 * nem no buffer é descartado. Devolve null sem nada colável.
 */
export function pasteFurnituresCommand(p: Project, clip: ClipBuffer, levelId: Id, mint: MintId = (prefix) => newId(prefix)): PasteFurnituresResult | null {
  const list = clip.furnitures ?? [];
  if (list.length === 0 || !p.levels.some((l) => l.id === levelId)) return null;
  const assets = new Map((clip.furnitureAssets ?? []).map((a) => [a.id, a]));
  const present = new Set(Object.keys(p.furniture?.assets ?? {}));
  const commands: Command[] = [];
  const furnitureIds: Id[] = [];
  for (const f of list) {
    if (!present.has(f.assetId)) {
      const a = assets.get(f.assetId);
      if (!a) continue;
      commands.push({ type: 'addFurnitureAsset', asset: a });
      present.add(a.id);
    }
    const id = mint('fu');
    furnitureIds.push(id);
    const { order: _order, ...rest } = f;
    commands.push({ type: 'addFurniture', furniture: { ...rest, id, levelId } });
  }
  return furnitureIds.length === 0 ? null : { command: { type: 'batch', commands }, furnitureIds };
}
