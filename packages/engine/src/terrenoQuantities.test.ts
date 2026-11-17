import { describe, expect, it } from 'vitest';
import { decodificarQuantidadesRegioesTN, decodificarQuantidadesTN, totaisTerreno } from './terrenoQuantities.ts';

const terreno = (n: number): string | undefined => (n === 1 ? 'tn_a' : n === 2 ? 'tn_b' : undefined);
const regiao = (n: number): string | undefined => (n === 5 ? 'rg_p' : undefined);

describe('terrenoQuantities', () => {
  it('quant_terreno: oito colunas por terreno, terreno desconhecido some', () => {
    const q = decodificarQuantidadesTN([1, 9, 2], [400, 400, 401.9, 10, 12, 1, 2, 8, 1, 1, 1, 1, 1, 1, 1, 1, 100, 100, 100, 9, 9, 0, 3, 4], terreno);
    expect(q).toHaveLength(2);
    expect(q[0]).toEqual({ terrenoId: 'tn_a', areaPlanta: 400, areaSuperficieExistente: 400, areaSuperficieProposta: 401.9, zMin: 10, zMax: 12, volumeCorte: 1, volumeAterro: 2, nTriangulos: 8 });
    expect(q[1]!.terrenoId).toBe('tn_b');
    expect(q[1]!.volumeAterro).toBe(3);
  });
  it('quant_terreno_regioes: quatro colunas por região', () => {
    const q = decodificarQuantidadesRegioesTN([5, 1, 6, 1], [100, 100, 200, 0, 1, 1, 1, 1], terreno, regiao);
    expect(q).toEqual([{ regiaoId: 'rg_p', terrenoId: 'tn_a', areaPlanta: 100, areaSuperficie: 100, volumeCorte: 200, volumeAterro: 0 }]);
  });
  it('formato inesperado lança, sem valor de reserva', () => {
    expect(() => decodificarQuantidadesTN([1], [1, 2, 3], terreno)).toThrow(/formato inesperado/);
    expect(() => decodificarQuantidadesRegioesTN([1], [], terreno, regiao)).toThrow(/formato inesperado/);
  });
  it('totais: soma e saldo = aterro menos corte', () => {
    const t = totaisTerreno([
      { areaPlanta: 100, volumeCorte: 200, volumeAterro: 0 },
      { areaPlanta: 50, volumeCorte: 10, volumeAterro: 40 },
    ]);
    expect(t).toEqual({ areaPlanta: 150, volumeCorte: 210, volumeAterro: 40, saldo: -170 });
    expect(totaisTerreno([])).toEqual({ areaPlanta: 0, volumeCorte: 0, volumeAterro: 0, saldo: 0 });
  });
});
