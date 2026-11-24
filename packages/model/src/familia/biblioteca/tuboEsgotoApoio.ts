import type { Familia, Parametro, Tipo, Valor } from '../tipos.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import type { Corpo, FormaCorpo, PapelCorpo, Perfil, Ponto3, QuadroCorpo } from '../tiposCorpo.ts';
import { comprimento, derivado, enumerado, nova } from './novosApoio.ts';

/*
 * Apoio da tubulação de esgoto em PVC (ficha F1, ADR 0061). O diâmetro nominal (DN, mm) é o diâmetro EXTERNO do tubo PVC de
 * esgoto. Espessura de parede, comprimento de encaixe e raio das curvas vêm de tabelas por DN: são valores RAZOÁVEIS, não
 * confirmados em norma nem em catálogo de fabricante. Cada um tem o comentário CONFERIR.
 * Eixos: o tubo reto cresce em +Z local; a ponta A fica na origem e aponta para −Z; a ponta B fica do outro lado.
 */

export const DNS_ESGOTO = [40, 50, 75, 100, 150] as const;
/** Família padrão do domínio esgoto (usada por C5 e C6). */
export const FAMILIA_TUBO_ESGOTO_PADRAO = 'fam_tubo_esgoto';
export const MATERIAL_ESGOTO = 'mat_pvc';
export const SISTEMA_ESGOTO = 'Esgoto primário';

type Tabela = ReadonlyArray<readonly [number, number]>;

/** Expressão `busca(chave, dn1, v1, dn2, v2, ...)` com a tabela de um parâmetro por DN. */
export function buscaDn(chave: string, tabela: Tabela): string {
  return `busca(${chave}, ${tabela.map(([dn, v]) => `${dn}, ${v}`).join(', ')})`;
}

// CONFERIR: diâmetro externo do tubo PVC de esgoto igual ao DN (série normal).
export const TABELA_DE: Tabela = [[40, 40], [50, 50], [75, 75], [100, 100], [150, 150]];
// CONFERIR: espessura de parede por DN, em mm (valores razoáveis, a confirmar na norma do fabricante).
export const TABELA_ESPESSURA: Tabela = [[40, 1.6], [50, 1.8], [75, 2.2], [100, 3.2], [150, 4.9]];
// CONFERIR: comprimento do encaixe (bolsa) por DN, em mm.
export const TABELA_ENCAIXE: Tabela = [[40, 35], [50, 40], [75, 50], [100, 60], [150, 75]];

/** Parâmetro de bitola (escopo `tipo`): enum de DN 40 a 150. */
export function parametroDn(id: string, nome: string, padrao: number): Parametro {
  return { id, nome, tipo: 'enum', escopo: 'tipo', padrao, grupo: 'Bitola', opcoes: DNS_ESGOTO.map((dn) => ({ valor: dn, rotulo: `DN ${dn}` })) };
}

/** Diâmetro externo (mm) pela tabela de `dn`. */
export function parametroDe(dn: string, id = 'De', nome = 'Diâmetro externo'): Parametro {
  return derivado(id, nome, buscaDn(dn, TABELA_DE));
}

/** Espessura da parede `e` (mm) pela tabela de `dn`. CONFERIR. */
export function parametroEspessura(dn: string): Parametro {
  return derivado('e', 'Espessura da parede', buscaDn(dn, TABELA_ESPESSURA));
}

/** Comprimento do encaixe `Lf` (mm) pela tabela de `dn`. CONFERIR. */
export function parametroEncaixe(dn: string): Parametro {
  return derivado('Lf', 'Comprimento do encaixe', buscaDn(dn, TABELA_ENCAIXE));
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
  return TABELA_ENCAIXE.find(([d]) => d === dn)?.[1] ?? 0;
}

/** Arredonda a 0,1 mm (dimensões nominais de tipo). */
export const mm = (x: number): number => Math.round(x * 10) / 10;

/** Raio da curva: `curta` = De, `longa` = 2 De (CONFERIR). Escopo instância: cada curva colocada pode mudar. */
export function parametroRaioCurva(): Parametro {
  return enumerado('raio', 'Raio da curva', 'curta', [['curta', 'Curta (raio = De)'], ['longa', 'Longa (raio = 2 De)']], 'instancia');
}

/** Tipos por bitola: um por DN. `extras` dá os valores de cada tipo (dimensões nominais de caixa, raio) a partir do DN. */
export function tiposPorDn(extras: (dn: number) => Record<string, Valor> = () => ({})): Tipo[] {
  return DNS_ESGOTO.map((dn) => ({ id: `dn${dn}`, nome: `DN ${dn}`, valores: { DN: dn, ...extras(dn) } }));
}

/** Ligação de esgoto: redonda, fluxo nos dois sentidos, sai pela direção dada. */
export function ligacaoEsgoto(id: string, nome: string, posicao: Ponto3, direcao: Ponto3, diametro: string): Ligacao {
  return { id, nome, dominio: 'esgoto', sistema: SISTEMA_ESGOTO, secao: 'redonda', posicao, direcao, diametro, fluxo: 'ambos' };
}

/** Anel De × (De − 2e) de parede de esgoto. */
export function anelEsgoto(): Perfil {
  return { tipo: 'anel', diametroExterno: 'De', diametroInterno: 'De - 2 * e' };
}

/** Corpo de PVC de esgoto com o material do projeto. */
export function corpoEsgoto(id: string, nome: string, papel: PapelCorpo, forma: FormaCorpo, quadro: QuadroCorpo): Corpo {
  return { id, nome, papel, forma, quadro, material: MATERIAL_ESGOTO };
}

export interface DadosEsgoto {
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

/** Família de esgoto: cabeçalho de hidrossanitário, sem peças de marcenaria nem conectores de móvel. */
export function familiaEsgoto(d: DadosEsgoto): Familia {
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
