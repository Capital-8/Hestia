import { CATALOGO_PADRAO, opcoesDeChapa } from '../catalogo.ts';
import type { Parametro } from '../tipos.ts';

export const FITA_PVC = 'fita_pvc';

export function comprimento(id: string, nome: string, padrao: number, min: number, max: number, passo = 10): Parametro {
  return { id, nome, tipo: 'comprimento', escopo: 'instancia', padrao, min, max, passo, grupo: 'Dimensões' };
}

export function derivado(id: string, nome: string, formula: string): Parametro {
  return { id, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula, grupo: 'Derivados' };
}

export function chapa(id: string, nome: string, padrao: string, ids: readonly string[]): Parametro {
  return { id, nome, tipo: 'chapa', escopo: 'tipo', padrao, grupo: 'Material', opcoes: opcoesDeChapa(CATALOGO_PADRAO, ids) };
}

export function material(id: string, nome: string, padrao: string): Parametro {
  return { id, nome, tipo: 'material', escopo: 'tipo', padrao, grupo: 'Material' };
}

export function booleano(id: string, nome: string, padrao: boolean): Parametro {
  return { id, nome, tipo: 'booleano', escopo: 'tipo', padrao, grupo: 'Construção' };
}
