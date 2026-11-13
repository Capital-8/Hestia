import { describe, expect, it } from 'vitest';
import { TOLERANCIA_FECHAMENTO, fechamentoAceito, poligonoParaRumos, rumosParaPoligono } from './loteRumos.ts';

const retangulo = [{ azimute: 90, distancia: 10 }, { azimute: 180, distancia: 5 }, { azimute: 270, distancia: 10 }, { azimute: 0, distancia: 5 }];

describe('rumos e distâncias', () => {
  it('rumos_retangulo_fecha', () => {
    const r = rumosParaPoligono({ x: 0, y: 0 }, retangulo);
    expect(r.erroFechamento).toBeLessThan(1e-9);
    expect(r.pontos).toHaveLength(4);
    expect(r.pontos[1]!.x).toBeCloseTo(10, 9);
    expect(r.pontos[2]!.y).toBeCloseTo(-5, 9);
  });

  it('rumos_com_norte_verdadeiro', () => {
    const base = rumosParaPoligono({ x: 0, y: 0 }, retangulo);
    const norte = 30 * (Math.PI / 180);
    const girado = rumosParaPoligono({ x: 0, y: 0 }, retangulo, norte);
    expect(girado.erroFechamento).toBeLessThan(1e-9);
    // Cada ponto é o original girado 30° em torno do ponto inicial (azimute − norte: sentido anti-horário no plano).
    base.pontos.forEach((q, i) => {
      const x = q.x * Math.cos(norte) - q.y * Math.sin(norte);
      const y = q.x * Math.sin(norte) + q.y * Math.cos(norte);
      expect(girado.pontos[i]!.x).toBeCloseTo(x, 9);
      expect(girado.pontos[i]!.y).toBeCloseTo(y, 9);
    });
  });

  it('rumos_ida_e_volta', () => {
    const contorno = [{ x: 3, y: 4 }, { x: 20, y: 6 }, { x: 18, y: 15 }, { x: 5, y: 12 }];
    for (const norte of [0, 0.5236, -1.1]) {
      const linhas = poligonoParaRumos(contorno, norte);
      linhas.forEach((l) => expect(l.azimute >= 0 && l.azimute < 360).toBe(true));
      const volta = rumosParaPoligono(contorno[0]!, linhas, norte);
      expect(volta.erroFechamento).toBeLessThan(1e-9);
      volta.pontos.forEach((q, i) => {
        expect(q.x).toBeCloseTo(contorno[i]!.x, 9);
        expect(q.y).toBeCloseTo(contorno[i]!.y, 9);
      });
    }
  });

  it('erro de fechamento e regra de aceite', () => {
    const aberta = rumosParaPoligono({ x: 0, y: 0 }, [{ azimute: 90, distancia: 10 }, { azimute: 180, distancia: 5 }, { azimute: 270, distancia: 10 }, { azimute: 0, distancia: 4.9 }]);
    expect(aberta.erroFechamento).toBeCloseTo(0.1, 9);
    expect(fechamentoAceito(aberta.erroFechamento, false)).toBe(false);
    expect(fechamentoAceito(aberta.erroFechamento, true)).toBe(true);
    expect(fechamentoAceito(TOLERANCIA_FECHAMENTO, false)).toBe(true);
  });
});
