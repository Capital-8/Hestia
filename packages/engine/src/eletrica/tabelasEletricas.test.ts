import { describe, expect, it } from 'vitest';
import { marcarConferido, mesclarTabelas, rotuloEstado, TABELAS_PROVISORIAS as T, validarTabelas } from './tabelasEletricas.ts';

describe('tabelas elétricas (CONFERIR)', () => {
  it('as provisórias nascem CONFERIR, com a fonte avisando que não são norma verificada', () => {
    expect(T.estado).toBe('CONFERIR');
    expect(T.fonte).toContain('não é norma verificada');
    expect(validarTabelas(T)).toEqual([]);
  });
  it('mesclar não altera a base e valor inválido é ignorado', () => {
    const n = mesclarTabelas(T, { quedaMaximaPct: -3, secoes: [1, 'x'], capacidadeA: { '2.5': Number.NaN, '4': 33 } });
    expect(n.quedaMaximaPct).toBe(T.quedaMaximaPct);
    expect(n.secoes).toEqual(T.secoes);
    expect(n.capacidadeA['2.5']).toBe(24);
    expect(n.capacidadeA['4']).toBe(33);
    expect(T.capacidadeA['4']).toBe(32);
  });
  it('editar um número volta o estado para CONFERIR e apaga a conferência', () => {
    const conf = marcarConferido(T, 'Ana', '2026-11-25');
    expect(rotuloEstado(conf)).toBe('conferido por Ana');
    const n = mesclarTabelas(conf, { quedaMaximaPct: 3 });
    expect(n.estado).toBe('CONFERIR');
    expect(n.conferidoPor).toBeUndefined();
  });
  it('marcarConferido sem nome não marca; fator de demanda acima de 1 é recusado', () => {
    expect(marcarConferido(T, '  ', 'hoje')).toBe(T);
    expect(mesclarTabelas(T, { fatorDemanda: { iluminacao: 2 } }).fatorDemanda.iluminacao).toBe(1);
  });
  it('validarTabelas avisa seção sem capacidade', () => {
    expect(validarTabelas(mesclarTabelas(T, { secoes: [1.5, 2.5, 5] })).join(' ')).toContain('seção 5');
  });
});
