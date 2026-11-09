/**
 * Referência TS das medidas de aviso do guarda-corpo (decisão 0055, §8.1), espelho de `crates/geom-wasm/src/gc_avisos.rs`. Usada só pelos testes
 * de paridade; o app não a chama (a medida vem do Rust). Desdobramento 2D: `s` horizontal, `h` altura sobre o hospedeiro.
 */
export interface VaoGCRef {
  comprimento: number;
  altura: number;
  /** Faixas verticais ocupadas (balaústres, postes) em `s`. */
  verticais: Array<[number, number]>;
  /** Faixas horizontais ocupadas (trilhos) em `h`. */
  horizontais: Array<[number, number]>;
}

function livres(ocupados: ReadonlyArray<[number, number]>, a: number, b: number): Array<[number, number]> {
  const o = ocupados.filter(([x, y]) => y > a && x < b).sort((p, q) => p[0] - q[0]);
  const out: Array<[number, number]> = [];
  let cur = a;
  for (const [x, y] of o) {
    if (x > cur) out.push([cur, Math.min(x, b)]);
    cur = Math.max(cur, y);
  }
  if (cur < b) out.push([cur, b]);
  return out;
}

/** Maior esfera (diâmetro, m) que passa por uma célula livre na faixa de alturas `[hMin, hMax]`, com o centro `(s, h)`; null se não há célula. */
export function maiorEsfera(v: VaoGCRef, hMin: number, hMax: number): { diametro: number; s: number; h: number } | null {
  const hs = livres(v.horizontais, Math.max(hMin, 0), Math.min(hMax, v.altura));
  const ss = livres(v.verticais, 0, v.comprimento);
  let melhor: { diametro: number; s: number; h: number } | null = null;
  for (const [s0, s1] of ss) {
    for (const [h0, h1] of hs) {
      const d = Math.min(s1 - s0, h1 - h0);
      if (d > 0 && (!melhor || d > melhor.diametro)) melhor = { diametro: d, s: (s0 + s1) / 2, h: (h0 + h1) / 2 };
    }
  }
  return melhor;
}
