import { wallBaseElevation, wallMaxHeight, type Project, type Wall } from '@hestia/model';
import type { WallFrame } from './frame.ts';
import { resolveAllFloors } from './floors.ts';
import { resolveAllRoofs } from './roofs.ts';
import { resolveAllSlabs } from './slabs.ts';
import { wallZRange, type WallZ } from './wallZ.ts';

/** Parede cuja faixa vertical depende de piso, laje ou telhado (anexos). */
function hasAttach(w: Wall): boolean {
  return w.attachBottomToFloor === true || w.attachTopToFloor === true || w.attachTopToRoof === true;
}

/** Evita o ciclo levelFrames -> resolveAll* -> levelFrames: dentro da resolução, vale a cota nominal. */
let resolving = false;

/**
 * Faixa vertical de cada parede (base e topo) para a junção só unir paredes que se encontram em altura (J-04).
 * Paredes sem anexo usam a cota nominal (caminho rápido, sem resolver pisos). Com anexo a piso, laje ou telhado, usa a
 * cota real de `wallZRange` (menor base ao longo do eixo; topo = z0 + altura máxima), como o BIMCraft. Pisos, lajes e
 * telhados são resolvidos uma vez por chamada e só se alguma parede tem anexo. Se a resolução for reentrante (os
 * pisos chamam levelFrames para classificar o contorno), cai na cota nominal para não gerar ciclo: limite documentado.
 * Quadros são construídos a cada chamada: anota no próprio objeto (copiar quebraria a identidade usada pela junção).
 */
export function withWallZ(p: Project, frames: WallFrame[]): WallFrame[] {
  const attached = !resolving && frames.some((f) => hasAttach(f.wall));
  let ctx: { floors: ReturnType<typeof resolveAllFloors>; slabs: ReturnType<typeof resolveAllSlabs>; roofs: ReturnType<typeof resolveAllRoofs> } | null = null;
  if (attached) {
    resolving = true;
    try {
      ctx = { floors: resolveAllFloors(p), slabs: resolveAllSlabs(p), roofs: resolveAllRoofs(p) };
    } finally {
      resolving = false;
    }
  }
  for (const f of frames) {
    if (ctx && hasAttach(f.wall)) {
      const z = wallZRange(p, f.wall, ctx.floors, ctx.slabs, ctx.roofs);
      f.z = { z0: z.z0, top: z.z0 + z.height };
    } else {
      const z0 = wallBaseElevation(p, f.wall);
      f.z = { z0, top: z0 + wallMaxHeight(p, f.wall) };
    }
  }
  return frames;
}

/**
 * Faixa vertical REAL (com anexos) de paredes soltas, para peneirar parceiras de outros níveis (`resolveParceiras`).
 * Resolve pisos, lajes e telhados uma vez. Devolve `null` se a resolução for reentrante (mesma guarda de `withWallZ`):
 * quem chama então trata a parede como não resolvida, sem ciclo.
 */
export function zRealDe(p: Project, walls: readonly Wall[]): Map<string, WallZ> | null {
  if (resolving) return null;
  const out = new Map<string, WallZ>();
  if (walls.length === 0) return out;
  resolving = true;
  try {
    const floors = resolveAllFloors(p);
    const slabs = resolveAllSlabs(p);
    const roofs = resolveAllRoofs(p);
    for (const w of walls) out.set(w.id, wallZRange(p, w, floors, slabs, roofs));
  } finally {
    resolving = false;
  }
  return out;
}
