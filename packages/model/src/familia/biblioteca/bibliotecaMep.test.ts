import { describe, expect, it } from 'vitest';
import { tentar, type Env } from '../expressao.ts';
import type { Familia, Valor } from '../tipos.ts';
import { validarFamilia } from '../validar.ts';
import { BIBLIOTECA_BASE, BIBLIOTECA_MEP, familiaDaBiblioteca } from './index.ts';

/*
 * Ficha F1b: a biblioteca MEP (tubulação e conexões de esgoto) fica separada da base de móveis, e a busca por id acha as duas.
 * Este teste fica no modelo (sem o motor): confere a validação e que cada tipo de cada família avalia todas as fórmulas sem erro.
 */

/** Ambiente de um tipo: valores do tipo (ou padrão) e as fórmulas calculadas até estabilizar. */
function ambiente(f: Familia, tipoId: string | undefined): Env {
  const tipo = f.tipos.find((t) => t.id === tipoId);
  const env: Record<string, Valor> = {};
  for (const p of f.parametros) env[p.id] = tipo?.valores[p.id] ?? p.padrao;
  for (let rodada = 0; rodada <= f.parametros.length; rodada++) {
    for (const p of f.parametros) {
      if (p.formula === undefined) continue;
      const r = tentar(p.formula, env);
      if (r.ok) env[p.id] = r.valor;
    }
  }
  return env;
}

describe('biblioteca MEP (ficha F1b)', () => {
  it('é separada da base de móveis: nenhuma família MEP entra em BIBLIOTECA_BASE', () => {
    const idsBase = new Set(BIBLIOTECA_BASE.map((f) => f.id));
    for (const f of BIBLIOTECA_MEP) expect(idsBase.has(f.id)).toBe(false);
    expect(BIBLIOTECA_MEP.map((f) => f.id)).toContain('fam_tubo_esgoto');
  });

  it('familiaDaBiblioteca acha família MEP e família de móvel pelo id; id desconhecido devolve undefined', () => {
    expect(familiaDaBiblioteca('fam_tubo_esgoto')?.id).toBe('fam_tubo_esgoto');
    expect(familiaDaBiblioteca('fam_esgoto_reducao')?.id).toBe('fam_esgoto_reducao');
    expect(familiaDaBiblioteca('fam_comoda')?.id).toBe('fam_comoda');
    expect(familiaDaBiblioteca('fam_inexistente_xyz')).toBeUndefined();
  });

  for (const f of BIBLIOTECA_MEP) {
    it(`${f.id}: valida sem erro`, () => {
      const erros = validarFamilia(f).filter((p) => p.nivel === 'erro');
      expect(erros).toEqual([]);
    });

    it(`${f.id}: todos os tipos avaliam todas as fórmulas sem erro`, () => {
      const tipos = f.tipos.length > 0 ? f.tipos.map((t) => t.id) : [undefined];
      for (const tipoId of tipos) {
        const env = ambiente(f, tipoId);
        for (const p of f.parametros) {
          if (p.formula === undefined) continue;
          const r = tentar(p.formula, env);
          expect(r.ok, `${f.id}/${tipoId ?? 'padrão'}: ${p.id} = ${p.formula}`).toBe(true);
        }
      }
    });
  }
});
