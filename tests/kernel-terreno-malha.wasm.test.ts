/**
 * Terreno, ficha R1 (PLANO do terreno A.5 e A.10): as consultas 160 (`terreno_malha`) e 163 (`terreno_cotas`) pela ABI real do WASM, sobre a fixture T3
 * (pirâmide: cantos do quadrado (0,0)–(20,20) com z = 0 e o centro com z = 5). Confere contagens, `z_base`, cotas e que entrada inválida vira erro leve,
 * não aborto. As seções são montadas aqui à mão: o adaptador `kernelTerreno.ts` é da ficha E1.
 * Roda só na suíte WASM.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
import { NIVEL_TODOS } from '../packages/geom/src/kernel/v2/esquema.gerado.ts';
import { GerenciadorKernelV2 } from '../packages/geom/src/kernel/v2/gerenciador.ts';

const caminho = caminhoDoWasm();
const bytes = existsSync(caminho) ? readFileSync(caminho) : null;
let ger: GerenciadorKernelV2 | null = null;

beforeAll(async () => {
  if (!bytes) return;
  try {
    ger = await GerenciadorKernelV2.dosBytes(bytes);
  } catch {
    ger = null;
  }
});

const ID_AUSENTE = 0xffffffff;

interface TerrenoDeTeste {
  id: number;
  pontos: number[][];
  /** Linha de quebra opcional (x, y, z por vértice). */
  quebra?: number[][];
  /** Borda opcional (x, y por vértice). */
  borda?: number[][];
}

const T3: TerrenoDeTeste = {
  id: 1,
  pontos: [
    [0, 0, 0],
    [20, 0, 0],
    [20, 20, 0],
    [0, 20, 0],
    [10, 10, 5],
  ],
};

/** Envia as seções 160 a 162 (ids na ordem canônica: pontos soltos, quebra, borda) e a 165. */
function enviar(cena: CenaV2, terrenos: TerrenoDeTeste[], sondas: number[][]): void {
  const v = { id: [] as number[], terreno: [] as number[], linha: [] as number[], ordem: [] as number[], x: [] as number[], y: [] as number[], z: [] as number[] };
  const l = { id: [] as number[], terreno: [] as number[], tipo: [] as number[], fechada: [] as number[] };
  const vertice = (terreno: number, linha: number, ordem: number, p: number[]): void => {
    v.id.push(v.id.length);
    v.terreno.push(terreno);
    v.linha.push(linha);
    v.ordem.push(ordem);
    v.x.push(p[0]!);
    v.y.push(p[1]!);
    v.z.push(p[2] ?? 0);
  };
  const linha = (terreno: number, tipo: number, pontos: number[][]): void => {
    const id = l.id.length;
    l.id.push(id);
    l.terreno.push(terreno);
    l.tipo.push(tipo);
    l.fechada.push(tipo === 2 ? 1 : 0);
    pontos.forEach((p, k) => vertice(terreno, id, k, p));
  };
  for (const t of terrenos) {
    t.pontos.forEach((p, k) => vertice(t.id, ID_AUSENTE, k, p));
    if (t.quebra) linha(t.id, 1, t.quebra);
    if (t.borda) linha(t.id, 2, t.borda);
  }
  const n = terrenos.length;
  cena.definirSecao(
    'terrenos',
    { id_num: terrenos.map((t) => t.id), nivel_num: new Array<number>(n).fill(0), espessura_base: new Array<number>(n).fill(3), intervalo: new Array<number>(n).fill(1), mestra_cada: new Array<number>(n).fill(5) },
    n,
  );
  cena.definirSecao('terreno_linhas', { id_num: l.id, terreno_num: l.terreno, tipo: l.tipo, fechada: l.fechada }, l.id.length);
  cena.definirSecao('terreno_vertices', { id_num: v.id, terreno_num: v.terreno, linha_num: v.linha, ordem: v.ordem, x: v.x, y: v.y, z: v.z }, v.id.length);
  cena.definirSecao('terreno_sondas', { id_num: sondas.map((_, k) => k), x: sondas.map((p) => p[0]!), y: sondas.map((p) => p[1]!) }, sondas.length);
}

const cenaCom = (terrenos: TerrenoDeTeste[], sondas: number[][] = []): CenaV2 => CenaV2.criar(ger!, (c) => enviar(c, terrenos, sondas));

/** Grupos da consulta 160 como linhas de 5 números. */
function grupos(g: ArrayLike<number>): number[][] {
  const out: number[][] = [];
  for (let k = 0; k < g.length; k += 5) out.push(Array.from({ length: 5 }, (_, j) => g[k + j]!));
  return out;
}

describe('terreno, ficha R1: terreno_malha e terreno_cotas pela ABI real', () => {
  it.skipIf(!bytes)('T3: 4 triângulos de superfície, 4 quadriláteros de saia e a base em z_base = −3', () => {
    const cena = cenaCom([T3]);
    const r = cena.consultar('terreno_malha', [0, 0]);
    const vert = r['vertices']!;
    const ind = r['indices']!;
    // Vértices: os 5 da superfície e as suas 5 cópias na base. Índices: 4 triângulos, 8 triângulos de saia, 4 de base.
    expect(vert.length).toBe(10 * 3);
    expect(grupos(r['grupos']!)).toEqual([
      [1, ID_AUSENTE, 0, 0, 12],
      [1, ID_AUSENTE, 1, 12, 24],
      [1, ID_AUSENTE, 2, 36, 12],
    ]);
    expect(ind.length).toBe(48);
    expect(Math.max(...Array.from(ind))).toBe(9);
    // Superfície: normal para cima e área de 400·√1,25 = 447,21360.
    let area = 0;
    for (let k = 0; k < 12; k += 3) {
      const [a, b, c] = [ind[k]!, ind[k + 1]!, ind[k + 2]!].map((i) => [vert[3 * i]!, vert[3 * i + 1]!, vert[3 * i + 2]!]);
      const u = [b![0]! - a![0]!, b![1]! - a![1]!, b![2]! - a![2]!];
      const w = [c![0]! - a![0]!, c![1]! - a![1]!, c![2]! - a![2]!];
      const nz = u[0]! * w[1]! - u[1]! * w[0]!;
      expect(nz).toBeGreaterThan(0);
      area += Math.hypot(u[1]! * w[2]! - u[2]! * w[1]!, u[2]! * w[0]! - u[0]! * w[2]!, nz) / 2;
    }
    expect(Math.abs(area - 447.2136)).toBeLessThan(1e-5);
    // Base: z_base = min(z) − espessura_base = 0 − 3.
    for (let i = 5; i < 10; i++) expect(vert[3 * i + 2]).toBe(-3);
    // Superfície proposta: igual à existente enquanto não há regiões (ficha R3).
    const p = cena.consultar('terreno_malha', [NIVEL_TODOS, 1]);
    expect(Array.from(p['vertices']!)).toEqual(Array.from(vert));
    expect(Array.from(p['indices']!)).toEqual(Array.from(ind));
    // Outro nível: nada.
    expect(cena.consultar('terreno_malha', [7, 0])['grupos']!.length).toBe(0);
    cena.destruir();
  });

  it.skipIf(!bytes)('T3: cotas nas sondas, declividade e ponto fora', () => {
    const cena = cenaCom(
      [T3],
      [
        [10, 10],
        [5, 10],
        [0, 0],
        [25, 10],
      ],
    );
    const r = cena.consultar('terreno_cotas', [0]);
    expect(Array.from(r['linhas']!)).toEqual([0, 1, 1, 1, 2, 1, 3, ID_AUSENTE]);
    const v = r['valores']!;
    expect(v.length).toBe(8);
    expect(Math.abs(v[0]! - 5)).toBeLessThan(1e-9);
    expect(Math.abs(v[2]! - 2.5)).toBeLessThan(1e-9);
    expect(Math.abs(v[3]! - 0.5)).toBeLessThan(1e-9);
    expect(Math.abs(v[4]!)).toBeLessThan(1e-9);
    expect([v[6], v[7]]).toEqual([0, 0]);
    expect(Array.from(cena.consultar('terreno_cotas', [1])['valores']!)).toEqual(Array.from(v));
    cena.destruir();
  });

  it.skipIf(!bytes)('quebras que se cruzam, borda e terreno sem triângulos não derrubam o WASM', () => {
    const cantos = (z: number): number[][] => [
      [0, 0, z],
      [20, 0, z],
      [20, 20, z],
      [0, 20, z],
    ];
    const cruzadas: TerrenoDeTeste = { id: 1, pontos: [...cantos(10), [5, 5, 10], [15, 15, 10], [5, 15, 10], [15, 5, 10]], quebra: [[5, 5, 10], [15, 15, 10], [5, 15, 10], [15, 5, 10], [5, 5, 10], [10, 0, 10]] };
    const comBorda: TerrenoDeTeste = { id: 2, pontos: T3.pontos.map((p) => [p[0]! + 100, p[1]!, p[2]!]), borda: [[105, 5], [115, 5], [115, 15], [105, 15]] };
    const doisPontos: TerrenoDeTeste = { id: 3, pontos: [[0, 50, 1], [5, 50, 2]] };
    const cena = cenaCom([cruzadas, comBorda, doisPontos], [[5, 5], [110, 10], [101, 1], [2, 50]]);
    const g = grupos(cena.consultar('terreno_malha', [0, 0])['grupos']!);
    expect(g.map((x) => [x[0], x[2]])).toEqual([
      [1, 0],
      [1, 1],
      [1, 2],
      [2, 0],
      [2, 1],
      [2, 2],
    ]);
    // A borda de 10 × 10 adensada de 1 em 1 m: 40 arestas de borda, 80 triângulos de saia.
    expect(g[4]![4]).toBe(80 * 3);
    const c = cena.consultar('terreno_cotas', [0]);
    expect(Array.from(c['linhas']!)).toEqual([0, 1, 1, 2, 2, ID_AUSENTE, 3, ID_AUSENTE]);
    expect(Math.abs(c['valores']![0]! - 10)).toBeLessThan(1e-9);
    expect(Math.abs(c['valores']![2]! - 5)).toBeLessThan(1e-9);
    cena.destruir();
  });

  it.skipIf(!bytes)('argumento inválido e NaN na seção viram erro leve (ENTRADA), e a cena continua de pé', () => {
    const cena = cenaCom([T3]);
    expect(() => cena.consultar('terreno_malha', [0, 2])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('terreno_cotas', [Number.NaN])).toThrow(ErroKernelLeve);
    expect(() => cena.definirSecao('terreno_sondas', { id_num: [0], x: [Number.NaN], y: [0] }, 1)).toThrow(ErroKernelLeve);
    expect(cena.consultar('terreno_malha', [0, 0])['indices']!.length).toBe(48);
    cena.destruir();
  });
});
