import { describe, expect, it } from 'vitest';
import { atualizarCircuito, criarCircuito, type CircuitoEletrico } from './circuitosEletricos.ts';

const c: CircuitoEletrico = { id: 'cir_1', nome: 'C1', tipo: 'iluminacao', tensao: 127, cor: '#d9480f', pontos: [] };

describe('circuito: fp, seção e disjuntor adotados (C5)', () => {
  const cs = criarCircuito({}, c);
  it('grava e apaga com null', () => {
    const a = atualizarCircuito(cs, 'cir_1', { fp: 0.9, secaoMm2: 4, disjuntorA: 25 });
    expect(a.cir_1).toMatchObject({ fp: 0.9, secaoMm2: 4, disjuntorA: 25 });
    const b = atualizarCircuito(a, 'cir_1', { fp: null, secaoMm2: null, disjuntorA: null });
    expect('fp' in b.cir_1! || 'secaoMm2' in b.cir_1! || 'disjuntorA' in b.cir_1!).toBe(false);
  });
  it('recusa fp fora de (0, 1], seção e disjuntor não positivos', () => {
    expect(() => atualizarCircuito(cs, 'cir_1', { fp: 0 })).toThrow('fator de potência');
    expect(() => atualizarCircuito(cs, 'cir_1', { fp: 1.1 })).toThrow('fator de potência');
    expect(() => atualizarCircuito(cs, 'cir_1', { secaoMm2: -1 })).toThrow('seção');
    expect(() => atualizarCircuito(cs, 'cir_1', { disjuntorA: 0 })).toThrow('disjuntor');
  });
  it('circuito antigo, sem os campos, continua válido', () => {
    expect(cs.cir_1!.fp).toBeUndefined();
  });
});
