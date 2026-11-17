import { camadaDaCunha, type Cunha, type JunctionLevel, type ResolvedLevel } from '@hestia/engine';
import type { Id } from '@hestia/model';
import type { SolidBatch } from './solids.ts';

function push(b: SolidBatch, v: number[], n: [number, number, number], tris: number[]): void {
  const base = b.positions.length / 3;
  for (let i = 0; i < v.length; i += 3) {
    b.positions.push(v[i]!, v[i + 1]!, v[i + 2]!);
    b.normals.push(n[0], n[1], n[2]);
  }
  for (const t of tris) b.indices.push(base + t);
}

/** Prisma triangular da cunha de transição (etapa R): 2 tampas e 3 faces laterais, malha fechada. `baseZ` = cota da base da parede. */
export function cunhaSolid(c: Cunha, baseZ: number, materialId: Id): SolidBatch {
  const b: SolidBatch = { materialId, category: 'wall', positions: [], normals: [], indices: [], ids: [] };
  const at = (side: number, lat: number, z: number): [number, number, number] => {
    const k = (side * c.t) / 2;
    return [c.node.x + c.u.x * k + c.n.x * lat, c.node.y + c.u.y * k + c.n.y * lat, baseZ + z];
  };
  const tri = (p: [number, number, number], q: [number, number, number], r: [number, number, number], ref: [number, number, number]): void => {
    // Normal para fora: aponta para longe do centro de massa `ref`.
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], w = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    let n: [number, number, number] = [u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, u[0]! * w[1]! - u[1]! * w[0]!];
    const l = Math.hypot(...n);
    if (l < 1e-14) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const out = n[0] * (p[0] - ref[0]) + n[1] * (p[1] - ref[1]) + n[2] * (p[2] - ref[2]) >= 0;
    push(b, out ? [...p, ...q, ...r] : [...p, ...r, ...q], out ? n : [-n[0], -n[1], -n[2]], [0, 1, 2]);
  };
  const lo = [at(-1, 0, 0), at(-1, c.offA, c.H), at(-1, c.offB, c.H)] as const;
  const hi = [at(1, 0, 0), at(1, c.offA, c.H), at(1, c.offB, c.H)] as const;
  const ref: [number, number, number] = [0, 1, 2].map((j) => ([...lo, ...hi].reduce((s, v) => s + v[j]!, 0)) / 6) as [number, number, number];
  tri(lo[0], lo[1], lo[2], ref);
  tri(hi[0], hi[1], hi[2], ref);
  for (let i = 0; i < 3; i++) {
    const j = (i + 1) % 3;
    tri(lo[i]!, lo[j]!, hi[j]!, ref);
    tri(lo[i]!, hi[j]!, hi[i]!, ref);
  }
  if (b.indices.length) b.ids.push({ id: c.wallId, start: 0, count: b.indices.length });
  return b;
}


/** Sólidos das cunhas do nível, cada um com o material da camada principal da parede dona. */
export function cunhasDoNivel3d(r: ResolvedLevel, jl?: JunctionLevel): SolidBatch[] {
  return (jl?.cunhas ?? []).flatMap((c) => {
    const rw = r.walls[c.wallId], m = rw && camadaDaCunha(rw)?.materialId;
    return rw && m ? [cunhaSolid(c, rw.baseZ, m)] : [];
  });
}
