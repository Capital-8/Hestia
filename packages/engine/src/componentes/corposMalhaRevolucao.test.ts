import type { Perfil } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverPerfil } from './corposPerfil.ts';
import type { PerfilResolvido } from './corposTipos.ts';
import { malhaRevolucao, posicionarPerfilRevolucao } from './corposMalhaRevolucao.ts';
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
    const pos = (k: number) => {
      const i = m.indices[t + k]!;
      return [m.positions[i * 3]!, m.positions[i * 3 + 1]!, m.positions[i * 3 + 2]!];
    };
    const a = pos(0);
    const b = pos(1);
    const c = pos(2);
    const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
    const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
    const x = u[1]! * v[2]! - u[2]! * v[1]!;
    const y = u[2]! * v[0]! - u[0]! * v[2]!;
    const z = u[0]! * v[1]! - u[1]! * v[0]!;
    menor = Math.min(menor, Math.hypot(x, y, z) / 2);
  }
  return menor;
}

/** Retângulo u ∈ [0, 0,05], v ∈ [0, 0,1] em metros (perfil com u = 0 sobre o eixo). */
const RETANGULO_EIXO: PerfilResolvido = { externo: [0, 0, 0.05, 0, 0.05, 0.1, 0, 0.1], furos: [] };

describe('malhaRevolucao', () => {
  it('N3: retângulo u ∈ [0; 0,05], v ∈ [0; 0,1], 360° e 64 segmentos tem o volume do prisma de 64 lados (exato a 1e-9)', () => {
    const m = malhaRevolucao(RETANGULO_EIXO, 2 * Math.PI, 64);
    expect(volumeDaMalha(m)).toBeCloseTo((32 * 0.05 * 0.05 * Math.sin((2 * Math.PI) / 64)) * 0.1, 9);
    expect(volumeDaMalha(m) / (Math.PI * 0.05 * 0.05 * 0.1)).toBeGreaterThan(0.995);
  });

  it('toro: círculo Ø50 com afastamento 100 mm e 360° tem volume ≈ 1,5421e-3 m³ (±0,5 %)', () => {
    const base = resolvido({ tipo: 'circulo', diametro: '50', segmentos: '64' });
    const pos = posicionarPerfilRevolucao(base, 0.1, true);
    if (!pos.ok) throw new Error(pos.erro);
    const m = malhaRevolucao(pos.perfil, 2 * Math.PI, 64);
    const esperado = 2 * Math.PI * 0.125 * Math.PI * 0.025 * 0.025;
    expect(Math.abs(volumeDaMalha(m) / esperado - 1)).toBeLessThan(0.005);
    expect(volumeDaMalha(m)).toBeGreaterThan(0);
  });

  it('360° é sólido fechado sem tampas; abaixo de 360° também fecha (com as tampas)', () => {
    expect(malhaFechada(malhaRevolucao(RETANGULO_EIXO, 2 * Math.PI, 16))).toBe(true);
    expect(malhaFechada(malhaRevolucao(RETANGULO_EIXO, Math.PI, 8))).toBe(true);
  });

  it('meia volta tem metade do volume da volta completa com a mesma discretização', () => {
    const cheia = volumeDaMalha(malhaRevolucao(RETANGULO_EIXO, 2 * Math.PI, 64));
    const meia = volumeDaMalha(malhaRevolucao(RETANGULO_EIXO, Math.PI, 32));
    expect(meia).toBeCloseTo(cheia / 2, 9);
  });

  it('normais unitárias e nenhum triângulo de área ~0 (u = 0 é omitido, não gera degenerado)', () => {
    const m = malhaRevolucao(RETANGULO_EIXO, 2 * Math.PI, 16);
    expect(normaisUnitarias(m)).toBe(true);
    expect(menorArea(m)).toBeGreaterThan(1e-12);
  });

  it('ângulo ou segmentos inválidos devolvem malha vazia, sem lançar', () => {
    expect(malhaRevolucao(RETANGULO_EIXO, 0, 16).indices).toEqual([]);
    expect(malhaRevolucao(RETANGULO_EIXO, 3 * Math.PI, 16).indices).toEqual([]);
    expect(malhaRevolucao(RETANGULO_EIXO, 2 * Math.PI, 2).indices).toEqual([]);
  });
});

describe('posicionarPerfilRevolucao', () => {
  it('perfil centrado encosta no eixo: menor u vira o afastamento', () => {
    const base = resolvido({ tipo: 'circulo', diametro: '50', segmentos: '64' });
    const r = posicionarPerfilRevolucao(base, 0, true);
    if (!r.ok) throw new Error(r.erro);
    const us = r.perfil.externo.filter((_, i) => i % 2 === 0);
    expect(Math.min(...us)).toBeCloseTo(0, 12);
  });

  it('poligono usa u literal e soma o afastamento', () => {
    const r = posicionarPerfilRevolucao(RETANGULO_EIXO, 0.1, false);
    if (!r.ok) throw new Error(r.erro);
    expect(r.perfil.externo[0]).toBeCloseTo(0.1, 12);
  });

  it('perfil que cruza o eixo é recusado com a mensagem fixa', () => {
    const cruzando: PerfilResolvido = { externo: [-0.01, 0, 0.05, 0, 0.05, 0.1], furos: [] };
    const r = posicionarPerfilRevolucao(cruzando, 0, false);
    expect(r).toEqual({ ok: false, erro: 'perfil de revolução cruza o eixo' });
  });
});
