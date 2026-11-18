import { describe, expect, it } from 'vitest';
import { isTerrain, isTerrainRegion } from '@hestia/model';
import { NOMES_FIXTURE_TERRENO, idRegiaoFixture, idTerrenoFixture, projetoTerreno, projetoTerrenos, regiaoDaFixture } from './fixtureTerreno.ts';

describe('fixtureTerreno (A.10)', () => {
  it('cada fixture tem um terreno; só T5, T6 e T7 têm região', () => {
    for (const nome of NOMES_FIXTURE_TERRENO) {
      const p = projetoTerreno(nome);
      const els = Object.values(p.elements);
      expect(els.filter(isTerrain)).toHaveLength(1);
      expect(els.filter(isTerrainRegion)).toHaveLength(['T5', 'T6', 'T7'].includes(nome) ? 1 : 0);
      expect(p.localizacao).toBeUndefined();
    }
  });
  it('fontes de T1 a T4, T8 e T9', () => {
    const t = (n: (typeof NOMES_FIXTURE_TERRENO)[number]) => projetoTerreno(n).elements[idTerrenoFixture(n)] as ReturnType<typeof projetoTerreno>['elements'][string] & { pontos: number[]; quebras: unknown[]; borda?: number[]; intervaloCurvas: number };
    expect(t('T1').pontos).toEqual([0, 0, 10, 20, 0, 10, 20, 20, 10, 0, 20, 10]);
    expect(t('T2').pontos.filter((_, k) => k % 3 === 2)).toEqual([10.25, 12.25, 12.25, 10.25]);
    expect(t('T3').pontos.slice(-3)).toEqual([10, 10, 5]);
    expect(t('T3').intervaloCurvas).toBe(1);
    expect(t('T4').quebras).toEqual([{ xyz: [10, 0, 0, 10, 20, 0] }]);
    expect(t('T8').borda).toEqual([5, 5, 15, 5, 15, 15, 5, 15]);
    expect(t('T9').quebras).toHaveLength(2);
    expect(t('T1').intervaloCurvas).toBe(0.5);
  });
  it('regiões: T5 plataforma cota 8, T6 nivelada com talude de corte 1, T7 plataforma cota 12,25', () => {
    expect(regiaoDaFixture('T5')).toMatchObject({ papel: 'plataforma', cota: 8, taludeCorte: 0, terrenoId: idTerrenoFixture('T5'), permeavel: false });
    expect(regiaoDaFixture('T6')).toMatchObject({ papel: 'nivelada', cota: 8, taludeCorte: 1 });
    expect(regiaoDaFixture('T7')).toMatchObject({ papel: 'plataforma', cota: 12.25 });
    expect(regiaoDaFixture('T1')).toBeNull();
    expect(idRegiaoFixture('T7')).toBe('rg_t7');
  });
  it('projetoTerrenos junta T1 a T9 e as três regiões', () => {
    const els = Object.values(projetoTerrenos().elements);
    expect(els.filter(isTerrain)).toHaveLength(9);
    expect(els.filter(isTerrainRegion)).toHaveLength(3);
  });
});
