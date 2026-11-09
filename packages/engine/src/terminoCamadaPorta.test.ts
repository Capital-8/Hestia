import { describe, expect, it } from 'vitest';
import { bordaDaLajeEm, projetoPortaSobLaje } from '../../../tests/termino-camada-porta.ts';

describe('término por camada: acima da porta a parede é contínua (TypeScript)', () => {
  it('a borda da laje sobre o vão da porta é a mesma do trecho cheio da parede', () => {
    const p = projetoPortaSobLaje();
    const cheio = bordaDaLajeEm(p, 1);
    const sobPorta = bordaDaLajeEm(p, 3);
    expect(Number.isFinite(cheio) && Number.isFinite(sobPorta)).toBe(true);
    expect(sobPorta).toBeCloseTo(cheio, 6);
  });
});
