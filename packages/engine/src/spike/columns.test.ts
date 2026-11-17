/** SPIKE caminho C: colunas verticais com base inclinada. Ver docs/estudo-esquadrias/12-spike-colunas-inclinadas.md. */
import { describe, expect, it } from 'vitest';
import { holeSlices, outline, ringArea, slicesArea, type OPt } from './outline.ts';
import { columnVolume, columnsOf, slabPieceCount } from './columns.ts';

const T = 0.09; // espessura da camada
const LEN = 3;
const H = 2.8;
const volRemovido = (ring: readonly OPt[], sill: number): number => {
  const cols = columnsOf(ring, LEN, H, sill);
  return T * LEN * H - cols.reduce((a, c) => a + columnVolume(c, T), 0);
};
const casos: Array<[string, OPt[], number]> = [
  ['meia-lua 0,9x1,4 (round)', outline('round', 0.9, 1.4, 0), 0],
  ['arco abatido 1,2x1,5 flecha 0,2', outline('segmental', 1.2, 1.5, 0.2), 0],
];

describe('colunas: volume removido = área do contorno x espessura', () => {
  for (const [nome, ring, sill] of casos) {
    it(nome, () => {
      const esperado = ringArea(ring) * T;
      expect(Math.abs(volRemovido(ring, sill) - esperado) / esperado).toBeLessThan(1e-9);
    });
  }
  it('com soleira 0,9 o removido é o mesmo (parapeito sob o vão)', () => {
    const r = outline('segmental', 1.2, 1.5, 0.2);
    expect(Math.abs(volRemovido(r, 0.9) - ringArea(r) * T)).toBeLessThan(1e-9);
  });
});

describe('colunas: sem folga nem sobreposição e contagem', () => {
  it('as colunas "above" cobrem exatamente [-half,half] sem lacunas e com base contínua', () => {
    const r = outline('round', 0.9, 1.4, 0);
    const a = columnsOf(r, LEN, H, 0).filter((c) => c.kind === 'above');
    for (let i = 1; i < a.length; i++) {
      expect(a[i]!.x0).toBeCloseTo(a[i - 1]!.x1, 12);
      expect(a[i]!.zb0).toBeCloseTo(a[i - 1]!.zb1, 12); // a base é contínua (sem degrau)
    }
    expect(a[0]!.x0).toBeCloseTo(-0.45, 9);
    expect(a[a.length - 1]!.x1).toBeCloseTo(0.45, 9);
  });
  it('contagem de peças por camada: colunas x faixas (24 a 48)', () => {
    const r = outline('round', 0.9, 1.4, 0);
    const cols = columnsOf(r, LEN, H, 0);
    const n = cols.length;
    const out = [24, 48].map((k) => slabPieceCount(k, false));
    console.log(`colunas=${n} (vértices=${r.length}) faixas(24)=${out[0]} faixas(48)=${out[1]}`);
    expect(n).toBeGreaterThan(0);
  });
  it('faixas: o erro de área em escada é maior que o das colunas (que é ~ zero)', () => {
    const r = outline('round', 0.9, 1.4, 0);
    const erroFaixas = Math.abs(slicesArea(holeSlices(r, 24, 'outer')) - ringArea(r));
    expect(erroFaixas).toBeGreaterThan(1e-5);
  });
});
