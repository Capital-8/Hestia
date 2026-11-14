/**
 * Terreno, ficha R2 (PLANO do terreno A.4 regras 10 a 12 e 14, A.5 e A.10): as consultas 161 (`terreno_curvas`), 162 (`terreno_planta`),
 * 164 (`terreno_corte`), 165 (`quant_terreno`) e 168 (`terreno_avisos`) pela ABI real do WASM, sobre as fixtures T2 (rampa), T3 (pirâmide), T8 (borda) e
 * T9 (quebras cruzadas). As seções são montadas aqui à mão: o adaptador `kernelTerreno.ts` é da ficha E1. Nenhuma geometria é calculada em TS: o teste
 * só mede o que o kernel devolve.
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
  intervalo: number;
  mestraCada?: number;
  /** Linhas de quebra opcionais (x, y, z por vértice). */
  quebras?: number[][][];
  /** Borda opcional (x, y por vértice). */
  borda?: number[][];
}

const cantos = (z: (x: number) => number): number[][] => [
  [0, 0, z(0)],
  [20, 0, z(20)],
  [20, 20, z(20)],
  [0, 20, z(0)],
];

const T2: TerrenoDeTeste = { id: 2, intervalo: 0.5, mestraCada: 2, pontos: cantos((x) => 10.25 + 0.1 * x) };
const T3: TerrenoDeTeste = { id: 3, intervalo: 1, pontos: [...cantos(() => 0), [10, 10, 5]] };
const T8: TerrenoDeTeste = { ...T3, id: 8, borda: [[5, 5], [15, 5], [15, 15], [5, 15]] };
const T9: TerrenoDeTeste = { id: 9, intervalo: 0.5, pontos: cantos(() => 10), quebras: [[[5, 5, 10], [15, 15, 10]], [[5, 15, 10], [15, 5, 10]]] };

/** Envia as seções 160 a 162 (ids na ordem canônica: pontos soltos, quebras, borda). */
function enviar(cena: CenaV2, terrenos: TerrenoDeTeste[]): void {
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
    for (const q of t.quebras ?? []) linha(t.id, 1, q);
    if (t.borda) linha(t.id, 2, t.borda);
  }
  const n = terrenos.length;
  cena.definirSecao(
    'terrenos',
    {
      id_num: terrenos.map((t) => t.id),
      nivel_num: new Array<number>(n).fill(0),
      espessura_base: new Array<number>(n).fill(3),
      intervalo: terrenos.map((t) => t.intervalo),
      mestra_cada: terrenos.map((t) => t.mestraCada ?? 5),
    },
    n,
  );
  cena.definirSecao('terreno_linhas', { id_num: l.id, terreno_num: l.terreno, tipo: l.tipo, fechada: l.fechada }, l.id.length);
  cena.definirSecao('terreno_vertices', { id_num: v.id, terreno_num: v.terreno, linha_num: v.linha, ordem: v.ordem, x: v.x, y: v.y, z: v.z }, v.id.length);
}

const cenaCom = (terrenos: TerrenoDeTeste[]): CenaV2 => CenaV2.criar(ger!, (c) => enviar(c, terrenos));

interface Linha {
  terreno: number;
  marca: number;
  fechada: boolean;
  pontos: number[][];
}

/** Linhas `[terreno, marca, fechada, n_pontos]` com os seus pontos. */
function linhas(r: Record<string, ArrayLike<number> | undefined>): Linha[] {
  const l = r['linhas']!;
  const p = r['pontos']!;
  const out: Linha[] = [];
  let i = 0;
  for (let k = 0; k < l.length; k += 4) {
    const n = l[k + 3]!;
    out.push({ terreno: l[k]!, marca: l[k + 1]!, fechada: l[k + 2] === 1, pontos: Array.from({ length: n }, (_, j) => [p[2 * (i + j)]!, p[2 * (i + j) + 1]!]) });
    i += n;
  }
  expect(p.length).toBe(2 * i);
  return out;
}

/** Comprimento da linha lida (com o trecho de fecho, se fechada). */
function comprimento(l: Linha): number {
  let s = 0;
  const n = l.pontos.length;
  for (let k = 0; k < (l.fechada ? n : n - 1); k++) {
    const [a, b] = [l.pontos[k]!, l.pontos[(k + 1) % n]!];
    s += Math.hypot(b[0]! - a[0]!, b[1]! - a[1]!);
  }
  return s;
}

/** Área assinada do polígono lido. */
function area(l: Linha): number {
  let s = 0;
  const n = l.pontos.length;
  for (let k = 0; k < n; k++) {
    const [a, b] = [l.pontos[k]!, l.pontos[(k + 1) % n]!];
    s += (a[0]! * b[1]! - a[1]! * b[0]!) / 2;
  }
  return s;
}

describe('terreno, ficha R2: curvas, planta, corte, quantidades e avisos pela ABI real', () => {
  it.skipIf(!bytes)('terreno_curvas: T2 com 4 retas de 20 m e T3 com 4 quadrados fechados', () => {
    const cena = cenaCom([T2, T3]);
    const r = cena.consultar('terreno_curvas', [0, 0]);
    const l = linhas(r);
    expect(Array.from(r['cotas']!)).toEqual([10.5, 11, 11.5, 12, 1, 2, 3, 4]);
    expect(l.map((x) => [x.terreno, x.marca, x.fechada])).toEqual([
      [2, 0, false],
      [2, 1, false],
      [2, 0, false],
      [2, 1, false],
      [3, 0, true],
      [3, 0, true],
      [3, 0, true],
      [3, 0, true],
    ]);
    [2.5, 7.5, 12.5, 17.5].forEach((x, k) => {
      for (const p of l[k]!.pontos) expect(Math.abs(p[0]! - x)).toBeLessThan(1e-9);
      expect(Math.abs(comprimento(l[k]!) - 20)).toBeLessThan(1e-9);
    });
    [64, 48, 32, 16].forEach((perimetro, k) => {
      expect(l[4 + k]!.pontos.length).toBe(4);
      expect(Math.abs(comprimento(l[4 + k]!) - perimetro)).toBeLessThan(1e-9);
    });
    // A proposta é igual à existente enquanto não há regiões (ficha R3).
    const p = cena.consultar('terreno_curvas', [NIVEL_TODOS, 1]);
    expect(Array.from(p['pontos']!)).toEqual(Array.from(r['pontos']!));
    expect(cena.consultar('terreno_curvas', [7, 0])['linhas']!.length).toBe(0);
    cena.destruir();
  });

  it.skipIf(!bytes)('terreno_planta: a borda de T8 é um laço fechado de área 100', () => {
    const cena = cenaCom([T8]);
    const l = linhas(cena.consultar('terreno_planta', [0, 0]));
    expect(l.length).toBe(1);
    expect([l[0]!.terreno, l[0]!.marca, l[0]!.fechada, l[0]!.pontos.length]).toEqual([8, 0, true, 40]);
    expect(Math.abs(area(l[0]!) - 100)).toBeLessThan(1e-9);
    cena.destruir();
  });

  it.skipIf(!bytes)('terreno_corte: perfil reto de T2, fechado na base, e a silhueta de T3 com pico em z = 5', () => {
    const cena = cenaCom([T2]);
    const l = linhas(cena.consultar('terreno_corte', [0, 0, 10, 1, 0, 0]));
    expect(l.map((x) => [x.terreno, x.marca, x.fechada])).toEqual([[2, 0, true]]);
    const p = l[0]!.pontos;
    expect(p[0]).toEqual([0, 10.25]);
    expect(p[p.length - 3]).toEqual([20, 12.25]);
    expect(p.slice(-2)).toEqual([
      [20, 7.25],
      [0, 7.25],
    ]);
    for (const q of p.slice(0, -2)) expect(Math.abs(q[1]! - (10.25 + 0.1 * q[0]!))).toBeLessThan(1e-12);
    expect(Math.abs(area(l[0]!))).toBeGreaterThan(0);
    // Plano fora do terreno: sem profundidade para alcançá-lo, nada.
    expect(cena.consultar('terreno_corte', [0, 0, -5, 1, 0, 2])['linhas']!.length).toBe(0);
    cena.destruir();
    const piramide = cenaCom([T3]);
    const s = linhas(piramide.consultar('terreno_corte', [0, 0, -5, 1, 0, 100]));
    expect(s.map((x) => [x.terreno, x.marca, x.fechada, x.pontos.length])).toEqual([[3, 2, false, 2048]]);
    expect(Math.max(...s[0]!.pontos.map((q) => q[1]!))).toBe(5);
    piramide.destruir();
  });

  it.skipIf(!bytes)('quant_terreno: áreas, cotas extremas e triângulos de T2, T3 e T8', () => {
    const cena = cenaCom([T2, T3, T8]);
    const r = cena.consultar('quant_terreno', [0]);
    expect(Array.from(r['linhas']!)).toEqual([2, 3, 8]);
    const v = r['valores']!;
    expect(v.length).toBe(24);
    const linha = (k: number): number[] => Array.from({ length: 8 }, (_, j) => v[8 * k + j]!);
    const [t2, t3, t8] = [linha(0), linha(1), linha(2)];
    expect(Math.abs(t2[0]! - 400)).toBeLessThan(1e-9);
    expect(Math.abs(t2[1]! - 400 * Math.sqrt(1.01))).toBeLessThan(1e-6);
    expect(t2.slice(2)).toEqual([t2[1], 10.25, 12.25, 0, 0, 2]);
    expect(Math.abs(t3[1]! - 447.2136)).toBeLessThan(1e-5);
    expect(t3.slice(3)).toEqual([0, 5, 0, 0, 4]);
    expect(Math.abs(t8[0]! - 100)).toBeLessThan(1e-9);
    expect(t8.slice(3)).toEqual([2.5, 5, 0, 0, 40]);
    cena.destruir();
  });

  it.skipIf(!bytes)('terreno_avisos: T9 avisa a linha cruzada uma vez; T3 não avisa nada', () => {
    const cena = cenaCom([T3, T9]);
    const r = cena.consultar('terreno_avisos', [0]);
    expect(Array.from(r['avisos']!)).toEqual([9, 2, ID_AUSENTE, 1]);
    expect(Array.from(r['valores']!).slice(2)).toEqual([10, 10, 10]);
    expect(cena.consultar('terreno_avisos', [5])['avisos']!.length).toBe(0);
    cena.destruir();
  });

  it.skipIf(!bytes)('limite de cotas e argumento inválido viram erro leve, e a cena continua de pé; 166 e 167 seguem sem implementação', () => {
    const ingreme: TerrenoDeTeste = { id: 1, intervalo: 0.5, pontos: cantos((x) => 60 * x) };
    const cena = cenaCom([ingreme]);
    expect(() => cena.consultar('terreno_curvas', [0, 0])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('terreno_curvas', [0, 2])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('terreno_planta', [0, 2])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('terreno_corte', [0, 0, 10, Number.NaN, 0, 1])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('quant_terreno_regioes', [0])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('terreno_corte_aterro', [0])).toThrow(ErroKernelLeve);
    expect(cena.consultar('terreno_planta', [0, 0])['linhas']!.length).toBe(4);
    expect(cena.consultar('quant_terreno', [0])['valores']![7]).toBe(2);
    cena.destruir();
  });
});
