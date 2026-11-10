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

/** Códigos de `guarda_avisos` (iguais a `gc_avisos.rs`). Os de 6 a 11 vêm do caminho (1 a 6) e os de 13 a 17 da distribuição (1 a 5). */
export const AV = {
  hospedeiroDescontinuo: 6,
  deslocamentoExcede: 7,
  trechoCurto: 8,
  caminhoRepetido: 9,
  caminhoNulo: 10,
  semBorda: 11,
  perfilAutoIntersecta: 12,
  padraoNaoCabe: 13,
  padraoComprimido: 14,
  vaoSemEspaco: 15,
  sobraCurta: 16,
  montanteForaDoPiso: 17,
} as const;

export interface AvisoRef {
  guarda: number;
  codigo: number;
  trecho: number;
  indice: number;
  medido: number;
  limite: number;
  x: number;
  y: number;
  z: number;
}

/** Traduz `avisos`/`valores` de `guarda_caminhos` (códigos 1 a 6) para os códigos de `guarda_avisos` (6 a 11). */
export function deCaminho(avisos: readonly number[], valores: readonly number[]): AvisoRef[] {
  const mapa: Record<number, number> = { 1: AV.hospedeiroDescontinuo, 2: AV.deslocamentoExcede, 3: AV.trechoCurto, 4: AV.caminhoRepetido, 5: AV.caminhoNulo, 6: AV.semBorda };
  const out: AvisoRef[] = [];
  for (let i = 0; i < avisos.length / 4; i++) {
    const codigo = mapa[avisos[4 * i + 1]!];
    if (codigo === undefined) continue;
    const v = valores.slice(5 * i, 5 * i + 5);
    out.push({ guarda: avisos[4 * i]!, codigo, trecho: avisos[4 * i + 2]!, indice: avisos[4 * i + 3]!, medido: v[0]!, limite: v[1]!, x: v[2]!, y: v[3]!, z: v[4]! });
  }
  return out;
}

/** Traduz o aviso da distribuição (códigos 1 a 5) para o código de `guarda_avisos` (13 a 17). */
export function deDistribuicao(guarda: number, trecho: number, codigo: number, s: number, valor: number): AvisoRef | null {
  const mapa: Record<number, number> = { 1: AV.padraoNaoCabe, 2: AV.padraoComprimido, 3: AV.vaoSemEspaco, 4: AV.sobraCurta, 5: AV.montanteForaDoPiso };
  const c = mapa[codigo];
  return c === undefined ? null : { guarda, codigo: c, trecho, indice: 0, medido: valor, limite: 0, x: s, y: 0, z: 0 };
}

/** `gc-trecho-curto`: trecho emitido pelo caminho que ainda assim vira ponto em planta. */
export function avisoTrechoCurto(guarda: number, trecho: number, comprimento: number, minimo: number, p: [number, number, number]): AvisoRef | null {
  return comprimento <= minimo ? { guarda, codigo: AV.trechoCurto, trecho, indice: 0, medido: comprimento, limite: minimo, x: p[0], y: p[1], z: p[2] } : null;
}

/**
 * `gc-perfil-auto-intersecta`: num vértice com giro θ, o perfil de meia largura `m` recua `m * tan(θ/2)` pelo lado de dentro; se isso passa do menor
 * segmento vizinho, o contorno da varredura dobra sobre si. Mede em planta; `fechado` inclui o vértice de fechamento. Devolve o pior vértice.
 */
export function avisoPerfilAutoIntersecta(guarda: number, trecho: number, nos: ReadonlyArray<readonly [number, number, number]>, meiaLargura: number, fechado: boolean): AvisoRef | null {
  const n = nos.length;
  if (n < 3 || meiaLargura <= 0) return null;
  const seg = (i: number, j: number): [number, [number, number]] => {
    const d: [number, number] = [nos[j]![0] - nos[i]![0], nos[j]![1] - nos[i]![1]];
    return [Math.hypot(d[0], d[1]), d];
  };
  let pior: AvisoRef | null = null;
  const vertices = fechado ? Array.from({ length: n }, (_, i) => i) : Array.from({ length: n - 2 }, (_, i) => i + 1);
  for (const i of vertices) {
    const [l1, d1] = seg((i + n - 1) % n, i);
    const [l2, d2] = seg(i, (i + 1) % n);
    if (l1 < 1e-9 || l2 < 1e-9) continue;
    const giro = Math.acos(Math.min(1, Math.max(-1, (d1[0] * d2[0] + d1[1] * d2[1]) / (l1 * l2))));
    const recuo = meiaLargura * Math.min(Math.tan(giro / 2), 1e6);
    const menor = Math.min(l1, l2);
    if (recuo > menor + 1e-9 && (!pior || recuo - menor > pior.medido - pior.limite)) {
      pior = { guarda, codigo: AV.perfilAutoIntersecta, trecho, indice: i, medido: recuo, limite: menor, x: nos[i]![0], y: nos[i]![1], z: nos[i]![2] };
    }
  }
  return pior;
}
