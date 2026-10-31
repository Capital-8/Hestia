import type { Ring, Vec2 } from '@hestia/geom';
import type { Id } from '@hestia/model';

/** Anel em (t, z) de um elemento (escada ou rampa), só para captura de pontos e arestas na vista. */
export interface SectionSnapRing {
  /** Escada ou rampa de origem. */
  hostId: Id;
  ring: Ring;
}

/**
 * Anéis de um prisma projetado na vista: para cada lado do contorno em planta, a face lateral (topo e fundo nas duas
 * pontas) e, ao fim, o contorno do topo e do fundo. Mantém os vértices côncavos que a envoltória convexa perde.
 */
export function prismSnapRings(
  hostId: Id,
  outer: readonly Vec2[],
  along: (v: Vec2) => number,
  topAt: (v: Vec2) => number,
  bottomAt: (v: Vec2) => number,
): SectionSnapRing[] {
  const out: SectionSnapRing[] = [];
  const n = outer.length;
  for (let i = 0; i < n; i++) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    const ta = along(a);
    const tb = along(b);
    out.push({
      hostId,
      ring: [
        { x: ta, y: bottomAt(a) },
        { x: tb, y: bottomAt(b) },
        { x: tb, y: topAt(b) },
        { x: ta, y: topAt(a) },
      ],
    });
  }
  return out;
}
