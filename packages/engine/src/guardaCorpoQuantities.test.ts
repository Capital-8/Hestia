import { describe, expect, it } from 'vitest';
import { projetoGuardaCorpo } from './fixtureGuardaCorpo.ts';
import { montarCenaGC } from './kernelGuardaCorpo.ts';
import { PAPEL_GC, SEM_PERFIL_GC, decodificarQuantidadesGC, quantidadesGuardaCorpo, type LinhaQuantGC } from './guardaCorpoQuantities.ts';

const linha = (guarda: number, papel: number, t: Partial<LinhaQuantGC> = {}): LinhaQuantGC => ({
  guarda,
  papel,
  perfil: 10,
  material: 1,
  nPecas: 0,
  comprimento: 0,
  area: 0,
  volume: 0,
  areaProjetada: 0,
  ...t,
});

describe('decodificarQuantidadesGC', () => {
  it('lê 5 u32 e 4 f64 por linha', () => {
    const out = decodificarQuantidadesGC({
      linhas: [7, PAPEL_GC.balaustre, 3, 4, 27, 8, PAPEL_GC.painel, SEM_PERFIL_GC, 5, 6],
      valores: [1.5, 0, 0.25, 1.5, 2.25, 0.5, 0.1, 0.5],
    });
    expect(out).toEqual([
      { guarda: 7, papel: PAPEL_GC.balaustre, perfil: 3, material: 4, nPecas: 27, comprimento: 1.5, area: 0, volume: 0.25, areaProjetada: 1.5 },
      { guarda: 8, papel: PAPEL_GC.painel, perfil: SEM_PERFIL_GC, material: 5, nPecas: 6, comprimento: 2.25, area: 0.5, volume: 0.1, areaProjetada: 0.5 },
    ]);
  });

  it('recusa formato inesperado', () => {
    expect(() => decodificarQuantidadesGC({ linhas: [1, 2, 3, 4], valores: [1, 2, 3, 4] })).toThrow();
  });
});

describe('quantidadesGuardaCorpo', () => {
  const { p } = projetoGuardaCorpo();
  const cena = montarCenaGC(p);
  const numero = cena.guardaDe.get('gc_e')!;

  it('soma metros, contagens e áreas por guarda-corpo e por tipo', () => {
    const q = quantidadesGuardaCorpo(p, cena, [
      linha(numero, PAPEL_GC.poste, { nPecas: 4, comprimento: 4.4, volume: 0.02 }),
      linha(numero, PAPEL_GC.balaustre, { nPecas: 27, comprimento: 29.7 }),
      linha(numero, PAPEL_GC.trilho, { nPecas: 1, comprimento: 3, volume: 0.1 }),
      linha(numero, PAPEL_GC.corrimao, { nPecas: 2, comprimento: 7.2 }),
      linha(numero, PAPEL_GC.travessa, { nPecas: 1, comprimento: 1 }),
      linha(numero, PAPEL_GC.painel, { nPecas: 6, area: 3.036, volume: 0.03 }),
    ]);
    const total = q.porGuarda['gc_e']!;
    expect(total.postes).toBe(4);
    expect(total.balaustres).toBe(27);
    expect(total.metrosTrilho).toBeCloseTo(3, 12);
    expect(total.metrosCorrimao).toBeCloseTo(7.2, 12);
    expect(total.metrosTravessa).toBeCloseTo(1, 12);
    expect(total.areaPaineis).toBeCloseTo(3.036, 12);
    expect(total.volume).toBeCloseTo(0.15, 12);
    expect(q.porTipo['gct_balaustres']).toEqual(total);
  });

  it('linha com número de guarda-corpo que a cena não conhece lança', () => {
    expect(() => quantidadesGuardaCorpo(p, cena, [linha(999, PAPEL_GC.poste, { nPecas: 1 })])).toThrow(/sem id/);
  });

  it('papel desconhecido lança', () => {
    expect(() => quantidadesGuardaCorpo(p, cena, [linha(numero, 42, { nPecas: 1 })])).toThrow(/papel 42/);
  });
});
