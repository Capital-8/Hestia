import { describe, expect, it } from 'vitest';
import { somaPorPavimento, totaisDasMassas } from './massaQuantities.ts';
import type { FatiaMassaProjeto, QuantMassaProjeto } from './massaServico.ts';

const fatia = (massaId: string, copia: number, nivelId: string, z: number, area: number, perimetro: number): FatiaMassaProjeto => ({
  massaId,
  copia,
  nivelId,
  area,
  perimetro,
  z,
  pontos: [],
});

describe('massa: quantidades por pavimento (A.4 regra 11)', () => {
  it('soma as cópias de uma massa no mesmo pavimento e conta quantas entraram', () => {
    const linhas = somaPorPavimento([fatia('m5p', 0, 'lv_1', 3, 2, 5), fatia('m5p', 1, 'lv_1', 3, 2, 5), fatia('m5p', 0, 'lv_2', 6, 4, 8), fatia('m3', 0, 'lv_1', 3, 64, 32)]);
    expect(linhas.map((l) => [l.massaId, l.nivelId, l.area, l.perimetro, l.copias])).toEqual([
      ['m3', 'lv_1', 64, 32, 1],
      ['m5p', 'lv_1', 4, 10, 2],
      ['m5p', 'lv_2', 4, 8, 1],
    ]);
  });

  it('o total do projeto soma o volume e as áreas de todas as massas', () => {
    const q = (massaId: string, volume: number): QuantMassaProjeto => ({ massaId, volume, areaLateral: volume / 2, areaBase: 10, areaTopo: 10, altura: 9 });
    expect(totaisDasMassas([q('m1', 540), q('m2', 100)])).toEqual({ volume: 640, areaLateral: 320, areaBase: 20, areaTopo: 20 });
    expect(totaisDasMassas([])).toEqual({ volume: 0, areaLateral: 0, areaBase: 0, areaTopo: 0 });
  });
});
