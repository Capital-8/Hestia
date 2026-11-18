import { assetParts, type FurnitureAsset } from '@hestia/model';

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

/** Tamanho aproximado do projeto salvo, em MB, quando passa de 40 MB; senão null (aviso ao salvar). */
export function saveSizeWarningMb(jsonLength: number): number | null {
  const mb = jsonLength / 1048576; // units-ok: tamanho em MB
  return mb > 40 ? Math.round(mb) : null;
}
