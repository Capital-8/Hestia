import { describe, expect, it } from 'vitest';
import { criarInstanciaFalsa } from './falso.ts';

describe('falso: decisões de contrato 0046', () => {
  it('abi2_alocar(0) devolve ponteiro válido (0 só significa falha)', () => {
    const inst = criarInstanciaFalsa();
    expect(inst.exports.abi2_alocar(0)).toBeGreaterThan(0);
  });
});
