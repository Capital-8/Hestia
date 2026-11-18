import type { OpeningMuntinKind, OpeningType } from './types.ts';

/** Desenhos de divisão decorativa do vidro aceitos em `OpeningType.muntinPattern` (docs/estudo-esquadrias/28 §6). */
export const OPENING_MUNTIN_KINDS: readonly OpeningMuntinKind[] = ['colonial', 'prairie', 'diamond', 'fan', 'cross', 'mullions'];

const axis = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(8, Math.max(1, Math.round(v))) : 1);

/** Divisão decorativa do tipo com o padrão por leitura (1..8 por eixo, `on` 'all'); `null` quando o tipo não tem. */
export function openingMuntinPattern(t: Pick<OpeningType, 'muntinPattern'>): { kind: OpeningMuntinKind; cols: number; rows: number; on: 'all' | 'transom' } | null {
  const m = t.muntinPattern;
  if (!m || !OPENING_MUNTIN_KINDS.includes(m.kind)) return null;
  return { kind: m.kind, cols: axis(m.cols), rows: axis(m.rows), on: m.on === 'transom' ? 'transom' : 'all' };
}
