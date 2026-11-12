import { describe, expect, it } from 'vitest';
import { projetoGuardaCorpo } from '../fixtureGuardaCorpo.ts';
import { montarCenaGC } from '../kernelGuardaCorpo.ts';
import { FLAG_DIREITO, FLAG_SOLDADO, guardaCaminhosRef } from './caminho.ts';

describe('guardaCaminhosRef (só para a paridade)', () => {
  const c = montarCenaGC(projetoGuardaCorpo().p);
  const r = guardaCaminhosRef(c, null, 1e-6);

  it('a fixture dá cadeias em planta e em cota coerentes', () => {
    const n = r.trechos.length / 5;
    expect(n).toBeGreaterThanOrEqual(6);
    expect(r.nos.length / 3).toBe(r.trechos.filter((_, i) => i % 5 === 3).reduce((a, b) => a + b, 0));
    expect(r.avisos).toEqual([]);
  });

  it('a escada reta tem um trecho por lado ligado, com cota crescente no esquerdo', () => {
    const gid = c.guardaDe.get('gc_e')!;
    const meus: number[][] = [];
    for (let i = 0; i < r.trechos.length; i += 5) if (r.trechos[i] === gid) meus.push(r.trechos.slice(i, i + 5));
    expect(meus).toHaveLength(2);
    expect(meus[1]![4]! & FLAG_DIREITO).toBe(FLAG_DIREITO);
    expect(meus[0]![4]! & FLAG_SOLDADO).toBe(0);
    expect(meus[0]![3]).toBe(2);
  });
});
