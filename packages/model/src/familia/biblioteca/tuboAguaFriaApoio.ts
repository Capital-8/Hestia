import type { Familia, Parametro, Tipo, Valor } from '../tipos.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Corpo, FormaCorpo, PapelCorpo, Perfil, Ponto3, QuadroCorpo } from '../tiposCorpo.ts';
import { comprimento, derivado, nova } from './novosApoio.ts';

/*
 * Apoio da tubulação de água fria em PVC soldável (ficha F2, ADR 0061). O diâmetro nominal (DN, mm) é o diâmetro EXTERNO do
 * tubo soldável. Espessura de parede, comprimento do encaixe (bolsa) e tabelas de caixa vêm de valores por DN que são RAZOÁVEIS,
 * não confirmados em norma (NBR 5648 / NBR 15939) nem em catálogo de fabricante. Cada um tem o comentário CONFERIR.
 * Eixos: o tubo reto cresce em +Z local; a ponta A fica na origem e aponta para −Z; a ponta B fica em z = L e aponta para +Z.
 */

export const DNS_AGUA_FRIA = [20, 25, 32, 40, 50, 60, 75, 85, 110] as const;
/** Família padrão de água fria (tubo reto). */
export const FAMILIA_TUBO_AGUA_FRIA_PADRAO = 'fam_tubo_agua_fria';
export const MATERIAL_AGUA_FRIA = 'mat_pvc';
export const SISTEMA_AGUA_FRIA = 'Água fria';

type Tabela = ReadonlyArray<readonly [number, number]>;

/** Expressão `busca(chave, dn1, v1, dn2, v2, ...)` com a tabela de um parâmetro por DN. */
export function buscaDn(chave: string, tabela: Tabela): string {
  return `busca(${chave}, ${tabela.map(([dn, v]) => `${dn}, ${v}`).join(', ')})`;
}

// CONFERIR: diâmetro externo do tubo soldável igual ao DN (série métrica de água fria).
export const TABELA_DE_AF: Tabela = DNS_AGUA_FRIA.map((dn) => [dn, dn] as const);
// CONFERIR: espessura de parede por DN, em mm (valores razoáveis, a confirmar na norma do fabricante).
export const TABELA_ESPESSURA_AF: Tabela = [[20, 2.0], [25, 2.3], [32, 2.9], [40, 3.7], [50, 4.6], [60, 5.5], [75, 6.8], [85, 7.7], [110, 10.0]];
// CONFERIR: comprimento do encaixe (bolsa soldável) por DN, em mm.
export const TABELA_ENCAIXE_AF: Tabela = [[20, 14], [25, 16], [32, 20], [40, 26], [50, 31], [60, 37], [75, 44], [85, 49], [110, 62]];

/** Parâmetro de bitola (escopo `tipo`): enum de DN 20 a 110. */
export function parametroDn(id: string, nome: string, padrao: number): Parametro {
  return { id, nome, tipo: 'enum', escopo: 'tipo', padrao, grupo: 'Bitola', opcoes: DNS_AGUA_FRIA.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) };
}

/** Diâmetro externo (mm) pela tabela de `dn`. */
export function parametroDe(dn: string, id = 'De', nome = 'Diâmetro externo'): Parametro {
  return derivado(id, nome, buscaDn(dn, TABELA_DE_AF));
}

/** Espessura da parede `e` (mm) pela tabela de `dn`. CONFERIR. */
export function parametroEspessura(dn: string): Parametro {
  return derivado('e', 'Espessura da parede', buscaDn(dn, TABELA_ESPESSURA_AF));
}

/** Comprimento do encaixe `Lf` (mm) pela tabela de `dn`. CONFERIR. */
export function parametroEncaixe(dn: string): Parametro {
  return derivado('Lf', 'Comprimento do encaixe', buscaDn(dn, TABELA_ENCAIXE_AF));
}

/**
 * Dimensão de caixa L, A ou P (comprimento de instância, obrigatória na família). Os valores NOMINAIS vêm de cada tipo (por DN);
 * a fórmula não serve aqui, porque a validação exige escopo de instância para essas três.
 */
export function dimensao(id: 'L' | 'A' | 'P', nome: string): Parametro {
  return comprimento(id, nome, 100, 1, 6000, 1);
}

/** Encaixe (mm) do DN pela tabela (CONFERIR). */
export function encaixeDe(dn: number): number {
  return TABELA_ENCAIXE_AF.find(([d]) => d === dn)?.[1] ?? 0;
}

/** Arredonda a 0,1 mm (dimensões nominais de tipo). */
export const mm = (x: number): number => Math.round(x * 10) / 10;

/** Tipos por bitola: um por DN. `extras` dá os valores de cada tipo (dimensões nominais de caixa) a partir do DN. */
export function tiposPorDn(extras: (dn: number) => Record<string, Valor> = () => ({})): Tipo[] {
  return DNS_AGUA_FRIA.map((dn) => ({ id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, ...extras(dn) } }));
}

/** Ligação de água fria: redonda, fluxo nos dois sentidos, sai pela direção dada. */
export function ligacaoAgua(id: string, nome: string, posicao: Ponto3, direcao: Ponto3, diametro: string): Ligacao {
  return { id, nome, dominio: 'agua_fria', sistema: SISTEMA_AGUA_FRIA, secao: 'redonda', posicao, direcao, diametro, fluxo: 'ambos' };
}

/** Anel De × (De − 2e) de parede de PVC soldável. */
export function anelAgua(): Perfil {
  return { tipo: 'anel', diametroExterno: 'De', diametroInterno: 'De - 2 * e' };
}

/** Corpo de PVC de água fria com o material do projeto. */
export function corpoAgua(id: string, nome: string, papel: PapelCorpo, forma: FormaCorpo, quadro: QuadroCorpo): Corpo {
  return { id, nome, papel, forma, quadro, material: MATERIAL_AGUA_FRIA };
}

export interface DadosAgua {
  id: string;
  nome: string;
  categoria: 'tubulacao' | 'conexao_tubo';
  descricao: string;
  parametros: Parametro[];
  corpos: Corpo[];
  ligacoes: Ligacao[];
  ifc: NonNullable<Familia['ifc']>;
  tipos: Tipo[];
  tipoPadrao: string;
}

/** Família de água fria: cabeçalho de hidrossanitário, sem peças de marcenaria nem conectores de móvel. */
export function familiaAgua(d: DadosAgua): Familia {
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: 'hidrossanitario',
    descricao: d.descricao,
    parametros: d.parametros,
    pecas: [],
    conectores: [],
    tipos: d.tipos,
    tipoPadrao: d.tipoPadrao,
  });
  return { ...base, corpos: d.corpos, ligacoes: d.ligacoes, ifc: d.ifc };
}
