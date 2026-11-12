import {
  OPENING_LINTEL_DEFAULTS,
  canonComposition,
  compositionOfType,
  newId,
  openingFamilies,
  withBridgedComposition,
  type CellNode,
  type CompositionNode,
  type Id,
  type ProfilePreset,
  type OpeningFamily,
  type OpeningFrameStyle,
  type OpeningHandle,
  type OpeningLeafStyle,
  type OpeningLeaves,
  type OpeningType,
} from '@hestia/model';
import { t as translate, type Dict, type Lang } from '../../editor/i18n.ts';

/** Estilos de folha aceitos por categoria (o schema é fechado; o diálogo só oferece estes). */
const LEAF_STYLES_BY_KIND: Record<'door' | 'window', readonly OpeningLeafStyle[]> = {
  door: ['flush', 'panel', 'glass', 'louver', 'grille'],
  window: ['glass', 'louver', 'grille'],
};

/** Estilo de folha padrão da categoria (o mesmo de `openingStyle.ts`). */
export function defaultLeafStyle(kind: OpeningType['kind']): OpeningLeafStyle {
  return kind === 'door' ? 'flush' : 'glass';
}

/** Estilo de folha válido para a família (por categoria). */
export function leafStyleValidFor(family: OpeningFamily, style: OpeningLeafStyle | undefined): boolean {
  return style !== undefined && LEAF_STYLES_BY_KIND[family.kind].includes(style);
}

/** Divisões do caixilho dentro do contrato (inteiros de 1 a 8). */
export function gridValid(grid: { cols: number; rows: number } | undefined): boolean {
  return (
    grid !== undefined &&
    Number.isInteger(grid.cols) &&
    Number.isInteger(grid.rows) &&
    grid.cols >= 1 &&
    grid.cols <= 8 &&
    grid.rows >= 1 &&
    grid.rows <= 8
  );
}

/** Maçaneta coerente com a família: haste só na porta de giro e na dupla. */
export function defaultHandleFor(family: OpeningFamily): OpeningHandle {
  return family.id === 'door_swing' || family.id === 'door_double' ? 'lever' : 'none';
}

/** Ângulo 3D coerente: maxim-ar e basculante abrem 30°; as demais famílias, 90°. */
export function defaultAngle3dFor(family: OpeningFamily): number {
  return family.id === 'window_casement' || family.id === 'window_tilt' ? 30 : 90;
}

/** Famílias oferecidas ao tipo (portas ou janelas), na ordem da interface. */
export function familyOptionsFor(kind: OpeningType['kind'], lang: Lang = 'pt'): OpeningFamily[] {
  return openingFamilies(kind, lang);
}

/** Rótulo da contagem de folhas ("Vão livre (sem folha)", "1 folha", "2 folhas", "3 folhas"). */
export function leavesLabel(leaves: OpeningLeaves, lang: Lang = 'pt'): string {
  if (leaves === 0) return translate(lang, 'dlo_leaves_void');
  return translate(lang, leaves > 1 ? 'dlo_leaves_many' : 'dlo_leaves_one', { n: leaves });
}

/** Opções de contagem de folhas aceitas pela família, com o rótulo da interface. */
export function leavesChoicesFor(family: OpeningFamily, lang: Lang = 'pt'): Array<{ value: OpeningLeaves; label: string }> {
  return family.leaves.map((value) => ({ value, label: leavesLabel(value, lang) }));
}

/**
 * Aplica a família escolhida ao tipo: grava o símbolo e a 1ª contagem de folhas que ela aceita. O estilo da folha é
 * preservado quando válido para a nova categoria e volta ao padrão quando não; o grid só existe em janela (em porta o
 * campo é removido, voltando ao padrão por leitura).
 */
export function applyFamily(t: OpeningType, family: OpeningFamily): OpeningType {
  const next: OpeningType = { ...t, plan: family.plan, leaves: family.leaves[0] ?? t.leaves };
  if (t.leafStyle !== undefined && !leafStyleValidFor(family, t.leafStyle)) {
    next.leafStyle = defaultLeafStyle(family.kind);
  }
  if (family.kind === 'window') {
    if (t.grid !== undefined) next.grid = gridValid(t.grid) ? t.grid : { cols: 1, rows: 1 };
  } else {
    delete next.grid;
  }
  return next;
}

/** Tipo novo a partir da família escolhida, com nome, medidas e campos v2 padrão coerentes com a família. */
export function newOpeningTypeFromFamily(family: OpeningFamily, lang: Lang = 'pt'): OpeningType {
  const door = family.kind === 'door';
  const base: OpeningType = {
    id: newId('ot'),
    kind: family.kind,
    name: translate(lang, door ? 'dlo_new_door' : 'dlo_new_window'),
    code: '',
    description: '',
    width: door ? 0.8 : 1.2,
    height: door ? 2.1 : 1.2,
    sill: door ? 0 : 1.1,
    leaves: family.leaves[0] ?? 1,
    plan: family.plan,
    frameMaterialId: door ? 'mat_madeira' : 'mat_aluminio',
    glassMaterialId: 'mat_vidro',
    closure: 'inherit',
    leafStyle: defaultLeafStyle(family.kind),
    handle: defaultHandleFor(family),
    frameStyle: 'rebate',
    frameDepthMode: 'wall',
    angle2d: 90,
    angle3d: defaultAngle3dFor(family),
  };
  return door ? base : { ...base, grid: { cols: 1, rows: 1 } };
}

/** Altura padrão da bandeira ao ligá-la: 0,40 m ou 0,60 m abaixo do topo, o que for menor. */
export function defaultTransomHeight(height: number): number {
  return Math.round(Math.min(0.4, Math.max(0.1, height - 0.6)) * 100) / 100;
}

/** Liga (altura padrão fixa) ou desliga a bandeira superior; desligar tira o campo (volta ao padrão por leitura). */
export function alternarTransom(t: OpeningType, ligado: boolean): OpeningType {
  const next: OpeningType = { ...t };
  delete next.transom;
  return ligado ? { ...next, transom: { height: defaultTransomHeight(t.height), fixed: true } } : next;
}

/** Largura padrão da bandeira lateral ao ligá-la: até 0,30 m, um quarto do vão. */
export function defaultSidelightWidth(width: number): number {
  return Math.round(Math.min(0.3, Math.max(0.05, width / 4)) * 100) / 100;
}

/**
 * Liga ou desliga a bandeira lateral de um lado. Sem nenhum lado ligado, o campo sai do tipo; ligar grava a largura
 * padrão (a já existente é preservada).
 */
export function alternarSidelight(t: OpeningType, side: 'left' | 'right', ligado: boolean): OpeningType {
  const cur = t.sidelights;
  const left = side === 'left' ? ligado : cur?.left === true;
  const right = side === 'right' ? ligado : cur?.right === true;
  const next: OpeningType = { ...t };
  delete next.sidelights;
  if (!left && !right) return next;
  const width = cur && cur.width > 0 ? cur.width : defaultSidelightWidth(t.width);
  return { ...next, sidelights: { left, right, width } };
}

/** Variante da biblioteca: escreve o estilo da folha, as divisões e/ou o perfil no rascunho. */
export interface OpeningVariant {
  id: string;
  /** Chave do nome exibido na biblioteca (quando o nome é traduzível). */
  nameKey?: keyof Dict;
  /** Nome já neutro ao idioma (ex.: "2 × 1"). */
  name?: string;
  leafStyle?: OpeningLeafStyle;
  grid?: { cols: number; rows: number };
  frameStyle?: OpeningFrameStyle;
}

const DOOR_VARIANTS: readonly OpeningVariant[] = [
  { id: 'lisa', nameKey: 'dlo_o_leaf_flush', leafStyle: 'flush' },
  { id: 'painel', nameKey: 'dlo_o_leaf_panel', leafStyle: 'panel' },
  { id: 'vidro', nameKey: 'dlo_o_leaf_glass', leafStyle: 'glass' },
  { id: 'veneziana', nameKey: 'dlo_o_leaf_louver', leafStyle: 'louver' },
  { id: 'grade', nameKey: 'dlo_o_leaf_grille', leafStyle: 'grille' },
];

const WINDOW_VARIANTS: readonly OpeningVariant[] = [
  { id: '1x1', name: '1 × 1', leafStyle: 'glass', grid: { cols: 1, rows: 1 } },
  { id: '2x1', name: '2 × 1', leafStyle: 'glass', grid: { cols: 2, rows: 1 } },
  { id: '2x2', name: '2 × 2', leafStyle: 'glass', grid: { cols: 2, rows: 2 } },
  { id: '3x1', name: '3 × 1', leafStyle: 'glass', grid: { cols: 3, rows: 1 } },
  { id: 'veneziana', nameKey: 'dlo_o_leaf_louver', leafStyle: 'louver' },
  { id: 'perfil-simples', nameKey: 'dlo_o_variant_simple', frameStyle: 'simple' },
];

/** Variantes oferecidas para a categoria (porta: estilo da folha; janela: divisões e perfil). */
export function openingVariants(kind: OpeningType['kind']): readonly OpeningVariant[] {
  return kind === 'door' ? DOOR_VARIANTS : WINDOW_VARIANTS;
}

/**
 * Aplica a variante ao rascunho: grava o estilo da folha, o grid e o perfil. A variante muda o layout, não o material:
 * batente, folha e vidro ficam como estão (quem troca o material é o campo de material do diálogo).
 */
export function applyVariant(t: OpeningType, variant: OpeningVariant): OpeningType {
  const next: OpeningType = { ...t };
  if (variant.leafStyle !== undefined) next.leafStyle = variant.leafStyle;
  if (variant.grid !== undefined) next.grid = { ...variant.grid };
  if (variant.frameStyle !== undefined) next.frameStyle = variant.frameStyle;
  return next;
}

/** Acabamentos que o diálogo liga e desliga (alizar, soleira saliente, verga e contraverga). */
export type CampoAcabamento = 'casing' | 'sillBoard' | 'lintel' | 'sillBeam';

/** Valores que um acabamento recebe ao ser ligado (depois o usuário ajusta). Verga e contraverga usam o padrão do modelo. */
export const ACABAMENTO_PADRAO = {
  casing: { width: 0.05, thickness: 0.015 },
  sillBoard: { projection: 0.03, thickness: 0.03 },
  lintel: { ...OPENING_LINTEL_DEFAULTS },
  sillBeam: { ...OPENING_LINTEL_DEFAULTS },
} as const;

/** Liga (valor padrão) ou desliga (tira o campo, que volta ao padrão por leitura) um acabamento do tipo. Função pura. */
export function alternarAcabamento(t: OpeningType, campo: CampoAcabamento, ligado: boolean): OpeningType {
  const next: OpeningType = { ...t };
  delete next[campo];
  return ligado ? Object.assign(next, { [campo]: { ...ACABAMENTO_PADRAO[campo] } }) : next;
}

/** A composição do tipo foi editada nos módulos (não é só a derivada dos campos antigos). */
export function hasAuthoredComposition(t: OpeningType): boolean {
  return !!t.composition && canonComposition(t.composition) !== canonComposition(compositionOfType(t));
}

/**
 * Passa o rascunho pela ponte da composição, como o comando `upsertOpeningType` fará ao gravar: editar um campo antigo (família,
 * bandeira, medidas...) regenera a composição derivada; a composição editada nos módulos é preservada. Composição inválida não
 * bloqueia a edição do rascunho: o erro volta para o diálogo mostrar.
 */
export function bridgeDraft(next: OpeningType, prev: OpeningType, presets?: Record<string, ProfilePreset>, lang: Lang = 'pt'): { type: OpeningType; error: string | null } {
  try {
    return { type: withBridgedComposition(next, prev, presets), error: null };
  } catch (e) {
    return { type: next, error: e instanceof Error ? e.message : translate(lang, 'dlo_err_composition') };
  }
}

/**
 * Troca de família num tipo cuja composição foi editada nos módulos: a composição não se regenera, então a célula de folha
 * principal recebe a família, o símbolo e as folhas novas (senão a prévia e o modelo continuariam com a família antiga).
 */
export function syncFamilyInComposition(t: OpeningType, family: OpeningFamily): OpeningType {
  const c = t.composition;
  if (!c) return t;
  let feito = false;
  const mapa = (n: CompositionNode): CompositionNode => {
    if (n.kind === 'cell') {
      if (feito || n.content.kind !== 'leaf') return n;
      feito = true;
      const cell: CellNode = { ...n, content: { ...n.content, family: family.id, plan: t.plan, leaves: t.leaves } };
      return cell;
    }
    return { ...n, children: n.children.map((ch) => ({ ...ch, node: mapa(ch.node) })) };
  };
  return { ...t, composition: { ...c, layout: mapa(c.layout) } };
}
