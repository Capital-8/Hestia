import {
  FAMILIA_FORMATO,
  FAMILIA_VERSAO,
  type Aninhado,
  type CategoriaFamilia,
  type Conector,
  type Familia,
  type Ferragem,
  type Hospedagem,
  type OpcaoParametro,
  type OrigemFamilia,
  type Parametro,
  type Peca,
  type PlanoReferencia,
  type Tipo,
} from '../tipos.ts';

/*
 * Apoio das famílias de cozinha (ficha E7-cozinha). Só construtores de parâmetros e o preenchimento dos campos comuns do
 * contrato; as medidas continuam em milímetros e as regras de montagem são PROPOSTAS do Hestia, a validar com marceneiro.
 */

export const FITA = 'fita_pvc';

/** Chapa de corpo disponível nas famílias (mesmas espessuras do catálogo padrão). */
export const CHAPAS_CORPO: OpcaoParametro[] = [
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
  passo: number,
  escopo: 'tipo' | 'instancia' = 'instancia',
): Parametro => ({ id, nome, tipo: 'comprimento', escopo, padrao, min, max, passo, grupo: 'Dimensões' });

export const derivado = (id: string, nome: string, formula: string): Parametro =>
  ({ id, nome, tipo: 'numero', escopo: 'tipo', padrao: 0, formula, grupo: 'Derivados' });

export const inteiro = (id: string, nome: string, padrao: number, min: number, max: number): Parametro =>
  ({ id, nome, tipo: 'inteiro', escopo: 'tipo', padrao, min, max, passo: 1, grupo: 'Construção' });

export const enumerado = (id: string, nome: string, padrao: string, opcoes: OpcaoParametro[]): Parametro =>
  ({ id, nome, tipo: 'enum', escopo: 'tipo', padrao, grupo: 'Construção', opcoes });

export const chapaCorpo = (padrao = 'mdf18'): Parametro => ({
  id: 'corpo',
  nome: 'Chapa do corpo',
  tipo: 'chapa',
  escopo: 'tipo',
  padrao,
  grupo: 'Material',
  opcoes: CHAPAS_CORPO,
});

interface DadosFamilia {
  id: string;
  nome: string;
  descricao: string;
  parametros: Parametro[];
  pecas: Peca[];
  tipos: Tipo[];
  tipoPadrao: string;
  aninhados?: Aninhado[];
  ferragens?: Ferragem[];
  conectores?: Conector[];
  planos?: PlanoReferencia[];
  categoria?: CategoriaFamilia;
  hospedagem?: Hospedagem;
  origem?: OrigemFamilia;
}

/** Família de cozinha com os campos fixos do contrato já preenchidos. */
export const familia = (dados: DadosFamilia): Familia => ({
  formato: FAMILIA_FORMATO,
  versao: FAMILIA_VERSAO,
  id: dados.id,
  nome: dados.nome,
  categoria: dados.categoria ?? 'marcenaria',
  descricao: dados.descricao,
  unidade: 'mm',
  hospedagem: dados.hospedagem ?? 'nivel',
  origem: dados.origem ?? 'canto',
  parametros: dados.parametros,
  planos: dados.planos ?? [],
  pecas: dados.pecas,
  aninhados: dados.aninhados ?? [],
  ferragens: dados.ferragens ?? [],
  conectores: dados.conectores,
  tipos: dados.tipos,
  tipoPadrao: dados.tipoPadrao,
});
