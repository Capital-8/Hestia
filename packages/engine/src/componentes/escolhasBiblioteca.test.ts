import { BIBLIOTECA_BASE, FAMILIA_ARMARIO, familiaDaBiblioteca, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverFamilia } from './resolver.ts';

/*
 * As escolhas internas (`grupo` das peças e `escolhas` da família) são só dados de interface: a resolução tem de dar
 * exatamente as mesmas peças de antes. O teste monta uma cópia sem grupos/escolhas e compara origem e extensão.
 */

function semGrupos(familia: Familia): Familia {
  return {
    ...familia,
    pecas: familia.pecas.map(({ grupo: _grupo, ...peca }) => peca),
    escolhas: undefined,
  };
}

function assinatura(familia: Familia): Array<{ id: string; indice: number; origem: number[]; extensao: number[] }> {
  const resolvida = resolverFamilia(familia, { tipoId: familia.tipoPadrao, biblioteca: familiaDaBiblioteca });
  expect(resolvida.erros, familia.id).toEqual([]);
  return resolvida.pecas.map((peca) => ({ id: peca.id, indice: peca.indice, origem: peca.origem, extensao: peca.extensao }));
}

const familias = [...new Map([...BIBLIOTECA_BASE, FAMILIA_ARMARIO].map((f) => [f.id, f])).values()];

describe('escolhas da biblioteca não mudam a geometria', () => {
  for (const familia of familias) {
    it(`${familia.id}: mesmas peças do tipo padrão`, () => {
      expect(assinatura(familia)).toEqual(assinatura(semGrupos(familia)));
    });
  }
});
