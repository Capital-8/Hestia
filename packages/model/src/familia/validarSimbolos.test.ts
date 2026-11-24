import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import type { Familia } from './tipos.ts';
import type { CodigoProblema } from './validar.ts';
import { validarSimbolos } from './validarSimbolos.ts';
import { LIMITES_REPRESENTACAO, type Simbolo2D } from './tiposRepresentacao.ts';

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);

const simbolo = (id: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  nome: id,
  vistas: ['planta'],
  plano: 'xy',
  primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['L', '0'] }],
  ...extra,
});

const comSimbolos = (...lista: unknown[]): Familia => {
  const f = nova();
  f.simbolos = lista as Simbolo2D[];
  return f;
};

/** Códigos dos problemas, para asserções curtas. */
const codigos = (f: Familia): CodigoProblema[] => validarSimbolos(f).map((p) => p.codigo);

describe('validarSimbolos', () => {
  it('família sem símbolos (família antiga) não tem problema', () => {
    expect(validarSimbolos(nova())).toEqual([]);
  });

  it('um símbolo com os cinco primitivos é válido', () => {
    const f = comSimbolos(
      simbolo('cinco', {
        primitivos: [
          { tipo: 'linha', de: ['0', '0'], ate: ['L', '0'] },
          { tipo: 'circulo', centro: ['L / 2', 'P / 2'], raio: '25' },
          { tipo: 'arco', centro: ['0', '0'], raio: 'A / 4', deGraus: '0', ateGraus: '90' },
          { tipo: 'polilinha', pontos: [['0', '0'], ['10', '0'], ['10', '10']], fechada: true },
          { tipo: 'texto', posicao: ['0', '20'], texto: 'nPrat', altura: '2.5' },
        ],
      }),
    );
    expect(validarSimbolos(f)).toEqual([]);
  });

  it('id ausente e id repetido são apontados', () => {
    expect(codigos(comSimbolos(simbolo(''), simbolo('x')))).toContain('id_invalido');
    expect(codigos(comSimbolos(simbolo('x'), simbolo('x')))).toEqual(['id_duplicado']);
  });

  it('limite de símbolos e de primitivos da família', () => {
    const muitos = Array.from({ length: LIMITES_REPRESENTACAO.simbolos + 1 }, (_, k) => simbolo(`s${k}`));
    expect(codigos(comSimbolos(...muitos))).toContain('limite');

    const primitivo = { tipo: 'linha', de: ['0', '0'], ate: ['1', '0'] };
    const cheios = Array.from({ length: 5 }, (_, k) => simbolo(`p${k}`, { primitivos: Array.from({ length: 52 }, () => primitivo) }));
    expect(cheios.length * 52).toBeGreaterThan(LIMITES_REPRESENTACAO.primitivos);
    expect(codigos(comSimbolos(...cheios))).toEqual(['limite']);
  });

  it('vistas e plano conhecidos; lista de vistas vazia é faixa', () => {
    expect(codigos(comSimbolos(simbolo('a', { vistas: ['meio'] })))).toEqual(['tipo']);
    expect(codigos(comSimbolos(simbolo('a', { plano: 'ab' })))).toEqual(['tipo']);
    expect(codigos(comSimbolos(simbolo('a', { vistas: [] })))).toEqual(['faixa']);
  });

  it('símbolo sem primitivos é faixa; primitivo de tipo desconhecido é tipo', () => {
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [] })))).toEqual(['faixa']);
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [{ tipo: 'elipse' }] })))).toEqual(['tipo']);
  });

  it('polilinha precisa de pelo menos 2 pontos', () => {
    const f = comSimbolos(simbolo('a', { primitivos: [{ tipo: 'polilinha', pontos: [['0', '0']] }] }));
    expect(codigos(f)).toEqual(['faixa']);
  });

  it('raio literal zero ou negativo é faixa; raio por fórmula não é julgado aqui', () => {
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: '0' }] })))).toEqual(['faixa']);
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: '-5' }] })))).toEqual(['faixa']);
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: 'L / 2' }] })))).toEqual([]);
  });

  it('fórmula com sintaxe ruim é formula; nome que não existe é referencia', () => {
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['L +', '0'] }] })))).toEqual(['formula']);
    expect(codigos(comSimbolos(simbolo('a', { primitivos: [{ tipo: 'linha', de: ['0', '0'], ate: ['nada', '0'] }] })))).toEqual(['referencia']);
  });

  it('PI e x.esp de chapa valem; i e n não valem (símbolo não repete)', () => {
    const ok = comSimbolos(simbolo('a', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: 'corpo.esp * PI' }] }));
    expect(validarSimbolos(ok)).toEqual([]);
    const ruim = comSimbolos(simbolo('a', { primitivos: [{ tipo: 'circulo', centro: ['0', '0'], raio: 'i + 1' }] }));
    expect(codigos(ruim)).toEqual(['referencia']);
  });

  it('quando com nome desconhecido é referencia; quando booleano válido não gera problema', () => {
    expect(codigos(comSimbolos(simbolo('a', { quando: 'fantasma > 1' })))).toEqual(['referencia']);
    expect(validarSimbolos(comSimbolos(simbolo('a', { quando: 'nPrat > 1' })))).toEqual([]);
  });

  it('primitivo de texto exige posição, texto e altura', () => {
    const f = comSimbolos(simbolo('a', { primitivos: [{ tipo: 'texto', posicao: ['0', '0'], texto: '"DN"' }] }));
    expect(codigos(f)).toEqual(['obrigatorio']);
  });

  it('substituiGeometria e detalhe com tipo errado são tipo', () => {
    expect(codigos(comSimbolos(simbolo('a', { substituiGeometria: 'sim' })))).toEqual(['tipo']);
    expect(codigos(comSimbolos(simbolo('a', { detalhe: ['gigante'] })))).toEqual(['tipo']);
  });
});
