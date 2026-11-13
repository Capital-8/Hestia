import { describe, expect, it } from 'vitest';
import { t } from './i18n.ts';
import { ladosPadrao, makeLot } from './lot.ts';
import { LOTE_LIMITES, type Lot } from './lotTypes.ts';
import { TERRENO_LIMITES } from './terrainTypes.ts';
import { lotIssue } from './validateLot.ts';

const quadrado = [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 30 }, { x: 0, y: 30 }];
const lote = (p: Partial<Lot> = {}): Lot => ({ ...makeLot({ id: 'lt1', levelId: 'lv_0', contorno: quadrado, lados: ladosPadrao(4), ...p }), order: 0 });
const msg = (k: Parameters<typeof t>[1], params?: Record<string, string | number>): string => t('pt', k, params);

describe('lotIssue (A.3 item 6)', () => {
  it('lote válido passa, com e sem limites', () => {
    expect(lotIssue(lote())).toBeNull();
    expect(lotIssue(lote({ limites: { taxaOcupacaoMax: 0.5, coefAproveitamentoMax: 2, permeabilidadeMin: 0.2, gabaritoMax: 12 } }))).toBeNull();
  });

  it('contorno com 3 a 256 pontos', () => {
    expect(lotIssue(lote({ contorno: quadrado.slice(0, 2), lados: ladosPadrao(2) }))).toBe(msg('md_lt_pontos', { max: LOTE_LIMITES.pontos }));
    const n = LOTE_LIMITES.pontos + 1;
    const circulo = Array.from({ length: n }, (_, k) => ({ x: 100 * Math.cos((2 * Math.PI * k) / n), y: 100 * Math.sin((2 * Math.PI * k) / n) }));
    expect(lotIssue(lote({ contorno: circulo, lados: ladosPadrao(n) }))).toBe(msg('md_lt_pontos', { max: LOTE_LIMITES.pontos }));
    const ok = circulo.slice(0, LOTE_LIMITES.pontos);
    expect(lotIssue(lote({ contorno: ok, lados: ladosPadrao(ok.length) }))).toBeNull();
  });

  it('contorno simples, com área e anti-horário', () => {
    expect(lotIssue(lote({ contorno: [{ x: 0, y: 0 }, { x: 4, y: 4 }, { x: 4, y: 0 }, { x: 0, y: 4 }] }))).toBe(msg('md_lt_simples'));
    expect(lotIssue(lote({ contorno: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }], lados: ladosPadrao(3) }))).toBe(msg('md_lt_simples'));
    expect(lotIssue(lote({ contorno: [...quadrado].reverse() }))).toBe(msg('md_lt_horario'));
  });

  it('números finitos e coordenadas dentro do limite', () => {
    expect(lotIssue(lote({ contorno: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 5, y: 8 }], lados: ladosPadrao(3) }))).toBe(msg('md_lt_numero'));
    expect(lotIssue(lote({ contorno: [{ x: 0, y: 0 }, { x: TERRENO_LIMITES.coordMax + 1, y: 0 }, { x: 5, y: 8 }], lados: ladosPadrao(3) }))).toBe(msg('md_lt_coord', { max: TERRENO_LIMITES.coordMax }));
  });

  it('lados com o mesmo tamanho do contorno', () => {
    expect(lotIssue(lote({ lados: ladosPadrao(3) }))).toBe(msg('md_lt_lados'));
    expect(lotIssue(lote({ lados: ladosPadrao(5) }))).toBe(msg('md_lt_lados'));
  });

  it('papel do lado: frente, lateral ou fundo', () => {
    const lados = ladosPadrao(4);
    lados[2] = { papel: 'esquina' as 'frente', recuo: 0 };
    expect(lotIssue(lote({ lados }))).toBe(msg('md_lt_papel', { i: 3 }));
  });

  it('recuo de 0 a recuoMax', () => {
    for (const recuo of [-0.01, LOTE_LIMITES.recuoMax + 1, Number.NaN]) {
      const lados = ladosPadrao(4);
      lados[1] = { papel: 'lateral', recuo };
      expect(lotIssue(lote({ lados }))).toBe(msg('md_lt_recuo', { i: 2, max: LOTE_LIMITES.recuoMax }));
    }
    const lados = ladosPadrao(4);
    lados[0] = { papel: 'frente', recuo: LOTE_LIMITES.recuoMax };
    expect(lotIssue(lote({ lados }))).toBeNull();
  });

  it('limites presentes são maiores que zero (frações até 1, coeficiente até 100)', () => {
    expect(lotIssue(lote({ limites: { taxaOcupacaoMax: 0 } }))).toBe(msg('md_lt_limite', { campo: 'taxaOcupacaoMax', max: 1 }));
    expect(lotIssue(lote({ limites: { taxaOcupacaoMax: 1.01 } }))).toBe(msg('md_lt_limite', { campo: 'taxaOcupacaoMax', max: 1 }));
    expect(lotIssue(lote({ limites: { permeabilidadeMin: -0.1 } }))).toBe(msg('md_lt_limite', { campo: 'permeabilidadeMin', max: 1 }));
    expect(lotIssue(lote({ limites: { permeabilidadeMin: 1.5 } }))).toBe(msg('md_lt_limite', { campo: 'permeabilidadeMin', max: 1 }));
    expect(lotIssue(lote({ limites: { coefAproveitamentoMax: 100.5 } }))).toBe(msg('md_lt_limite', { campo: 'coefAproveitamentoMax', max: 100 }));
    expect(lotIssue(lote({ limites: { coefAproveitamentoMax: Number.NaN } }))).toBe(msg('md_lt_limite', { campo: 'coefAproveitamentoMax', max: 100 }));
    expect(lotIssue(lote({ limites: { coefAproveitamentoMax: 100, taxaOcupacaoMax: 1, permeabilidadeMin: 1 } }))).toBeNull();
    expect(lotIssue(lote({ limites: { gabaritoMax: 0 } }))).toBe(msg('md_lt_gabarito'));
    expect(lotIssue(lote({ limites: { gabaritoMax: Number.NaN } }))).toBe(msg('md_lt_gabarito'));
  });
});
