import type { DetailLevel, GraphicsCategory, PartialStructure, VisualStyle } from '@hestia/model';
import { t, type Dict, type Lang } from '../editor/i18n.ts';

/** Rótulos dos gráficos de vista (decisão 0015 §3), compartilhados pelas propriedades e pelos diálogos. */

/** Mapa de chaves do dicionário por categoria (o texto vem do idioma ativo). */
const CATEGORY_KEY: Record<GraphicsCategory, keyof Dict> = {
  wall: 'tool_wall',
  door: 'tool_door',
  window: 'tool_window',
  floor: 'tool_floor',
  slab: 'tool_slab',
  roof: 'tool_roof',
  stair: 'cvn_cat_stair',
  room: 'tool_room',
  annotation: 'cvn_cat_annotation',
  generic: 'cvn_cat_generic',
};

const VISUAL_STYLE_KEY: Record<VisualStyle, keyof Dict> = {
  wireframe: 'cvn_style_wireframe',
  hiddenLine: 'cvn_style_hidden',
  shaded: 'style_shaded',
  consistentColors: 'cvn_style_consistent',
  realistic: 'cvn_style_realistic',
};

const PARTIAL_KEY: Record<PartialStructure, keyof Dict> = {
  entire: 'cvn_partial_entire',
  noFinishes: 'cvn_partial_no_finishes',
  coreOnly: 'cvn_partial_core',
};

const DETAIL_KEY: Record<DetailLevel | 'byScale', keyof Dict> = {
  byScale: 'cvn_detail_by_scale',
  coarse: 'cvn_detail_coarse',
  medium: 'detail_medium',
  fine: 'cvn_detail_fine',
};

/** Converte um mapa de chaves no mapa de textos PT (compatibilidade: PT é o fallback do app). */
function ptLabels<K extends string>(keys: Record<K, keyof Dict>): Record<K, string> {
  return Object.fromEntries(Object.entries(keys).map(([key, texto]) => [key, t('pt', texto as keyof Dict)])) as Record<K, string>;
}

/**
 * Mapas PT mantidos para os consumidores que ainda leem `CATEGORY_LABEL[x]` diretamente
 * (Properties/ViewControlBar/diálogos). Código novo deve usar as funções `*Label(key, lang)`.
 */
export const CATEGORY_LABEL: Record<GraphicsCategory, string> = ptLabels(CATEGORY_KEY);
export const VISUAL_STYLE_LABEL: Record<VisualStyle, string> = ptLabels(VISUAL_STYLE_KEY);
export const PARTIAL_LABEL: Record<PartialStructure, string> = ptLabels(PARTIAL_KEY);
export const DETAIL_LABEL: Record<DetailLevel | 'byScale', string> = ptLabels(DETAIL_KEY);

/** Rótulo da categoria de gráficos no idioma pedido. */
export function categoryLabel(categoria: GraphicsCategory, lang: Lang): string {
  return t(lang, CATEGORY_KEY[categoria]);
}

/** Rótulo do estilo visual no idioma pedido. */
export function visualStyleLabel(estilo: VisualStyle, lang: Lang): string {
  return t(lang, VISUAL_STYLE_KEY[estilo]);
}

/** Rótulo da estrutura parcial no idioma pedido. */
export function partialLabel(parcial: PartialStructure, lang: Lang): string {
  return t(lang, PARTIAL_KEY[parcial]);
}

/** Rótulo do nível de detalhe no idioma pedido. */
export function detailLabel(detalhe: DetailLevel | 'byScale', lang: Lang): string {
  return t(lang, DETAIL_KEY[detalhe]);
}

/** Escalas oferecidas na planta (denominador). Qualquer outra vem do campo livre. */
export const PLAN_SCALES: readonly number[] = [20, 50, 100, 200, 500];

/** Pesos de linha do Revit (1 a 16) para a lista dos estilos por categoria. */
export const WEIGHTS: readonly number[] = Array.from({ length: 16 }, (_, i) => i + 1);
