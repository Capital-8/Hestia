import { createHash } from 'node:crypto';
import { BIBLIOTECA_BASE, FAMILIA_ARMARIO, type Corpo, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverFamilia } from './resolver.ts';

/*
 * Regressão da ficha A7: a biblioteca base tem de resolver IDÊNTICA à de antes da integração dos corpos. A impressão cobre só os
 * campos que já existiam (pecas, ferragens, erros, env); `corpos` e `ligacoes` são novos e ficam de fora de propósito.
 * O snapshot foi gerado com o código ANTES da mudança em resolver.ts.
 */
const impressao = (f: Familia, tipoId?: string): string => {
  const { pecas, ferragens, erros, env } = resolverFamilia(f, tipoId === undefined ? {} : { tipoId });
  return createHash('sha256').update(JSON.stringify({ pecas, ferragens, erros, env })).digest('hex');
};

describe('regressão A7: biblioteca base resolve igual ao de antes', () => {
  for (const f of BIBLIOTECA_BASE) {
    it(`${f.id} (tipo padrão)`, () => {
      expect(impressao(f)).toMatchSnapshot();
    });
    for (const t of f.tipos) {
      it(`${f.id} (tipo ${t.id})`, () => {
        expect(impressao(f, t.id)).toMatchSnapshot();
      });
    }
  }
});

/** Armário de teste com a lista de corpos dada; as peças do armário continuam valendo. */
const familiaCom = (corpos: Corpo[]): Familia => ({ ...structuredClone(FAMILIA_ARMARIO), corpos });
/** Cilindro Ø100 × 1000 mm na origem da família, salvo o que `extra` sobrescrever. */
const tubo = (extra: Partial<Corpo> = {}): Corpo => ({
  id: 'tubo',
  nome: 'Tubo',
  papel: 'tubo',
  forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '100' }, comprimento: '1000' },
  quadro: { origem: ['0', '0', '0'] },
  ...extra,
});

describe('corpos na resolução (ficha A7)', () => {
  it('família sem corpos: listas vazias e caixa nula', () => {
    const r = resolverFamilia(structuredClone(FAMILIA_ARMARIO));
    expect(r.corpos).toEqual([]);
    expect(r.ligacoes).toEqual([]);
    expect(r.caixaCorpos).toBeNull();
  });

  it('cilindro Ø100 × 1000 mm: resolve em metros e a caixa envolvente sai certa', () => {
    const r = resolverFamilia(familiaCom([tubo()]));
    expect(r.erros).toEqual([]);
    expect(r.corpos).toHaveLength(1);
    expect(r.corpos[0]).toMatchObject({ id: 'tubo', nome: 'Tubo', indice: 1, vazio: false, forma: { tipo: 'extrusao', comprimento: 1 } });
    // Polígono de 32 lados inscrito com vértices em 0°, 90°, 180° e 270°: a caixa é exatamente ±50 mm em X e Y, 0 a 1 m em Z.
    const c = r.caixaCorpos!;
    expect(c.min[0]).toBeCloseTo(-0.05, 6);
    expect(c.max[0]).toBeCloseTo(0.05, 6);
    expect(c.min[1]).toBeCloseTo(-0.05, 6);
    expect(c.max[1]).toBeCloseTo(0.05, 6);
    expect(c.min[2]).toBeCloseTo(0, 6);
    expect(c.max[2]).toBeCloseTo(1, 6);
    // As peças do armário continuam lá.
    expect(r.pecas).toHaveLength(11);
  });

  it('repetir 3 com i na origem: três corpos espaçados de 200 mm, com nomes numerados', () => {
    const r = resolverFamilia(familiaCom([tubo({ repetir: '3', quadro: { origem: ['i*200', '0', '0'] } })]));
    expect(r.erros).toEqual([]);
    expect(r.corpos.map((c) => c.nome)).toEqual(['Tubo 1', 'Tubo 2', 'Tubo 3']);
    expect(r.corpos.map((c) => c.indice)).toEqual([1, 2, 3]);
    expect(r.corpos.map((c) => c.origem[0])).toEqual([expect.closeTo(0.2, 6), expect.closeTo(0.4, 6), expect.closeTo(0.6, 6)]);
    expect(r.caixaCorpos!.min[0]).toBeCloseTo(0.15, 6);
    expect(r.caixaCorpos!.max[0]).toBeCloseTo(0.65, 6);
  });

  it('quando falso: o corpo some da lista, sem erro, e a caixa fica nula', () => {
    const r = resolverFamilia(familiaCom([tubo({ quando: '0' })]));
    expect(r.corpos).toEqual([]);
    expect(r.erros).toEqual([]);
    expect(r.caixaCorpos).toBeNull();
  });

  it('medida de perfil inválida vira diagnóstico com onde, sem lançar; as peças seguem', () => {
    const ruim = tubo({ forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: '-5' }, comprimento: '1000' } });
    const r = resolverFamilia(familiaCom([ruim]));
    expect(r.corpos).toEqual([]);
    expect(r.erros).toContainEqual({ onde: 'corpos[tubo].forma.perfil', mensagem: 'perfil: medida deve ser maior que zero' });
    expect(r.pecas).toHaveLength(11);
  });

  it('fórmula inexistente no perfil vira diagnóstico no mesmo onde, uma vez só', () => {
    const ruim = tubo({ forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro: 'nao_existe' }, comprimento: '1000' } });
    const r = resolverFamilia(familiaCom([ruim]));
    expect(r.corpos).toEqual([]);
    expect(r.erros.filter((e) => e.onde === 'corpos[tubo].forma.perfil')).toHaveLength(1);
  });
});
