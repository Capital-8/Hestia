/**
 * Terreno, ficha R3 (PLANO do terreno A.4 regras 6 a 8, 12 e 13, A.5 e A.10): a superfície proposta e as consultas 160 a 164 com `superficie` 1, as
 * quantidades por região (166), o mapa de corte e aterro (167) e os avisos 3 e 6 (168), pela ABI real do WASM, sobre as fixtures T1 (plano), T2 (rampa) com
 * as regiões de T5 (plataforma), T6 (talude) e T7 (aterro). As seções são montadas aqui à mão: o adaptador `kernelTerreno.ts` é da ficha E1. Nenhuma
 * geometria é calculada em TS: o teste só mede o que o kernel devolve.
 * Roda só na suíte WASM.
 */
import { existsSync, readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { caminhoDoWasm } from '../packages/geom/src/kernel/caminhoWasm.ts';
import { CenaV2 } from '../packages/geom/src/kernel/v2/cena.ts';
import { ErroKernelLeve } from '../packages/geom/src/kernel/v2/erros.ts';
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

interface RegiaoDeTeste {
  id: number;
  /** 0 subdivisão, 1 plataforma, 2 nivelada. */
  papel: number;
  /** Quadrado de canto (x, y) e lado. */
  quadrado: [number, number, number];
  cota: number;
  taludeCorte?: number;
  taludeAterro?: number;
}

interface TerrenoDeTeste {
  id: number;
  /** Cota dos quatro cantos do quadrado (0,0)-(20,20), em função de x. */
  z: (x: number) => number;
  lado?: number;
  regioes?: RegiaoDeTeste[];
}

const T5: TerrenoDeTeste = { id: 5, z: () => 10, regioes: [{ id: 1, papel: 1, quadrado: [5, 5, 10], cota: 8 }] };
const T6: TerrenoDeTeste = { id: 6, z: () => 10, regioes: [{ id: 1, papel: 2, quadrado: [5, 5, 10], cota: 8, taludeCorte: 1 }] };
const T7: TerrenoDeTeste = { id: 7, z: (x) => 10.25 + 0.1 * x, regioes: [{ id: 1, papel: 1, quadrado: [5, 5, 10], cota: 12.25 }] };

/** Envia as seções 160, 161, 162, 163 e 164 (pontos soltos nos cantos; sem curvas, quebras nem borda). */
function enviar(cena: CenaV2, terrenos: TerrenoDeTeste[]): void {
  const v = { id: [] as number[], terreno: [] as number[], x: [] as number[], y: [] as number[], z: [] as number[] };
  const g = { id: [] as number[], terreno: [] as number[], papel: [] as number[], cota: [] as number[], refX: [] as number[], refY: [] as number[], tc: [] as number[], ta: [] as number[] };
  const p = { id: [] as number[], regiao: [] as number[], ordem: [] as number[], x: [] as number[], y: [] as number[] };
  for (const t of terrenos) {
    const lado = t.lado ?? 20;
    for (const [x, y] of [[0, 0], [lado, 0], [lado, lado], [0, lado]] as const) {
      v.id.push(v.id.length);
      v.terreno.push(t.id);
      v.x.push(x);
      v.y.push(y);
      v.z.push(t.z(x));
    }
    for (const r of t.regioes ?? []) {
      const [x, y, l] = r.quadrado;
      g.id.push(r.id);
      g.terreno.push(t.id);
      g.papel.push(r.papel);
      g.cota.push(r.cota);
      g.refX.push(x + l / 2);
      g.refY.push(y + l / 2);
      g.tc.push(r.taludeCorte ?? 0);
      g.ta.push(r.taludeAterro ?? 0);
      [[x, y], [x + l, y], [x + l, y + l], [x, y + l]].forEach((q, k) => {
        p.id.push(p.id.length);
        p.regiao.push(r.id);
        p.ordem.push(k);
        p.x.push(q[0]!);
        p.y.push(q[1]!);
      });
    }
  }
  const n = terrenos.length;
  cena.definirSecao(
    'terrenos',
    { id_num: terrenos.map((t) => t.id), nivel_num: new Array<number>(n).fill(0), espessura_base: new Array<number>(n).fill(3), intervalo: new Array<number>(n).fill(0.5), mestra_cada: new Array<number>(n).fill(5) },
    n,
  );
  cena.definirSecao('terreno_linhas', { id_num: [], terreno_num: [], tipo: [], fechada: [] }, 0);
  cena.definirSecao(
    'terreno_vertices',
    { id_num: v.id, terreno_num: v.terreno, linha_num: new Array<number>(v.id.length).fill(ID_AUSENTE), ordem: v.id.map((_, k) => k % 4), x: v.x, y: v.y, z: v.z },
    v.id.length,
  );
  const nr = g.id.length;
  cena.definirSecao(
    'terreno_regioes',
    {
      id_num: g.id,
      terreno_num: g.terreno,
      ordem: g.id,
      papel: g.papel,
      cota: g.cota,
      inclinacao: new Array<number>(nr).fill(0),
      direcao: new Array<number>(nr).fill(0),
      ref_x: g.refX,
      ref_y: g.refY,
      talude_corte: g.tc,
      talude_aterro: g.ta,
    },
    nr,
  );
  cena.definirSecao('terreno_regiao_pontos', { id_num: p.id, regiao_num: p.regiao, ordem: p.ordem, x: p.x, y: p.y }, p.id.length);
}

const cenaCom = (terrenos: TerrenoDeTeste[]): CenaV2 => CenaV2.criar(ger!, (c) => enviar(c, terrenos));

/** Área assinada dos triângulos de índices `[primeiro, primeiro + n)` da consulta 160. */
function areaDosIndices(r: Record<string, ArrayLike<number> | undefined>, primeiro: number, n: number): number {
  const vert = r['vertices']!;
  const idx = r['indices']!;
  let s = 0;
  for (let k = primeiro; k < primeiro + n; k += 3) {
    const [a, b, c] = [idx[k]!, idx[k + 1]!, idx[k + 2]!];
    s += ((vert[3 * b]! - vert[3 * a]!) * (vert[3 * c + 1]! - vert[3 * a + 1]!) - (vert[3 * b + 1]! - vert[3 * a + 1]!) * (vert[3 * c]! - vert[3 * a]!)) / 2;
  }
  return s;
}

describe('terreno, ficha R3: superfície proposta, corte e aterro pela ABI real', () => {
  it.skipIf(!bytes)('T5, T6 e T7: volumes de corte e aterro de quant_terreno e quant_terreno_regioes nas faixas de A.10', () => {
    const cena = cenaCom([T5, T6, T7]);
    const q = cena.consultar('quant_terreno', [0]);
    expect(Array.from(q['linhas']!)).toEqual([5, 6, 7]);
    const v = q['valores']!;
    const [corte, aterro] = [(k: number) => v[8 * k + 5]!, (k: number) => v[8 * k + 6]!];
    expect(corte(0)).toBeGreaterThanOrEqual(200);
    expect(corte(0)).toBeLessThanOrEqual(200.6);
    expect(aterro(0)).toBeLessThan(1e-9);
    expect(Math.abs(corte(1) - 288.38)).toBeLessThanOrEqual(0.02 * 288.38);
    expect(aterro(1)).toBeLessThan(1e-9);
    expect(aterro(2)).toBeGreaterThanOrEqual(100);
    expect(aterro(2)).toBeLessThanOrEqual(100.4);
    expect(corte(2)).toBeLessThan(1e-6);
    const r = cena.consultar('quant_terreno_regioes', [0]);
    expect(Array.from(r['linhas']!)).toEqual([1, 5, 1, 6, 1, 7]);
    const rv = r['valores']!;
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(rv[4 * k]! - 100)).toBeLessThan(1e-9);
      expect(Math.abs(rv[4 * k + 2]! - corte(k))).toBeLessThan(1e-9);
      expect(Math.abs(rv[4 * k + 3]! - aterro(k))).toBeLessThan(1e-9);
    }
    cena.destruir();
  });

  it.skipIf(!bytes)('terreno_cotas com superficie 1: plataforma em (10, 10) = 8 e talude de T6 em (4, 10) = 9', () => {
    const cena = CenaV2.criar(ger!, (c) => {
      enviar(c, [T5, T6]);
      c.definirSecao('terreno_sondas', { id_num: [0, 1, 2], x: [10, 4, 2], y: [10, 10, 2] }, 3);
    });
    const p = cena.consultar('terreno_cotas', [1]);
    // O terreno de menor id_num que contém a sonda responde: o 5 (plataforma).
    expect(Array.from(p['linhas']!)).toEqual([0, 5, 1, 5, 2, 5]);
    expect(Math.abs(p['valores']![0]! - 8)).toBeLessThan(1e-9);
    expect(Math.abs(p['valores']![2]! - 10)).toBeLessThan(1e-9);
    expect(Math.abs(p['valores']![4]! - 10)).toBeLessThan(1e-9);
    cena.destruir();
    const t6 = CenaV2.criar(ger!, (c) => {
      enviar(c, [T6]);
      c.definirSecao('terreno_sondas', { id_num: [0], x: [4], y: [10] }, 1);
    });
    expect(Math.abs(t6.consultar('terreno_cotas', [1])['valores']![0]! - 9)).toBeLessThanOrEqual(0.02);
    expect(Math.abs(t6.consultar('terreno_cotas', [0])['valores']![0]! - 10)).toBeLessThan(1e-9);
    t6.destruir();
  });

  it.skipIf(!bytes)('terreno_malha com superficie 1: um grupo de superfície por região, e a soma das áreas é a do terreno', () => {
    const sub: TerrenoDeTeste = { id: 2, z: (x) => 10.25 + 0.1 * x, regioes: [{ id: 9, papel: 0, quadrado: [5, 5, 10], cota: 0 }] };
    const cena = cenaCom([sub]);
    const m = cena.consultar('terreno_malha', [0, 1]);
    const g = Array.from(m['grupos']!);
    const grupos = Array.from({ length: g.length / 5 }, (_, k) => g.slice(5 * k, 5 * k + 5));
    expect(grupos.map((x) => [x[0], x[1], x[2]])).toEqual([
      [2, ID_AUSENTE, 0],
      [2, 9, 0],
      [2, ID_AUSENTE, 1],
      [2, ID_AUSENTE, 2],
    ]);
    const superficie = grupos.filter((x) => x[2] === 0);
    expect(Math.abs(superficie.reduce((s, x) => s + areaDosIndices(m, x[3]!, x[4]!), 0) - 400)).toBeLessThan(1e-6);
    expect(Math.abs(areaDosIndices(m, superficie[1]![3]!, superficie[1]![4]!) - 100)).toBeLessThan(1e-6);
    const r = cena.consultar('quant_terreno_regioes', [0]);
    expect(Array.from(r['linhas']!)).toEqual([9, 2]);
    expect(Math.abs(r['valores']![0]! - 100)).toBeLessThan(1e-9);
    expect(Array.from(r['valores']!).slice(2)).toEqual([0, 0]);
    cena.destruir();
  });

  it.skipIf(!bytes)('terreno_corte: o perfil existente (papel 1) só aparece com plataforma ou nivelada', () => {
    const cena = cenaCom([T5]);
    const l = cena.consultar('terreno_corte', [0, -1, 10, 1, 0, 0]);
    const linhas = Array.from(l['linhas']!);
    expect(linhas.filter((_, k) => k % 4 === 1)).toEqual([0, 1]);
    cena.destruir();
    const rampa = cenaCom([{ id: 2, z: (x) => 10.25 + 0.1 * x }]);
    expect(Array.from(rampa.consultar('terreno_corte', [0, -1, 10, 1, 0, 0])['linhas']!).filter((_, k) => k % 4 === 1)).toEqual([0]);
    rampa.destruir();
  });

  it.skipIf(!bytes)('terreno_corte_aterro: T5 só tem corte e T7 só aterro, com área entre 100 e 101', () => {
    const cena = cenaCom([T5, T7]);
    const m = cena.consultar('terreno_corte_aterro', [0]);
    const g = Array.from(m['grupos']!);
    expect([[g[0], g[1]], [g[4], g[5]]]).toEqual([[5, 0], [7, 1]]);
    const p = m['pontos']!;
    const area = (primeiro: number, n: number): number => {
      let s = 0;
      for (let k = primeiro; k < primeiro + n; k += 3) {
        const [ax, ay, bx, by, cx, cy] = [p[2 * k]!, p[2 * k + 1]!, p[2 * k + 2]!, p[2 * k + 3]!, p[2 * k + 4]!, p[2 * k + 5]!];
        s += ((bx - ax) * (cy - ay) - (by - ay) * (cx - ax)) / 2;
      }
      return s;
    };
    for (const k of [0, 1]) {
      const a = area(g[4 * k + 2]!, g[4 * k + 3]!);
      expect(a).toBeGreaterThan(100);
      expect(a).toBeLessThan(101);
    }
    cena.destruir();
  });

  it.skipIf(!bytes)('terreno_avisos: regiões sobrepostas (3) e fora do terreno (6); T5 não avisa nada', () => {
    const cruzadas: TerrenoDeTeste = {
      id: 3,
      z: () => 10,
      regioes: [
        { id: 1, papel: 1, quadrado: [5, 5, 10], cota: 8 },
        { id: 2, papel: 1, quadrado: [10, 10, 9], cota: 9 },
        { id: 3, papel: 0, quadrado: [30, 30, 5], cota: 0 },
      ],
    };
    const cena = cenaCom([T5, cruzadas]);
    const r = cena.consultar('terreno_avisos', [0]);
    expect(Array.from(r['avisos']!)).toEqual([3, 3, 2, 1, 3, 6, 3, ID_AUSENTE]);
    cena.destruir();
  });

  it.skipIf(!bytes)('superficie inválida e região degenerada viram erro leve ou são ignoradas, e a cena continua de pé', () => {
    const cena = cenaCom([T5]);
    expect(() => cena.consultar('terreno_malha', [0, 2])).toThrow(ErroKernelLeve);
    expect(() => cena.consultar('quant_terreno_regioes', [Number.NaN])).toThrow(ErroKernelLeve);
    expect(cena.consultar('quant_terreno_regioes', [9])['linhas']!.length).toBe(0);
    expect(cena.consultar('terreno_corte_aterro', [9])['grupos']!.length).toBe(0);
    cena.destruir();
    // Região com dois pontos (sem área) é ignorada.
    const ruim = CenaV2.criar(ger!, (c) => {
      enviar(c, [{ id: 1, z: () => 10 }]);
      c.definirSecao('terreno_regioes', { id_num: [1], terreno_num: [1], ordem: [0], papel: [1], cota: [8], inclinacao: [0], direcao: [0], ref_x: [0], ref_y: [0], talude_corte: [0], talude_aterro: [0] }, 1);
      c.definirSecao('terreno_regiao_pontos', { id_num: [0, 1], regiao_num: [1, 1], ordem: [0, 1], x: [1, 2], y: [1, 2] }, 2);
    });
    expect(ruim.consultar('quant_terreno_regioes', [0])['linhas']!.length).toBe(0);
    expect(ruim.consultar('quant_terreno', [0])['valores']![5]).toBe(0);
    ruim.destruir();
  });
});
