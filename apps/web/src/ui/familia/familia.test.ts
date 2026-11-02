import { describe, expect, it } from 'vitest';
import { compile, LIMITE_FORMULA } from './expressao.ts';
import { PECAS_INICIAIS, TIPOS } from './familiaModelo.ts';
import { quantitativos, resolverFamilia, validar } from './resolver.ts';

describe('expressões das famílias', () => {
  it('avalia aritmética, comparação, ternário e funções', () => {
    expect(compile('2 + 3 * 4')({})).toBe(14);
    expect(compile('L > 500 ? 1 : 2')({ L: 800 })).toBe(1);
    expect(compile('fundo == "pregado" ? 6 : 0')({ fundo: 'pregado' })).toBe(6);
    expect(compile('max(1, min(5, 9)) + clamp(20, 0, 10)')({})).toBe(15);
    expect(compile('corpo.esp * 2')({ 'corpo.esp': 18 })).toBe(36);
  });
  it('recusa entrada ruim com mensagem, sem lançar nada além de Error', () => {
    expect(() => compile('1 +')).toThrow();
    expect(() => compile('foo(1)')).toThrow(/desconhecida/);
    expect(() => compile('1 $ 2')).toThrow(/inesperado/);
    expect(() => compile('x'.repeat(LIMITE_FORMULA + 1))).toThrow(/passa de/);
    expect(() => compile('(1 + 2')).toThrow();
    expect(() => compile('nome')({})).toThrow(/não existe/);
  });
  it('limita a profundidade de parênteses', () => {
    expect(() => compile('('.repeat(40) + '1' + ')'.repeat(40))).toThrow(/parênteses/);
  });
});

describe('resolução do armário baixo', () => {
  const resolve = (id: string) => resolverFamilia(TIPOS.find((t) => t.id === id)!.v, PECAS_INICIAIS);
  it('todos os tipos do exemplo resolvem sem erro e passam na validação', () => {
    for (const t of TIPOS) {
      const r = resolve(t.id);
      expect(r.erros).toEqual({});
      expect(validar(r).every((a) => a.nivel === 'ok')).toBe(true);
    }
  });
  it('é determinística e arredondada a 1 µm', () => {
    expect(resolve('A80').pecas).toEqual(resolve('A80').pecas);
    for (const p of resolve('A100').pecas) for (const v of [p.ox, p.oy, p.oz, p.ca, p.cb, p.ct]) expect(Math.abs(v * 1000 - Math.round(v * 1000))).toBeLessThan(1e-6);
  });
  it('trocar a chapa de 18 para 25 mm muda as espessuras e continua válido', () => {
    const r = resolverFamilia({ ...TIPOS[1]!.v, corpo: 25 }, PECAS_INICIAIS);
    expect(r.pecas.find((p) => p.id === 'latE')?.ct).toBe(25);
    expect(validar(r)[0]?.nivel).toBe('ok');
  });
  it('cada prateleira e cada porta repete pelo número pedido', () => {
    const r = resolverFamilia({ ...TIPOS[1]!.v, nPrat: 3, nPortas: 2 }, PECAS_INICIAIS);
    expect(r.pecas.filter((p) => p.id === 'prat')).toHaveLength(3);
    expect(r.pecas.filter((p) => p.id === 'porta')).toHaveLength(2);
    expect(resolverFamilia({ ...TIPOS[1]!.v, nPortas: 0 }, PECAS_INICIAIS).pecas.some((p) => p.id === 'porta')).toBe(false);
  });
  it('fórmula errada vira erro da peça, sem derrubar as outras', () => {
    const quebradas = PECAS_INICIAIS.map((p) => (p.id === 'base' ? { ...p, a: 'L - ' } : p));
    const r = resolverFamilia(TIPOS[1]!.v, quebradas);
    expect(r.erros['base.a']).toBeTruthy();
    expect(r.pecas.some((p) => p.id === 'latE')).toBe(true);
    expect(validar(r).some((a) => a.nivel === 'erro')).toBe(true);
  });
  it('quantitativos somam a área das peças', () => {
    const r = resolve('A80');
    const qt = quantitativos(r.pecas);
    const soma = r.pecas.reduce((s, p) => s + (p.ca * p.cb) / 1e6, 0);
    expect(qt.areaM2).toBeCloseTo(soma, 9);
    expect(Object.values(qt.porEspessura).reduce((s, v) => s + v, 0)).toBeCloseTo(soma, 9);
  });
});
