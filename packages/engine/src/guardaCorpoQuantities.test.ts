import { describe, expect, it } from 'vitest';
import { projetoGuardaCorpo } from './fixtureGuardaCorpo.ts';
import { montarCenaGC } from './kernelGuardaCorpo.ts';
import { decodificarQuantidadesGC, guardaCorpoQuantities, totaisPorTipoGC, type LinhaQuantGC } from './guardaCorpoQuantities.ts';

const { p } = projetoGuardaCorpo();
const cena = montarCenaGC(p);
const numero = cena.guardaDe.get('gc_e')!;

const linha = (guardaId: string, papel: number, t: Partial<LinhaQuantGC> = {}): LinhaQuantGC => ({
  guardaId,
  papel,
  perfilNum: 10,
  materialNum: 1,
  nPecas: 0,
  comprimento: 0,
  area: 0,
  volume: 0,
  areaProjetada: 0,
  ...t,
});

describe('decodificarQuantidadesGC', () => {
  it('lê 5 u32 e 4 f64 por linha e mapeia o número do guarda-corpo para o id', () => {
    const out = decodificarQuantidadesGC({ linhas: [numero, 1, 3, 4, 27], valores: [1.5, 0, 0.25, 1.5] }, cena);
    expect(out).toEqual([{ guardaId: 'gc_e', papel: 1, perfilNum: 3, materialNum: 4, nPecas: 27, comprimento: 1.5, area: 0, volume: 0.25, areaProjetada: 1.5 }]);
  });

  it('número que a cena não conhece lança e formato errado lança', () => {
    expect(() => decodificarQuantidadesGC({ linhas: [999, 1, 3, 4, 1], valores: [0, 0, 0, 0] }, cena)).toThrow(/sem id/);
    expect(() => decodificarQuantidadesGC({ linhas: [1, 2, 3, 4], valores: [1, 2, 3, 4] }, cena)).toThrow();
  });
});

describe('guardaCorpoQuantities e totaisPorTipoGC (fonte única)', () => {
  it('soma metros, contagens e áreas por guarda-corpo e por tipo', () => {
    const linhas = [
      linha('gc_e', 0, { nPecas: 4, comprimento: 4.4, volume: 0.02 }),
      linha('gc_e', 1, { nPecas: 27, comprimento: 29.7 }),
      linha('gc_e', 2, { nPecas: 1, comprimento: 3, volume: 0.1 }),
      linha('gc_e', 3, { nPecas: 2, comprimento: 7.2 }),
      linha('gc_e', 7, { nPecas: 1, comprimento: 1 }),
      linha('gc_e', 5, { nPecas: 6, area: 6.072, volume: 0.03 }),
    ];
    const q = guardaCorpoQuantities(p, linhas);
    const g = q.find((x) => x.guardaId === 'gc_e')!;
    expect(g.postes).toBe(4);
    expect(g.balaustres).toBe(27);
    expect(g.areaPaineis).toBeCloseTo(3.036, 12); // uma face: a área lateral de painel é de duas faces
    const t = totaisPorTipoGC(q)['gct_balaustres']!;
    expect(t.guardas).toBe(1);
    expect(t.postes).toBe(4);
    expect(t.balaustres).toBe(27);
    expect(t.metrosTrilho).toBeCloseTo(3, 12);
    expect(t.metrosCorrimao).toBeCloseTo(7.2, 12);
    expect(t.metrosTravessa).toBeCloseTo(1, 12);
    expect(t.areaPaineis).toBeCloseTo(3.036, 12);
  });

  it('guarda-corpo sem linhas não aparece no resultado', () => {
    expect(guardaCorpoQuantities(p, [])).toEqual([]);
  });
});
