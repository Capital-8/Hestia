import { describe, expect, it } from 'vitest';
import { avaliar, compilar, ErroExpressao, imprimir, parse, referencias, tentar, type No } from './expressao.ts';
import { LIMITES } from './tipos.ts';

const v = (src: string, env: Record<string, number | string | boolean> = {}): unknown => {
  const r = tentar(src, env);
  if (!r.ok) throw r.erro;
  return r.valor;
};

describe('fórmulas: avaliação', () => {
  it('aritmética com precedência e parênteses', () => {
    expect(v('2 + 3 * 4')).toBe(14);
    expect(v('(2 + 3) * 4')).toBe(20);
    expect(v('10 - 4 - 3')).toBe(3);
    expect(v('100 / 5 / 2')).toBe(10);
    expect(v('-3 + 5')).toBe(2);
    expect(v('2 - -3')).toBe(5);
    expect(v('.5 + 1.25')).toBe(1.75);
  });
  it('comparação, lógica e condicional (direita para esquerda)', () => {
    expect(v('L > 500 && L <= 800', { L: 800 })).toBe(true);
    expect(v('L < 100 || fundo == "sem"', { L: 800, fundo: 'sem' })).toBe(true);
    expect(v('!(1 == 2)')).toBe(true);
    expect(v('x ? 1 : y ? 2 : 3', { x: false, y: true })).toBe(2);
    expect(v('fundo == "pregado" ? 6 : 0', { fundo: 'pregado' })).toBe(6);
    expect(v('fundo != "pregado" ? 6 : 0', { fundo: 'pregado' })).toBe(0);
  });
  it('funções e membro com ponto', () => {
    expect(v('max(1, min(5, 9)) + clamp(20, 0, 10)')).toBe(15);
    expect(v('round(7.4) + round(7.6) + round(13, 5)')).toBe(7 + 8 + 15);
    expect(v('floor(2.9) + ceil(2.1) + abs(-4) + sqrt(16)')).toBe(2 + 3 + 4 + 4);
    expect(v('corpo.esp * 2', { 'corpo.esp': 18 })).toBe(36);
  });
  it('só avalia o ramo escolhido (o outro pode estar quebrado)', () => {
    expect(v('ok ? 1 : 1 / 0', { ok: true })).toBe(1);
    expect(v('ok ? naoExiste : 2', { ok: false })).toBe(2);
    expect(v('a || naoExiste', { a: true })).toBe(true);
    expect(v('a && naoExiste', { a: false })).toBe(false);
  });
  it('erros de avaliação viram resultado, não exceção, e dizem o motivo', () => {
    expect(tentar('1 / 0', {})).toMatchObject({ ok: false });
    expect(tentar('x + 1', {})).toMatchObject({ ok: false, erro: { message: expect.stringContaining('não existe') } });
    expect(tentar('"a" + 1', {})).toMatchObject({ ok: false });
    expect(tentar('sqrt(-1)', {})).toMatchObject({ ok: false, erro: { message: expect.stringContaining('finito') } });
  });
});

describe('fórmulas: análise e limites', () => {
  it('recusa entrada ruim com posição', () => {
    for (const ruim of ['1 +', '(1 + 2', '1 $ 2', 'foo(1)', 'max()', 'clamp(1, 2)', '1.2.3', '"aberto', '', '   ', '1 2', 'a b']) {
      expect(() => parse(ruim), ruim).toThrow(ErroExpressao);
    }
    try { parse('1 + $'); } catch (e) { expect((e as ErroExpressao).pos).toBe(4); }
  });
  it('respeita os limites de tamanho e de parênteses', () => {
    expect(() => parse('1'.repeat(LIMITES.formula + 1))).toThrow(/passa de/);
    expect(() => parse(`${'('.repeat(LIMITES.parenteses + 1)}1${')'.repeat(LIMITES.parenteses + 1)}`)).toThrow(/parênteses/);
    expect(parse(`${'('.repeat(LIMITES.parenteses)}1${')'.repeat(LIMITES.parenteses)}`)).toEqual({ k: 'num', v: 1 });
    expect(() => parse('-'.repeat(300) + '1')).toThrow(/aninhada/);
  });
  it('referencias lista nomes sem repetir, em ordem', () => {
    expect(referencias(parse('b + a * b + corpo.esp + max(z, 1)'))).toEqual(['a', 'b', 'corpo.esp', 'z']);
    expect(referencias(parse('1 + 2'))).toEqual([]);
  });
  it('compilar usa cache e guarda o erro', () => {
    expect('no' in compilar('1 + 1')).toBe(true);
    expect(compilar('1 +')).toHaveProperty('erro');
    expect(compilar('1 + 1')).toBe(compilar('1 + 1'));
  });
});

// ── propriedades: gerador de árvores com semente fixa (sem biblioteca externa) ──
function prng(semente: number): () => number {
  let s = semente >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
function arvore(r: () => number, fundo: number): No {
  const folha = fundo <= 0 || r() < 0.25;
  if (folha) {
    const t = r();
    if (t < 0.5) return { k: 'num', v: Math.round(r() * 100000) / 1000 };
    if (t < 0.75) return { k: 'ref', nome: ['L', 'A', 'corpo.esp', 'x_1'][Math.floor(r() * 4)]! };
    return { k: 'txt', v: ['sem', 'pregado'][Math.floor(r() * 2)]! };
  }
  const t = r();
  if (t < 0.15) return { k: 'un', op: r() < 0.5 ? '-' : '!', a: arvore(r, fundo - 1) };
  if (t < 0.25) return { k: 'cond', c: arvore(r, fundo - 1), a: arvore(r, fundo - 1), b: arvore(r, fundo - 1) };
  if (t < 0.4) return { k: 'chamada', f: 'max', args: [arvore(r, fundo - 1), arvore(r, fundo - 1)] };
  const ops = ['+', '-', '*', '/', '<', '>', '<=', '>=', '==', '!=', '&&', '||'] as const;
  return { k: 'bin', op: ops[Math.floor(r() * ops.length)]!, a: arvore(r, fundo - 1), b: arvore(r, fundo - 1) };
}

describe('fórmulas: propriedades', () => {
  it('parse(imprimir(n)) devolve o mesmo nó (500 árvores)', () => {
    const r = prng(42);
    for (let i = 0; i < 500; i++) {
      const n = arvore(r, 4);
      const texto = imprimir(n);
      expect(parse(texto), texto).toEqual(n);
      expect(imprimir(parse(texto))).toBe(texto);
    }
  });
  it('avaliar é determinística e nunca lança algo que não seja ErroExpressao', () => {
    const r = prng(7);
    const env = { L: 800, A: 720, 'corpo.esp': 18, x_1: 3 };
    for (let i = 0; i < 500; i++) {
      const n = arvore(r, 4);
      let a: unknown; let b: unknown;
      try { a = avaliar(n, env); } catch (e) { expect(e).toBeInstanceOf(ErroExpressao); a = 'erro'; }
      try { b = avaliar(n, env); } catch { b = 'erro'; }
      expect(a).toEqual(b);
    }
  });
  it('soma e produto são comutativos e + - * respeitam as identidades', () => {
    const r = prng(99);
    for (let i = 0; i < 200; i++) {
      const a = Math.round(r() * 1e6) / 1e3;
      const b = Math.round(r() * 1e6) / 1e3;
      const env = { a, b };
      expect(v('a + b', env)).toBe(v('b + a', env));
      expect(v('a * b', env)).toBe(v('b * a', env));
      expect(v('a - a', env)).toBe(0);
      expect(v('a * 1 + 0', env)).toBe(a);
    }
  });
});
