import { terminoEhRegraParede, type Project, type Wall } from '@hestia/model';
import { resolveAllFloors, type ResolvedFloor } from './floors.ts';
import { projetoBase } from './projetoBase.ts';
import { resolveAllSlabs, type ResolvedSlab } from './slabs.ts';

const attachMemo = new WeakMap<Project, { floors: ResolvedFloor[]; slabs: ResolvedSlab[] }>();
const flatMemo = new WeakMap<Project, { floors: ResolvedFloor[]; slabs: ResolvedSlab[] }>();

/** Algum tipo de piso ou de laje tem camada com regra de término contra a parede (decisão 0025). */
const hasWallTermino = (p: Project): boolean =>
  [...Object.values(p.floorTypes), ...Object.values(p.slabTypes)].some((t) => t.layers.some(terminoEhRegraParede));

/** Pisos e lajes a que as paredes se anexam: sem anexo, nada; com término por camada, as camadas; senão, o contorno. */
export function attachTargets(p: Project, walls: readonly Wall[], flat: boolean): { floors: ResolvedFloor[]; slabs: ResolvedSlab[] } {
  if (!walls.some((w) => w.attachBottomToFloor === true || w.attachTopToFloor === true)) return { floors: [], slabs: [] };
  const memo = flat || !hasWallTermino(p) ? flatMemo : attachMemo;
  const base = projetoBase(p);
  let hit = memo.get(base);
  if (!hit) {
    const opts = memo === flatMemo ? { layers: false } : {};
    hit = { floors: resolveAllFloors(base, opts), slabs: resolveAllSlabs(base, opts) };
    memo.set(base, hit);
  }
  return hit;
}
