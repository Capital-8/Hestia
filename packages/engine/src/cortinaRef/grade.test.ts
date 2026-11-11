import { describe, expect, it } from 'vitest';
import { eixoEfetivo, linhasDoEixo } from './grade.ts';
import { CURTAIN_MIN_REMAINDER, TOL_SOLDA, type GridAxisSpec } from './tipos.ts';

const L = (A: number, s: GridAxisSpec): number[] => linhasDoEixo(A, s).linhas;
const perto = (a: number[], b: number[]): void => {
  expect(a.length, `${JSON.stringify(a)} vs ${JSON.stringify(b)}`).toBe(b.length);
  b.forEach((v, i) => expect(a[i]).toBeCloseTo(v, 9));
};

describe('cortinaRef/grade: fixedNumber', () => {
  it('n células iguais', () => perto(L(6, { mode: 'fixedNumber', count: 4 }), [1.5, 3, 4.5]));
  it('count = 1: nenhuma linha interna, uma célula', () => {
    const r = linhasDoEixo(4, { mode: 'fixedNumber', count: 1 });
    expect(r.linhas).toEqual([]);
    expect(r.n).toBe(1);
    expect(r.bordas).toEqual([0, 4]);
  });
  it('count inválido é ENTRADA', () => {
    for (const count of [0, -2, 1.5, undefined]) expect(() => L(4, { mode: 'fixedNumber', count })).toThrow('ENTRADA');
  });
  it('offset desloca o padrão inteiro: a linha k=0 entra e a k=n sai', () => perto(L(6, { mode: 'fixedNumber', count: 4, offset: 0.5 }), [0.5, 2, 3.5, 5]));
  it('offset negativo: a linha k=n entra e a k=0 sai', () => perto(L(6, { mode: 'fixedNumber', count: 4, offset: -0.3 }), [1.2, 2.7, 4.2, 5.7]));
  it('offset maior que o vão: todas as linhas somem', () => expect(L(6, { mode: 'fixedNumber', count: 4, offset: 20 })).toEqual([]));
  it('offset que deixa ponta menor que a sobra: a ponta é fundida', () => {
    perto(L(6, { mode: 'fixedNumber', count: 4, offset: 0.03 }), [1.53, 3.03, 4.53]);
  });
  it('sem offset NÃO funde (o número de células é o pedido, mesmo pequenas)', () => {
    expect(L(0.1, { mode: 'fixedNumber', count: 5 })).toHaveLength(4);
  });
});

describe('cortinaRef/grade: maxDistance', () => {
  it('n = ceil(A / d), células iguais', () => perto(L(5, { mode: 'maxDistance', distance: 1.2 }), [1, 2, 3, 4]));
  it('divisível exato não ganha célula extra (ruído de ponto flutuante)', () => {
    perto(L(3, { mode: 'maxDistance', distance: 1.5 }), [1.5]);
    perto(L(0.3, { mode: 'maxDistance', distance: 0.1 }), [0.1, 0.2]);
  });
  it('d maior que L: uma célula só', () => expect(L(1, { mode: 'maxDistance', distance: 4 })).toEqual([]));
  it('d inválido é ENTRADA', () => {
    for (const distance of [0, -1, undefined]) expect(() => L(4, { mode: 'maxDistance', distance })).toThrow('ENTRADA');
  });
  it('nenhuma célula passa de d', () => {
    const b = linhasDoEixo(7.3, { mode: 'maxDistance', distance: 1.1 }).bordas;
    for (let i = 0; i + 1 < b.length; i++) expect(b[i + 1]! - b[i]!).toBeLessThanOrEqual(1.1 + 1e-9);
  });
});

describe('cortinaRef/grade: fixedDistance', () => {
  it('start: células cheias a partir do início, sobra no fim', () => perto(L(5, { mode: 'fixedDistance', distance: 1.2 }), [1.2, 2.4, 3.6, 4.8]));
  it('end: espelho, sobra no início', () => perto(L(5, { mode: 'fixedDistance', distance: 1.2, justify: 'end' }), [0.2, 1.4, 2.6, 3.8]));
  it('center: sobra repartida nas duas pontas', () => perto(L(5, { mode: 'fixedDistance', distance: 1.2, justify: 'center' }), [0.1, 1.3, 2.5, 3.7, 4.9]));
  it('d >= L: uma célula só, em qualquer justificação', () => {
    for (const justify of ['start', 'center', 'end'] as const) {
      expect(L(3, { mode: 'fixedDistance', distance: 5, justify })).toEqual([]);
      expect(L(3, { mode: 'fixedDistance', distance: 3, justify })).toEqual([]); // d == L: a linha cairia na borda
    }
  });
  it('d > L com offset: sem célula cheia, o offset não cria linha', () => expect(L(3, { mode: 'fixedDistance', distance: 5, offset: 1 })).toEqual([]));
  it('sobra minúscula (< 0,05) é fundida à célula de ponta', () => {
    const r = linhasDoEixo(3.02, { mode: 'fixedDistance', distance: 1 });
    perto(r.linhas, [1, 2]);
    expect(r.bordas[3]! - r.bordas[2]!).toBeCloseTo(1.02, 9);
  });
  it('sobra no limiar (= 0,05) vira célula própria', () => perto(L(3.05, { mode: 'fixedDistance', distance: 1 }), [1, 2, 3]));
  it('sobra logo acima do limiar vira célula própria', () => perto(L(3.0501, { mode: 'fixedDistance', distance: 1 }), [1, 2, 3]));
  it('end: a sobra minúscula no início é fundida', () => perto(L(3.02, { mode: 'fixedDistance', distance: 1, justify: 'end' }), [1.02, 2.02]));
  it('center: as duas meias-sobras minúsculas são fundidas', () => perto(L(3.04, { mode: 'fixedDistance', distance: 1, justify: 'center' }), [1.02, 2.02]));
  it('center: R/2 acima do limiar mantém as duas pontas', () => {
    const b = linhasDoEixo(3.2, { mode: 'fixedDistance', distance: 1, justify: 'center' }).bordas;
    perto(b, [0, 0.1, 1.1, 2.1, 3.1, 3.2]);
  });
  it('minRemainder configurável: maior funde mais', () => {
    perto(L(3.15, { mode: 'fixedDistance', distance: 1, minRemainder: 0.2 }), [1, 2]);
    perto(L(3.15, { mode: 'fixedDistance', distance: 1 }), [1, 2, 3]);
  });
  it('minRemainder 0: nada é fundido, a sobra minúscula vira célula', () => perto(L(3.02, { mode: 'fixedDistance', distance: 1, minRemainder: 0 }), [1, 2, 3]));
  it('sobra menor que a soldagem (1e-6) nem vira célula nem linha', () => perto(L(3 + 5e-7, { mode: 'fixedDistance', distance: 1 }), [1, 2]));
  it('ruído de ponto flutuante na razão A/d não perde a última célula cheia', () => perto(L(0.3, { mode: 'fixedDistance', distance: 0.1 }), [0.1, 0.2]));
  it('offset: o padrão periódico desliza e a ponta minúscula é fundida', () => {
    perto(L(5, { mode: 'fixedDistance', distance: 1.2, offset: 0.3 }), [0.3, 1.5, 2.7, 3.9]);
    perto(L(5, { mode: 'fixedDistance', distance: 1.2, offset: -0.4 }), [0.8, 2, 3.2, 4.4]);
    perto(L(5, { mode: 'fixedDistance', distance: 1.2, offset: 0.03 }), [1.23, 2.43, 3.63, 4.83]);
  });
  it('offset de um período inteiro reproduz o padrão', () => {
    perto(L(5, { mode: 'fixedDistance', distance: 1.2, offset: 1.2 }), L(5, { mode: 'fixedDistance', distance: 1.2 }));
    perto(L(5, { mode: 'fixedDistance', distance: 1.2, offset: -2.4 }), L(5, { mode: 'fixedDistance', distance: 1.2 }));
  });
  it('aviso de sobra fundida só quando a célula resultante passa de 1,5 d', () => {
    expect(linhasDoEixo(3.02, { mode: 'fixedDistance', distance: 1 }).avisos).toEqual([]);
    const r = linhasDoEixo(0.08, { mode: 'fixedDistance', distance: 0.03 });
    expect(r.linhas).toEqual([]); // as duas pontas minúsculas se fundem: uma célula só
    expect(r.avisos.map((a) => a.codigo)).toEqual(['sobra-fundida', 'sobra-fundida']);
    expect(r.avisos[0]!.limite).toBeCloseTo(0.045, 12);
  });
  it('d inválido é ENTRADA', () => {
    for (const distance of [0, -1, NaN, undefined]) expect(() => L(4, { mode: 'fixedDistance', distance })).toThrow('ENTRADA');
  });
});

describe('cortinaRef/grade: manual', () => {
  it('posições a partir do início, as de fora são ignoradas com aviso', () => {
    const r = linhasDoEixo(3, { mode: 'manual', positions: [2, 10, 0, 3] });
    perto(r.linhas, [2]);
    expect(r.avisos.map((a) => [a.codigo, a.indice])).toEqual([['posicao-fora', 1], ['posicao-fora', 2], ['posicao-fora', 3]]);
  });
  it('âncora no fim mede de trás para frente e ordena', () => perto(L(6, { mode: 'manual', positions: [1, 2.5], anchor: 'end' }), [3.5, 5]));
  it('duas posições a menos de 1e-6 viram uma (e iguais também)', () => {
    perto(L(6, { mode: 'manual', positions: [1, 1.0000005, 2, 2, 3] }), [1, 2, 3]);
    expect(L(6, { mode: 'manual', positions: [1, 1 + 2e-6] })).toHaveLength(2);
  });
  it('posição desordenada é aceita (ordena)', () => perto(L(6, { mode: 'manual', positions: [4, 1, 2] }), [1, 2, 4]));
  it('vazio: uma célula', () => expect(L(6, { mode: 'manual', positions: [] })).toEqual([]));
  it('offset desloca as posições; fora do vão sai com aviso; manual NUNCA funde sobra', () => {
    perto(L(6, { mode: 'manual', positions: [1, 2], offset: 0.5 }), [1.5, 2.5]);
    perto(L(6, { mode: 'manual', positions: [0.01, 2], offset: 0.02 }), [0.03, 2.02]);
  });
  it('sem positions é ENTRADA', () => expect(() => L(6, { mode: 'manual' })).toThrow('ENTRADA'));
});

describe('cortinaRef/grade: entrada', () => {
  it('comprimento do eixo não positivo ou infinito é ENTRADA', () => {
    for (const A of [0, -1, NaN, Infinity]) expect(() => L(A, { mode: 'fixedNumber', count: 2 })).toThrow('ENTRADA');
  });
  it('ângulo diferente de 0 é ENTRADA até a fase 7', () => expect(() => L(4, { mode: 'fixedNumber', count: 2, angle: 0.1 })).toThrow('ENTRADA'));
  it('eixo efetivo: a instância sobrescreve campo a campo e undefined herda', () => {
    const tipo: GridAxisSpec = { mode: 'fixedDistance', distance: 1.5, justify: 'center' };
    expect(eixoEfetivo(tipo, { distance: 2 })).toEqual({ mode: 'fixedDistance', distance: 2, justify: 'center' });
    expect(eixoEfetivo(tipo, { distance: undefined })).toEqual(tipo);
    expect(eixoEfetivo(tipo)).toEqual(tipo);
  });
  it('o padrão da sobra é o do ADR', () => expect(CURTAIN_MIN_REMAINDER).toBe(0.05));
});

// ───── propriedades com semente ─────
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('cortinaRef/grade: propriedades (200 casos com semente)', () => {
  const rand = rng(56);
  const modos: GridAxisSpec['mode'][] = ['fixedNumber', 'fixedDistance', 'maxDistance', 'manual'];
  const justs = ['start', 'center', 'end'] as const;
  for (let c = 0; c < 200; c++) {
    const A = 0.2 + rand() * 12;
    const modo = modos[Math.floor(rand() * 4)]!;
    const spec: GridAxisSpec = { mode: modo };
    if (modo === 'fixedNumber') spec.count = 1 + Math.floor(rand() * 9);
    if (modo === 'fixedDistance' || modo === 'maxDistance') spec.distance = 0.1 + rand() * 3;
    if (modo === 'fixedDistance') spec.justify = justs[Math.floor(rand() * 3)]!;
    if (modo === 'manual') spec.positions = Array.from({ length: Math.floor(rand() * 6) }, () => rand() * A * 1.2);
    if (rand() < 0.3) spec.offset = (rand() - 0.5) * A;
    it(`caso ${c} ${modo}`, () => {
      const r = linhasDoEixo(A, spec);
      // estritamente crescentes, dentro do vão, separadas ao menos pela soldagem
      let ant = 0;
      for (const p of r.linhas) {
        expect(p).toBeGreaterThan(ant + TOL_SOLDA - 1e-12);
        ant = p;
      }
      expect(A - ant).toBeGreaterThan(TOL_SOLDA - 1e-12);
      // as células cobrem o eixo sem fresta
      expect(r.n).toBe(r.linhas.length + 1);
      let soma = 0;
      for (let i = 0; i + 1 < r.bordas.length; i++) soma += r.bordas[i + 1]! - r.bordas[i]!;
      expect(soma).toBeCloseTo(A, 9);
      // fixedDistance: as células de dentro medem d (sem offset) e as pontas nunca ficam abaixo da sobra
      if (modo === 'fixedDistance' && spec.offset === undefined) {
        const b = r.bordas;
        for (let i = 1; i + 2 < b.length; i++) expect(b[i + 1]! - b[i]!).toBeCloseTo(spec.distance as number, 9);
        if (b.length > 2) {
          expect(b[1]! - b[0]!).toBeGreaterThanOrEqual(CURTAIN_MIN_REMAINDER - 1e-9);
          expect(b[b.length - 1]! - b[b.length - 2]!).toBeGreaterThanOrEqual(CURTAIN_MIN_REMAINDER - 1e-9);
        }
        // espelho: 'end' é o 'start' visto de trás
        if (spec.justify === 'start') {
          const fim = linhasDoEixo(A, { ...spec, justify: 'end' }).linhas;
          const esp = r.linhas.map((p) => A - p).reverse();
          expect(fim.length).toBe(esp.length);
          fim.forEach((p, i) => expect(p).toBeCloseTo(esp[i]!, 9));
        }
        // 'center' é simétrico
        if (spec.justify === 'center') r.linhas.forEach((p, i) => expect(p).toBeCloseTo(A - r.linhas[r.linhas.length - 1 - i]!, 9));
      }
      // fixedNumber e maxDistance sem offset: células iguais
      if ((modo === 'fixedNumber' || modo === 'maxDistance') && spec.offset === undefined) {
        const b = r.bordas;
        for (let i = 0; i + 1 < b.length; i++) expect(b[i + 1]! - b[i]!).toBeCloseTo(A / r.n, 9);
      }
    });
  }
});
