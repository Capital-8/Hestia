import { describe, expect, it } from 'vitest';
import { ajustarLarguras, posicoesDaFila, preencherVao } from './encaixeFila.ts';
import { retanguloNoMundo } from './encaixeColisao.ts';
import type { CaixaLocal } from './encaixeTipos.ts';

const TOL = 9;

function somaMicras(larguras: readonly number[]): number {
  return larguras.reduce((t, v) => t + Math.round(v * 1e6), 0);
}

describe('preencherVao', () => {
  it('vão exato de 1,8 m com 0,6: três módulos, sem painel nem sobra', () => {
    expect(preencherVao(1.8, [0.6, 0.8])).toEqual({ modulos: [0.6, 0.6, 0.6], painel: 0, sobra: 0 });
  });
  it('vão de 1,5 m: 0,8 + 0,6 fecha com painel 0,1', () => {
    expect(preencherVao(1.5, [0.6, 0.8])).toEqual({ modulos: [0.8, 0.6], painel: 0.1, sobra: 0 });
  });
  it('painel sozinho (sem módulos) quando o vão cabe na banda', () => {
    expect(preencherVao(0.1, [0.6])).toEqual({ modulos: [], painel: 0.1, sobra: 0 });
  });
  it('vão abaixo do painel mínimo: sobra = vão', () => {
    expect(preencherVao(0.01, [0.6])).toEqual({ modulos: [], painel: 0, sobra: 0.01 });
  });
  it('casos de borda: vão ≤ 0 e sem larguras', () => {
    expect(preencherVao(0, [0.6])).toEqual({ modulos: [], painel: 0, sobra: 0 });
    expect(preencherVao(1, [])).toEqual({ modulos: [], painel: 0, sobra: 1 });
  });
  it('determinística: mesma entrada três vezes e ordem embaralhada dão a mesma saída', () => {
    const a = preencherVao(2.2, [0.6, 0.8]);
    expect(preencherVao(2.2, [0.6, 0.8])).toEqual(a);
    expect(preencherVao(2.2, [0.6, 0.8])).toEqual(a);
    expect(preencherVao(2.2, [0.8, 0.6, 0.8])).toEqual(a);
    expect(preencherVao(1.5, [0.8, 0.6])).toEqual(preencherVao(1.5, [0.6, 0.8]));
    expect(a.modulos).toEqual([0.8, 0.8, 0.6]);
  });
  it('sem solução exata: menor sobra, painel no máximo', () => {
    const r = preencherVao(0.5, [0.3]);
    expect(r.modulos).toEqual([0.3]);
    expect(r.painel).toBeCloseTo(0.15, TOL);
    expect(r.sobra).toBeCloseTo(0.05, TOL);
  });
});

describe('ajustarLarguras', () => {
  it('reparte o acréscimo igualmente e o resto de µm vai na ordem dos flexíveis', () => {
    const r = ajustarLarguras([0.6, 0.6, 0.6], [[0.4, 0.8], [0.4, 0.8], [0.4, 0.8]], 2.0);
    expect(somaMicras(r)).toBe(2_000_000);
    for (const w of r) {
      expect(w).toBeGreaterThanOrEqual(0.666666);
      expect(w).toBeLessThanOrEqual(0.666667);
    }
    expect(r[2]).toBeCloseTo(0.666666, TOL);
  });
  it('rígido no limite fica parado; os flexíveis dividem o resto', () => {
    expect(ajustarLarguras([0.6, 0.6, 0.6], [[0.6, 0.6], [0.4, 1.0], [0.4, 1.0]], 2.0)).toEqual([0.6, 0.7, 0.7]);
  });
  it('total fora do alcance: todos no máximo ou todos no mínimo', () => {
    expect(ajustarLarguras([0.6, 0.6], [[0.4, 0.7], [0.4, 0.7]], 2.0)).toEqual([0.7, 0.7]);
    expect(ajustarLarguras([0.6, 0.6], [[0.4, 0.7], [0.4, 0.7]], 0.5)).toEqual([0.4, 0.4]);
  });
  it('flexível que bate no limite repassa o excedente ao outro', () => {
    expect(ajustarLarguras([0.6, 0.6], [[0.5, 0.65], [0.4, 1.0]], 1.5)).toEqual([0.65, 0.85]);
  });
});

describe('posicoesDaFila', () => {
  it('linha horizontal: índice 0 junto de a, fundo na linha, frente à esquerda de d', () => {
    const ps = posicoesDaFila({ x: 0, y: 0 }, { x: 4, y: 0 }, [0.6, 0.8], 0.56);
    expect(ps).toHaveLength(2);
    const p0 = ps[0]!;
    expect(p0.indice).toBe(0);
    expect(p0.inicio).toBeCloseTo(0, TOL);
    expect(p0.largura).toBeCloseTo(0.6, TOL);
    expect(p0.pose.x).toBeCloseTo(0.6, TOL);
    expect(p0.pose.y).toBeCloseTo(0.56, TOL);
    expect(p0.pose.rotation).toBeCloseTo(Math.PI, TOL);
    expect(p0.pose.mirrored).toBe(false);
    expect(p0.pose.z).toBe(0);
    const p1 = ps[1]!;
    expect(p1.inicio).toBeCloseTo(0.6, TOL);
    expect(p1.largura).toBeCloseTo(0.8, TOL);
    expect(p1.pose.x).toBeCloseTo(1.4, TOL);
    expect(p1.pose.y).toBeCloseTo(0.56, TOL);
    const caixa: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 2] };
    const cantos = retanguloNoMundo(p0.pose, caixa);
    expect(Math.min(...cantos.map((c) => c.x))).toBeCloseTo(0, TOL);
    expect(Math.max(...cantos.map((c) => c.x))).toBeCloseTo(0.6, TOL);
    expect(Math.min(...cantos.map((c) => c.y))).toBeCloseTo(0, TOL);
    expect(Math.max(...cantos.map((c) => c.y))).toBeCloseTo(0.56, TOL);
  });
  it('linha vertical com livre à esquerda: fundo em x = 0, frente em x = −profundidade', () => {
    const ps = posicoesDaFila({ x: 0, y: 0 }, { x: 0, y: 4 }, [0.6], 0.56);
    const p0 = ps[0]!;
    expect(p0.pose.rotation).toBeCloseTo(-Math.PI / 2, TOL);
    expect(p0.pose.x).toBeCloseTo(-0.56, TOL);
    expect(p0.pose.y).toBeCloseTo(0.6, TOL);
    const caixa: CaixaLocal = { min: [0, 0, 0], max: [0.6, 0.56, 2] };
    const cantos = retanguloNoMundo(p0.pose, caixa);
    expect(Math.max(...cantos.map((c) => c.x))).toBeCloseTo(0, TOL);
    expect(Math.min(...cantos.map((c) => c.x))).toBeCloseTo(-0.56, TOL);
    expect(Math.min(...cantos.map((c) => c.y))).toBeCloseTo(0, TOL);
    expect(Math.max(...cantos.map((c) => c.y))).toBeCloseTo(0.6, TOL);
  });
});
