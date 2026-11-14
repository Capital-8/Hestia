import { isGeneric, type Generic, type Id, type Project } from '@hestia/model';
import { ofElement, type SolidBatch } from './solids.ts';

/**
 * Malha dos objetos importados (viga, pilar, mobiliário, MEP...) de um nível. Cada triângulo entra com a normal da própria
 * face (sombreamento chapado, como as demais peças) e com a faixa de índices do elemento, para o picking do 3D continuar
 * funcionando do mesmo jeito que nas paredes. A cor do IFC vira um lote por material (`im_<hex>`, criado na importação).
 */
export function buildGenericSolids(p: Project, levelId: Id): SolidBatch[] {
  const batches = new Map<string, SolidBatch>();
  for (const e of Object.values(p.elements)) {
    if (!isGeneric(e) || e.levelId !== levelId) continue;
    const materialId = materialOf(e);
    let batch = batches.get(materialId);
    if (!batch) {
      batch = { materialId, category: 'generic', positions: [], normals: [], indices: [], ids: [] };
      batches.set(materialId, batch);
    }
    ofElement(batch, e.id, () => pushMesh(batch!, e.mesh.positions, e.mesh.indices));
  }
  return [...batches.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([, b]) => b).filter((b) => b.indices.length > 0);
}

/** Material do genérico: o da cor do IFC quando existir; senão o concreto padrão. */
function materialOf(e: Generic): string {
  if (!e.color) return 'mat_concreto';
  const hex = e.color.replace('#', '').toLowerCase();
  return e.opacity != null && e.opacity < 0.999 ? `im_${hex}_${String(Math.round(e.opacity * 100)).padStart(3, '0')}` : `im_${hex}`;
}

/** Triângulos com vértices próprios e normal plana por face. */
function pushMesh(batch: SolidBatch, positions: ArrayLike<number>, indices: ArrayLike<number>): void {
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = (indices[i] ?? 0) * 3;
    const b = (indices[i + 1] ?? 0) * 3;
    const c = (indices[i + 2] ?? 0) * 3;
    const ax = positions[a] ?? 0;
    const ay = positions[a + 1] ?? 0;
    const az = positions[a + 2] ?? 0;
    const bx = positions[b] ?? 0;
    const by = positions[b + 1] ?? 0;
    const bz = positions[b + 2] ?? 0;
    const cx = positions[c] ?? 0;
    const cy = positions[c + 1] ?? 0;
    const cz = positions[c + 2] ?? 0;
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;
    const base = batch.positions.length / 3;
    batch.positions.push(ax, ay, az, bx, by, bz, cx, cy, cz);
    batch.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    batch.indices.push(base, base + 1, base + 2);
  }
}
