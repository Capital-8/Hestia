import { bitolaNumerica, buscaDaColuna, buscaPorCodigo, juntarItens, linhasCom, type ItemCatalogo } from '../catalogoMep.ts';
import { KRONA_ESGOTO } from '../catalogosMep/kronaEsgoto.ts';
import { KRONA_SOLDAVEL } from '../catalogosMep/kronaSoldavel.ts';
import type { Familia, Parametro, Tipo, Valor } from '../tipos.ts';
import type { Corpo, Ponto3 } from '../tiposCorpo.ts';
import type { DominioLigacao, Ligacao } from '../tiposLigacao.ts';
import { comprimento, derivado, nova } from './novosApoio.ts';
import { SISTEMA_ESGOTO } from './tuboEsgotoApoio.ts';

/*
 * Apoio das famílias de esgoto construídas DIRETO do catálogo da Krona (fichas P3 e P4). Nenhuma medida é escrita aqui: cada
 * parâmetro derivado é uma `busca(chave, ...)` gerada da tabela do catálogo (`catalogosMep/kronaEsgoto.ts`), então corrigir ou
 * trocar o catálogo corrige a família. Estado dos dados: CONFERIR (ver docs/familias-parametricas/catalogos/README.md).
 *
 * IDS DE PARÂMETRO (leitura das cotas do desenho do fabricante; CONFERIR): B = profundidade da bolsa; Db = diâmetro interno da bolsa
 * (D do catálogo); De = diâmetro externo da ponta (d); Z = distância do centro (ou do eixo) à entrada da bolsa; C = comprimento
 * total; e = espessura da parede. O catálogo não traz a espessura das conexões: usa-se a do TUBO da bitola maior (CONFERIR).
 * A geometria é SIMPLIFICADA: cilindros ocos concorrentes, sem o contorno interno de fábrica, sem anel de vedação e sem nervuras.
 */

export const MATERIAL_KRONA_ESGOTO = 'mat_pvc';

export function itemKrona(id: string): ItemCatalogo {
  const it = [...KRONA_ESGOTO.itens, ...KRONA_SOLDAVEL.itens].find((i) => i.id === id);
  if (!it) throw new Error(`Catálogo da Krona: item “${id}” não existe`);
  return it;
}

/** Tubos do esgoto da série normal, de onde vem a espessura de parede por bitola (CONFERIR). */
export const ITENS_TUBO_NORMAL = ['tubo_de_pvc_esgoto_primario_6m', 'tubos_de_pvc_esgoto_secundario_6m', 'tubos_de_pvc_esgoto_secundario_6m_3'] as const;
/** Tubo da série reforçada (as linhas 0136 a 0139; a 0135 tem a bitola repetida no PDF e fica de fora). */
export const ITEM_TUBO_REFORCADO = 'tubo_de_pvc_esgoto_serie_reforcada_6m';
export const ITEM_TUBO_SOLDAVEL = 'tubo_de_pvc_soldavel_6m';

/** Domínio, sistema e material das ligações e corpos de uma linha de produtos. */
export interface Contexto {
  dominio: DominioLigacao;
  sistema: string;
}
export const ESGOTO: Contexto = { dominio: 'esgoto', sistema: SISTEMA_ESGOTO };
export const AGUA_FRIA: Contexto = { dominio: 'agua_fria', sistema: 'Água fria' };
export const ELETRICA: Contexto = { dominio: 'eletroduto', sistema: 'Eletroduto' };

export type SerieKrona = 'normal' | 'reforcada' | 'soldavel';

/** Espessura da parede por bitola numérica, juntando os tubos da série (nunca inventa: bitola sem tubo fica sem espessura). */
export function espessurasDoTubo(serie: SerieKrona): Map<number, number> {
  const itens = serie === 'normal' ? ITENS_TUBO_NORMAL.map(itemKrona) : serie === 'soldavel' ? [itemKrona(ITEM_TUBO_SOLDAVEL)] : [itemKrona(ITEM_TUBO_REFORCADO)];
  const mapa = new Map<number, number>();
  for (const it of itens) {
    for (const l of it.linhas) {
      const b = bitolaNumerica(l.bitola);
      if (b === null || l.valores.e === undefined) continue;
      if (serie === 'reforcada' && l.codigo === '0135') continue; // bitola repetida no PDF (ver README dos catálogos)
      mapa.set(b, l.valores.e);
    }
  }
  return mapa;
}

/** Maior número da bitola ("75 x 50" → 75): é o diâmetro do tubo que dá a espessura. */
export function bitolaMaior(bitola: string): number {
  return Math.max(...(bitola.match(/\d+(?:[.,]\d+)?/g) ?? ['0']).map((x) => Number(x.replace(',', '.'))));
}

export interface PedidoItem {
  /** Ids dos itens do catálogo a juntar (ex.: primário + secundário). */
  itens: string[];
  /** Coluna do catálogo → id de parâmetro (só as usadas). */
  mapa: Record<string, string>;
  /** Coluna ausente copia outra (nomes DO CATÁLOGO), ex.: `{ d: 'D' }`. */
  padroes?: Record<string, string>;
  /** Parâmetro novo copiado de outro (ids de parâmetro), ex.: `{ Z2: 'Z' }` quando o catálogo traz uma cota só para os dois ramais. */
  copias?: Record<string, string>;
  /** Códigos de produto a deixar de fora (erro de impressão conhecido no PDF; documentar no README dos catálogos). */
  excluir?: string[];
  serie: SerieKrona;
  /** A conexão traz o diâmetro externo A: a espessura é (A − D) / 2 (soldável), em vez da do tubo. A coluna A vai para o id `Aext`. */
  espessuraDoA?: boolean;
}

/** Junta os itens, renomeia as colunas para ids de parâmetro e acrescenta `e` (espessura). Linhas incompletas saem. */
export function itemDaFamilia(id: string, nome: string, p: PedidoItem): ItemCatalogo {
  const cat = p.itens.map(itemKrona);
  const colunas = Object.keys(p.mapa);
  const junto = juntarItens(id, nome, cat, colunas, p.padroes);
  const esp = espessurasDoTubo(p.serie);
  const linhas = junto.linhas
    .filter((l) => !(p.excluir ?? []).includes(l.codigo ?? ''))
    .map((l) => {
      const eProprio = Object.values(p.mapa).includes('e');
      const e = p.espessuraDoA || eProprio ? 0 : esp.get(bitolaMaior(l.bitola));
      const valores: Record<string, number> = {};
      for (const [col, alvo] of Object.entries(p.mapa)) valores[alvo] = l.valores[col] as number;
      for (const [novo, de] of Object.entries(p.copias ?? {})) valores[novo] = valores[de] as number;
      if (e === undefined) return null;
      return { ...l, valores: p.espessuraDoA || eProprio ? valores : { ...valores, e } };
    })
    .filter((l): l is NonNullable<typeof l> => l !== null);
  const significado: Record<string, string> = p.espessuraDoA || Object.values(p.mapa).includes('e') ? {} : { e: 'espessura da parede (do tubo; CONFERIR)' };
  for (const [col, alvo] of Object.entries(p.mapa)) significado[alvo] = junto.colunas[col] ?? col;
  for (const novo of Object.keys(p.copias ?? {})) significado[novo] = significado[p.copias?.[novo] ?? ''] ?? novo;
  return { ...junto, colunas: significado, linhas };
}

const NOMES: Record<string, string> = {
  B: 'Profundidade da bolsa', B2: 'Profundidade da bolsa do ramal', C: 'Comprimento total (catálogo)', Z: 'Centro até a bolsa', Z2: 'Eixo da corrida até a bolsa (ramal)',
  Aext: 'Diâmetro externo da bolsa (A)', C1: 'Comprimento do ramal (catálogo)', Db: 'Diâmetro interno da bolsa', Db2: 'Diâmetro interno da bolsa do ramal', De: 'Diâmetro externo da ponta', C2: 'Comprimento menor (catálogo)', e: 'Espessura da parede (do tubo; CONFERIR)',
};

/** Chave da família: DN numérico quando toda bitola é número, senão o CÓDIGO do produto (bitola composta, ex.: 75 x 50). */
export const chaveDoItem = (item: ItemCatalogo): 'DN' | 'COD' => (item.linhas.every((l) => bitolaNumerica(l.bitola) !== null) ? 'DN' : 'COD');

export function parametroChave(item: ItemCatalogo): Parametro {
  const dn = chaveDoItem(item) === 'DN';
  const linhas = [...item.linhas].sort((a, b) => bitolaMaior(a.bitola) - bitolaMaior(b.bitola) || bitolaMaior(b.bitola.split(/x/i)[1] ?? '0') - bitolaMaior(a.bitola.split(/x/i)[1] ?? '0'));
  const opcoes = linhas.map((l) => (dn ? { valor: Number(l.bitola), rotulo: `DN ${l.bitola}` } : { valor: Number(l.codigo), rotulo: `DN ${l.bitola}` }));
  const padrao = (dn ? Number(linhas.find((l) => l.bitola === '100')?.bitola ?? linhas[0]?.bitola) : Number(linhas[0]?.codigo));
  return { id: dn ? 'DN' : 'COD', nome: dn ? 'Diâmetro nominal (DN)' : 'Bitola (maior x menor)', tipo: 'enum', escopo: 'tipo', padrao, grupo: 'Bitola', opcoes };
}

export function parametrosDoItem(item: ItemCatalogo): Parametro[] {
  const chave = chaveDoItem(item);
  const ler = chave === 'DN' ? buscaDaColuna : buscaPorCodigo;
  const params = Object.keys(item.colunas).map((c) => {
    const expr = ler(item, c, chave);
    if (!expr) throw new Error(`Catálogo da Krona: coluna ${c} sem valores em “${item.id}”`);
    return derivado(c, NOMES[c] ?? c, expr);
  });
  if (item.colunas.Aext !== undefined && item.colunas.e === undefined) params.push(derivado('e', 'Espessura da parede ((A − D) / 2; CONFERIR)', '(Aext - Db) / 2'));
  return params;
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

/** Ligação de esgoto; `bolsa` é a expressão da profundidade da bolsa (sem ela, a ligação é ponta lisa). Vai em `encaixe` (ficha P1). */
export function ligacaoKrona(ctx: Contexto, id: string, nome: string, posicao: Ponto3, direcao: Ponto3, diametro: string, bolsa?: string, aceitaMesmoTipo = false): Ligacao {
  return {
    id, nome, dominio: ctx.dominio, sistema: ctx.sistema, secao: 'redonda', posicao, direcao, diametro, fluxo: 'ambos',
    encaixe: bolsa ? { tipo: 'bolsa', profundidade: bolsa } : { tipo: 'ponta', ...(aceitaMesmoTipo ? { aceitaMesmoTipo: true } : {}) },
  };
}

export type Caixa = (v: Record<string, number>) => { L: number; A: number; P: number };
const arred = (x: number): number => Math.round(x * 10) / 10;

/** Um tipo por linha do item; `caixa` dá L, A e P nominais. */
export function tiposDoItem(item: ItemCatalogo, caixa: Caixa): Tipo[] {
  const chave = chaveDoItem(item);
  return linhasCom(item, Object.keys(item.colunas)).map((l) => {
    const c = caixa(l.valores);
    const base: Record<string, Valor> = chave === 'DN' ? { DN: Number(l.bitola) } : { COD: Number(l.codigo) };
    return { id: chave === 'DN' ? `dn${l.bitola}` : `cod${l.codigo}`, nome: `DN ${l.bitola}`, valores: { ...base, L: arred(c.L), A: arred(c.A), P: arred(c.P) } };
  });
}

/** Diâmetro externo da parede da bolsa (mm). */
export const externo = (v: Record<string, number>): number => (v.Db ?? 0) + 2 * (v.e ?? 0);

export interface DadosKrona {
  id: string;
  nome: string;
  categoria: 'tubulacao' | 'conexao_tubo';
  descricao: string;
  item: ItemCatalogo;
  corpos: Corpo[];
  ligacoes: Ligacao[];
  ifc: NonNullable<Familia['ifc']>;
  caixa: Caixa;
  /** Texto da origem das medidas na descrição; padrão: o catálogo da Krona. */
  fonte?: string;
  /** Disciplina da família; padrão `hidrossanitario`. */
  disciplina?: Familia['disciplina'];
}

/** Família de tubulação montada do catálogo: parâmetros derivados, tipos por bitola e fonte citada na descrição. */
export function familiaKrona(d: DadosKrona): Familia {
  const chave = parametroChave(d.item);
  const tipos = tiposDoItem(d.item, d.caixa);
  const padraoTipo = tipos.find((t) => t.valores[chave.id] === chave.padrao)?.id ?? tipos[0]?.id ?? '';
  const base = nova({
    id: d.id,
    nome: d.nome,
    categoria: d.categoria,
    disciplina: d.disciplina ?? 'hidrossanitario',
    descricao: `${d.descricao} Medidas lidas de ${d.fonte ?? `catálogo da Krona (${d.item.serie}, página ${d.item.pagina ?? '?'})`}; estado: ${d.item.estado}. Geometria simplificada. Não afirma conformidade com norma.`,
    parametros: [chave, ...parametrosDoItem(d.item), dimensaoKrona('L', 'Comprimento'), dimensaoKrona('A', 'Altura'), dimensaoKrona('P', 'Profundidade')],
    pecas: [],
    conectores: [],
    tipos,
    tipoPadrao: padraoTipo,
  });
  return { ...base, corpos: d.corpos, ligacoes: d.ligacoes, ifc: d.ifc };
}

/** Especificação de uma família do catálogo: itens a juntar, geometria (receita) e classe IFC. */
export interface SpecKrona {
  id: string;
  nome: string;
  categoria: 'tubulacao' | 'conexao_tubo';
  descricao: string;
  pedido: PedidoItem;
  receita: { corpos: Corpo[]; ligacoes: Ligacao[]; caixa: Caixa };
  ifc: NonNullable<Familia['ifc']>;
}

/** Material visual de cada linha de produto (cor do PVC da Krona: esgoto branco, reforçado bege, soldável marrom). */
export const MATERIAL_POR_SERIE: Readonly<Record<SerieKrona, string>> = { normal: 'mat_pvc_branco', reforcada: 'mat_pvc_bege', soldavel: 'mat_pvc_marrom' };

/** Corpos com o material trocado (a receita traz o apelido genérico `mat_pvc`). */
export const comMaterial = (corpos: Corpo[], material: string): Corpo[] => corpos.map((c) => ({ ...c, material }));

export function montarKrona(s: SpecKrona): Familia {
  const item = itemDaFamilia(s.id, s.nome, s.pedido);
  return familiaKrona({ id: s.id, nome: s.nome, categoria: s.categoria, descricao: s.descricao, item, corpos: comMaterial(s.receita.corpos, MATERIAL_POR_SERIE[s.pedido.serie]), ligacoes: s.receita.ligacoes, ifc: s.ifc, caixa: s.receita.caixa });
}
