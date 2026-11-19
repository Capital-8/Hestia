import { FAMILIA_FORMATO, FAMILIA_VERSAO, type Familia, type OpcaoParametro, type Parametro } from '../tipos.ts';
import { comEscolhas } from './escolhas.ts';

/*
 * Apoio das famílias do grupo sala/áreas (ficha E7-salaAreas). Só construtores pequenos para os parâmetros e o cabeçalho
 * comum; as medidas e as regras de montagem são PROPOSTAS do Hestia, a validar com marceneiro ou fabricante (ADR 0049 R5).
 * Medidas em mm.
 */

export const CHAPAS: OpcaoParametro[] = [
  { valor: 'mdf15', rotulo: 'MDF 15 mm', esp: 15 },
  { valor: 'mdf18', rotulo: 'MDF 18 mm', esp: 18 },
  { valor: 'mdf25', rotulo: 'MDF 25 mm', esp: 25 },
];

export const comprimento = (
  id: string,
  nome: string,
  padrao: number,
  min: number,
  max: number,
  passo = 10,
  escopo: 'tipo' | 'instancia' = 'instancia',
): Parametro => ({ id, nome, tipo: 'comprimento', escopo, padrao, min, max, passo, grupo: 'Dimensões' });

export const inteiro = (id: string, nome: string, padrao: number, min: number, max: number): Parametro =>
  ({ id, nome, tipo: 'inteiro', escopo: 'tipo', padrao, min, max, passo: 1, grupo: 'Construção' });

export const derivado = (id: string, nome: string, formula: string): Parametro =>
  ({ id, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula, grupo: 'Derivados' });

export const chapaCorpo = (padrao = 'mdf18'): Parametro => ({
  id: 'corpo',
  nome: 'Chapa do corpo',
  tipo: 'chapa',
  escopo: 'tipo',
  padrao,
  grupo: 'Material',
  opcoes: CHAPAS.map((o) => ({ ...o })),
});

/** Completa o cabeçalho fixo (formato, versão, unidade, categoria, hospedagem e origem) da família. */
export function criarFamilia(
  dados: Omit<Familia, 'formato' | 'versao' | 'unidade' | 'categoria' | 'hospedagem' | 'origem'>,
): Familia {
  return comEscolhas({
    formato: FAMILIA_FORMATO,
    versao: FAMILIA_VERSAO,
    unidade: 'mm',
    categoria: 'marcenaria',
    hospedagem: 'nivel',
    origem: 'canto',
    ...dados,
  });
}
