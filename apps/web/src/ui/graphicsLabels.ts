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
  railing: 'cvn_cat_railing',
  site: 'cvn_cat_site',
  lot: 'cvn_cat_lot',
  mass: 'cvn_cat_mass',
  room: 'tool_room',
  annotation: 'cvn_cat_annotation',
  generic: 'cvn_cat_generic',
  // Categorias por elemento (adendo 2 do ADR 0060): cada uma tem rótulo próprio (etapa 4.5d).
  column: 'cvn_cat_column',
  beam: 'cvn_cat_beam',
  footing: 'cvn_cat_footing',
  ceiling: 'cvn_cat_ceiling',
  ramp: 'cvn_cat_ramp',
  component: 'cvn_cat_component',
  plumbingFixture: 'cvn_cat_plumbing_fixture',
  electricalFixture: 'cvn_cat_electrical_fixture',
  mechanicalEquipment: 'cvn_cat_mechanical_equipment',
};

/** Grupo de categorias na lista de visibilidade/pesos (etapa 4.5d). */
export interface GraphicsCategoryGroup {
  id: 'general' | 'architecture' | 'structure' | 'components';
  labelKey: keyof Dict;
  categories: readonly GraphicsCategory[];
}

/**
 * Grupos da lista de categorias, na ordem em que aparecem nos diálogos. Todos os itens de `GRAPHICS_CATEGORIES`
 * entram uma vez só: o que é de estrutura fica junto (pilar, viga, sapata, laje) e os componentes ficam por
 * disciplina (arquitetura, hidrossanitário, elétrico, HVAC), sem repetir categorias nem mudar as que já existiam.
 */
export const CATEGORY_GROUPS: readonly GraphicsCategoryGroup[] = [
  { id: 'general', labelKey: 'cvn_catgrp_general', categories: ['site', 'lot', 'generic', 'annotation'] },
  { id: 'architecture', labelKey: 'cvn_catgrp_architecture', categories: ['wall', 'door', 'window', 'floor', 'ceiling', 'roof', 'stair', 'ramp', 'railing', 'mass', 'room'] },
  { id: 'structure', labelKey: 'cvn_catgrp_structure', categories: ['column', 'beam', 'footing', 'slab'] },
  { id: 'components', labelKey: 'cvn_catgrp_components', categories: ['component', 'plumbingFixture', 'electricalFixture', 'mechanicalEquipment'] },
];

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

/** Rótulo do grupo de categorias no idioma pedido. */
export function categoryGroupLabel(grupo: GraphicsCategoryGroup, lang: Lang): string {
  return t(lang, grupo.labelKey);
}

/** Todas as categorias na ordem dos grupos (o conjunto é o mesmo de `GRAPHICS_CATEGORIES`). */
export function categoriesInGroups(): readonly GraphicsCategory[] {
  return CATEGORY_GROUPS.flatMap((g) => g.categories);
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
