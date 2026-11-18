import type { Vec2 } from '@hestia/geom';
import { applyMat4, assetParts, furnitureDefArrays, furnitureWorldTransform, type Furniture, type FurnitureAsset } from '@hestia/model';

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

/** Máximo de vértices lidos por definição para o contorno (amostragem uniforme; o casco convexo muda pouco). */
const MAX_VERTICES_CONTORNO = 40_000;

const contornoLocal = new WeakMap<FurnitureAsset, Vec2[]>();

function cross(o: Vec2, a: Vec2, b: Vec2): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Casco convexo (monotone chain), anti-horário, sem ponto repetido. */
export function cascoConvexo(pts: Vec2[]): Vec2[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  if (s.length < 3) return s;
  const lower: Vec2[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec2[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/** Contorno da projeção da malha vista de cima, no espaço local do asset (casco convexo dos vértices de todas as peças). */
export function furnitureOutlineLocal(asset: FurnitureAsset): Vec2[] {
  const hit = contornoLocal.get(asset);
  if (hit) return hit;
  const pts: Vec2[] = [];
  const defs = new Map(asset.defs.map((d) => [d.id, d]));
  for (const part of assetParts(asset)) {
    const def = defs.get(part.defId);
    if (!def) continue;
    const pos = furnitureDefArrays(def).positions;
    const n = pos.length / 3;
    const step = Math.max(1, Math.ceil(n / MAX_VERTICES_CONTORNO));
    for (let i = 0; i < n; i += step) {
      const q = applyMat4(part.transform, [pos[i * 3]!, pos[i * 3 + 1]!, pos[i * 3 + 2]!]);
      pts.push({ x: q[0], y: q[1] });
    }
  }
  let ring = cascoConvexo(pts);
  if (ring.length < 3) {
    const { min, max } = asset.bbox;
    ring = [{ x: min[0], y: min[1] }, { x: max[0], y: min[1] }, { x: max[0], y: max[1] }, { x: min[0], y: max[1] }];
  }
  contornoLocal.set(asset, ring);
  return ring;
}

/** Contorno real em planta (projeção da malha, simplificada pelo casco convexo) da instância, metros. */
export function furnitureOutline(pose: FurniturePose, asset: FurnitureAsset): Vec2[] {
  const m = furnitureWorldTransform({ ...pose } as Furniture, asset, 0);
  return furnitureOutlineLocal(asset).map((q) => {
    const p = applyMat4(m, [q.x, q.y, 0]);
    return { x: p[0], y: p[1] };
  });
}
