import { describe, expect, it } from 'vitest';
import { areaContorno, caixaDoContorno, CONTORNO_MAX_PONTOS, orientarAntiHorario, pontoDentro, retanguloComoContorno, validarContorno } from './contorno.ts';

const quadrado = [0, 0, 2, 0, 2, 2, 0, 2];
const ele = [0, 0, 2, 0, 2, 1, 1, 1, 1, 2, 0, 2]; // L: área 3
const reverso = (p: number[]): number[] => { const o: number[] = []; for (let i = p.length - 2; i >= 0; i -= 2) o.push(p[i]!, p[i + 1]!); return o; };

describe('areaContorno', () => {
  it('área com sinal: positiva anti-horário, negativa horário', () => {
    expect(areaContorno(quadrado)).toBeCloseTo(4, 12);
    expect(areaContorno(reverso(quadrado))).toBeCloseTo(-4, 12);
    expect(areaContorno(ele)).toBeCloseTo(3, 12);
    expect(areaContorno([0, 0, 1, 1])).toBe(0);
    expect(areaContorno([])).toBe(0);
  });
  it('não muda com a origem (translação) e muda com escala ao quadrado', () => {
    const t = quadrado.map((v, i) => v + (i % 2 === 0 ? 5 : -3));
    expect(areaContorno(t)).toBeCloseTo(4, 12);
    expect(areaContorno(quadrado.map((v) => v * 3))).toBeCloseTo(36, 12);
  });
});

describe('validarContorno', () => {
  it('aceita polígonos simples, nos dois sentidos', () => {
    expect(validarContorno(quadrado)).toBeNull();
    expect(validarContorno(reverso(quadrado))).toBeNull();
    expect(validarContorno(ele)).toBeNull();
    expect(validarContorno(retanguloComoContorno(0.4, 0.6))).toBeNull();
  });
  it('1: pontos de menos ou lista ímpar', () => {
    expect(validarContorno([])).toBe('contorno precisa de ao menos 3 pontos');
    expect(validarContorno([0, 0, 1, 1])).toBe('contorno precisa de ao menos 3 pontos');
    expect(validarContorno([0, 0, 1, 0, 1])).toBe('contorno precisa de ao menos 3 pontos');
  });
  it('2: pontos demais', () => {
    const muitos: number[] = [];
    for (let i = 0; i <= CONTORNO_MAX_PONTOS; i++) muitos.push(Math.cos(i), Math.sin(i));
    expect(validarContorno(muitos)).toBe('contorno com pontos demais');
  });
  it('3: valor inválido', () => {
    expect(validarContorno([0, 0, Number.NaN, 0, 1, 1])).toBe('contorno com valor inválido');
    expect(validarContorno([0, 0, 1, 0, Number.POSITIVE_INFINITY, 1])).toBe('contorno com valor inválido');
  });
  it('4: pontos repetidos, inclusive último = primeiro', () => {
    expect(validarContorno([0, 0, 1, 0, 1, 0, 1, 1])).toBe('contorno com pontos repetidos');
    expect(validarContorno([0, 0, 1, 0, 1, 1, 0, 0])).toBe('contorno com pontos repetidos');
  });
  it('5: sem área (colinear)', () => {
    expect(validarContorno([0, 0, 1, 0, 2, 0])).toBe('contorno sem área');
    expect(validarContorno([0, 0, 1e-6, 0, 1e-6, 1e-6])).toBe('contorno sem área');
  });
  it('6: cruzamento e toque entre arestas não vizinhas', () => {
    expect(validarContorno([0, 0, 4, 0, 1, 3, 3, 3])).toBe('contorno se cruza'); // gravata com área
    expect(validarContorno([0, 0, 4, 0, 4, 4, 2, 0, 0, 4])).toBe('contorno se cruza'); // vértice sobre a aresta
    expect(validarContorno([0, 0, 2, 0, 2, 2, 1, 0, 0, 2])).toBe('contorno se cruza');
  });
  it('6: aresta vizinha colinear sobreposta também reprova', () => {
    expect(validarContorno([0, 0, 2, 0, 1, 0, 1, 1])).toBe('contorno se cruza');
  });
});

describe('orientar, retângulo e caixa', () => {
  it('orientarAntiHorario devolve cópia anti-horária e não muda a entrada', () => {
    const horario = reverso(quadrado);
    const copia = [...horario];
    const r = orientarAntiHorario(horario);
    expect(areaContorno(r)).toBeGreaterThan(0);
    expect(horario).toEqual(copia);
    expect(orientarAntiHorario(quadrado)).toEqual(quadrado);
    expect(orientarAntiHorario(quadrado)).not.toBe(quadrado);
    expect(new Set(pares(r))).toEqual(new Set(pares(quadrado)));
  });
  it('retanguloComoContorno', () => {
    expect(retanguloComoContorno(2, 3)).toEqual([0, 0, 2, 0, 2, 3, 0, 3]);
    expect(areaContorno(retanguloComoContorno(2, 3))).toBeCloseTo(6, 12);
  });
  it('caixaDoContorno', () => {
    expect(caixaDoContorno(ele)).toEqual({ u0: 0, v0: 0, u1: 2, v1: 2 });
    expect(caixaDoContorno([3, -1, 5, 2, 4, 7])).toEqual({ u0: 3, v0: -1, u1: 5, v1: 7 });
    expect(() => caixaDoContorno([])).toThrow('contorno vazio');
  });
});

describe('pontoDentro', () => {
  it('dentro, fora e borda no quadrado e no L', () => {
    expect(pontoDentro(quadrado, 1, 1)).toBe(true);
    expect(pontoDentro(quadrado, 3, 1)).toBe(false);
    expect(pontoDentro(quadrado, 0, 1)).toBe(true); // borda
    expect(pontoDentro(quadrado, 2, 2)).toBe(true); // vértice
    expect(pontoDentro(ele, 1.5, 1.5)).toBe(false); // no vão do L
    expect(pontoDentro(ele, 0.5, 1.5)).toBe(true);
    expect(pontoDentro(ele, 1.5, 0.5)).toBe(true);
  });
  it('vale nos dois sentidos de orientação (grade 21×21)', () => {
    for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) {
      const u = i / 10; const v = j / 10;
      expect(pontoDentro(reverso(ele), u, v), `${u},${v}`).toBe(pontoDentro(ele, u, v));
    }
  });
});

function pares(p: number[]): string[] { const o: string[] = []; for (let i = 0; i < p.length; i += 2) o.push(`${p[i]},${p[i + 1]}`); return o; }
