import { describe, expect, it } from 'vitest';
import { filetarCaminho } from './corposCaminho';
import type { CaminhoResolvido } from './corposTipos';

/*
 * Teste CEGO do caminho com curvas (CONTRATO.md §2.3). Escrito só a partir do contrato e de corposTipos.ts.
 * AMBIGUIDADE (assinatura): o contrato não fixa o tipo de entrada de `pontos` nem o de `raios`. Assume-se
 * `pontos` como trios (m) e `raios` com `pontos.length - 2` valores (raios[i] é do vértice interior i+1).
 * O retorno é `CaminhoResolvido`: `pontos` em lista plana x,y,z (m) e `vertices` com índices de ponto.
 */

type Trio = [number, number, number];

const TOL_REL = 0.005;
const EPS = 1e-9;
const SEGMENTOS = 12;

function ponto(flat: number[], i: number): Trio {
  const x = flat[3 * i];
  const y = flat[3 * i + 1];
  const z = flat[3 * i + 2];
  if (x === undefined || y === undefined || z === undefined) throw new Error(`ponto ${i} fora do caminho`);
  return [x, y, z];
}

function numPontos(r: CaminhoResolvido): number {
  return r.pontos.length / 3;
}

function sub(a: Trio, b: Trio): Trio {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function soma(a: Trio, b: Trio): Trio {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function escala(a: Trio, k: number): Trio {
  return [a[0] * k, a[1] * k, a[2] * k];
}

function dot(a: Trio, b: Trio): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function norma(a: Trio): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function unit(a: Trio): Trio {
  const l = norma(a);
  return [a[0] / l, a[1] / l, a[2] / l];
}

function dist(a: Trio, b: Trio): number {
  return norma(sub(a, b));
}

function angulo(a: Trio, b: Trio): number {
  return Math.acos(Math.min(1, Math.max(-1, dot(unit(a), unit(b)))));
}

function expectRelativo(obtido: number, esperado: number): void {
  expect(Math.abs(obtido - esperado) / esperado).toBeLessThanOrEqual(TOL_REL);
}

function comprimentoEixo(r: CaminhoResolvido): number {
  let total = 0;
  for (let i = 1; i < numPontos(r); i++) total += dist(ponto(r.pontos, i - 1), ponto(r.pontos, i));
  return total;
}

/** Caminho em L: 0,5 m para cima e 0,5 m para +X, com curva de raio R no vértice do meio. */
const LSHAPE: Trio[] = [
  [0, 0, 0],
  [0, 0, 0.5],
  [0.5, 0, 0.5],
];

/** Dois trechos de 1 m; o desvio no vértice (1,0,0) é `grausDesvio` (0 = reto). */
function caminhoComDesvio(grausDesvio: number): Trio[] {
  const phi = (grausDesvio * Math.PI) / 180;
  return [
    [0, 0, 0],
    [1, 0, 0],
    [1 + Math.cos(phi), Math.sin(phi), 0],
  ];
}

/** Verifica a geometria do arco independentemente do código: A, B, centro C e tangência. */
function verificaArco(p: Trio[], raio: number): void {
  const d1 = unit(sub(p[1] as Trio, p[0] as Trio));
  const d2 = unit(sub(p[2] as Trio, p[1] as Trio));
  const phi = angulo(d1, d2);
  const t = raio * Math.tan(phi / 2);
  const P = p[1] as Trio;
  const A = sub(P, escala(d1, t));
  const B = soma(P, escala(d2, t));
  const n = unit(sub(d2, escala(d1, dot(d2, d1))));
  const C = soma(A, escala(n, raio));

  const r = filetarCaminho(p, [raio], SEGMENTOS);

  // Extremos do arco: primeiro ponto é A, último é B (segmentos + 1 pontos no arco).
  expect(ponto(r.pontos, 1)[0]).toBeCloseTo(A[0], 9);
  expect(ponto(r.pontos, 1)[1]).toBeCloseTo(A[1], 9);
  expect(ponto(r.pontos, 1)[2]).toBeCloseTo(A[2], 9);
  expect(ponto(r.pontos, SEGMENTOS + 1)[0]).toBeCloseTo(B[0], 9);
  expect(ponto(r.pontos, SEGMENTOS + 1)[1]).toBeCloseTo(B[1], 9);
  expect(ponto(r.pontos, SEGMENTOS + 1)[2]).toBeCloseTo(B[2], 9);

  // Distância ao centro constante = R em todos os pontos do arco.
  for (let i = 1; i <= SEGMENTOS + 1; i++) {
    expect(dist(ponto(r.pontos, i), C)).toBeCloseTo(raio, 9);
  }

  // Tangência: a primeira e a última corda do arco fazem ângulo ≤ φ/segmentos com d1 e d2.
  const limite = phi / SEGMENTOS + EPS;
  expect(angulo(sub(ponto(r.pontos, 2), ponto(r.pontos, 1)), d1)).toBeLessThanOrEqual(limite);
  expect(angulo(sub(ponto(r.pontos, SEGMENTOS + 1), ponto(r.pontos, SEGMENTOS)), d2)).toBeLessThanOrEqual(limite);
}

describe('filetarCaminho — teste cego (A4, CONTRATO §2.3)', () => {
  it('L-shape 0,5 m + 0,5 m com R = 0,1 m: comprimento do eixo 0,95708 m (±0,5 %)', () => {
    const r = filetarCaminho(LSHAPE, [0.1], SEGMENTOS);
    expectRelativo(comprimentoEixo(r), 0.9570796);
  });

  it('L-shape: o arco gera segmentos + 1 pontos (13) entre os dois vértices de extremidade', () => {
    const r = filetarCaminho(LSHAPE, [0.1], SEGMENTOS);
    // P0 + 13 pontos do arco (A..B incluídos) + P2.
    expect(numPontos(r)).toBe(2 + SEGMENTOS + 1);
  });

  it('L-shape: tangência nos extremos do arco e distância ao centro constante', () => {
    verificaArco(LSHAPE, 0.1);
  });

  it('desvio de 45° com R = 0,1 m: comprimento 2 − 2R·tan(22,5°) + R·π/4 (±0,5 %)', () => {
    const phi = Math.PI / 4;
    const esperado = 2 - 2 * 0.1 * Math.tan(phi / 2) + 0.1 * phi;
    const r = filetarCaminho(caminhoComDesvio(45), [0.1], SEGMENTOS);
    expectRelativo(comprimentoEixo(r), esperado);
  });

  it('desvio de 45° com R = 0,1 m: tangência e centro constante', () => {
    verificaArco(caminhoComDesvio(45), 0.1);
  });

  it('desvio de 120° com R = 0,1 m: comprimento 2 − 2R·tan(60°) + R·2π/3 (±0,5 %)', () => {
    const phi = (2 * Math.PI) / 3;
    const esperado = 2 - 2 * 0.1 * Math.tan(phi / 2) + 0.1 * phi;
    const r = filetarCaminho(caminhoComDesvio(120), [0.1], SEGMENTOS);
    expectRelativo(comprimentoEixo(r), esperado);
  });

  it('desvio de 120° com R = 0,1 m: tangência e centro constante', () => {
    verificaArco(caminhoComDesvio(120), 0.1);
  });

  it('raio 0 ou caminho colinear: o raio é ignorado e os pontos ficam como estão', () => {
    const reta: Trio[] = [
      [0, 0, 0],
      [1, 0, 0],
      [2, 0, 0],
    ];
    const r = filetarCaminho(reta, [0.1], SEGMENTOS);
    expect(r.pontos).toEqual([0, 0, 0, 1, 0, 0, 2, 0, 0]);
    const r0 = filetarCaminho(LSHAPE, [0], SEGMENTOS);
    expect(numPontos(r0)).toBe(3);
  });

  it('determinístico: duas chamadas com a mesma entrada dão o mesmo resultado', () => {
    const a = filetarCaminho(caminhoComDesvio(120), [0.1], SEGMENTOS);
    const b = filetarCaminho(caminhoComDesvio(120), [0.1], SEGMENTOS);
    expect(b).toEqual(a);
  });

  // AMBIGUIDADE: o contrato não diz se `vertices` mantém o índice do vértice de curva (P1), que deixa de
  // existir como ponto, nem qual é o índice do último vértice (esperado 14 pela contagem de pontos).
  it.skip('AMBIGUIDADE: vertices lista P0 e P2 (índices 0 e 14); P1 de curva fica fora ou não', () => {
    const r = filetarCaminho(LSHAPE, [0.1], SEGMENTOS);
    expect(r.vertices).toEqual([0, 14]);
  });

  // AMBIGUIDADE: o contrato cita o texto "retorno de 180° não pode ter curva" mas não diz se o erro é lançado
  // ou devolvido como diagnóstico (REGRAS §9), nem em que forma.
  it.skip('AMBIGUIDADE: retorno de 180° com raio é erro "retorno de 180° não pode ter curva"', () => {
    const volta: Trio[] = [
      [0, 0, 0],
      [0, 0, 1],
      [0, 0, 0],
    ];
    expect(() => filetarCaminho(volta, [0.1], SEGMENTOS)).toThrow('retorno de 180° não pode ter curva');
  });

  // AMBIGUIDADE: o contrato cita "curvas se sobrepõem no trecho N" sem dizer o índice N do trecho (0 ou 1)
  // nem se o erro é lançado ou devolvido.
  it.skip('AMBIGUIDADE: trechos curtos com curvas grandes geram "curvas se sobrepõem no trecho N"', () => {
    const curto: Trio[] = [
      [0, 0, 0],
      [0, 0, 0.1],
      [0.1, 0, 0.1],
    ];
    expect(() => filetarCaminho(curto, [0.5], SEGMENTOS)).toThrow('curvas se sobrepõem');
  });

  // AMBIGUIDADE: o contrato não define erro para segmento nulo (dois vértices iguais) nem a sua mensagem.
  it.skip('AMBIGUIDADE: segmento nulo entre dois vértices iguais é erro (mensagem não definida no contrato)', () => {
    const nulo: Trio[] = [
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
    ];
    expect(() => filetarCaminho(nulo, [0.1], SEGMENTOS)).toThrow();
  });
});
