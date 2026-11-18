import type { Vec2 } from '@hestia/geom';
import type { PosicaoNaFila, PreenchimentoDeVao } from './encaixeTipos.ts';

/*
 * Fila do encaixe (PLANO-MODELAGEM-FLUIDA, F2): fechar vão, redistribuir larguras e posicionar módulos na linha.
 * Toda a conta interna é em micrômetros inteiros (`round(m × 1e6)`) para não acumular erro de ponto flutuante;
 * a saída volta em metros exatos a 1 µm.
 */

/** Micrômetros por metro. */
const UM = 1_000_000;
/** Limite da busca exaustiva: no máximo 40 módulos, vão até 12 m. */
const MAX_MODULOS = 40;
const VAO_MAXIMO_UM = 12 * UM;

function micra(m: number): number {
  return Math.round(m * UM);
}

function metros(um: number): number {
  return um / UM;
}

/** Painel e sobra de uma soma `soma` de módulos (µm) num vão `V` (µm): painel 0 abaixo de `painelMin`, o resto na banda, `painelMax` acima. */
interface Candidato {
  soma: number;
  painel: number;
  sobra: number;
  modulos: number;
}

function avaliarVao(V: number, painelMin: number, painelMax: number, soma: number, modulos: number): Candidato {
  const resto = V - soma;
  const painel = resto === 0 || resto < painelMin ? 0 : resto <= painelMax ? resto : painelMax;
  return { soma, painel, sobra: resto - painel, modulos };
}

/** Menor na ordem do objetivo: sobra, depois painel, depois nº de módulos. */
function melhorQue(a: Candidato, b: Candidato): boolean {
  return a.sobra < b.sobra || (a.sobra === b.sobra && (a.painel < b.painel || (a.painel === b.painel && a.modulos < b.modulos)));
}

/**
 * Mochila ilimitada com menor nº de módulos por soma (µm) até `U = min(V, 40 × maior largura)`; percorre as somas e
 * escolhe pelo objetivo declarado. Contagens acima de `MAX_MODULOS` ficam no teto `INF` (inviável).
 */
function melhorSoma(V: number, painelMin: number, painelMax: number, mods: readonly number[]): Candidato {
  if (mods.length === 0) return avaliarVao(V, painelMin, painelMax, 0, 0);
  const U = Math.min(V, MAX_MODULOS * mods[0]!);
  const INF = MAX_MODULOS + 1;
  const dp = new Int32Array(U + 1).fill(INF);
  dp[0] = 0;
  for (const w of mods) {
    for (let s = w; s <= U; s++) {
      const c = Math.min(INF, dp[s - w]! + 1);
      if (c < dp[s]!) dp[s] = c;
    }
  }
  let melhor: Candidato | null = null;
  for (let s = 0; s <= U; s++) {
    const cont = dp[s]!;
    if (cont > MAX_MODULOS) continue;
    const c = avaliarVao(V, painelMin, painelMax, s, cont);
    if (melhor === null || melhorQue(c, melhor)) melhor = c;
  }
  return melhor ?? avaliarVao(V, painelMin, painelMax, 0, 0);
}

/**
 * Reconstrói o multiconjunto de `n` módulos (larguras `mods`, decrescentes, sem repetição) que soma exatamente `soma` (µm),
 * maior lexicograficamente em ordem não crescente (larguras maiores primeiro — critério 4 do objetivo).
 */
function multiplicidade(mods: readonly number[], soma: number, n: number): number[] {
  if (soma === 0 || n === 0) return [];
  const menor = mods[mods.length - 1]!;
  const counts = mods.map(() => 0);
  const visto = new Set<string>();
  const vai = (i: number, rem: number, q: number): boolean => {
    if (q === 0) return rem === 0;
    if (i >= mods.length || rem < q * menor || rem > q * mods[i]!) return false;
    const chave = `${i}|${rem}|${q}`;
    if (visto.has(chave)) return false;
    visto.add(chave);
    const w = mods[i]!;
    for (let t = Math.min(q, Math.floor(rem / w)); t >= 0; t--) {
      if (vai(i + 1, rem - t * w, q - t)) {
        counts[i] = t;
        return true;
      }
    }
    return false;
  };
  if (!vai(0, soma, n)) throw new Error('falha interna: soma sem multiconjunto viável');
  const saida: number[] = [];
  mods.forEach((w, i) => {
    for (let t = counts[i]!; t > 0; t--) saida.push(w);
  });
  return saida;
}

/**
 * Fecha um vão de `vao` (m) com módulos das larguras disponíveis (m, podem repetir) mais, se precisar, um painel de enchimento entre
 * `painelMin` e `painelMax` (m, padrões 0,02 e 0,15). Objetivo, nesta ordem: (1) cobrir o vão (sobra 0), (2) menos painel, (3) menos módulos,
 * (4) larguras maiores primeiro. Resultado determinístico (mesma entrada, mesma saída). Sem solução exata: usa a combinação que deixa
 * a MENOR sobra não negativa, devolvendo essa sobra. `vao` ≤ 0 ou sem larguras: modulos [], painel 0, sobra = max(vao, 0).
 */
export function preencherVao(
  vao: number,
  larguras: readonly number[],
  opcoes: { painelMin?: number; painelMax?: number } = {},
): PreenchimentoDeVao {
  if (!(vao > 0) || larguras.length === 0) return { modulos: [], painel: 0, sobra: metros(Math.max(micra(vao), 0)) };
  const V = micra(vao);
  if (V > VAO_MAXIMO_UM) throw new Error(`vão de ${vao} m acima do limite de busca de ${metros(VAO_MAXIMO_UM)} m`);
  const painelMin = Math.max(0, micra(opcoes.painelMin ?? 0.02));
  const painelMax = Math.max(painelMin, micra(opcoes.painelMax ?? 0.15));
  const mods = [...new Set(larguras.map(micra).filter((w) => w > 0 && w <= V))].sort((a, b) => b - a);
  const melhor = melhorSoma(V, painelMin, painelMax, mods);
  return {
    modulos: multiplicidade(mods, melhor.soma, melhor.modulos).map(metros),
    painel: metros(melhor.painel),
    sobra: metros(melhor.sobra),
  };
}

/**
 * Redistribui a diferença entre `total` (m) e a soma das larguras entre os módulos que podem crescer ou encolher: cada um tem
 * `limites[i] = [min, max]` (m). Divide igualmente a diferença entre os módulos flexíveis (min < max) respeitando os limites e
 * repartindo o excedente entre os demais, até esgotar. Devolve as novas larguras (mesma ordem). Se não couber nos limites, devolve
 * as larguras no limite mais próximo e a soma continua diferente de `total` (o chamador confere). Arredonda a 1 µm.
 */
export function ajustarLarguras(larguras: readonly number[], limites: ReadonlyArray<readonly [number, number]>, total: number): number[] {
  const min: number[] = [];
  const max: number[] = [];
  const w: number[] = [];
  larguras.forEach((v, i) => {
    const par = limites[i];
    const m = Math.min(micra(par?.[0] ?? v), micra(par?.[1] ?? v));
    const M = Math.max(micra(par?.[0] ?? v), micra(par?.[1] ?? v));
    min.push(m);
    max.push(M);
    w.push(Math.min(Math.max(micra(v), m), M));
  });
  const soma = (v: number[]): number => v.reduce((t, x) => t + x, 0);
  const alvo = micra(total);
  let delta = alvo - soma(w);
  while (delta !== 0) {
    const cands: number[] = [];
    for (let i = 0; i < w.length; i++) {
      if (delta > 0 ? w[i]! < max[i]! : w[i]! > min[i]!) cands.push(i);
    }
    if (cands.length === 0) break;
    const d = Math.abs(delta);
    const base = Math.floor(d / cands.length);
    const resto = d % cands.length;
    cands.forEach((i, j) => {
      const inc = (base + (j < resto ? 1 : 0)) * Math.sign(delta);
      w[i] = Math.min(Math.max(w[i]! + inc, min[i]!), max[i]!);
    });
    delta = alvo - soma(w);
  }
  return w.map(metros);
}

/** Posições (e poses) dos módulos de uma fila da linha `a`→`b`, na ordem recebida, colados um ao outro a partir de `a`. Ver `PosicaoNaFila`. */
export function posicoesDaFila(a: Vec2, b: Vec2, larguras: readonly number[], profundidade: number, z = 0): PosicaoNaFila[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const comp = Math.hypot(dx, dy);
  if (comp === 0) throw new Error('linha degenerada: a e b coincidem');
  const d = { x: dx / comp, y: dy / comp };
  let rotation = Math.atan2(-d.y, -d.x);
  if (rotation <= -Math.PI) rotation += 2 * Math.PI;
  const saida: PosicaoNaFila[] = [];
  let inicio = 0;
  larguras.forEach((largura, indice) => {
    const avanco = inicio + largura;
    saida.push({
      indice,
      inicio,
      largura,
      pose: {
        x: a.x + avanco * d.x - profundidade * d.y,
        y: a.y + avanco * d.y + profundidade * d.x,
        rotation,
        mirrored: false,
        z,
      },
    });
    inicio += largura;
  });
  return saida;
}
