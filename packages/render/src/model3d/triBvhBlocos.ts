import * as THREE from 'three';
import { buildTriBvh, raycastTriBvh, type TriBvh, type TriBvhHit } from './triBvh.ts';

/** Triângulos por bloco: o BVH de um bloco custa ~1 ms, então o primeiro raio que o toca não trava a thread. */
const BLOCO = 512;

/**
 * BVH em dois níveis, de construção preguiçosa: os triângulos são agrupados em blocos consecutivos (os elementos da
 * malha são gravados em sequência, então um bloco é espacialmente coeso), cada bloco tem só a caixa envolvente (uma
 * passada linear, barata) e o BVH de triângulos de um bloco só é construído quando um raio chega à caixa dele e ainda
 * pode vencer o melhor acerto. O resultado é idêntico ao do BVH global (`raycastTriBvh`): mesma interseção
 * Möller–Trumbore, menor `t` e, no empate, menor `faceIndex`.
 */
export interface BlocosBvh {
  positions: ArrayLike<number>;
  indices: Uint16Array | Uint32Array;
  triangles: number;
  blocos: number;
  /** Caixa de cada bloco (minx, miny, minz, maxx, maxy, maxz). */
  bounds: Float64Array;
  /** BVH de cada bloco, criado sob demanda. */
  folhas: (TriBvh | undefined)[];
}

export function buildBlocosBvh(positions: ArrayLike<number>, indices: Uint16Array | Uint32Array): BlocosBvh {
  const triangles = Math.floor(indices.length / 3);
  const blocos = Math.ceil(triangles / BLOCO);
  const bounds = new Float64Array(blocos * 6);
  for (let b = 0; b < blocos; b++) {
    let minX = Infinity;
    let minY = Infinity;
    let minZ = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let maxZ = -Infinity;
    const fim = Math.min(triangles, (b + 1) * BLOCO) * 3;
    for (let i = b * BLOCO * 3; i < fim; i++) {
      const v = indices[i]! * 3;
      const x = positions[v]!;
      const y = positions[v + 1]!;
      const z = positions[v + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
    bounds.set([minX, minY, minZ, maxX, maxY, maxZ], b * 6);
  }
  return { positions, indices, triangles, blocos, bounds, folhas: new Array(blocos) };
}

/** Distância de entrada do raio na caixa do bloco, ou −1 se não a toca antes de `maxDist` (com folga de arredondamento). */
function entrada(bounds: Float64Array, b: number, o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number {
  let tmin = 0;
  let tmax = maxDist;
  for (let axis = 0; axis < 3; axis++) {
    const oa = axis === 0 ? o.x : axis === 1 ? o.y : o.z;
    const da = axis === 0 ? d.x : axis === 1 ? d.y : d.z;
    const eps = 1e-9 * (1 + Math.abs(bounds[b * 6 + 3 + axis]!) + Math.abs(bounds[b * 6 + axis]!));
    const lo = bounds[b * 6 + axis]! - eps;
    const hi = bounds[b * 6 + 3 + axis]! + eps;
    if (da === 0) {
      if (oa < lo || oa > hi) return -1;
      continue;
    }
    const inv = 1 / da;
    let t1 = (lo - oa) * inv;
    let t2 = (hi - oa) * inv;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return -1;
  }
  return tmin;
}

/** Mesma semântica de `raycastTriBvh` (incluindo `side` e `accept` com o `faceIndex` global). */
export function raycastBlocosBvh(
  bvh: BlocosBvh,
  ray: THREE.Ray,
  maxDist = Infinity,
  side: THREE.Side = THREE.DoubleSide,
  accept?: (faceIndex: number) => boolean,
): TriBvhHit | null {
  if (!bvh.triangles || maxDist <= 0) return null;
  const n = bvh.blocos;
  const tmins = new Float64Array(n);
  const cand: number[] = [];
  for (let b = 0; b < n; b++) {
    const t = entrada(bvh.bounds, b, ray.origin, ray.direction, maxDist);
    if (t < 0) continue;
    tmins[b] = t;
    cand.push(b);
  }
  if (!cand.length) return null;
  cand.sort((a, b) => tmins[a]! - tmins[b]!);

  let bestT = maxDist;
  let bestFace = -1;
  for (const b of cand) {
    // Estritamente maior: um bloco que só empata em `t` ainda pode ter o menor faceIndex.
    if (bestFace >= 0 && tmins[b]! > bestT) break;
    let folha = bvh.folhas[b];
    const base = b * BLOCO;
    if (!folha) {
      folha = buildTriBvh(bvh.positions, bvh.indices.subarray(base * 3, Math.min(bvh.triangles, base + BLOCO) * 3));
      bvh.folhas[b] = folha;
    }
    const hit = raycastTriBvh(folha, ray, bestT, side, accept ? (f) => accept(f + base) : undefined);
    if (!hit) continue;
    const face = hit.faceIndex + base;
    if (hit.distance < bestT || (hit.distance === bestT && (bestFace < 0 || face < bestFace))) {
      bestT = hit.distance;
      bestFace = face;
    }
  }
  if (bestFace < 0) return null;
  return { faceIndex: bestFace, distance: bestT, point: ray.at(bestT, new THREE.Vector3()) };
}
