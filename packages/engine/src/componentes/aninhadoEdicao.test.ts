import { adicionarAninhado, FAMILIA_ARMARIO, familiaDaBiblioteca, type Aninhado, type Familia } from '@hestia/model';
import { describe, expect, it } from 'vitest';
import { resolverFamilia } from './resolver.ts';

describe('módulo aninhado criado pela edição', () => {
  it('resolve sem erros com a biblioteca padrão', () => {
    const f: Familia = structuredClone(FAMILIA_ARMARIO);
    const a: Aninhado = { id: 'gaveta', nome: 'Gaveta', familiaId: 'fam_gaveta', valores: {}, origem: ['0', '0', '0'] };
    expect(adicionarAninhado(f, a)).toBeNull();

    const r = resolverFamilia(f, { biblioteca: familiaDaBiblioteca });
    expect(r.erros).toEqual([]);
    expect(r.pecas.some((p) => p.deAninhado === 'gaveta')).toBe(true);
  });
});
