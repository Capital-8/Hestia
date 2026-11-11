import type { Project } from '../types.ts';
import type { Id } from '../types.ts';
import type { Furniture, FurnitureAsset, FurnitureBBox, FurniturePart } from './types.ts';

/** Matriz 4x4 em colunas (16 numeros), local -> mundo, metros, Z para cima. */
export type FurnitureMat4 = number[];

export const isFurniture = (e: { kind: string } | undefined): e is Furniture => e?.kind === 'furniture';

/**
 * Local -> mundo: `T(x, y, z + elevacao) * Rz(rotation) * S(scale) * Espelho`, onde o espelho inverte o X local
 * quando `mirrored`. Com espelho o determinante e negativo: quem desenha deve inverter a ordem dos vertices dos triangulos.
 * `asset` entra na assinatura para o chamador nao precisar saber da origem do bloco (hoje a origem e a do arquivo).
 */
export function furnitureWorldTransform(inst: Furniture, _asset?: FurnitureAsset, levelElevation = 0): FurnitureMat4 {
  const c = Math.cos(inst.rotation);
  const s = Math.sin(inst.rotation);
  const k = inst.scale;
  const m = inst.mirrored ? -1 : 1;
  return [
    k * m * c, k * m * s, 0, 0,
    0 - k * s, k * c, 0, 0,
    0, 0, k, 0,
    inst.x, inst.y, inst.z + levelElevation, 1,
  ];
}

export function applyMat4(m: FurnitureMat4, p: readonly [number, number, number]): [number, number, number] {
  return [
    m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
    m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
    m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!,
  ];
}

/** Caixa alinhada aos eixos do mundo (conservadora: transforma os 8 cantos da caixa local), metros. */
export function furnitureBounds(inst: Furniture, asset: FurnitureAsset, levelElevation = 0): FurnitureBBox {
  const m = furnitureWorldTransform(inst, asset, levelElevation);
  const { min, max } = asset.bbox;
  const lo: [number, number, number] = [Infinity, Infinity, Infinity];
  const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < 8; i++) {
    const p = applyMat4(m, [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]]);
    for (let k = 0; k < 3; k++) {
      if (p[k]! < lo[k]!) lo[k] = p[k]!;
      if (p[k]! > hi[k]!) hi[k] = p[k]!;
    }
  }
  return { min: lo, max: hi };
}

export interface AssetUsage {
  count: number;
  instanceIds: Id[];
  levelIds: Id[];
}

/** Quantas instancias usam o asset (e onde). */
export function assetUsage(project: Project, assetId: Id): AssetUsage {
  const instanceIds: Id[] = [];
  const levels = new Set<Id>();
  for (const e of Object.values(project.elements)) {
    if (isFurniture(e) && e.assetId === assetId) {
      instanceIds.push(e.id);
      levels.add(e.levelId);
    }
  }
  return { count: instanceIds.length, instanceIds, levelIds: [...levels] };
}

const IDENT: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Produto de matrizes 4x4 em colunas: `a * b` (aplica `b` primeiro). */
export function mat4Mul(a: FurnitureMat4, b: FurnitureMat4): FurnitureMat4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r]! * b[c * 4 + k]!;
      o[c * 4 + r] = v;
    }
  }
  return o;
}

/** Determinante da parte 3x3 (negativo = espelhada: inverter a ordem dos vertices dos triangulos). */
export function mat4Det3(m: FurnitureMat4): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}

/** Pecas do bloco; assets antigos (sem `parts`) devolvem cada definicao na origem. */
export function assetParts(asset: FurnitureAsset): FurniturePart[] {
  return asset.parts?.length ? asset.parts : asset.defs.map((d) => ({ defId: d.id, transform: IDENT }));
}

/** Local da definicao -> mundo para uma peca de uma instancia: `mundo(instancia) * peca`. */
export function furniturePartWorldTransform(inst: Furniture, part: FurniturePart, asset?: FurnitureAsset, levelElevation = 0): FurnitureMat4 {
  return mat4Mul(furnitureWorldTransform(inst, asset, levelElevation), part.transform);
}
