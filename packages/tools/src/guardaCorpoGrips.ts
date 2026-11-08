import type { Vec2 } from '@hestia/geom';
import type { GuardaCorpo } from '@hestia/model';

/** Alça de vértice de um caminho manual de guarda-corpo (decisão 0055 §6a). */
export interface GripVerticeGC {
  indice: number;
  x: number;
  y: number;
}

/** Vértices do caminho manual; guarda-corpo hospedado em escada ou rampa não tem alça de vértice (vem do hospedeiro). */
export function gripsDoGuardaCorpo(g: GuardaCorpo): GripVerticeGC[] {
  if (g.hospedeiro.tipo !== 'manual') return [];
  return g.hospedeiro.caminho.map((v, indice) => ({ indice, x: v.x, y: v.y }));
}

/**
 * Patch do `updateGuardaCorpo` que move um vértice do caminho para `ponto`, preservando o desnível `dz` e os demais
 * vértices. Null quando o guarda-corpo não é manual ou o índice não existe.
 */
export function patchMoverVerticeGC(g: GuardaCorpo, indice: number, ponto: Vec2): Partial<Omit<GuardaCorpo, 'id' | 'kind' | 'order'>> | null {
  const h = g.hospedeiro;
  if (h.tipo !== 'manual' || indice < 0 || indice >= h.caminho.length) return null;
  const caminho = h.caminho.map((v, i) => (i === indice ? { ...v, x: ponto.x, y: ponto.y } : { ...v }));
  return { hospedeiro: { ...h, caminho } };
}
