import { afterEach, describe, expect, it } from 'vitest';
import { PESO_MONTAGEM, fracaoProgresso3d, progresso3dAtual, publicarProgresso3d } from './progresso3d.ts';

describe('fração da barra 3D', () => {
  afterEach(() => publicarProgresso3d(0, 0));

  it('pondera os pavimentos pelo trabalho de cada um', () => {
    // Um pavimento pesado (90) e nove leves (10 no total): os 9 últimos pouco movem a barra.
    const pesos = [90, ...Array(9).fill(10 / 9)];
    const soPesado = fracaoProgresso3d(pesos, new Set([0]), null);
    expect(soPesado).toBeCloseTo(0.9 * PESO_MONTAGEM, 6);
    const semPesado = fracaoProgresso3d(pesos, new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]), null);
    expect(semPesado).toBeCloseTo(0.1 * PESO_MONTAGEM, 6);
  });

  it('com a montagem completa e sem preparo a barra não passa de PESO_MONTAGEM', () => {
    expect(fracaoProgresso3d([1, 1], new Set([0, 1]), null)).toBeCloseTo(PESO_MONTAGEM, 6);
  });

  it('o preparo da seleção ocupa o resto e só chega a 1 quando termina', () => {
    const todos = new Set([0, 1]);
    expect(fracaoProgresso3d([1, 1], todos, { feitas: 0, total: 10 })).toBeCloseTo(PESO_MONTAGEM, 6);
    expect(fracaoProgresso3d([1, 1], todos, { feitas: 5, total: 10 })).toBeCloseTo(PESO_MONTAGEM + (1 - PESO_MONTAGEM) / 2, 6);
    expect(fracaoProgresso3d([1, 1], todos, { feitas: 10, total: 10 })).toBe(1);
    expect(fracaoProgresso3d([1, 1], todos, { feitas: 0, total: 0 })).toBe(1);
  });

  it('é monotônica ao ir montando pavimentos', () => {
    const pesos = [3, 1, 4, 1, 5];
    const feitos = new Set<number>();
    let ant = fracaoProgresso3d(pesos, feitos, null);
    for (let i = 0; i < pesos.length; i++) {
      feitos.add(i);
      const f = fracaoProgresso3d(pesos, feitos, null);
      expect(f).toBeGreaterThan(ant);
      ant = f;
    }
  });

  it('a barra publicada some só com fração 1 e guarda a fase', () => {
    publicarProgresso3d(4, 4, { fracao: PESO_MONTAGEM, fase: 'selecao' });
    expect(progresso3dAtual()).toEqual({ montados: 4, total: 4, fracao: PESO_MONTAGEM, fase: 'selecao' });
    publicarProgresso3d(4, 4, { fracao: 1, fase: 'selecao' });
    expect(progresso3dAtual()).toBeNull();
    publicarProgresso3d(1, 4);
    expect(progresso3dAtual()).toEqual({ montados: 1, total: 4, fracao: 0.25, fase: 'montagem' });
  });
});
