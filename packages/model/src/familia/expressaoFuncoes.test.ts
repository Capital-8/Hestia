import { describe, expect, it } from 'vitest';
import { tentar } from './expressao.ts';
import { validarParametros } from './validarParametros.ts';
import type { Familia } from './tipos.ts';

const v = (src: string, env: Record<string, number | string | boolean> = {}): unknown => {
  const r = tentar(src, env);
  if (!r.ok) throw r.erro;
  return r.valor;
};
const erro = (src: string, env: Record<string, number | string | boolean> = {}): string => {
  const r = tentar(src, env);
  if (r.ok) throw new Error(`esperava erro em “${src}”, veio ${String(r.valor)}`);
  return r.erro.message;
};

describe('fórmulas: trigonometria em graus (A1)', () => {
  it('N10 do CONTRATO', () => {
    expect(v('sin(30)')).toBeCloseTo(0.5, 12);
    expect(v('atan2(1,1)')).toBeCloseTo(45, 12);
    expect(v('pow(2,10)')).toBe(1024);
    expect(v('busca(75, 50,60, 75,75, 100,110)')).toBe(75);
    expect(v('PI')).toBeCloseTo(3.14159265358979, 12);
  });
  it('seno, cosseno e tangente recebem graus', () => {
    expect(v('sin(0)')).toBe(0);
    expect(v('cos(60)')).toBeCloseTo(0.5, 12);
    expect(v('tan(45)')).toBeCloseTo(1, 12);
  });
  it('arco-funções devolvem graus', () => {
    expect(v('acos(0)')).toBeCloseTo(90, 12);
    expect(v('asin(1)')).toBeCloseTo(90, 12);
    expect(v('atan(1)')).toBeCloseTo(45, 12);
    expect(v('atan2(1,0)')).toBeCloseTo(90, 12);
  });
  it('asin e acos fora de [-1, 1] devolvem erro em português, sem lançar', () => {
    expect(erro('asin(2)')).toContain('asin');
    expect(erro('acos(-1.5)')).toContain('acos');
  });
  it('aridade errada é erro de compilação', () => {
    expect(erro('sin()')).toContain('espera');
    expect(erro('atan2(1)')).toContain('espera');
    expect(erro('pow(2, 3, 4)')).toContain('espera');
  });
  it('pow com resultado não finito devolve erro', () => {
    expect(erro('pow(10, 400)')).toContain('finito');
  });
});

describe('fórmulas: busca (A1)', () => {
  it('chave exata, sem padrão: pega o primeiro par que casa', () => {
    expect(v('busca(2, 1,10, 2,20, 2,30)')).toBe(20);
  });
  it('número ímpar depois da chave: o último é o padrão', () => {
    expect(v('busca(9, 1,10, 2,20, 99)')).toBe(99);
    expect(v('busca(2, 1,10, 2,20, 99)')).toBe(20);
    expect(v('busca(75, 50)')).toBe(50);
  });
  it('chave inexistente e sem padrão é erro', () => {
    expect(erro('busca(9, 1,10, 2,20)')).toBe('busca: chave sem valor');
  });
  it('só a chave, sem nenhum par nem padrão, é erro', () => {
    expect(erro('busca(9)')).toBe('busca: chave sem valor');
  });
  it('argumento ausente (sem chave) é erro de aridade', () => {
    expect(erro('busca()')).toContain('espera');
  });
  it('usa a chave vinda de parâmetro', () => {
    expect(v('busca(L, 800,1, 600,2, 0)', { L: 600 })).toBe(2);
  });
});

describe('fórmulas: PI (A1)', () => {
  it('PI vale Math.PI e entra em contas', () => {
    expect(v('PI * 2')).toBeCloseTo(Math.PI * 2, 15);
  });
});

describe('validação de parâmetros (A1)', () => {
  const familiaCom = (parametros: unknown[]): Familia => ({ parametros, pecas: [] }) as unknown as Familia;

  it('recusa PI como id de parâmetro', () => {
    const problemas = validarParametros(familiaCom([{ id: 'PI', nome: 'x', tipo: 'numero', escopo: 'instancia', padrao: 0 }]));
    expect(problemas.some((p) => p.codigo === 'id_invalido' && p.onde === 'parametro:PI')).toBe(true);
  });
  it('aceita o tipo angulo com padrão numérico e faixa', () => {
    const problemas = validarParametros(familiaCom([{ id: 'ang', nome: 'Ângulo', tipo: 'angulo', escopo: 'instancia', padrao: 45, min: 0, max: 90 }]));
    expect(problemas).toEqual([]);
  });
  it('angulo com padrão fora da faixa é recusado', () => {
    const problemas = validarParametros(familiaCom([{ id: 'ang', nome: 'Ângulo', tipo: 'angulo', escopo: 'instancia', padrao: 120, min: 0, max: 90 }]));
    expect(problemas.some((p) => p.codigo === 'faixa')).toBe(true);
  });
});
