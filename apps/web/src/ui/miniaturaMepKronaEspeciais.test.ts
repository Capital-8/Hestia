import { BIBLIOTECA_MEP } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { silhuetaMep } from './miniaturaMep.ts';

/* Ficha D3b: as peças especiais da Krona esgoto geram miniatura MEP (triângulos) a partir dos corpos. */
const ESPECIAIS = BIBLIOTECA_MEP.filter((f) => ['te_inspecao', 'juncao45_dupla', 'joelho90_visita', 'curva90_pe_coluna'].some((s) => f.id.startsWith('fam_krona_esgoto_') && f.id.endsWith(s)));

describe('miniatura MEP das peças especiais da Krona esgoto (D3b)', () => {
  it('são 7 famílias e todas geram triângulos', () => {
    expect(ESPECIAIS).toHaveLength(7);
    for (const f of ESPECIAIS) expect(silhuetaMep(f)?.triangulos.length ?? 0, f.id).toBeGreaterThan(0);
  });
});
