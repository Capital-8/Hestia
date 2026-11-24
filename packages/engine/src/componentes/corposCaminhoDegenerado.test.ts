import type { Perfil } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { filetarCaminho, resolverCaminho } from './corposCaminho.ts';
import { malhaVarredura } from './corposMalhaVarredura.ts';
import { resolverPerfil } from './corposPerfil.ts';
import type { CaminhoResolvido, PerfilResolvido } from './corposTipos.ts';
import { volumeDaMalha, type Malha } from './malha.ts';

/*
 * Caminhos degenerados (ficha A4b): arco que começa exatamente no vértice A e trecho reto de 1 µm depois de uma curva.
 * Entrada em mm pelo caminho da família (arredonda a 1 µm), como no defeito achado na ficha F1.
 */

const av = (e: string): number => Number(e);
const SQ = Math.SQRT1_2;
const RAIO_TUBO = 0.05;

function circulo100(): PerfilResolvido {
  const p: Perfil = { tipo: 'circulo', diametro: '100', segmentos: '64' };
  const r = resolverPerfil(p, av);
  if (!r.ok) throw new Error(r.erro);
  return r.perfil;
}

function caminhoDe(pontos: Array<[string, string, string]>, raios: string[]): CaminhoResolvido {
  const r = resolverCaminho({ pontos, raios, segmentosPorCurva: '12' }, av);
  if (!r.ok) throw new Error(r.erro);
  return r.caminho;
}

/** Menor distância entre pontos consecutivos do caminho (m). */
function menorTrecho(flat: number[]): number {
  let menor = Infinity;
  for (let i = 3; i + 2 < flat.length; i += 3) {
    menor = Math.min(menor, Math.hypot(flat[i]! - flat[i - 3]!, flat[i + 1]! - flat[i - 2]!, flat[i + 2]! - flat[i - 1]!));
  }
  return menor;
}

function caixa(m: Malha): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i++) {
    const k = i % 3;
    const v = m.positions[i]!;
    min[k] = Math.min(min[k]!, v);
    max[k] = Math.max(max[k]!, v);
  }
  return { min, max };
}

describe('caminho com arco que começa no vértice A', () => {
  const c = caminhoDe(
    [
      ['0', '0', '0'],
      ['0', '0', '500'],
      ['500', '0', '500'],
    ],
    ['500'],
  );

  it('não gera segmento de comprimento ~0', () => {
    expect(menorTrecho(c.pontos)).toBeGreaterThanOrEqual(1e-7);
  });

  it('a malha da varredura fica dentro da caixa [-0,05; 0,55] m', () => {
    const { min, max } = caixa(malhaVarredura(circulo100(), c));
    for (let k = 0; k < 3; k++) {
      expect(min[k]!).toBeGreaterThanOrEqual(-0.05 - 1e-6);
      expect(max[k]!).toBeLessThanOrEqual(0.55 + 1e-6);
    }
  });

  it('volume = área × comprimento do eixo (±1 %)', () => {
    const analitico = Math.PI * RAIO_TUBO * RAIO_TUBO * ((0.5 * Math.PI) / 2);
    const v = volumeDaMalha(malhaVarredura(circulo100(), c));
    expect(v / analitico).toBeGreaterThan(0.99);
    expect(v / analitico).toBeLessThan(1.01);
  });
});

describe('curva de 45° com trecho reto curto de 1 µm', () => {
  // t = R·tan(22,5°) = 500 mm: o arco começa exatamente em (0,0,0); o último trecho sai 1 µm além do fim do arco
  const R = 500 / Math.tan(Math.PI / 8);
  const L2 = 500.001;
  const c = caminhoDe(
    [
      ['0', '0', '0'],
      ['0', '0', '500'],
      [String(L2 * SQ), '0', String(500 + L2 * SQ)],
    ],
    [String(R)],
  );

  it('não gera segmento de comprimento ~0 nem segmento invertido', () => {
    expect(menorTrecho(c.pontos)).toBeGreaterThanOrEqual(1e-7);
  });

  it('volume = área × comprimento do eixo (±1 %)', () => {
    const eixo = ((R / 1000) * Math.PI) / 4 + 1e-6;
    const analitico = Math.PI * RAIO_TUBO * RAIO_TUBO * eixo;
    const v = volumeDaMalha(malhaVarredura(circulo100(), c));
    expect(v / analitico).toBeGreaterThan(0.99);
    expect(v / analitico).toBeLessThan(1.01);
  });
});

describe('vértice quase coincidente com o anterior', () => {
  it('é removido, o último ponto é mantido e vertices aponta para o que sobrou', () => {
    const r = filetarCaminho(
      [
        [0, 0, 0],
        [0, 0, 1e-8],
        [0, 0, 0.5],
      ],
      [0, 0],
      12,
    );
    if (!r.ok) throw new Error(r.erro);
    expect(r.caminho.pontos).toEqual([0, 0, 0, 0, 0, 0.5]);
    expect(r.caminho.vertices).toEqual([0, 1]);
  });
});
