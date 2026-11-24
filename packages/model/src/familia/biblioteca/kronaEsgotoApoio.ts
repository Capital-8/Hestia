import { bitolaNumerica, bitolasDoItem, buscaDaColuna, linhaDaBitola, type ItemCatalogo } from '../catalogoMep.ts';
import { KRONA_ESGOTO } from '../catalogosMep/kronaEsgoto.ts';
import type { Familia, Parametro, Tipo, Valor } from '../tipos.ts';
import type { Corpo, Ponto3 } from '../tiposCorpo.ts';
import type { Ligacao } from '../tiposLigacao.ts';
import { comprimento, derivado, nova } from './novosApoio.ts';
import { SISTEMA_ESGOTO } from './tuboEsgotoApoio.ts';

/*
 * Apoio das famílias de esgoto construídas DIRETO do catálogo da Krona (ficha P3/P4). Nenhuma medida é escrita aqui: cada
 * parâmetro derivado é uma `busca(DN, ...)` gerada da tabela do catálogo (`catalogosMep/kronaEsgoto.ts`), então corrigir ou
 * trocar o catálogo corrige a família. Estado dos dados: CONFERIR (ver docs/familias-parametricas/catalogos/README.md).
 *
 * LEITURA DAS COTAS (do desenho do fabricante; CONFERIR): B = profundidade da bolsa; D = diâmetro interno da bolsa; d = diâmetro
 * externo da ponta; Z = distância do centro (ou do eixo do ramal) à entrada da bolsa; C = comprimento total (só conferência).
 * O catálogo não traz a espessura da parede das conexões: usa-se a do TUBO da mesma bitola (CONFERIR). A geometria é SIMPLIFICADA:
 * cilindros ocos concorrentes, sem o contorno interno de fábrica, sem anel de vedação e sem nervuras.
 */

export const MATERIAL_KRONA_ESGOTO = 'mat_pvc';
export const SERIE_KRONA = 'Esgoto série normal';

export function itemKrona(id: string): ItemCatalogo {
  const it = KRONA_ESGOTO.itens.find((i) => i.id === id);
  if (!it) throw new Error(`Catálogo da Krona: item “${id}” não existe`);
  return it;
}

/** Tubo de 6 m do esgoto primário: dá a espessura de parede por bitola às conexões (CONFERIR). */
export const ITEM_TUBO_PRIMARIO = 'tubo_de_pvc_esgoto_primario_6m';

/** Colunas do catálogo → id de parâmetro da família. */
const ID_DA_COLUNA: Record<string, [string, string]> = {
  B: ['B', 'Profundidade da bolsa'], B1: ['B1', 'Bolsa 1'], B2: ['B2', 'Bolsa 2'], C: ['C', 'Comprimento total (catálogo)'], Z: ['Z', 'Centro até a bolsa'],
  Z1: ['Z1', 'Eixo do ramal até a bolsa (corrida)'], Z2: ['Z2', 'Eixo da corrida até a bolsa (ramal)'], D: ['Db', 'Diâmetro interno da bolsa'], d: ['De', 'Diâmetro externo da ponta'],
};

export function parametroDnKrona(item: ItemCatalogo, padrao: number): Parametro {
  return { id: 'DN', nome: 'Diâmetro nominal (DN)', tipo: 'enum', escopo: 'tipo', padrao, grupo: 'Bitola', opcoes: bitolasDoItem(item).map((b) => ({ valor: b, rotulo: `DN ${b}` })) };
}

/** Um parâmetro derivado por coluna pedida, lendo o catálogo; a espessura vem do tubo primário. */
export function parametrosDoCatalogo(item: ItemCatalogo, colunas: string[]): Parametro[] {
  const out: Parametro[] = [];
  for (const c of colunas) {
    const alvo = ID_DA_COLUNA[c];
    const expr = buscaDaColuna(item, c, 'DN');
    if (!alvo || !expr) throw new Error(`Catálogo da Krona: coluna ${c} sem leitura em “${item.id}”`);
    out.push(derivado(alvo[0], alvo[1], expr));
  }
  const e = buscaDaColuna(itemKrona(ITEM_TUBO_PRIMARIO), 'e', 'DN');
  if (e) out.push(derivado('e', 'Espessura da parede (do tubo; CONFERIR)', e));
  return out;
}

export const dimensaoKrona = (id: 'L' | 'A' | 'P', nome: string): Parametro => comprimento(id, nome, 100, 1, 6000, 1);

/** Anel de PVC: externo e interno por fórmula. */
export const anel = (ext: string, int: string) => ({ tipo: 'anel' as const, diametroExterno: ext, diametroInterno: int });

/** Cilindro oco ao longo do eixo local Z do corpo, do ponto `origem`, girado por `rotacao` (graus em X, Y, Z). */
export function oco(id: string, nome: string, papel: Corpo['papel'], ext: string, int: string, comp: string, origem: Ponto3, rotacao?: Ponto3): Corpo {
  return { id, nome, papel, forma: { tipo: 'extrusao', perfil: anel(ext, int), comprimento: comp }, quadro: { origem, ...(rotacao ? { rotacao } : {}) }, material: MATERIAL_KRONA_ESGOTO };
}

/** Disco cheio (fundo do cap). */
export function disco(id: string, nome: string, diametro: string, comp: string, origem: Ponto3): Corpo {
  return { id, nome, papel: 'conexao', forma: { tipo: 'extrusao', perfil: { tipo: 'circulo', diametro }, comprimento: comp }, quadro: { origem }, material: MATERIAL_KRONA_ESGOTO };
}

/** Ligação de esgoto; `bolsa` é a expressão da profundidade da bolsa (ponta lisa não passa nada). A bolsa vai em `propriedades`. */
export function ligacaoKrona(id: string, nome: string, posicao: Ponto3, direcao: Ponto3, diametro: string, bolsa?: string): Ligacao {
  return {
    id, nome, dominio: 'esgoto', sistema: SISTEMA_ESGOTO, secao: 'redonda', posicao, direcao, diametro, fluxo: 'ambos',
    ...(bolsa ? { propriedades: { profundidadeBolsa: bolsa } } : {}),
  };
}

/** Um tipo por bitola do item; `caixa` devolve L, A e P nominais a partir da linha do catálogo e da espessura. */
export function tiposKrona(item: ItemCatalogo, caixa: (v: Record<string, number>, e: number) => { L: number; A: number; P: number }): Tipo[] {
  const tubo = itemKrona(ITEM_TUBO_PRIMARIO);
  return bitolasDoItem(item).map((dn) => {
    const v = linhaDaBitola(item, dn)?.valores ?? {};
    const e = linhaDaBitola(tubo, dn)?.valores.e ?? 0;
    const c = caixa(v, e);
    const valores: Record<string, Valor> = { DN: dn, L: arred(c.L), A: arred(c.A), P: arred(c.P) };
    return { id: `dn${dn}`, nome: `DN ${dn}`, valores };
  });
}

const arred = (x: number): number => Math.round(x * 10) / 10;
export const diametroExtBolsa = (v: Record<string, number>, e: number): number => (v.D ?? v.d ?? 0) + 2 * e;

export interface DadosKrona {
  id: string;
  nome: string;
  categoria: 'tubulacao' | 'conexao_tubo';
  descricao: string;
  item: ItemCatalogo;
  colunas: string[];
  corpos: Corpo[];
  ligacoes: Ligacao[];
  ifc: NonNullable<Familia['ifc']>;
  caixa: (v: Record<string, number>, e: number) => { L: number; A: number; P: number };
}

/** Família de esgoto montada do catálogo: parâmetros derivados, tipos por bitola e fonte citada na descrição. */
export function familiaKrona(d: DadosKrona): Familia {
  const bitolas = bitolasDoItem(d.item);
  const padrao = bitolas.includes(100) ? 100 : (bitolas[0] ?? 0);
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: 'hidrossanitario',
    descricao: `${d.descricao} Medidas lidas do catálogo da Krona (${d.item.nome}, página ${d.item.pagina ?? '?'}); estado: ${d.item.estado}. Geometria simplificada. Não afirma conformidade com norma.`,
    parametros: [parametroDnKrona(d.item, padrao), ...parametrosDoCatalogo(d.item, d.colunas), dimensaoKrona('L', 'Comprimento'), dimensaoKrona('A', 'Altura'), dimensaoKrona('P', 'Profundidade')],
    pecas: [],
    conectores: [],
    tipos: tiposKrona(d.item, d.caixa),
    tipoPadrao: `dn${padrao}`,
  });
  return { ...base, corpos: d.corpos, ligacoes: d.ligacoes, ifc: d.ifc };
}

export { bitolaNumerica };
