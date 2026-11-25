import { familiaDaBiblioteca, ID_QUADRO_ELETRICO } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { ehFamiliaMep, silhuetaMep } from '../miniaturaMep.ts';

/* Quadro de distribuição elétrico (ficha C4): usa a miniatura MEP (silhueta isométrica real), não o retângulo de móvel. */
describe('miniatura MEP do quadro de distribuição', () => {
  const quadro = familiaDaBiblioteca(ID_QUADRO_ELETRICO)!;
  it('é família MEP (painel Elétrico)', () => {
    expect(ehFamiliaMep(quadro)).toBe(true);
  });
  it('gera a silhueta com triângulos', () => {
    const s = silhuetaMep(quadro);
    expect(s).not.toBeNull();
    expect(s!.triangulos.length).toBeGreaterThan(0);
  });
});
