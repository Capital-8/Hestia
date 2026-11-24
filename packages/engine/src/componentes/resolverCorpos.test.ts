import { createHash } from 'node:crypto';
import { BIBLIOTECA_BASE, type Familia } from '@hestia/model';
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
