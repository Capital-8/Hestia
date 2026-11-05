import {
  OPENING_FAMILIES,
  OPENING_FRAME_DEFAULTS,
  compositionCells,
  compositionIssue,
  formatQuantity,
  nominalCellOf,
  openingCompositionOf,
  resolveLayout,
  type CellContent,
  type CellNode,
  type CellSize,
  type CompositionNode,
  type OpeningComposition,
  type OpeningFamilyId,
  type OpeningType,
  type ResolvedCell,
  type ResolvedUnits,
  type SplitNode,
} from '@hestia/model';
import type { Dict } from '../../../../editor/i18n.ts';

/*
 * Operações puras sobre a composição de um tipo (spec F1 §1 e §2). Cada função devolve um tipo NOVO; nada roda o motor.
 * Ações rápidas e edição de célula usam só o que o model exporta. A validação (`compositionIssue`) fica com o painel.
 */

/** Luz padrão de vidro fixo e painel cego ao acrescentar um módulo (m). */
export const MODULO_LUZ_PADRAO = 0.4;
/** Espessura padrão do painel cego (m, a validar). */
export const PAINEL_ESPESSURA_PADRAO = 0.04;

export type TipoConteudo = CellContent['kind'];
export type LeafContent = Extract<CellContent, { kind: 'leaf' }>;
export type Lado = 'esquerda' | 'direita' | 'topo';
export type Acao = 'bandeira' | 'esquerda' | 'direita' | 'painel' | 'duasColunas';

type Filho = SplitNode['children'][number];

/** Rótulos de conteúdo para a lista de módulos (chaves do dicionário). */
export const ROTULO_CONTEUDO: Readonly<Record<TipoConteudo, keyof Dict>> = { leaf: 'dlo_o_content_leaf', glass: 'dlo_o_content_glass', panel: 'dlo_o_content_panel', louver: 'dlo_o_content_louver' };

/** Ações rápidas por tipo de abertura (spec F6: porta e janela têm conjuntos diferentes). */
export const ACOES_PORTA: ReadonlyArray<readonly [Acao, keyof Dict]> = [
  ['bandeira', 'dlo_action_transom'],
  ['esquerda', 'dlo_action_left'],
  ['direita', 'dlo_action_right'],
  ['painel', 'dlo_action_side_panel'],
];
export const ACOES_JANELA: ReadonlyArray<readonly [Acao, keyof Dict]> = [
  ['duasColunas', 'dlo_action_split_two'],
  ['bandeira', 'dlo_action_stack_transom'],
];

/** Comprimento nas unidades do projeto, com duas casas (ex.: "0,88 m"). */
export const metrosTexto = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m, { decimals: 2 });

/** Substitui a composição do tipo (o campo passa a ser a fonte; a ponte F3–F5 confere ao salvar). */
export const comComposicao = (t: OpeningType, c: OpeningComposition): OpeningType => ({ ...t, composition: c });

/** Erro de validação da composição do tipo (null se válida). */
export const issueDe = (t: OpeningType): string | null => compositionIssue(openingCompositionOf(t));

/** Ids usados na árvore (células e divisões). */
function idsDe(node: CompositionNode, acc: Set<string>): Set<string> {
  acc.add(node.id);
  if (node.kind === 'split') node.children.forEach((ch) => idsDe(ch.node, acc));
  return acc;
}

/** Id novo, a partir de `base`, que não repete nenhum id da composição. */
export function novoId(c: OpeningComposition, base: string): string {
  const usados = idsDe(c.layout, new Set());
  let id = base;
  for (let n = 2; usados.has(id); n++) id = `${base}-${n}`;
  return id;
}

const contem = (node: CompositionNode, id: string): boolean => (node.kind === 'cell' ? node.id === id : node.children.some((ch) => contem(ch.node, id)));

/** Vidro fixo com o vidro do tipo (tipo e espessura; padrão de rebaixo). */
export function vidroPadrao(t: OpeningType): CellContent {
  return { kind: 'glass', glass: { kind: t.glassKind ?? 'clear', thickness: t.glassThickness ?? OPENING_FRAME_DEFAULTS.glass, mounting: 'rebate' } };
}

/** Conteúdo de folha de uma família (uma folha; as opções de folha ficam com o tipo). */
export function conteudoFolha(family: OpeningFamilyId): LeafContent {
  const f = OPENING_FAMILIES.find((x) => x.id === family);
  return { kind: 'leaf', family, plan: f?.plan ?? 'swing', leaves: 1, options: {} };
}

/** Famílias de uma folha só que valem para o tipo (porta ou janela); o vão livre fica de fora. */
export const familiasDoTipo = (kind: OpeningType['kind']) => OPENING_FAMILIES.filter((f) => f.kind === kind && f.leaves.includes(1) && f.id !== 'door_void');

/** Troca a família da folha, mantendo as opções e a espelhagem; o símbolo de planta segue a família. */
export function comFamilia(content: LeafContent, family: OpeningFamilyId): LeafContent {
  return { ...content, family, plan: OPENING_FAMILIES.find((f) => f.id === family)?.plan ?? content.plan };
}

/** Conteúdo padrão quando o usuário troca o tipo da célula. */
export function conteudoPadrao(t: OpeningType, tipo: TipoConteudo): CellContent {
  if (tipo === 'leaf') return conteudoFolha(familiasDoTipo(t.kind)[0]?.id ?? 'door_swing');
  if (tipo === 'glass') return vidroPadrao(t);
  if (tipo === 'panel') return { kind: 'panel', thickness: PAINEL_ESPESSURA_PADRAO };
  return { kind: 'louver' };
}

/** Acrescenta uma célula ao lado (esquerda, direita ou acima) da composição. O módulo principal passa a `fill`. */
export function adicionaModulo(c: OpeningComposition, lado: Lado, conteudo: CellContent, luz: number, base: string): OpeningComposition {
  const principal = nominalCellOf(c)?.id ?? compositionCells(c)[0]?.id ?? '';
  const eixo = lado === 'topo' ? 'rows' : 'cols';
  const antes = lado === 'esquerda';
  const novo: Filho = { size: { mode: 'fixed', value: luz }, node: { kind: 'cell', id: novoId(c, base), content: conteudo } };
  const raiz = c.layout;

  // Mesmo eixo: entra como irmão na divisão existente (o divisor é o padrão dela).
  if (raiz.kind === 'split' && raiz.axis === eixo) {
    let filhos: Filho[] = antes ? [novo, ...raiz.children] : [...raiz.children, novo];
    if (!filhos.some((f) => f.size.mode === 'fill')) filhos = filhos.map((f) => (contem(f.node, principal) ? { ...f, size: { mode: 'fill' } } : f));
    return { ...c, layout: { ...raiz, children: filhos } };
  }

  // Eixo novo: a raiz vira um filho `fill` de uma divisão nova (divisor padrão 0,05).
  const velho: Filho = { size: { mode: 'fill' }, node: raiz };
  const split: SplitNode = { kind: 'split', id: novoId(c, eixo === 'cols' ? 'colunas' : 'linhas'), axis: eixo, children: antes ? [novo, velho] : [velho, novo] };
  return { ...c, layout: split };
}

/** Aplica uma ação rápida ao tipo (divisor e vidro/painel padrão; ver spec §1, exemplos 2 a 4). */
export function aplicaAcao(t: OpeningType, acao: Acao): OpeningType {
  const c = openingCompositionOf(t);
  const vidro = vidroPadrao(t);
  const L = MODULO_LUZ_PADRAO;
  let next: OpeningComposition;
  switch (acao) {
    case 'bandeira':
      next = adicionaModulo(c, 'topo', vidro, L, 'bandeira');
      break;
    case 'esquerda':
      next = adicionaModulo(c, 'esquerda', vidro, L, 'lateral');
      break;
    case 'direita':
      next = adicionaModulo(c, 'direita', vidro, L, 'lateral');
      break;
    case 'painel':
      next = adicionaModulo(c, 'esquerda', { kind: 'panel', thickness: PAINEL_ESPESSURA_PADRAO }, L, 'painel');
      break;
    case 'duasColunas':
      next = adicionaModulo(c, 'direita', vidro, L, 'coluna');
      break;
  }
  return comComposicao(t, next);
}

/** Tira a célula da árvore; divisão que sobra com um filho colapsa nele (volta ao que havia antes). */
function tira(node: CompositionNode, id: string): CompositionNode | null {
  if (node.kind === 'cell') return node.id === id ? null : node;
  const filhos = node.children.flatMap((ch) => {
    const n = tira(ch.node, id);
    return n ? [{ ...ch, node: n }] : [];
  });
  const [unico] = filhos;
  if (!unico) return null;
  if (filhos.length === 1) return unico.node;
  return { ...node, children: filhos };
}

/** Pode remover: há mais de uma célula e não é a célula nominal (folha da referência do vão). */
export function podeRemover(c: OpeningComposition, id: string): boolean {
  return compositionCells(c).length > 1 && nominalCellOf(c)?.id !== id;
}

/** Remove um módulo; sem efeito se `podeRemover` for falso. */
export function removeModulo(t: OpeningType, id: string): OpeningType {
  const c = openingCompositionOf(t);
  if (!podeRemover(c, id)) return t;
  const layout = tira(c.layout, id);
  return layout ? comComposicao(t, { ...c, layout }) : t;
}

function mapFilho(node: CompositionNode, id: string, f: (ch: Filho) => Filho): CompositionNode {
  if (node.kind === 'cell') return node;
  return { ...node, children: node.children.map((ch) => (ch.node.kind === 'cell' && ch.node.id === id ? f(ch) : { ...ch, node: mapFilho(ch.node, id, f) })) };
}

function mapCelula(node: CompositionNode, id: string, f: (cell: CellNode) => CellNode): CompositionNode {
  if (node.kind === 'cell') return node.id === id ? f(node) : node;
  return { ...node, children: node.children.map((ch) => ({ ...ch, node: mapCelula(ch.node, id, f) })) };
}

/** Tamanho da célula na divisão (luz fixa ou preenche); null se a célula é a raiz. */
export function tamanhoDaCelula(c: OpeningComposition, id: string): CellSize | null {
  const ache = (node: CompositionNode): CellSize | null => {
    if (node.kind === 'cell') return null;
    for (const ch of node.children) {
      if (ch.node.kind === 'cell' && ch.node.id === id) return ch.size;
      const dentro = ache(ch.node);
      if (dentro) return dentro;
    }
    return null;
  };
  return ache(c.layout);
}

/** Muda a luz (fixa) ou marca a célula como `fill`. Dois `fill` na mesma divisão aparecem em `issueDe`. */
export function defineLuz(t: OpeningType, id: string, size: CellSize): OpeningType {
  const c = openingCompositionOf(t);
  return comComposicao(t, { ...c, layout: mapFilho(c.layout, id, (ch) => ({ ...ch, size })) });
}

/** Troca o conteúdo da célula. */
export function defineConteudo(t: OpeningType, id: string, content: CellContent): OpeningType {
  const c = openingCompositionOf(t);
  return comComposicao(t, { ...c, layout: mapCelula(c.layout, id, (cell) => ({ ...cell, content })) });
}

/** Medidas resolvidas por célula; null enquanto a composição tem erro (o motor não roda com ela). */
export function medidasCelulas(c: OpeningComposition): Map<string, ResolvedCell> | null {
  if (compositionIssue(c)) return null;
  return new Map(resolveLayout(c).cells.map((x) => [x.id, x]));
}
