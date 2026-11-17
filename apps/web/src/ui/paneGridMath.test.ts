import { describe, expect, it } from 'vitest';
import { DIVISORIA_PX, clampRatio, fracaoDoPonteiro, passoDaTecla } from './paneGridMath.ts';

describe('clampRatio', () => {
  it('mantém a fração dentro de SPLIT_LIMITS (0,15 a 0,85)', () => {
    expect(clampRatio(0.9)).toBe(0.85);
    expect(clampRatio(0.05)).toBe(0.15);
    expect(clampRatio(0.4)).toBe(0.4);
  });
  it('valor não finito vira o meio (0,5)', () => {
    expect(clampRatio(Number.NaN)).toBe(0.5);
    expect(clampRatio(Number.POSITIVE_INFINITY)).toBe(0.5);
  });
});

describe('fracaoDoPonteiro', () => {
  it('a divisória ocupa 6 px: espaço livre = extensão - 6 e o centro fica a 3 px depois do primeiro filho', () => {
    expect(DIVISORIA_PX).toBe(6);
    // origem 100, extensão 406 → livre 400; ponteiro 300 → (300 - 100 - 3) / 400 = 0,4925
    expect(fracaoDoPonteiro(300, 100, 406)).toBeCloseTo(0.4925, 10);
  });
  it('contêiner de 806 px (livre 800): centro da divisória em 403 dá 0,5 e em 503 dá 0,625', () => {
    // origem 0, extensão 806: (403 - 0 - 3) / 800 = 0,5; (503 - 0 - 3) / 800 = 0,625
    expect(fracaoDoPonteiro(403, 0, 806)).toBeCloseTo(0.5, 10);
    expect(fracaoDoPonteiro(503, 0, 806)).toBeCloseTo(0.625, 10);
  });
  it('fora da área útil é limitado pelo clamp (0,15 e 0,85)', () => {
    expect(fracaoDoPonteiro(100, 100, 406)).toBe(0.15);
    expect(fracaoDoPonteiro(900, 100, 406)).toBe(0.85);
  });
  it('sem espaço útil (extensão não maior que a divisória) ou ponteiro inválido devolve null', () => {
    expect(fracaoDoPonteiro(10, 0, 6)).toBeNull();
    expect(fracaoDoPonteiro(10, 0, 5)).toBeNull();
    expect(fracaoDoPonteiro(Number.NaN, 0, 406)).toBeNull();
  });
});

describe('passoDaTecla', () => {
  it('→ e ↓ aumentam 0,02; ← e ↑ diminuem 0,02', () => {
    expect(passoDaTecla(0.5, 'ArrowRight')).toBeCloseTo(0.52, 10);
    expect(passoDaTecla(0.5, 'ArrowDown')).toBeCloseTo(0.52, 10);
    expect(passoDaTecla(0.5, 'ArrowLeft')).toBeCloseTo(0.48, 10);
    expect(passoDaTecla(0.5, 'ArrowUp')).toBeCloseTo(0.48, 10);
  });
  it('o passo respeita o clamp', () => {
    expect(passoDaTecla(0.16, 'ArrowUp')).toBe(0.15);
    expect(passoDaTecla(0.84, 'ArrowDown')).toBe(0.85);
  });
  it('tecla que não é de divisória devolve null', () => {
    expect(passoDaTecla(0.5, 'a')).toBeNull();
    expect(passoDaTecla(0.5, 'Enter')).toBeNull();
  });
});
