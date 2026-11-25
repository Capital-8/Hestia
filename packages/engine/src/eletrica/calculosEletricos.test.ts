import { describe, expect, it } from 'vitest';
import { capacidadeDaSecao, correnteProjetoA, dimensionarCircuito, escolherDisjuntor, escolherSecao, potenciaAtivaW, quedaTensaoPct } from './calculosEletricos.ts';
import { mesclarTabelas, TABELAS_PROVISORIAS as T } from './tabelasEletricas.ts';

/* Cálculos puros (ficha C5). Os números esperados foram feitos à mão com as tabelas PROVISÓRIAS (CONFERIR); não são norma. */
const base = { tipo: 'iluminacao' as const, tensaoV: 127, totalVA: 2540, comprimentoM: 10 };

describe('potência e corrente', () => {
  it('potência ativa = VA x fp', () => expect(potenciaAtivaW(1000, 0.8)).toBeCloseTo(800, 9));
  it('corrente = P / (V x fp)', () => expect(correnteProjetoA(800, 127, 0.8)).toBeCloseTo(7.874, 3));
  it('fp 1: 1270 W a 127 V dá 10 A', () => expect(correnteProjetoA(1270, 127, 1)).toBeCloseTo(10, 9));
  it('tensão zero não calcula (NaN)', () => expect(correnteProjetoA(100, 0, 1)).toBeNaN());
  it('fator de potência zero não calcula (NaN)', () => expect(correnteProjetoA(100, 127, 0)).toBeNaN());
});

describe('queda de tensão', () => {
  it('2 rho L I / (S V) x 100: 20 m, 10 A, 2,5 mm2, 127 V = 2,8346 %', () => expect(quedaTensaoPct(0.0225, 20, 10, 2.5, 127)).toBeCloseTo(2.8346, 4));
  it('dobra com o comprimento', () => expect(quedaTensaoPct(0.0225, 40, 10, 2.5, 127)).toBeCloseTo(2 * quedaTensaoPct(0.0225, 20, 10, 2.5, 127), 9));
  it('cai pela metade com o dobro da seção', () => expect(quedaTensaoPct(0.0225, 20, 10, 5, 127)).toBeCloseTo(quedaTensaoPct(0.0225, 20, 10, 2.5, 127) / 2, 9));
  it('seção zero não calcula (NaN)', () => expect(quedaTensaoPct(0.0225, 20, 10, 0, 127)).toBeNaN());
  it('comprimento zero dá queda zero', () => expect(quedaTensaoPct(0.0225, 0, 10, 2.5, 127)).toBe(0));
});

describe('disjuntor', () => {
  it('menor padronizado que atende: 10 A pede 10 A', () => expect(escolherDisjuntor(T, 10, 24)).toBe(10));
  it('10,1 A sobe para 16 A', () => expect(escolherDisjuntor(T, 10.1, 24)).toBe(16));
  it('respeita o teto do condutor: 17 A com 17,5 A de capacidade não tem disjuntor (20 > 17,5)', () => expect(escolherDisjuntor(T, 17, 17.5)).toBeNull());
  it('corrente acima do maior padronizado: nenhum', () => expect(escolherDisjuntor(T, 70, null)).toBeNull());
  it('sem teto (capacidade nula) vale o primeiro >= corrente', () => expect(escolherDisjuntor(T, 30, null)).toBe(32));
});

describe('escolha da seção', () => {
  it('capacidade da tabela por seção, nula fora dela', () => {
    expect(capacidadeDaSecao(T, 2.5)).toBe(24);
    expect(capacidadeDaSecao(T, 3)).toBeNull();
  });
  it('iluminação com 5 A: a menor, 1,5', () => expect(escolherSecao(T, 'iluminacao', 5, 127, 10)).toEqual({ secaoMm2: 1.5, motivo: null }));
  it('tomadas com 5 A: a seção mínima do tipo manda, 2,5', () => expect(escolherSecao(T, 'tomadas_uso_geral', 5, 127, 10).secaoMm2).toBe(2.5));
  it('18 A: 1,5 não conduz, vai para 2,5', () => expect(escolherSecao(T, 'iluminacao', 18, 127, 5).secaoMm2).toBe(2.5));
  it('17 A: 1,5 conduz mas o disjuntor de 20 A passaria do condutor, vai para 2,5', () => expect(escolherSecao(T, 'iluminacao', 17, 127, 5).secaoMm2).toBe(2.5));
  it('a queda de tensão sobe a seção: 15 A a 40 m exige 6 mm2', () => expect(escolherSecao(T, 'iluminacao', 15, 127, 40).secaoMm2).toBe(6));
  it('sem comprimento a queda não é verificada: 15 A fica em 1,5', () => expect(escolherSecao(T, 'iluminacao', 15, 127, null).secaoMm2).toBe(1.5));
  it('corrente acima de toda a tabela: nenhuma, motivo corrente', () => expect(escolherSecao(T, 'iluminacao', 200, 127, 5)).toEqual({ secaoMm2: null, motivo: 'corrente' }));
  it('só a queda falha: motivo queda', () => expect(escolherSecao(T, 'iluminacao', 50, 127, 200)).toEqual({ secaoMm2: null, motivo: 'queda' }));
  it('tabela sem seções: sem_tabela', () => expect(escolherSecao({ ...T, secoes: [] }, 'iluminacao', 5, 127, 5).motivo).toBe('sem_tabela'));
});

describe('dimensionarCircuito', () => {
  it('2540 VA a 127 V (20 A), 10 m: 2,5 mm2, disjuntor 20 A, queda 2,83 %', () => {
    const r = dimensionarCircuito(base, T);
    expect(r.correnteA).toBeCloseTo(20, 9);
    expect([r.secaoMm2, r.disjuntorA, r.capacidadeA]).toEqual([2.5, 20, 24]);
    expect(r.quedaPct).toBeCloseTo(2.8346, 4);
    expect([r.sobrecarregado, r.quedaExcedida]).toEqual([false, false]);
  });
  it('devolve as entradas e a tabela usada, com o estado CONFERIR', () => {
    const r = dimensionarCircuito(base, T);
    expect(r.entrada).toBe(base);
    expect(r.tabela).toBe(T);
    expect(r.estadoTabelas).toBe('CONFERIR');
  });
  it('fator de demanda da tabela reduz a potência: 0,5 sobre 2540 VA dá 1270 VA e 10 A', () => {
    const t = mesclarTabelas(T, { fatorDemanda: { ...T.fatorDemanda, iluminacao: 0.5 } });
    const r = dimensionarCircuito(base, t);
    expect([r.potenciaAplicadaVA, r.correnteA]).toEqual([1270, 10]);
    expect(r.disjuntorA).toBe(10);
  });
  it('fp do circuito: 1000 VA, fp 0,8: 800 W e 7,874 A', () => {
    const r = dimensionarCircuito({ ...base, totalVA: 1000, fp: 0.8 }, T);
    expect(r.potenciaAtivaW).toBeCloseTo(800, 9);
    expect(r.correnteA).toBeCloseTo(7.874, 3);
  });
  it('fp ausente usa o padrão da tabela', () => {
    const t = mesclarTabelas(T, { fatorPotenciaPadrao: 0.5 });
    expect(dimensionarCircuito({ ...base, totalVA: 1000 }, t).fp).toBe(0.5);
  });
  it('seção adotada pequena demais: sobrecarregado', () => expect(dimensionarCircuito({ ...base, secaoAdotadaMm2: 1.5 }, T).sobrecarregado).toBe(true));
  it('disjuntor adotado abaixo da corrente: sobrecarregado', () => expect(dimensionarCircuito({ ...base, disjuntorAdotadoA: 16 }, T).sobrecarregado).toBe(true));
  it('seção adotada fora da tabela: aviso e sobrecarregado', () => {
    const r = dimensionarCircuito({ ...base, secaoAdotadaMm2: 3 }, T);
    expect(r.sobrecarregado).toBe(true);
    expect(r.avisos.join(' ')).toContain('não está na tabela');
  });
  it('sem comprimento: aviso, queda nula, nada inventado', () => {
    const r = dimensionarCircuito({ ...base, comprimentoM: null }, T);
    expect(r.quedaPct).toBeNull();
    expect(r.comprimentoM).toBeNull();
    expect(r.avisos.join(' ')).toContain('Sem comprimento');
  });
  it('queda acima do limite com seção adotada 1,5 a 60 m e 10 A: 14,17 %', () => {
    const r = dimensionarCircuito({ ...base, totalVA: 1270, comprimentoM: 60, secaoAdotadaMm2: 1.5 }, T);
    expect(r.quedaPct).toBeCloseTo(14.173, 3);
    expect(r.quedaExcedida).toBe(true);
  });
  it('corrente enorme: nenhuma seção serve, sobrecarregado', () => {
    const r = dimensionarCircuito({ ...base, totalVA: 40000 }, T);
    expect(r.secaoMm2).toBeNull();
    expect(r.sobrecarregado).toBe(true);
  });
  it('tensão zero: corrente não calculável, aviso e sem sobrecarga falsa', () => {
    const r = dimensionarCircuito({ ...base, tensaoV: 0 }, T);
    expect(r.correnteA).toBeNaN();
    expect(r.sobrecarregado).toBe(false);
    expect(r.avisos.join(' ')).toContain('não calculável');
  });
  it('circuito sem carga: corrente 0 e o menor disjuntor da lista', () => {
    const r = dimensionarCircuito({ ...base, totalVA: 0 }, T);
    expect([r.correnteA, r.disjuntorA, r.secaoMm2]).toEqual([0, 6, 1.5]);
  });
  it('tabela editada muda o resultado: capacidade de 2,5 mm2 em 19 A empurra 20 A para 4 mm2', () => {
    const t = mesclarTabelas(T, { capacidadeA: { '2.5': 19 } });
    expect(dimensionarCircuito(base, t).secaoMm2).toBe(4);
  });
});
