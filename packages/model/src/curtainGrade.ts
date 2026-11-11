// Grade da parede cortina no modelo (decisão 0056, §5.1 e §5.2): linhas de um eixo, linhas extras, células e regiões.
// Função pura e pequena, usada pelos comandos e pelo remapeamento (curtainRemap.ts). O Rust resolve a grade para o 3D e a
// planta; esta cópia só diz ao modelo qual célula está em cada ponto e qual região cada célula forma.
// Metros. Sem ângulo (fase 7). Dois detalhes de identidade (decisão desta implementação, ver curtainRemap.ts):
// o índice e o `n` de uma linha GERADA contam só as geradas, para uma linha extra não deslocar as demais; a
// posição normalizada de uma gerada é a da linha ANTES de qualquer sobrescrita (a identidade não muda quando ela é movida).

import type { Id } from './types.ts';
import { CURTAIN_MIN_REMAINDER, type GridAxisSpec } from './wallCurtainTypes.ts';

/** Soldagem de linhas e tolerância de borda (m): mesma escala da referência (§5.1). */
export const TOL_SOLDA = 1e-6;
const EPS = 1e-9;

export type Eixo = 'u' | 'v';

/** Eixo efetivo = tipo com a sobrescrita da instância, campo a campo (campo `undefined` herda do tipo). */
export function eixoEfetivo(tipo: GridAxisSpec, inst?: Partial<GridAxisSpec>): GridAxisSpec {
  const out: Record<string, unknown> = { ...tipo };
  if (inst) for (const [k, v] of Object.entries(inst)) if (v !== undefined) out[k] = v;
  return out as unknown as GridAxisSpec;
}

/**
 * Posições das linhas geradas de um eixo de comprimento `A` (§5.1), em (0, A), já com `offset` e a fusão da sobra
 * minúscula. Eixo inválido ou fora de escopo (ângulo ≠ 0): nenhuma linha (a validação do tipo acusa o erro).
 */
export function linhasGeradas(A: number, spec: GridAxisSpec, r = CURTAIN_MIN_REMAINDER): number[] {
  if (!(A > 0) || !Number.isFinite(A) || (spec.angle ?? 0) !== 0) return [];
  const o = spec.offset ?? 0;
  const dentro = (p: number): boolean => p > TOL_SOLDA && p < A - TOL_SOLDA;
  let bruto: number[] = [];
  // Funde as pontas: fixedDistance sempre; os outros modos só com offset (a sobra vira célula de tamanho normal).
  let fundir = o !== 0 && spec.mode !== 'manual';
  if (spec.mode === 'fixedNumber' || spec.mode === 'maxDistance') {
    const n = spec.mode === 'fixedNumber' ? spec.count : spec.distance !== undefined && spec.distance > 0 ? Math.max(1, Math.ceil(A / spec.distance - EPS)) : undefined;
    if (n === undefined || !(n >= 1)) return [];
    for (let k = 0; k <= n; k++) bruto.push((A * k) / n + o);
  } else if (spec.mode === 'fixedDistance') {
    const d = spec.distance;
    if (d === undefined || !(d > 0)) return [];
    fundir = true;
    const m = Math.floor(A / d + EPS);
    if (m === 0) return [];
    const R = Math.max(0, A - m * d);
    const p0 = spec.justify === 'end' ? R : spec.justify === 'center' ? R / 2 : 0;
    const kmin = Math.floor((0 - p0 - o) / d) - 1;
    const kmax = Math.ceil((A - p0 - o) / d) + 1;
    for (let k = kmin; k <= kmax; k++) bruto.push(p0 + k * d + o);
  } else if (spec.mode === 'manual') {
    const ancora = spec.anchor ?? 'start';
    for (const p of spec.positions ?? []) bruto.push((ancora === 'start' ? p : A - p) + o);
  } else {
    return [];
  }
  bruto = bruto.filter(dentro).sort((x, y) => x - y);
  const linhas: number[] = [];
  for (const p of bruto) if (linhas.length === 0 || p - (linhas[linhas.length - 1] as number) >= TOL_SOLDA) linhas.push(p);
  if (fundir) {
    if (linhas.length > 0 && (linhas[0] as number) < r - EPS) linhas.shift();
    if (linhas.length > 0 && A - (linhas[linhas.length - 1] as number) < r - EPS) linhas.pop();
  }
  return linhas;
}

/** Linha da grade resolvida (já com as sobrescritas e as extras). */
export interface LinhaGrade {
  eixo: Eixo;
  /** Posição final (m) a partir do início (U) ou da base (V). */
  pos: number;
  /** Id da linha extra; ausente = gerada. */
  added?: Id;
  /** Índice entre as geradas (0 = primeira); ausente nas extras. */
  gerada?: number;
  /** Posição gerada, antes de sobrescrita (m); ausente nas extras. */
  base?: number;
  /** Montante da linha: id = tipo; null = sem montante; ausente = interior do sistema. */
  montante?: Id | null;
  locked?: boolean;
  /** Índice final (1..n-1) entre todas as linhas do eixo, em ordem crescente. */
  indice: number;
}

/** Uma linha de entrada da montagem: gerada (com a posição final) ou extra. */
export interface EntradaLinha {
  pos: number;
  added?: Id;
  gerada?: number;
  base?: number;
  montante?: Id | null;
  locked?: boolean;
}

/**
 * Monta as linhas finais de um eixo: entradas dentro do vão, ordenadas, com soldagem. Duas linhas a menos de
 * `TOL_SOLDA` viram uma e vale a extra (§5.1). Índices finais 1..n-1.
 */
export function montarLinhas(eixo: Eixo, A: number, entradas: EntradaLinha[]): LinhaGrade[] {
  const dentro = entradas.filter((l) => l.pos > TOL_SOLDA && l.pos < A - TOL_SOLDA);
  dentro.sort((a, b) => a.pos - b.pos);
  const final: LinhaGrade[] = [];
  for (const l of dentro) {
    const prev = final[final.length - 1];
    if (prev && l.pos - prev.pos < TOL_SOLDA) {
      if (l.added !== undefined && prev.added === undefined) final[final.length - 1] = { ...l, eixo, indice: 0 };
      continue;
    }
    final.push({ ...l, eixo, indice: 0 });
  }
  final.forEach((l, k) => {
    l.indice = k + 1;
  });
  return final;
}

/** Bordas de um eixo: [0, pos das linhas..., comprimento]. */
export function bordasDe(A: number, linhas: LinhaGrade[]): number[] {
  return [0, ...linhas.map((l) => l.pos), A];
}

/** Índice da célula que contém a coordenada `x` (menor índice na fronteira). -1 fora do eixo. */
export function celulaEm(bordas: number[], x: number): number {
  if (x < -TOL_SOLDA || x > (bordas[bordas.length - 1] as number) + TOL_SOLDA) return -1;
  for (let k = 0; k < bordas.length - 1; k++) if (x <= (bordas[k + 1] as number) + TOL_SOLDA) return k;
  return -1;
}

/** Centro de uma célula ou segmento de índice `k` entre as bordas. */
export const centroEntre = (bordas: number[], k: number): number => ((bordas[k] as number) + (bordas[k + 1] as number)) / 2;

/**
 * Regiões: união das células separadas por segmentos removidos. `arestas` = pares de índices de célula (a, b) que o
 * segmento removido liga. Devolve, para cada célula (índice i*nv + j), a célula canônica da região: a de menor (j, i).
 */
export function regioesDe(nu: number, nv: number, arestas: Array<[number, number]>): number[] {
  const pai = Array.from({ length: nu * nv }, (_, c) => c);
  const raiz = (c: number): number => {
    let x = c;
    while (pai[x] !== x) {
      pai[x] = pai[pai[x] as number] as number;
      x = pai[x] as number;
    }
    return x;
  };
  for (const [a, b] of arestas) {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) pai[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const melhor = new Map<number, number>();
  for (let c = 0; c < nu * nv; c++) {
    const r0 = raiz(c);
    const atual = melhor.get(r0);
    // Menor (j, i): com índice c = i*nv + j, comparar j e depois i.
    if (atual === undefined || jiDe(c, nv) < jiDe(atual, nv)) melhor.set(r0, c);
  }
  return Array.from({ length: nu * nv }, (_, c) => melhor.get(raiz(c)) as number);
}

/** Chave de ordem (j, i) de uma célula de índice `c = i*nv + j`. */
function jiDe(c: number, nv: number): number {
  const i = Math.floor(c / nv);
  const j = c - i * nv;
  return j * 1e6 + i;
}

/** Região (sem pai) de uma célula: as células (índices) que compartilham a canônica. */
export const regiaoRetangular = (nu: number, nv: number, regiao: number[], canon: number): boolean => {
  let n = 0;
  let i0 = Infinity;
  let i1 = -Infinity;
  let j0 = Infinity;
  let j1 = -Infinity;
  for (let c = 0; c < nu * nv; c++) {
    if (regiao[c] !== canon) continue;
    const i = Math.floor(c / nv);
    const j = c - i * nv;
    n++;
    i0 = Math.min(i0, i);
    i1 = Math.max(i1, i);
    j0 = Math.min(j0, j);
    j1 = Math.max(j1, j);
  }
  return n === (i1 - i0 + 1) * (j1 - j0 + 1);
};
