// Simplificacao por agrupamento de vertices em grade (vertex clustering), sem dependencias.
// Usada para a versao LEVE de navegar; a malha completa e preservada para o render final.
// Preserva grupos de material (cada material agrupa separadamente), recalcula normais e faz a media de posicao e UV por celula.
import type { ImportedMeshDef, ImportedMeshGroup } from './types';

interface Built {
  positions: number[];
  uvs: number[];
  indices: number[];
  groups: ImportedMeshGroup[];
  triangles: number;
}

const GRID_BITS = 16;
const GRID_MAX = (1 << GRID_BITS) - 1;

function octant(nx: number, ny: number, nz: number): number {
  return (nx < 0 ? 1 : 0) | (ny < 0 ? 2 : 0) | (nz < 0 ? 4 : 0);
}

/**
 * Agrupa os vertices de `def` em celulas de lado `cell` (por material e por octante da normal, para nao fundir os dois
 * lados de uma chapa fina) e devolve a malha resultante. Com `build=false` so conta os triangulos.
 */
function cluster(def: ImportedMeshDef, min: [number, number, number], cell: number, build: boolean): Built {
  const pos = def.positions;
  const nor = def.normals;
  const uv = def.uvs;
  const hasUv = uv.length > 0;
  const inv = 1 / cell;
  const out: Built = { positions: [], uvs: [], indices: [], groups: [], triangles: 0 };
  // somas por cluster
  const sx: number[] = [];
  const sy: number[] = [];
  const sz: number[] = [];
  const su: number[] = [];
  const sv: number[] = [];
  const cnt: number[] = [];

  const groups = def.groups.length > 0 ? def.groups : [{ start: 0, count: def.indices.length, materialIndex: 0 }];
  for (const g of groups) {
    const map = new Map<number, number>(); // chave da celula -> id do cluster (global)
    const local = new Map<number, number>(); // vertice original -> cluster
    const firstIndexOfGroup = out.indices.length;
    const tri: number[] = [0, 0, 0];
    for (let t = g.start; t < g.start + g.count; t += 3) {
      for (let k = 0; k < 3; k++) {
        const v = def.indices[t + k] as number;
        let c = local.get(v);
        if (c === undefined) {
          const x = pos[v * 3] as number;
          const y = pos[v * 3 + 1] as number;
          const z = pos[v * 3 + 2] as number;
          const ix = Math.min(GRID_MAX, Math.floor((x - min[0]) * inv));
          const iy = Math.min(GRID_MAX, Math.floor((y - min[1]) * inv));
          const iz = Math.min(GRID_MAX, Math.floor((z - min[2]) * inv));
          const o = octant(nor[v * 3] as number, nor[v * 3 + 1] as number, nor[v * 3 + 2] as number);
          const key = ((ix * (GRID_MAX + 1) + iy) * (GRID_MAX + 1) + iz) * 8 + o;
          c = map.get(key);
          if (c === undefined) {
            c = cnt.length;
            map.set(key, c);
            cnt.push(0);
            if (build) {
              sx.push(0); sy.push(0); sz.push(0); su.push(0); sv.push(0);
            }
          }
          local.set(v, c);
          if (build) {
            sx[c] = (sx[c] as number) + x;
            sy[c] = (sy[c] as number) + y;
            sz[c] = (sz[c] as number) + z;
            if (hasUv) {
              su[c] = (su[c] as number) + (uv[v * 2] as number);
              sv[c] = (sv[c] as number) + (uv[v * 2 + 1] as number);
            }
          }
          cnt[c] = (cnt[c] as number) + 1;
        }
        tri[k] = c;
      }
      if (tri[0] === tri[1] || tri[1] === tri[2] || tri[0] === tri[2]) continue;
      out.triangles++;
      if (build) out.indices.push(tri[0] as number, tri[1] as number, tri[2] as number);
    }
    if (build) {
      const count = out.indices.length - firstIndexOfGroup;
      if (count > 0) out.groups.push({ start: firstIndexOfGroup, count, materialIndex: g.materialIndex, ...(g.doubleSided ? { doubleSided: true } : {}) });
    }
  }
  if (build) {
    const n = cnt.length;
    for (let c = 0; c < n; c++) {
      const k = cnt[c] as number || 1;
      out.positions.push((sx[c] as number) / k, (sy[c] as number) / k, (sz[c] as number) / k);
      if (hasUv) out.uvs.push((su[c] as number) / k, (sv[c] as number) / k);
    }
  }
  return out;
}

function bbox(pos: Float32Array): { min: [number, number, number]; max: [number, number, number] } {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = pos[i + a] as number;
      if (v < (min[a] as number)) min[a] = v;
      if (v > (max[a] as number)) max[a] = v;
    }
  }
  return { min, max };
}

/**
 * Reduz `def` para perto de `targetTriangles` triangulos. Devolve a propria `def` se ja estiver na meta.
 * O resultado nunca contem triangulos degenerados (indices repetidos ou area zero), preserva os grupos de material e a
 * ordem de materiais, recalcula as normais (ponderadas por area) e tira a media de UV por celula.
 */
export function simplifyMesh(def: ImportedMeshDef, targetTriangles: number): ImportedMeshDef {
  const total = def.indices.length / 3;
  const target = Math.max(4, Math.floor(targetTriangles));
  if (total <= target || def.positions.length === 0) return def;

  const { min, max } = bbox(def.positions);
  const diag = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) || 1;

  // Busca binaria (em escala logaritmica) do lado da celula: maior celula cujo resultado fica >= alvo e, entre as
  // que ficam <= alvo * 1.1, a mais proxima.
  let lo = Math.log(diag / 100000); // celula pequena -> muitos triangulos
  let hi = Math.log(diag); // celula grande -> poucos triangulos
  let bestCell = Math.exp(hi);
  let bestDiff = Infinity;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    const cell = Math.exp(mid);
    const n = cluster(def, min, cell, false).triangles;
    const diff = Math.abs(n - target);
    if (n <= target * 1.1 && diff < bestDiff) {
      bestDiff = diff;
      bestCell = cell;
    }
    if (n > target) lo = mid;
    else hi = mid;
  }

  const built = cluster(def, min, bestCell, true);
  return finish(def, built);
}

function finish(def: ImportedMeshDef, b: Built): ImportedMeshDef {
  const nv = b.positions.length / 3;
  const P = b.positions;
  // Remove triangulos de area zero e recalcula normais.
  const keep: number[] = [];
  const groups: ImportedMeshGroup[] = [];
  const nrm = new Float64Array(nv * 3);
  for (const g of b.groups) {
    const start = keep.length;
    for (let t = g.start; t < g.start + g.count; t += 3) {
      const a = b.indices[t] as number;
      const bb = b.indices[t + 1] as number;
      const c = b.indices[t + 2] as number;
      const ux = (P[bb * 3] as number) - (P[a * 3] as number);
      const uy = (P[bb * 3 + 1] as number) - (P[a * 3 + 1] as number);
      const uz = (P[bb * 3 + 2] as number) - (P[a * 3 + 2] as number);
      const vx = (P[c * 3] as number) - (P[a * 3] as number);
      const vy = (P[c * 3 + 1] as number) - (P[a * 3 + 1] as number);
      const vz = (P[c * 3 + 2] as number) - (P[a * 3 + 2] as number);
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (nx * nx + ny * ny + nz * nz < 1e-24) continue;
      keep.push(a, bb, c);
      for (const v of [a, bb, c]) {
        nrm[v * 3] = (nrm[v * 3] as number) + nx;
        nrm[v * 3 + 1] = (nrm[v * 3 + 1] as number) + ny;
        nrm[v * 3 + 2] = (nrm[v * 3 + 2] as number) + nz;
      }
    }
    if (keep.length > start) groups.push({ start, count: keep.length - start, materialIndex: g.materialIndex, ...(g.doubleSided ? { doubleSided: true } : {}) });
  }

  // Compacta vertices realmente usados.
  const remap = new Int32Array(nv).fill(-1);
  let used = 0;
  for (let i = 0; i < keep.length; i++) {
    const v = keep[i] as number;
    if (remap[v] === -1) remap[v] = used++;
  }
  const hasUv = b.uvs.length > 0;
  const positions = new Float32Array(used * 3);
  const normals = new Float32Array(used * 3);
  const uvs = new Float32Array(hasUv ? used * 2 : 0);
  for (let v = 0; v < nv; v++) {
    const r = remap[v] as number;
    if (r < 0) continue;
    positions[r * 3] = P[v * 3] as number;
    positions[r * 3 + 1] = P[v * 3 + 1] as number;
    positions[r * 3 + 2] = P[v * 3 + 2] as number;
    const x = nrm[v * 3] as number;
    const y = nrm[v * 3 + 1] as number;
    const z = nrm[v * 3 + 2] as number;
    const l = Math.hypot(x, y, z);
    if (l > 1e-12) {
      normals[r * 3] = x / l;
      normals[r * 3 + 1] = y / l;
      normals[r * 3 + 2] = z / l;
    } else {
      normals[r * 3 + 2] = 1;
    }
    if (hasUv) {
      uvs[r * 2] = b.uvs[v * 2] as number;
      uvs[r * 2 + 1] = b.uvs[v * 2 + 1] as number;
    }
  }
  const indices = new Uint32Array(keep.length);
  for (let i = 0; i < keep.length; i++) indices[i] = remap[keep[i] as number] as number;

  return { id: def.id, name: def.name, positions, normals, uvs, indices, groups };
}
