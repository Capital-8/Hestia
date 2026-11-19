import { describe, expect, it } from 'vitest';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { BIBLIOTECA_BASE, familiaDaBiblioteca } from './biblioteca/index.ts';
import { duplicarPeca, duplicarTipo, espelharPecaEmX } from './edicao.ts';
import { HistoricoFamilia } from './historico.ts';
import { clonarSeguro, dependenciasDaFamilia } from './dependencias.ts';
import type { Familia } from './tipos.ts';

describe('dependenciasDaFamilia', () => {
  it('a cômoda depende da gaveta; o armário simples, de nada', () => {
    const comoda = familiaDaBiblioteca('fam_comoda')!;
    expect(dependenciasDaFamilia(comoda, familiaDaBiblioteca).map((f) => f.id)).toContain('fam_gaveta');
    expect(dependenciasDaFamilia(FAMILIA_ARMARIO, familiaDaBiblioteca)).toEqual([]);
  });

  it('todos os aninhados da biblioteca base existem na própria biblioteca', () => {
    for (const f of BIBLIOTECA_BASE) {
      for (const a of f.aninhados) expect(familiaDaBiblioteca(a.familiaId), `${f.id} → ${a.familiaId}`).toBeDefined();
    }
  });

  it('ciclo entre famílias não trava e não repete', () => {
    const a = { ...structuredClone(FAMILIA_ARMARIO), id: 'a', aninhados: [{ id: 'x', nome: 'x', familiaId: 'b', valores: {}, origem: ['0', '0', '0'] as [string, string, string] }] } as Familia;
    const b = { ...structuredClone(FAMILIA_ARMARIO), id: 'b', aninhados: [{ id: 'y', nome: 'y', familiaId: 'a', valores: {}, origem: ['0', '0', '0'] as [string, string, string] }] } as Familia;
    const mapa: Record<string, Familia> = { a, b };
    expect(dependenciasDaFamilia(a, (id) => mapa[id]).map((f) => f.id)).toEqual(['b']);
  });
});

describe('edições que clonam dentro do rascunho do immer (regressão do QA)', () => {
  it('duplicar tipo, duplicar peça e espelhar peça funcionam pelo histórico', () => {
    const h = new HistoricoFamilia<Familia>(structuredClone(FAMILIA_ARMARIO));
    const tipo = FAMILIA_ARMARIO.tipos[0]!.id;
    const peca = FAMILIA_ARMARIO.pecas.find((p) => p.eixo === 'x' && Array.isArray(p.tamanho))!.id;
    const nTipos = h.atual.tipos.length;
    const nPecas = h.atual.pecas.length;
    h.exec('Duplicar tipo', (f) => { expect(duplicarTipo(f, tipo)).toBeNull(); });
    h.exec('Duplicar peça', (f) => { expect(duplicarPeca(f, peca)).toBeNull(); });
    h.exec('Espelhar peça', (f) => { expect(espelharPecaEmX(f, peca)).toBeNull(); });
    expect(h.atual.tipos.length).toBe(nTipos + 1);
    expect(h.atual.pecas.length).toBeGreaterThanOrEqual(nPecas + 1);
  });

  it('clonarSeguro aceita objeto comum', () => {
    const o = { a: { b: 1 } };
    const c = clonarSeguro(o);
    expect(c).toEqual(o);
    expect(c).not.toBe(o);
  });
});
