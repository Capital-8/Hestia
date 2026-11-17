import { describe, expect, it } from 'vitest';
import { multiArea } from '@hestia/geom';
import { ladosPadrao } from '@hestia/model';
import { areaDoLote, areaEdificavel, faixaDeRecuo, faixasDeRecuo, perimetroDoLote } from './loteGeometria.ts';
import { loteL1, loteL2 } from './fixtureLote.ts';

describe('geometria do lote', () => {
  it('l1_area_e_edificavel', () => {
    const l = loteL1();
    expect(areaDoLote(l.contorno)).toBeCloseTo(360, 6);
    expect(perimetroDoLote(l.contorno)).toBeCloseTo(84, 6);
    expect(Math.abs(multiArea(areaEdificavel(l.contorno, l.lados)) - 198)).toBeLessThan(1e-6);
  });

  it('l2_canto_reentrante', () => {
    const l = loteL2();
    expect(areaDoLote(l.contorno)).toBeCloseTo(300, 6);
    expect(Math.abs(multiArea(areaEdificavel(l.contorno, l.lados)) - 156.86)).toBeLessThan(0.05);
  });

  it('recuo_zero_nao_gera_faixa', () => {
    const l = loteL1();
    expect(faixaDeRecuo(l.contorno[0]!, l.contorno[1]!, 0)).toBeNull();
    expect(faixasDeRecuo(l.contorno, ladosPadrao(4))).toHaveLength(0);
    expect(multiArea(areaEdificavel(l.contorno, ladosPadrao(4)))).toBeCloseTo(360, 9);
    // Só a frente com recuo: uma faixa só.
    expect(faixasDeRecuo(l.contorno, l.lados.map((x, i) => ({ ...x, recuo: i === 0 ? 5 : 0 })))).toHaveLength(1);
  });

  it('a faixa é um estádio de 12 trechos por meio-círculo', () => {
    const f = faixaDeRecuo({ x: 0, y: 0 }, { x: 10, y: 0 }, 2)!;
    expect(f).toHaveLength(26);
    expect(multiArea([[f]])).toBeGreaterThan(40);
    expect(multiArea([[f]])).toBeLessThan(40 + Math.PI * 4);
  });
});
