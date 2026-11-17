/**
 * SPIKE caminho C (docs/estudo-esquadrias/12-spike-colunas-inclinadas.md): furo por contorno decompondo a ELEVAÇÃO da
 * parede em colunas verticais entre os vértices do contorno. Acima do furo a base da coluna segue a corda do arco
 * (base inclinada); as laterais e o parapeito ficam retos. Código experimental, sem consumidores no produto.
 * Sistema: x ao longo da parede (origem no meio do vão), z para cima a partir da base da parede.
 */
import type { OPt } from './outline.ts';

/** Coluna: faixa x0..x1 da parede, entre a base z0 (reta em a0, inclinada se a1 != a0) e o topo ztop (reto). */
export interface Column {
  x0: number;
  x1: number;
  /** Cota da base nas duas pontas (x0 e x1). Igual nas duas = base reta. */
  zb0: number;
  zb1: number;
  /** Cota do topo (reto). */
  zt: number;
  /** Topo inclinado em vez de base (peça de parapeito sob um arco invertido não ocorre; reservado). */
  kind: 'full' | 'above' | 'sill';
}

/** Altura da parte superior do contorno em x (máx. z dos pontos do anel na vertical x). Contorno convexo e simétrico. */
function topAt(ring: readonly OPt[], x: number): number {
  let m = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const lo = Math.min(p[0], q[0]);
    const hi = Math.max(p[0], q[0]);
    if (x < lo - 1e-12 || x > hi + 1e-12 || hi - lo < 1e-12) continue;
    m = Math.max(m, p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0]));
  }
  return m;
}

/**
 * Colunas de UMA camada de parede (comprimento total `len`, altura `H`, vão centrado em x = 0, soleira `sill`).
 * Uma coluna por corda do topo do contorno (acima: base inclinada), uma sob o furo se `sill > 0` (parapeito, topo na
 * base do furo = reto) e duas laterais de altura total. Não gera peças de largura zero.
 */
export function columnsOf(ring: readonly OPt[], len: number, H: number, sill: number): Column[] {
  const cols: Column[] = [];
  const xs = [...new Set(ring.map((p) => p[0]))].sort((a, b) => a - b);
  const xl = xs[0]!;
  const xr = xs[xs.length - 1]!;
  if (xl > -len / 2) cols.push({ x0: -len / 2, x1: xl, zb0: 0, zb1: 0, zt: H, kind: 'full' });
  if (xr < len / 2) cols.push({ x0: xr, x1: len / 2, zb0: 0, zb1: 0, zt: H, kind: 'full' });
  for (let i = 0; i + 1 < xs.length; i++) {
    const a = xs[i]!;
    const b = xs[i + 1]!;
    // Topo do furo nas duas pontas: nos vértices (as ombreiras retas têm dois z em x = ±half: usa o maior).
    const za = sill + topAt(ring, a);
    const zb = sill + topAt(ring, b);
    cols.push({ x0: a, x1: b, zb0: za, zb1: zb, zt: H, kind: 'above' });
    if (sill > 1e-9) cols.push({ x0: a, x1: b, zb0: 0, zb1: 0, zt: sill, kind: 'sill' });
  }
  return cols;
}

/** Volume de uma coluna: espessura x largura x (topo − base média) (base linear, o trapézio é exato). */
export const columnVolume = (c: Column, thickness: number): number => thickness * (c.x1 - c.x0) * (c.zt - (c.zb0 + c.zb1) / 2);

/** Faixas horizontais equivalentes (z0, z1, half) do spike 1a, para contar peças: laterais + faixa reta + n faixas do arco. */
export function slabPieceCount(nStrips: number, hasSill: boolean): number {
  // por faixa: esquerda + direita; sob o vão (parapeito) 1; acima do vão 1 (inteira).
  return 2 * nStrips + (hasSill ? 1 : 0) + 1;
}
