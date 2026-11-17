import type { Vec2 } from '@hestia/geom';
import { applyMat4, furnitureWorldTransform, type Furniture, type FurnitureAsset } from '@hestia/model';

/** Pose mínima de uma instância (a prévia usa antes de existir o elemento). */
export type FurniturePose = Pick<Furniture, 'x' | 'y' | 'z' | 'rotation' | 'scale' | 'mirrored'>;

/** Contorno em planta (4 cantos da base da caixa do asset, já girado/escalado/espelhado), metros. */
export function furnitureFootprint(pose: FurniturePose, asset: FurnitureAsset): Vec2[] {
  const m = furnitureWorldTransform({ ...pose } as Furniture, asset, 0);
  const { min, max } = asset.bbox;
  return [
    [min[0], min[1]],
    [max[0], min[1]],
    [max[0], max[1]],
    [min[0], max[1]],
  ].map(([x, y]) => {
    const p = applyMat4(m, [x!, y!, 0]);
    return { x: p[0], y: p[1] };
  });
}

/**
 * Pose que põe o CENTRO da caixa do asset sobre `at` (planta) e a base no piso do nível: o clique escolhe onde o bloco
 * fica, mesmo quando a origem do arquivo está longe da geometria.
 */
export function furniturePoseAt(asset: FurnitureAsset, at: Vec2, rotation: number, mirrored: boolean, scale = 1): FurniturePose {
  const base: FurniturePose = { x: 0, y: 0, z: 0, rotation, scale, mirrored };
  const m = furnitureWorldTransform({ ...base } as Furniture, asset, 0);
  const { min, max } = asset.bbox;
  const c = applyMat4(m, [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, 0]);
  return { ...base, x: at.x - c[0], y: at.y - c[1], z: -min[2] * scale };
}
