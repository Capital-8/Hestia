import type { Id } from '@hestia/model';
import type { Item } from './resolve.ts';
import type { OpeningGeometry } from './types.ts';

const EPS_Z = 1e-6;

/** Altura absoluta (m) ocupada por uma parede. */
export interface ZRange {
  z0: number;
  z1: number;
}


/** Pontos de quebra vertical: bases, topos, limites das faixas e dos vãos de todas as paredes do cluster. */
export function breakpoints(items: Item[], zr: Map<Id, ZRange>, opens: OpeningGeometry[]): number[] {
  const set = new Set<number>();
  const add = (z: number): void => void set.add(Math.round(z / EPS_Z) * EPS_Z);
  for (const r of zr.values()) {
    add(r.z0);
    add(r.z1);
  }
  for (const i of items) {
    add(i.z0);
    add(i.z1);
  }
  for (const g of opens) {
    const w = zr.get(g.hostId);
    if (!w) continue;
    for (const z of [w.z0 + g.sill, w.z0 + g.sill + g.roughHeight]) if (z > w.z0 + EPS_Z && z < w.z1 - EPS_Z) add(z);
  }
  return [...set].sort((a, b) => a - b);
}

