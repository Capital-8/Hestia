import type { Escopo, Parametro } from '../tipos.ts';

/*
 * Apoio das famílias de dormitório e closet (FICHA E7-dormitorio): construtores de parâmetros e constantes de montagem.
 * Medidas em mm. Os padrões de folga, rodapé e espessuras são PROPOSTAS do Hestia, a validar com marceneiro (ADR 0049 R5).
 */

/** Fita de borda única usada pelas peças (está no catálogo padrão). */
export const FITA = 'fita_pvc';

/** Espessura fixa do fundo em chapa fina (mm). */
export const FUNDO_ESP = 6;

export const comprimento = (
  id: string,
  nome: string,
  padrao: number,
  min: number,
  max: number,
  passo: number,
  escopo: Escopo = 'instancia',
): Parametro => ({ id, nome, tipo: 'comprimento', escopo, padrao, min, max, passo, grupo: 'Dimensões' });

export const inteiro = (id: string, nome: string, padrao: number, min: number, max: number, passo = 1): Parametro =>
  ({ id, nome, tipo: 'inteiro', escopo: 'tipo', padrao, min, max, passo, grupo: 'Construção' });

export const booleano = (id: string, nome: string, padrao: boolean): Parametro =>
  ({ id, nome, tipo: 'booleano', escopo: 'tipo', padrao, grupo: 'Construção' });

export const derivado = (id: string, nome: string, formula: string): Parametro =>
  ({ id, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula, grupo: 'Derivados' });

/** Chapa do corpo com as três espessuras do catálogo padrão. */
export const chapaCorpo = (padrao = 'mdf18'): Parametro => ({
  id: 'corpo',
  nome: 'Chapa do corpo',
  tipo: 'chapa',
  escopo: 'tipo',
  padrao,
  grupo: 'Material',
  opcoes: [
    { valor: 'mdf15', rotulo: 'MDF 15 mm', esp: 15 },
    { valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 },
    { valor: 'mdf25', rotulo: 'MDF 25 mm', esp: 25 },
  ],
});
