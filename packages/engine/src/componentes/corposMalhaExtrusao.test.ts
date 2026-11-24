import type { Perfil } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverPerfil } from './corposPerfil.ts';
import type { PerfilResolvido } from './corposTipos.ts';
import { malhaExtrusao } from './corposMalhaExtrusao.ts';
import { volumeDaMalha, type Malha } from './malha.ts';

/** Fórmula em mm que é só um número (as fórmulas reais passam pelo resolvedor da família). */
const mm = (expr: string): number => Number(expr);

function resolvido(perfil: Perfil): PerfilResolvido {
  const r = resolverPerfil(perfil, mm);
  if (!r.ok) throw new Error(r.erro);
  return r.perfil;
}

/** Chave de posição soldada (1e-9 m), para checar a malha fechada sem depender dos índices. */
function chave(m: Malha, i: number): string {
  const q = (x: number) => Math.round(x * 1e9);
  return `${q(m.positions[i * 3]!)},${q(m.positions[i * 3 + 1]!)},${q(m.positions[i * 3 + 2]!)}`;
}

/** Cada aresta (sem contar as degeneradas) aparece exatamente 2 vezes, em sentidos opostos. */
function malhaFechada(m: Malha): boolean {
  const contagem = new Map<string, number>();
  for (let t = 0; t < m.indices.length; t += 3) {
    const ids = [m.indices[t]!, m.indices[t + 1]!, m.indices[t + 2]!].map((i) => chave(m, i));
    for (let k = 0; k < 3; k++) {
      const a = ids[k]!;
      const b = ids[(k + 1) % 3]!;
      if (a === b) continue;
      const cad = `${a}>${b}`;
      contagem.set(cad, (contagem.get(cad) ?? 0) + 1);
    }
  }
  for (const [cad, n] of contagem) {
    const [a, b] = cad.split('>') as [string, string];
    if (n !== 1 || contagem.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

function normaisUnitarias(m: Malha): boolean {
  for (let i = 0; i < m.normals.length; i += 3) {
    const tam = Math.hypot(m.normals[i]!, m.normals[i + 1]!, m.normals[i + 2]!);
    if (Math.abs(tam - 1) > 1e-9) return false;
  }
  return true;
}

/** Menor área de triângulo da malha (m²). */
function menorArea(m: Malha): number {
  let menor = Infinity;
  for (let t = 0; t < m.indices.length; t += 3) {
    const p = (k: number) => [m.positions[m.indices[t + k]! * 3]!, m.positions[m.indices[t + k]! * 3 + 1]!, m.positions[m.indices[t + k]! * 3 + 2]!];
    const a = p(0);
    const b = p(1);
    const c = p(2);
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const x = u[1]! * v[2]! - u[2]! * v[1]!;
    const y = u[2]! * v[0]! - u[0]! * v[2]!;
    const z = u[0]! * v[1]! - u[1]! * v[0]!;
    menor = Math.min(menor, Math.hypot(x, y, z) / 2);
  }
  return menor;
}

describe('malhaExtrusao', () => {
  it('N1: círculo Ø100 com 64 lados e L = 1000 mm tem o volume do polígono (exato a 1e-9)', () => {
    const m = malhaExtrusao(resolvido({ tipo: 'circulo', diametro: '100', segmentos: '64' }), 1);
    const r = 0.05;
    expect(volumeDaMalha(m)).toBeCloseTo(32 * r * r * Math.sin((2 * Math.PI) / 64) * 1, 9);
    expect(volumeDaMalha(m)).toBeGreaterThan(0.99 * Math.PI * r * r * 1);
  });

  it('N5: perfil I (h 200, b 100, tw 6, tf 10) com L = 1000 mm tem área 3080 mm² e volume 3,08e-3 m³', () => {
    const m = malhaExtrusao(resolvido({ tipo: 'perfilI', altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' }), 1);
    expect(volumeDaMalha(m)).toBeCloseTo(3.08e-3, 9);
  });

  it('anel: volume = área × L (área do anel de polígonos de 64 lados)', () => {
    const perfil = resolvido({ tipo: 'anel', diametroExterno: '100', diametroInterno: '60', segmentos: '64' });
    const m = malhaExtrusao(perfil, 2);
    const area = (32 * Math.sin((2 * Math.PI) / 64)) * (0.05 * 0.05 - 0.03 * 0.03);
    expect(volumeDaMalha(m)).toBeCloseTo(area * 2, 9);
  });

  it('a malha é fechada: cada aresta aparece duas vezes, em sentidos opostos', () => {
    expect(malhaFechada(malhaExtrusao(resolvido({ tipo: 'perfilI', altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' }), 1))).toBe(true);
    expect(malhaFechada(malhaExtrusao(resolvido({ tipo: 'anel', diametroExterno: '100', diametroInterno: '60', segmentos: '16' }), 1))).toBe(true);
  });

  it('todas as normais são unitárias e nenhum triângulo tem área ~0', () => {
    const m = malhaExtrusao(resolvido({ tipo: 'anel', diametroExterno: '100', diametroInterno: '60', segmentos: '16' }), 1);
    expect(normaisUnitarias(m)).toBe(true);
    expect(menorArea(m)).toBeGreaterThan(1e-12);
  });

  it('as normais das tampas apontam para −Z e +Z; o volume positivo confirma a orientação para fora', () => {
    const m = malhaExtrusao(resolvido({ tipo: 'retangulo', largura: '100', altura: '50' }), 1);
    expect(volumeDaMalha(m)).toBeCloseTo(0.1 * 0.05 * 1, 9);
    const normaisZ = new Set<number>();
    for (let i = 0; i < m.normals.length; i += 3) if (Math.abs(m.normals[i + 2]!) > 0.999) normaisZ.add(Math.sign(m.normals[i + 2]!));
    expect([...normaisZ].sort()).toEqual([-1, 1]);
  });

  it('comprimento inválido devolve malha vazia, sem lançar', () => {
    const perfil = resolvido({ tipo: 'circulo', diametro: '100' });
    expect(malhaExtrusao(perfil, 0).indices).toEqual([]);
    expect(malhaExtrusao(perfil, Number.NaN).indices).toEqual([]);
  });
});
