import type { Perfil } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import type { PerfilResolvido } from './corposTipos.ts';
import { resolverPerfil } from './corposPerfil.ts';

/** Fórmula em mm que é só um número (as fórmulas reais do texto passam pelo resolvedor da família). */
const mm = (expr: string): number => Number(expr);

function resolvido(perfil: Perfil): PerfilResolvido {
  const r = resolverPerfil(perfil, mm);
  if (!r.ok) throw new Error(r.erro);
  return r.perfil;
}

function erroDe(perfil: Perfil): string {
  const r = resolverPerfil(perfil, mm);
  if (r.ok) throw new Error('esperava erro e o perfil resolveu');
  return r.erro;
}

/** Área de um laço achatado `[u0, v0, u1, v1, …]` pela fórmula de shoelace; positiva no anti-horário. */
function areaLaco(f: number[]): number {
  const n = f.length / 2;
  let soma = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    soma += (f[2 * i] ?? 0) * (f[2 * j + 1] ?? 0) - (f[2 * j] ?? 0) * (f[2 * i + 1] ?? 0);
  }
  return soma / 2;
}

/** Área líquida da seção: externo menos furos (furos horários entram com sinal negativo). */
function areaLiquida(p: PerfilResolvido): number {
  return areaLaco(p.externo) + p.furos.reduce((s, f) => s + areaLaco(f), 0);
}

describe('resolverPerfil: círculo e anel', () => {
  it('círculo de 64 lados tem a área 32·r²·sin(2π/64) (exata a 1e-9)', () => {
    const p = resolvido({ tipo: 'circulo', diametro: '100', segmentos: '64' });
    const r = 0.05;
    expect(areaLiquida(p)).toBeCloseTo(32 * r * r * Math.sin((2 * Math.PI) / 64), 9);
  });

  it('círculo sem segmentos usa 32 lados, começa em (r, 0) e segue anti-horário', () => {
    const p = resolvido({ tipo: 'circulo', diametro: '100' });
    expect(p.externo).toHaveLength(64);
    expect(p.externo[0]).toBeCloseTo(0.05, 12);
    expect(p.externo[1]).toBeCloseTo(0, 12);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
  });

  it('círculo com segmentos fora de 8..128 é recusado', () => {
    expect(erroDe({ tipo: 'circulo', diametro: '100', segmentos: '4' })).toBe(
      'perfil: segmentos deve estar entre 8 e 128',
    );
  });

  it('círculo com diâmetro zero é recusado com a mensagem fixa', () => {
    expect(erroDe({ tipo: 'circulo', diametro: '0' })).toBe('perfil: medida deve ser maior que zero');
  });

  it('anel: área = (externo − interno) pela fórmula do polígono de 64 lados', () => {
    const p = resolvido({ tipo: 'anel', diametroExterno: '100', diametroInterno: '60', segmentos: '64' });
    expect(areaLiquida(p)).toBeCloseTo(32 * (0.05 ** 2 - 0.03 ** 2) * Math.sin((2 * Math.PI) / 64), 9);
  });

  it('anel: externo anti-horário e furo horário', () => {
    const p = resolvido({ tipo: 'anel', diametroExterno: '100', diametroInterno: '60' });
    expect(p.furos).toHaveLength(1);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
    expect(areaLaco(p.furos[0] ?? [])).toBeLessThan(0);
  });

  it('anel com diâmetro interno não menor que o externo é recusado', () => {
    expect(erroDe({ tipo: 'anel', diametroExterno: '60', diametroInterno: '100' })).toBe(
      'perfil: diâmetro interno precisa ser menor que o externo',
    );
  });
});

describe('resolverPerfil: retângulos', () => {
  it('retângulo 100 × 50 tem área 5000 mm² e é anti-horário', () => {
    const p = resolvido({ tipo: 'retangulo', largura: '100', altura: '50' });
    expect(areaLiquida(p)).toBeCloseTo(0.005, 9);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
    expect(p.furos).toEqual([]);
  });

  it('retângulo com raio de 10 mm perde os cantos (≈ 4·r²·(1 − π/4), tolerância 0,5 %)', () => {
    const p = resolvido({ tipo: 'retangulo', largura: '100', altura: '50', raio: '10' });
    const esperada = 0.005 - 4 * 0.01 ** 2 * (1 - Math.PI / 4);
    expect(Math.abs(areaLiquida(p) - esperada) / esperada).toBeLessThan(0.005);
  });

  it('retângulo com raio maior que metade do menor lado é recusado', () => {
    expect(erroDe({ tipo: 'retangulo', largura: '100', altura: '50', raio: '30' })).toBe(
      'perfil: raio de canto maior que metade do menor lado',
    );
  });

  it('retângulo oco 100 × 50, espessura 5: área 1400 mm² exata (N6)', () => {
    const p = resolvido({ tipo: 'retanguloOco', largura: '100', altura: '50', espessura: '5' });
    expect(areaLiquida(p)).toBeCloseTo(0.0014, 9);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
    expect(p.furos).toHaveLength(1);
    expect(areaLaco(p.furos[0] ?? [])).toBeLessThan(0);
  });

  it('retângulo oco com espessura que come a seção é recusado', () => {
    expect(erroDe({ tipo: 'retanguloOco', largura: '100', altura: '50', espessura: '25' })).toBe(
      'perfil: espessura precisa ser menor que metade do menor lado',
    );
  });
});

describe('resolverPerfil: polígono', () => {
  it('triângulo (0,0),(100,0),(0,100) tem área 5000 mm²', () => {
    const p = resolvido({ tipo: 'poligono', pontos: [['0', '0'], ['100', '0'], ['0', '100']] });
    expect(areaLiquida(p)).toBeCloseTo(0.005, 9);
  });

  it('polígono horário é invertido para anti-horário', () => {
    const p = resolvido({ tipo: 'poligono', pontos: [['0', '0'], ['0', '100'], ['100', '0']] });
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
    expect(areaLiquida(p)).toBeCloseTo(0.005, 9);
  });

  it('polígono que se cruza a si mesmo é recusado', () => {
    expect(
      erroDe({ tipo: 'poligono', pontos: [['0', '0'], ['100', '100'], ['100', '0'], ['0', '100']] }),
    ).toBe('perfil: polígono se cruza a si mesmo');
  });

  it('polígono com menos de 3 pontos é recusado', () => {
    expect(erroDe({ tipo: 'poligono', pontos: [['0', '0'], ['100', '0']] })).toBe(
      'perfil: polígono precisa de pelo menos 3 pontos',
    );
  });

  it('polígono de pontos colineares (sem área) é recusado', () => {
    expect(erroDe({ tipo: 'poligono', pontos: [['0', '0'], ['50', '0'], ['100', '0']] })).toBe(
      'perfil: polígono sem área',
    );
  });

  it('polígono com mais pontos que o limite é recusado', () => {
    const pontos = Array.from({ length: 257 }, (_, i): [string, string] => [String(i), String(i % 2)]);
    expect(erroDe({ tipo: 'poligono', pontos })).toBe('perfil: polígono aceita no máximo 256 pontos');
  });
});

describe('resolverPerfil: I, U, L e T', () => {
  it('perfil I (h 200, b 100, tw 6, tf 10): área 3080 mm² exata (N5)', () => {
    const p = resolvido({ tipo: 'perfilI', altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' });
    expect(areaLiquida(p)).toBeCloseTo(0.00308, 9);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
    expect(p.furos).toEqual([]);
  });

  it('perfil U com as mesmas medidas do I: área h·tw + 2·(b − tw)·tf = 3080 mm²', () => {
    const p = resolvido({ tipo: 'perfilU', altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' });
    expect(areaLiquida(p)).toBeCloseTo(0.00308, 9);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
  });

  it('perfil L (aba 100 × 50, espessura 5): área 725 mm² e anti-horário', () => {
    const p = resolvido({ tipo: 'perfilL', abaA: '100', abaB: '50', esp: '5' });
    expect(areaLiquida(p)).toBeCloseTo(0.000725, 9);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
  });

  it('perfil T (altura 200, largura 100, alma 6, mesa 10): área 2140 mm²', () => {
    const p = resolvido({ tipo: 'perfilT', altura: '200', largura: '100', almaEsp: '6', mesaEsp: '10' });
    expect(areaLiquida(p)).toBeCloseTo(0.00214, 9);
    expect(areaLaco(p.externo)).toBeGreaterThan(0);
  });

  it('perfil I com mesa que ocupa a altura toda é recusado', () => {
    expect(erroDe({ tipo: 'perfilI', altura: '200', largura: '100', almaEsp: '6', mesaEsp: '100' })).toBe(
      'perfil: mesa precisa caber na altura (2 × mesaEsp < altura)',
    );
  });

  it('perfil L com espessura maior que uma aba é recusado', () => {
    expect(erroDe({ tipo: 'perfilL', abaA: '100', abaB: '50', esp: '60' })).toBe(
      'perfil: espessura precisa ser menor que as duas abas',
    );
  });
});

describe('resolverPerfil: fórmulas e erros', () => {
  it('usa o avaliar injetado para cada medida', () => {
    const env: Record<string, number> = { D: 100 };
    const r = resolverPerfil({ tipo: 'circulo', diametro: 'D', segmentos: '64' }, (e) => env[e] ?? Number(e));
    expect(r.ok).toBe(true);
  });

  it('fórmula que lança vira erro, sem exceção', () => {
    const r = resolverPerfil(
      { tipo: 'circulo', diametro: 'x' },
      () => {
        throw new Error('fórmula ruim');
      },
    );
    expect(r).toEqual({ ok: false, erro: 'perfil: medida inválida (a fórmula não resolve para um número)' });
  });

  it('fórmula que não dá número finito vira erro', () => {
    expect(erroDe({ tipo: 'retangulo', largura: 'x', altura: '50' })).toBe(
      'perfil: medida inválida (a fórmula não resolve para um número)',
    );
  });
});
