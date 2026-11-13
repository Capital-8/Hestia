import { applyTransform, type Transform, type Vec2 } from '@hestia/geom';
import type { LadoLote, Lot } from './lotTypes.ts';
import { areaAnelComSinal } from './validateTerrain.ts';
import type { Element } from './types.ts';

export const isLot = (e: Element | undefined): e is Lot => e?.kind === 'lot';

/** Monta um lote com os padrões do modelo (A.3): sem limites informados e área edificável visível. `order` o comando atribui. */
export function makeLot(p: Pick<Lot, 'id' | 'levelId' | 'contorno' | 'lados'> & Partial<Omit<Lot, 'kind' | 'order'>>): Omit<Lot, 'order'> {
  return { kind: 'lot', name: 'Lote', limites: {}, mostrarEdificavel: true, ...p };
}

/** Lados em torno do polígono com `n` lados e recuo 0, todos laterais (atalho para o desenho inicial). */
export const ladosPadrao = (n: number): LadoLote[] => Array.from({ length: n }, () => ({ papel: 'lateral' as const, recuo: 0 }));

/**
 * Inverte o sentido do contorno mantendo o primeiro vértice: `contorno'[k] = contorno[(n − k) mod n]` e
 * `lados'[k] = lados[n − 1 − k]`. Cada lado continua ligando os mesmos dois pontos, com o seu papel e o seu recuo.
 */
export function inverterLote(contorno: readonly Vec2[], lados: readonly LadoLote[]): { contorno: Vec2[]; lados: LadoLote[] } {
  const n = contorno.length;
  return {
    contorno: contorno.map((_, k) => ({ ...contorno[(n - k) % n]! })),
    lados: lados.map((_, k) => ({ ...lados[n - 1 - k]! })),
  };
}

/** Contorno anti-horário (o comando normaliza o sentido, e os lados vão junto). */
export function normalizarLote(contorno: readonly Vec2[], lados: readonly LadoLote[]): { contorno: Vec2[]; lados: LadoLote[] } {
  if (contorno.length >= 3 && lados.length === contorno.length && areaAnelComSinal(contorno) < 0) return inverterLote(contorno, lados);
  return { contorno: contorno.map((q) => ({ ...q })), lados: lados.map((l) => ({ ...l })) };
}

/**
 * Move, gira ou espelha o lote (A.3 item 5). No espelho, com n pontos, `contorno'[k] = espelho(contorno[(n − k) mod n])`
 * e `lados'[k] = lados[n − 1 − k]`: cada lado mantém o seu papel e o seu recuo.
 */
export function transformLot(l: Lot, t: Transform): Lot {
  const movido = l.contorno.map((q) => applyTransform(t, q));
  if (t.kind !== 'mirror') return { ...l, contorno: movido, lados: l.lados.map((x) => ({ ...x })) };
  const inv = inverterLote(movido, l.lados);
  return { ...l, contorno: inv.contorno, lados: inv.lados };
}
