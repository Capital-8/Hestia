import { describe, expect, it } from 'vitest';
import { excluirPeca } from './edicaoPecas.ts';
import { FAMILIA_ARMARIO } from './exemplos.ts';
import { HistoricoFamilia } from './historico.ts';
import type { Familia, Peca } from './tipos.ts';
import { validarFamilia } from './validar.ts';

/*
 * Ficha CORR-3: excluir a última peça de uma zona (grupo) deixa escolhas apontando para uma zona sem peça, o que
 * invalida a família. `excluirPeca` deve podar essas escolhas órfãs num único passo de desfazer.
 */

const nova = (): Familia => structuredClone(FAMILIA_ARMARIO);
const peca = (f: Familia, id: string): Peca | undefined => f.pecas.find((p) => p.id === id);
const escolhaIds = (f: Familia): string[] => (f.escolhas ?? []).map((e) => e.id);
const erros = (f: Familia): string[] => validarFamilia(f).filter((p) => p.nivel === 'erro').map((p) => `${p.codigo}:${p.onde}`);

/** Mesma mecânica do `executar` da store: recusa lança e o histórico não ganha passo. */
const executar = (h: HistoricoFamilia<Familia>, rotulo: string, receita: (f: Familia) => string | null): string | null => {
  try {
    h.exec(rotulo, (rascunho) => {
      const motivo = receita(rascunho as unknown as Familia);
      if (motivo !== null) throw new Error(motivo);
    });
    return null;
  } catch (erro) {
    return erro instanceof Error ? erro.message : String(erro);
  }
};

describe('excluir peça poda escolhas órfãs', () => {
  it('a peça única da zona "portas" é a porta e a escolha esc_nPortas aponta para ela', () => {
    const f = nova();
    expect(peca(f, 'porta')?.grupo).toBe('portas');
    expect(escolhaIds(f)).toContain('esc_nPortas');
    expect(erros(f)).toEqual([]);
  });

  it('excluir a única peça da zona remove a escolha órfã e mantém a família válida', () => {
    const f = nova();
    const h = new HistoricoFamilia<Familia>(f);
    expect(executar(h, 'Excluir peça', (x) => excluirPeca(x, 'porta'))).toBeNull();
    expect(peca(h.atual, 'porta')).toBeUndefined();
    expect(escolhaIds(h.atual)).not.toContain('esc_nPortas');
    expect(erros(h.atual)).toEqual([]);
  });

  it('excluir uma peça de zona que ainda tem outra peça NÃO remove a escolha', () => {
    const f = nova();
    peca(f, 'trF')!.grupo = 'portas';
    const h = new HistoricoFamilia<Familia>(f);
    expect(executar(h, 'Excluir peça', (x) => excluirPeca(x, 'porta'))).toBeNull();
    expect(peca(h.atual, 'porta')).toBeUndefined();
    expect(escolhaIds(h.atual)).toContain('esc_nPortas');
    expect(erros(h.atual)).toEqual([]);
  });

  it('desfazer devolve a peça e a escolha juntas, num único passo', () => {
    const f = nova();
    const h = new HistoricoFamilia<Familia>(f);
    executar(h, 'Excluir peça', (x) => excluirPeca(x, 'porta'));
    expect(escolhaIds(h.atual)).not.toContain('esc_nPortas');
    expect(h.rotuloDesfazer).toBe('Excluir peça');
    expect(h.desfazer()).toBe(true);
    expect(peca(h.atual, 'porta')?.grupo).toBe('portas');
    expect(escolhaIds(h.atual)).toContain('esc_nPortas');
    expect(h.podeDesfazer).toBe(false);
  });

  it('não cria passo quando a peça não existe', () => {
    const f = nova();
    const h = new HistoricoFamilia<Familia>(f);
    const antes = h.versao;
    expect(executar(h, 'Excluir peça', (x) => excluirPeca(x, 'inexistente'))).toMatch('não existe');
    expect(h.versao).toBe(antes);
  });
});
