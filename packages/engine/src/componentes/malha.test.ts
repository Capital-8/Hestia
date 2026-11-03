import { FAMILIA_ARMARIO } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { volumePeca } from './medidas.ts';
import { malhaDasPecas, volumeDaMalha, type Malha } from './malha.ts';
import type { PecaResolvida } from './pecas.ts';
import { resolverFamilia } from './resolver.ts';

const base = (extra: Partial<PecaResolvida>): PecaResolvida => ({
  id: 'p', nome: 'P', indice: 1, papel: 'painel', eixo: 'z', vazio: false, origem: [0, 0, 0], tamanho: [0.5, 0.4], espessura: 0.018,
  extensao: [0.5, 0.4, 0.018], contorno: null, material: null, fita: null, veio: null, grupo: null, deAninhado: null, ...extra,
});
const caixa = (eixo: 'x' | 'y' | 'z', o: [number, number, number] = [0.1, 0.2, 0.3]): PecaResolvida => {
  const a = 0.5; const b = 0.4; const e = 0.018;
  return base({ eixo, origem: o, tamanho: [a, b], espessura: e, extensao: eixo === 'x' ? [e, a, b] : eixo === 'y' ? [a, e, b] : [a, b, e] });
};
const ele = [0, 0, 0.6, 0, 0.6, 0.3, 0.3, 0.3, 0.3, 0.6, 0, 0.6]; // L, área 0.27, anti-horário

/** Arestas por posição (soldando vértices repetidos): cada aresta de uma malha fechada pertence a exatamente 2 triângulos. */
function fechada(m: Malha): boolean {
  const chave = (i: number): string => [0, 1, 2].map((k) => m.positions[i * 3 + k]!.toFixed(9)).join(',');
  const arestas = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const ks = [chave(m.indices[t]!), chave(m.indices[t + 1]!), chave(m.indices[t + 2]!)];
    for (let e = 0; e < 3; e++) {
      const a = ks[e]!; const b = ks[(e + 1) % 3]!;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      arestas.set(k, (arestas.get(k) ?? 0) + 1);
    }
  }
  return arestas.size > 0 && [...arestas.values()].every((n) => n === 2);
}
function caixaDaMalha(m: Malha): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]; const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k]!, m.positions[i + k]!); max[k] = Math.max(max[k]!, m.positions[i + k]!); }
  return { min, max };
}
/** Normal declarada confere com a do triângulo (produto vetorial) e é unitária. */
function normaisCoerentes(m: Malha): boolean {
  for (let t = 0; t < m.indices.length; t += 3) {
    const [i, j, k] = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!];
    const p = (n: number): number[] => [m.positions[n * 3]!, m.positions[n * 3 + 1]!, m.positions[n * 3 + 2]!];
    const [a, b, c] = [p(i), p(j), p(k)];
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!]; const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const n = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!];
    const len = Math.hypot(n[0]!, n[1]!, n[2]!);
    if (len < 1e-15) return false;
    const d = [m.normals[i * 3]!, m.normals[i * 3 + 1]!, m.normals[i * 3 + 2]!];
    if (Math.abs(Math.hypot(d[0]!, d[1]!, d[2]!) - 1) > 1e-6) return false;
    if ((n[0]! * d[0]! + n[1]! * d[1]! + n[2]! * d[2]!) / len < 1 - 1e-6) return false;
  }
  return true;
}

describe('malhaDasPecas: caixas', () => {
  for (const eixo of ['x', 'y', 'z'] as const) {
    it(`eixo ${eixo}: 12 triângulos, fechada, volume e caixa certos, normais para fora`, () => {
      const p = caixa(eixo);
      const { solidas, vazios } = malhaDasPecas([p]);
      expect(vazios.indices).toEqual([]);
      expect(solidas.indices).toHaveLength(36);
      expect(solidas.pecaDoTriangulo).toEqual(Array(12).fill(0));
      expect(solidas.positions).toHaveLength(solidas.normals.length);
      expect(fechada(solidas)).toBe(true);
      expect(normaisCoerentes(solidas)).toBe(true);
      expect(volumeDaMalha(solidas)).toBeCloseTo(0.5 * 0.4 * 0.018, 12);
      const cx = caixaDaMalha(solidas);
      p.origem.forEach((o, k) => { expect(cx.min[k]).toBeCloseTo(o, 12); expect(cx.max[k]).toBeCloseTo(o + p.extensao[k]!, 12); });
    });
  }
  it('as normais saem para fora: produto escalar com (ponto da face − centro) é positivo', () => {
    for (const eixo of ['x', 'y', 'z'] as const) {
      const p = caixa(eixo);
      const m = malhaDasPecas([p]).solidas;
      const c = p.origem.map((o, k) => o + p.extensao[k]! / 2);
      for (let t = 0; t < m.indices.length; t += 3) {
        const i = m.indices[t]!;
        const d = [0, 1, 2].map((k) => (m.positions[i * 3 + k]! - c[k]!) * m.normals[i * 3 + k]!).reduce((s, v) => s + v, 0);
        expect(d, `${eixo} tri ${t / 3}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('malhaDasPecas: contorno poligonal', () => {
  for (const eixo of ['x', 'y', 'z'] as const) {
    it(`L no eixo ${eixo}: fechada, volume = área × espessura, normais coerentes`, () => {
      const p = base({ eixo, contorno: ele, origem: [0.2, 0.1, 0.05], tamanho: [0.6, 0.6], espessura: 0.02, extensao: eixo === 'x' ? [0.02, 0.6, 0.6] : eixo === 'y' ? [0.6, 0.02, 0.6] : [0.6, 0.6, 0.02] });
      const m = malhaDasPecas([p]).solidas;
      expect(fechada(m)).toBe(true);
      expect(normaisCoerentes(m)).toBe(true);
      expect(volumeDaMalha(m)).toBeCloseTo(0.27 * 0.02, 12);
      expect(volumeDaMalha(m)).toBeCloseTo(volumePeca(p), 12);
      // L: 4 triângulos nas tampas (6 vértices) ×2 + 6 paredes × 2 = 8 + 12
      expect(m.pecaDoTriangulo).toHaveLength(20);
    });
  }
});

describe('malhaDasPecas: lista de peças', () => {
  it('vazias vão para a outra malha; índices apontam para a lista de entrada', () => {
    const a = caixa('x'); const v = { ...caixa('y', [1, 1, 1]), vazio: true }; const c = caixa('z', [2, 2, 2]);
    const { solidas, vazios } = malhaDasPecas([a, v, c]);
    expect(new Set(solidas.pecaDoTriangulo)).toEqual(new Set([0, 2]));
    expect(new Set(vazios.pecaDoTriangulo)).toEqual(new Set([1]));
    expect(solidas.pecaDoTriangulo).toHaveLength(24);
    expect(vazios.pecaDoTriangulo).toHaveLength(12);
    expect(fechada(vazios)).toBe(true);
  });
  it('lista vazia e determinismo', () => {
    const r = malhaDasPecas([]);
    expect(r.solidas).toEqual({ positions: [], normals: [], indices: [], pecaDoTriangulo: [] });
    expect(r.vazios).toEqual(r.solidas);
    const l = [caixa('x'), caixa('y'), caixa('z')];
    expect(malhaDasPecas(l)).toEqual(malhaDasPecas(l));
  });
  it('índices sempre apontam para vértices existentes', () => {
    const m = malhaDasPecas([caixa('x'), base({ contorno: ele, tamanho: [0.6, 0.6], extensao: [0.6, 0.6, 0.018] })]).solidas;
    const n = m.positions.length / 3;
    expect(m.indices.every((i) => Number.isInteger(i) && i >= 0 && i < n)).toBe(true);
    expect(m.indices.length / 3).toBe(m.pecaDoTriangulo.length);
  });
});

describe('malhaDasPecas: o armário baixo inteiro', () => {
  it('volume da malha = soma dos volumes das peças não vazias, para todos os tipos', () => {
    for (const t of FAMILIA_ARMARIO.tipos) {
      const r = resolverFamilia(FAMILIA_ARMARIO, { tipoId: t.id });
      const { solidas } = malhaDasPecas(r.pecas);
      expect(volumeDaMalha(solidas), t.id).toBeCloseTo(r.pecas.reduce((s, p) => s + volumePeca(p), 0), 9);
      expect(normaisCoerentes(solidas)).toBe(true);
    }
  });
});
