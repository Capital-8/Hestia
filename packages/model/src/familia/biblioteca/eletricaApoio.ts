import type { Familia, Parametro, Tipo, Valor } from '../tipos.ts';
import type { Corpo, FormaCorpo, PapelCorpo, Perfil, Ponto3, QuadroCorpo } from '../tiposCorpo.ts';
import type { DominioLigacao, Ligacao } from '../tiposLigacao.ts';
import type { Simbolo2D, Verificacao } from '../tiposRepresentacao.ts';
import { comprimento, derivado, nova } from './novosApoio.ts';
import { buscaDn } from './tuboEsgotoApoio.ts';

/*
 * Apoio da elétrica (ficha F5, ADR 0061): eletroduto rígido de PVC, eletrocalha, caixas de embutir e dispositivos (tomada e
 * interruptor). Medidas em mm. Diâmetros externos, espessuras, raios e dimensões de caixa vêm de tabelas RAZOÁVEIS, não
 * confirmadas em norma (NBR 15465) nem em catálogo de fabricante: cada tabela tem CONFERIR.
 * Eixos: o tubo cresce em +Z e a ponta A fica na origem; a face de caixas e dispositivos é y = 0; X é a largura (L); Z é a altura (A).
 */

type Tabela = ReadonlyArray<readonly [number, number]>;

export const DNS_ELETRICO = [20, 25, 32, 40, 50] as const;
// CONFERIR: diâmetro externo (mm) do eletroduto rígido por DN (série de catálogo, não confirmada).
export const TABELA_DE_ELETRICO: Tabela = [[20, 25], [25, 32], [32, 40], [40, 50], [50, 60]];
// CONFERIR: espessura de parede (mm) do eletroduto rígido por DN.
export const TABELA_E_ELETRICO: Tabela = [[20, 2], [25, 2.2], [32, 2.5], [40, 2.8], [50, 3]];
/** Material do eletroduto, da eletrocalha e das caixas: PVC do projeto. CONFERIR: caixas metálicas ficam para outra ficha. */
export const MATERIAL_ELETRICO = 'mat_pvc';
/** Sistema padrão das ligações elétricas (texto livre, ao conectar). */
export const SISTEMA_ELETRICO = 'Eletrodutos';
/** Espessura da parede das caixas e da chapa da eletrocalha (mm). CONFERIR. */
export const ESPESSURA_CAIXA = '3';
export const ESPESSURA_CALHA = '1.5';

/** Diâmetro externo (mm) do eletroduto do DN, para a geometria dos corpos e dos tipos. */
export function deDn(dn: number): number {
  return TABELA_DE_ELETRICO.find(([d]) => d === dn)?.[1] ?? 0;
}

/** Parâmetro de bitola (escopo `tipo`): enum de DN com as opções dadas. */
export function parametroDnEletrico(opcoes: readonly number[] = DNS_ELETRICO, padrao = 20): Parametro {
  return { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao, grupo: 'Bitola', opcoes: opcoes.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) };
}

/** Diâmetro externo `De` (mm) pela tabela do DN. CONFERIR. */
export function deEletrico(): Parametro {
  return derivado('De', 'Diâmetro externo', buscaDn('DN', TABELA_DE_ELETRICO));
}

/** Espessura da parede `e` (mm) pela tabela do DN. CONFERIR. */
export function espessuraEletrica(): Parametro {
  return derivado('e', 'Espessura da parede', buscaDn('DN', TABELA_E_ELETRICO));
}

/** Dimensão de caixa ou tubo, L, A ou P (comprimento de instância, obrigatória na família). Os valores nominais vêm de cada tipo. */
export function dimensao(id: 'L' | 'A' | 'P', nome: string, padrao: number, max = 6000): Parametro {
  return comprimento(id, nome, padrao, 1, max, 1);
}

/** Potência nominal (W) do ponto: dado de informação, alimenta tabelas e verificações. CONFERIR. */
export function parametroPotencia(padrao: number): Parametro {
  return { id: 'potencia', nome: 'Potência nominal (W)', tipo: 'numero', escopo: 'tipo', padrao, min: 0, max: 3300, passo: 10, grupo: 'Elétrica' };
}

/** Tensão nominal (V) do ponto: 127 ou 220. Numérica, para ir às propriedades da ligação. */
export function parametroTensao(): Parametro {
  return { id: 'tensao', nome: 'Tensão nominal (V)', tipo: 'enum', escopo: 'tipo', padrao: 127, grupo: 'Elétrica', opcoes: [{ valor: 127, rotulo: '127 V' }, { valor: 220, rotulo: '220 V' }] };
}

/** Tipos por bitola: um por DN, com `extras` (dimensões nominais) a partir do DN. */
export function tiposDn(opcoes: readonly number[], extras: (dn: number) => Record<string, Valor> = () => ({})): Tipo[] {
  return opcoes.map((dn) => ({ id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, ...extras(dn) } }));
}

/** Ligação redonda elétrica: eletroduto (`De`) ou ponto de força. Fluxo nos dois sentidos, salvo `extra`. */
export function ligacaoEletrica(id: string, nome: string, dominio: DominioLigacao, posicao: Ponto3, direcao: Ponto3, extra: Partial<Ligacao> = {}): Ligacao {
  return { id, nome, dominio, sistema: SISTEMA_ELETRICO, secao: 'redonda', posicao, direcao, diametro: 'De', fluxo: 'ambos', ...extra };
}

/** Ligação retangular de eletrocalha (largura `P`, altura `A`). Sem diâmetro: a seção é retangular. */
export function ligacaoCalha(id: string, nome: string, posicao: Ponto3, direcao: Ponto3): Ligacao {
  return { id, nome, dominio: 'eletrocalha', sistema: SISTEMA_ELETRICO, secao: 'retangular', posicao, direcao, largura: 'P', altura: 'A', fluxo: 'ambos' };
}

/** Corpo elétrico com o material do projeto. */
export function corpoEletrico(id: string, nome: string, papel: PapelCorpo, forma: FormaCorpo, quadro: QuadroCorpo): Corpo {
  return { id, nome, papel, forma, quadro, material: MATERIAL_ELETRICO };
}

/** Anel De × (De − 2e) do eletroduto. */
export function anelEletrico(): Perfil {
  return { tipo: 'anel', diametroExterno: 'De', diametroInterno: 'De - 2 * e' };
}

export interface DadosEletrica {
  id: string;
  nome: string;
  categoria: 'eletroduto' | 'dispositivo_eletrico';
  descricao: string;
  hospedagem?: 'nivel' | 'parede';
  parametros: Parametro[];
  corpos: Corpo[];
  ligacoes: Ligacao[];
  ifc: NonNullable<Familia['ifc']>;
  tipos: Tipo[];
  tipoPadrao: string;
  simbolos?: Simbolo2D[];
  verificacoes?: Verificacao[];
}

/** Família elétrica: disciplina `eletrico`, sem peças de marcenaria nem conectores de móvel. */
export function familiaEletrica(d: DadosEletrica): Familia {
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: 'eletrico',
    descricao: d.descricao,
    hospedagem: d.hospedagem,
    parametros: d.parametros,
    pecas: [],
    conectores: [],
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  });
  return {
    ...base,
    corpos: d.corpos,
    ligacoes: d.ligacoes,
    ifc: d.ifc,
    ...(d.simbolos ? { simbolos: d.simbolos } : {}),
    ...(d.verificacoes ? { verificacoes: d.verificacoes } : {}),
  };
}
