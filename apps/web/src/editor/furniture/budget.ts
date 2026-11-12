import { assetParts, isFurniture, type FurnitureAsset, type Project } from '@hestia/model';

/** Triângulos de móveis acima dos quais a vista 3D pode ficar lenta (aviso discreto, não bloqueia). */
export const FURNITURE_TRIANGLE_BUDGET = 2_000_000;

const perAsset = new WeakMap<FurnitureAsset, number>();

/** Triângulos de UMA instância do asset: cada peça conta os triângulos da sua definição (peças repetem definições). */
export function assetTriangles(a: FurnitureAsset): number {
  let n = perAsset.get(a);
  if (n === undefined) {
    const tri = new Map(a.defs.map((d) => [d.id, d.indexCount / 3]));
    n = assetParts(a).reduce((s, p) => s + (tri.get(p.defId) ?? 0), 0);
    perAsset.set(a, n);
  }
  return n;
}

export interface FurnitureBudget {
  triangles: number;
  instances: number;
  over: boolean;
}

/** Função pura: total de triângulos de todas as instâncias de móveis do projeto contra o teto de ~2 milhões. */
export function furnitureBudget(p: Project, limit = FURNITURE_TRIANGLE_BUDGET): FurnitureBudget {
  let triangles = 0;
  let instances = 0;
  const assets = p.furniture?.assets;
  if (assets) {
    for (const e of Object.values(p.elements)) {
      if (!isFurniture(e)) continue;
      const a = assets[e.assetId];
      if (!a) continue;
      instances++;
      triangles += assetTriangles(a);
    }
  }
  return { triangles, instances, over: triangles > limit };
}

/** Tamanho aproximado do projeto salvo, em MB, quando passa de 40 MB; senão null (aviso ao salvar). */
export function saveSizeWarningMb(jsonLength: number): number | null {
  const mb = jsonLength / 1048576; // units-ok: tamanho em MB
  return mb > 40 ? Math.round(mb) : null;
}
