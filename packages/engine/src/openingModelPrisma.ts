import type { OPt } from '@hestia/model';
import type { OpeningPart, PartBox } from './openingModelTypes.ts';

/** Caixa envolvente (t, z) de um anel. */
export const boundsOf = (ring: readonly OPt[]): { t0: number; t1: number; z0: number; z1: number } => ({
  t0: Math.min(...ring.map((p) => p[0])),
  t1: Math.max(...ring.map((p) => p[0])),
  z0: Math.min(...ring.map((p) => p[1])),
  z1: Math.max(...ring.map((p) => p[1])),
});

/** A peça trocada por um prisma `tz` (seção (t, z), extrudada em `s` entre `s0` e `s1`); caixa = envolvente exata do anel. */
export function prisma(part: OpeningPart, ring: readonly OPt[], extra: Partial<OpeningPart> = {}, s?: { s0: number; s1: number }): OpeningPart {
  const b = boundsOf(ring);
  const box: PartBox = { t0: b.t0, t1: b.t1, z0: b.z0, z1: b.z1, s0: s?.s0 ?? part.box.s0, s1: s?.s1 ?? part.box.s1 };
  return { ...part, ...extra, box, profile: { plane: 'tz', pts: ring.map((p): [number, number] => [p[0], p[1]]) } };
}
