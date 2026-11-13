import { describe, expect, it } from 'vitest';
import { resumirCortinas, type LinhaQuantCortina } from './index.ts';

/** Linha de `quant_cortina` com os campos que o TS lê. Papéis: 0 interior vertical, 2 borda início, 10 vidro, 11 sólido, 12 vazio, 20 sistema. */
const linha = (over: Partial<LinhaQuantCortina> & Pick<LinhaQuantCortina, 'cortina' | 'papel'>): LinhaQuantCortina => ({
  tipo: 0,
  material: null,
  n: 0,
  comprimento: 0,
  area: 0,
  areaLiquida: 0,
  volume: 0,
  ...over,
});

describe('resumirCortinas (quant_cortina agregada, decisão 0056 §5.7)', () => {
  it('o montante de canto entre cortinas (papel 6, fase 3) conta como montante', () => {
    const [r] = resumirCortinas([linha({ cortina: 1, papel: 6, tipo: 9, n: 1, comprimento: 3, area: 0.18, volume: 0.04 })]);
    expect(r!.quantidadeMontantes).toBe(1);
    expect(r!.metrosPorPapel.get(6)).toBeCloseTo(3, 9);
    expect(r!.volumeMontantes).toBeCloseTo(0.04, 9);
  });

  it('soma montantes por papel e por tipo, com contagem e volume', () => {
    const [r] = resumirCortinas([
      linha({ cortina: 1, papel: 0, tipo: 7, n: 2, comprimento: 2.4, area: 0.24, volume: 0.024 }),
      linha({ cortina: 1, papel: 2, tipo: 8, n: 1, comprimento: 3, area: 0.15, volume: 0.015 }),
    ]);
    expect(r!.metrosMontante).toBeCloseTo(5.4, 9);
    expect(r!.quantidadeMontantes).toBe(3);
    expect(r!.volumeMontantes).toBeCloseTo(0.039, 9);
    expect(r!.metrosPorPapel.get(0)).toBeCloseTo(2.4, 9);
    expect(r!.metrosPorPapel.get(2)).toBeCloseTo(3, 9);
    expect(r!.metrosPorTipo.get(7)).toBeCloseTo(2.4, 9);
    expect(r!.metrosPorTipo.get(8)).toBeCloseTo(3, 9);
  });

  it('vidro: área bruta e visível vêm de colunas diferentes; sólido e vazio ficam à parte', () => {
    const [r] = resumirCortinas([
      linha({ cortina: 1, papel: 10, tipo: 3, n: 4, area: 6.2, areaLiquida: 5.9, volume: 0.062 }),
      linha({ cortina: 1, papel: 11, tipo: 4, n: 1, area: 1.0, areaLiquida: 1.0 }),
      linha({ cortina: 1, papel: 12, tipo: 5, n: 2, area: 0.8, areaLiquida: 0.8 }),
    ]);
    expect(r!.vidroBruta).toBeCloseTo(6.2, 9);
    expect(r!.vidroVisivel).toBeCloseTo(5.9, 9);
    expect(r!.areaSolida).toBeCloseTo(1.0, 9);
    expect(r!.areaVazia).toBeCloseTo(0.8, 9);
    expect(r!.quantidadePaineis).toBe(7);
    expect(r!.areaBrutaPorTipoPainel.get(3)).toBeCloseTo(6.2, 9);
  });

  it('o sistema traz comprimento e área bruta (L × H), sem entrar nos montantes nem nos painéis', () => {
    const [r] = resumirCortinas([linha({ cortina: 2, papel: 20, n: 1, comprimento: 6, area: 18, areaLiquida: 18 })]);
    expect(r!.comprimento).toBe(6);
    expect(r!.areaSistema).toBe(18);
    expect(r!.metrosMontante).toBe(0);
    expect(r!.quantidadePaineis).toBe(0);
  });

  it('separa cortinas e devolve em ordem crescente de cortina_num', () => {
    const r = resumirCortinas([
      linha({ cortina: 9, papel: 20, comprimento: 1, area: 2 }),
      linha({ cortina: 3, papel: 20, comprimento: 4, area: 8 }),
    ]);
    expect(r.map((x) => x.cortina)).toEqual([3, 9]);
    expect(r[0]!.comprimento).toBe(4);
  });

  it('sem linhas, não há resumo (a tabela não inventa zeros)', () => {
    expect(resumirCortinas([])).toEqual([]);
  });
});
