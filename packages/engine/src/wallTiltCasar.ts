import type { Vec2 } from '@hestia/geom';

/**
 * Casamento cíclico monótono de `raw` com `ring` (índices de `ring`, não decrescentes ao longo do anel, volta completa < m):
 * minimiza a soma das distâncias. O vértice mais próximo isolado erra em camada fina (2 mm), onde o deslocamento do anel
 * passa da espessura e dois vértices de `raw` cairiam no mesmo vértice do anel (anel degenerado).
 */
export function casarMonotono(raw: readonly Vec2[], ring: readonly Vec2[]): number[] {
  const n = raw.length, m = ring.length;
  const d = (i: number, j: number): number => Math.hypot(ring[j % m]!.x - raw[i]!.x, ring[j % m]!.y - raw[i]!.y);
  let best: number[] = raw.map((_, i) => Math.min(i, m - 1)), bestCost = Infinity;
  for (let j0 = 0; j0 < m; j0++) {
    // dp[i][k] = custo mínimo com raw[i] em ring[(j0 + k) % m], k em [0, m-1] não decrescente.
    const dp: number[][] = [], from: number[][] = [];
    for (let i = 0; i < n; i++) {
      dp.push(new Array<number>(m).fill(Infinity));
      from.push(new Array<number>(m).fill(0));
      for (let k = 0; k < m; k++) {
        if (i === 0) { if (k === 0) dp[0]![0] = d(0, j0); continue; }
        let pk = 0, pc = Infinity;
        for (let q = 0; q <= k; q++) if (dp[i - 1]![q]! < pc) { pc = dp[i - 1]![q]!; pk = q; }
        dp[i]![k] = pc + d(i, j0 + k);
        from[i]![k] = pk;
      }
    }
    let k = 0, c = Infinity;
    for (let q = 0; q < m; q++) if (dp[n - 1]![q]! < c) { c = dp[n - 1]![q]!; k = q; }
    if (c < bestCost) {
      bestCost = c;
      const idx = new Array<number>(n);
      for (let i = n - 1; i >= 0; i--) { idx[i] = (j0 + k) % m; k = from[i]![k]!; }
      best = idx;
    }
  }
  return best;
}
