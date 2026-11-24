/*
 * Quadro móvel da varredura (CONTRATO.md §2.3 "Varredura"): transporte paralelo (rotation-minimizing frame), sem torção.
 * `pontos` é uma lista plana (x, y, z) em metros. Devolve um quadro {T, N, B} por ponto, com B = T × N (e N × B = T).
 *
 * Inicial: T0 = direção do primeiro segmento; se |T0 × Z| < 1e-9, N0 = X; senão N0 = normalize(Z × T0). Entre segmentos
 * o normal é transportado pela rotação mínima (equivalente à reflexão dupla) que leva uma direção na outra. Em cada ponto
 * interior, T é a direção BISSETORA (normal do plano de esquadro da junta); o chamador alarga a seção por
 * `1/cos(φ/2)` ao longo de `e` (ver `alargamentoDaJunta`). Nas pontas, T é a direção do segmento vizinho.
 * Nunca lança: segmentos mais curtos que 1e-7 m não definem direção e herdam a do vizinho.
 */

import { LIMIAR_TRECHO } from './corposCaminho.ts';

export type V3 = [number, number, number];
export interface QuadroMovel {
  T: V3;
  N: V3;
  B: V3;
}

const EPS = 1e-9;

export const somaV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const subV = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mulV = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const dotV = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cruzV = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const normV = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export function unitV(a: V3, padrao: V3 = [0, 0, 1]): V3 {
  const n = normV(a);
  return n < EPS ? padrao : [a[0] / n, a[1] / n, a[2] / n];
}

/** Gira `v` em torno do eixo unitário `k` por `ang` (Rodrigues). */
function girar(v: V3, k: V3, ang: number): V3 {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const kv = cruzV(k, v);
  const kd = dotV(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
}

/** Leva `n` (perpendicular a `de`) pela rotação mínima que transforma `de` em `para`. */
function transportar(n: V3, de: V3, para: V3): V3 {
  const eixo = cruzV(de, para);
  const sen = normV(eixo);
  const cos = dotV(de, para);
  if (sen < EPS) {
    if (cos > 0) return n;
    // retorno de 180°: gira meia volta em torno de uma perpendicular a `de`
    return girar(n, unitV(cruzV(de, n), n), Math.PI);
  }
  return girar(n, [eixo[0] / sen, eixo[1] / sen, eixo[2] / sen], Math.atan2(sen, cos));
}

/**
 * Direções unitárias dos segmentos. Trecho mais curto que `LIMIAR_TRECHO` (m) não tem direção confiável: herda a direção
 * do segmento vizinho anterior, e o início sem anterior herda do primeiro segmento válido.
 */
export function direcoesDoCaminho(pontos: number[]): V3[] {
  const n = Math.floor(pontos.length / 3);
  const brutas: Array<V3 | null> = [];
  for (let i = 0; i + 1 < n; i++) {
    const d: V3 = [pontos[i * 3 + 3]! - pontos[i * 3]!, pontos[i * 3 + 4]! - pontos[i * 3 + 1]!, pontos[i * 3 + 5]! - pontos[i * 3 + 2]!];
    brutas.push(normV(d) < LIMIAR_TRECHO ? null : unitV(d));
  }
  let anterior: V3 = brutas.find((d): d is V3 => d !== null) ?? [0, 0, 1];
  return brutas.map((d) => {
    anterior = d ?? anterior;
    return anterior;
  });
}

export function quadrosDoCaminho(pontos: number[]): QuadroMovel[] {
  const n = Math.floor(pontos.length / 3);
  const dirs = direcoesDoCaminho(pontos);
  const primeira = dirs[0];
  if (n < 2 || !primeira) return [];
  const paraleloZ = normV(cruzV(primeira, [0, 0, 1])) < EPS;
  let normal: V3 = paraleloZ ? [1, 0, 0] : unitV(cruzV([0, 0, 1], primeira));
  const quadros: QuadroMovel[] = [];
  const empurra = (T: V3, N: V3): void => {
    quadros.push({ T, N, B: cruzV(T, N) });
  };
  empurra(primeira, normal);
  for (let i = 1; i < n - 1; i++) {
    const d1 = dirs[i - 1]!;
    const d2 = dirs[i]!;
    const bissetor = unitV(somaV(d1, d2), d2);
    const naJunta = transportar(normal, d1, bissetor);
    empurra(bissetor, naJunta);
    normal = transportar(naJunta, bissetor, d2);
  }
  empurra(dirs[dirs.length - 1]!, normal);
  return quadros;
}

/**
 * Junta de esquadro no ponto interior `i`, dadas as `dirs` do caminho: fator `1/cos(φ/2)` e a direção unitária `e` (no
 * plano de esquadro e no plano das duas tangentes) ao longo da qual a seção se alarga. Em reta, fator 1.
 */
export function alargamentoDaJunta(dirs: V3[], i: number): { fator: number; e: V3 } {
  const d1 = dirs[i - 1];
  const d2 = dirs[i];
  if (!d1 || !d2) return { fator: 1, e: [1, 0, 0] };
  const e = subV(d2, d1);
  if (normV(e) < EPS) return { fator: 1, e: [1, 0, 0] };
  const cosMeio = normV(somaV(d1, d2)) / 2;
  return { fator: 1 / Math.max(cosMeio, 1e-3), e: unitV(e) };
}
