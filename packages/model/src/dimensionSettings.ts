import { t, type Lang } from './i18n.ts';
import type { Project } from './types.ts';

/**
 * Referência de uma parede nas cotas dinâmicas.
 * - `axis`: eixo da parede (centro da espessura total).
 * - `finish`: face acabada, a de fora da parede voltada para o elemento medido.
 * - `coreCenter`: eixo do núcleo.
 * - `coreFace`: face do núcleo voltada para o elemento medido.
 */
export type WallDimRef = 'axis' | 'finish' | 'coreCenter' | 'coreFace';

/**
 * Referência de uma porta ou janela nas cotas dinâmicas.
 * - `center`: centro do vão.
 * - `clear`: vão livre (luz), entre as faces internas do batente.
 * - `frame`: vão externo do batente.
 * - `casing`: com alizar (borda externa do alizar do lado da cota).
 */
export type OpeningDimRef = 'center' | 'clear' | 'frame' | 'casing';

/** Configuração gravada no projeto; cada campo ausente vale o padrão. */
export interface DimensionSettings {
  wallRef?: WallDimRef;
  openingRef?: OpeningDimRef;
  showOnPlacement?: boolean;
  showOnSelection?: boolean;
}

export interface ResolvedDimensionSettings {
  wallRef: WallDimRef;
  openingRef: OpeningDimRef;
  showOnPlacement: boolean;
  showOnSelection: boolean;
}

export const WALL_DIM_REFS: readonly WallDimRef[] = ['axis', 'finish', 'coreCenter', 'coreFace'];
export const OPENING_DIM_REFS: readonly OpeningDimRef[] = ['center', 'clear', 'frame', 'casing'];

/** Rótulos da referência de parede no idioma pedido. */
export function wallDimRefLabels(lang: Lang = 'pt'): Readonly<Record<WallDimRef, string>> {
  return {
    axis: t(lang, 'md_dimref_axis'),
    finish: t(lang, 'md_dimref_finish'),
    coreCenter: t(lang, 'md_dimref_core_center'),
    coreFace: t(lang, 'md_dimref_core_face'),
  };
}

/** Rótulos da referência de abertura no idioma pedido. */
export function openingDimRefLabels(lang: Lang = 'pt'): Readonly<Record<OpeningDimRef, string>> {
  return {
    center: t(lang, 'md_dimref_center'),
    clear: t(lang, 'md_dimref_clear'),
    frame: t(lang, 'md_dimref_frame'),
    casing: t(lang, 'md_dimref_casing'),
  };
}

/** Rótulos em PT (compatibilidade); use `wallDimRefLabels(lang)` para o idioma ativo. */
export const WALL_DIM_REF_LABELS: Readonly<Record<WallDimRef, string>> = wallDimRefLabels('pt');

/** Rótulos em PT (compatibilidade); use `openingDimRefLabels(lang)` para o idioma ativo. */
export const OPENING_DIM_REF_LABELS: Readonly<Record<OpeningDimRef, string>> = openingDimRefLabels('pt');

export const isWallDimRef = (v: unknown): v is WallDimRef => WALL_DIM_REFS.includes(v as WallDimRef);
export const isOpeningDimRef = (v: unknown): v is OpeningDimRef => OPENING_DIM_REFS.includes(v as OpeningDimRef);

/** Padrões do projeto. Objeto único e congelado: a mesma referência volta enquanto nada foi configurado. */
export const DEFAULT_DIMENSION_SETTINGS: Readonly<ResolvedDimensionSettings> = Object.freeze({
  wallRef: 'finish',
  openingRef: 'frame',
  showOnPlacement: true,
  showOnSelection: true,
});

const cache = new WeakMap<DimensionSettings, ResolvedDimensionSettings>();

/** Configuração de cotas resolvida com os padrões; memoizada pela identidade de `settings.dimensions`. */
export function dimensionSettingsOf(p: Pick<Project, 'settings'>): ResolvedDimensionSettings {
  const raw = p.settings?.dimensions;
  if (!raw) return DEFAULT_DIMENSION_SETTINGS;
  const hit = cache.get(raw);
  if (hit) return hit;
  const out: ResolvedDimensionSettings = {
    wallRef: isWallDimRef(raw.wallRef) ? raw.wallRef : DEFAULT_DIMENSION_SETTINGS.wallRef,
    openingRef: isOpeningDimRef(raw.openingRef) ? raw.openingRef : DEFAULT_DIMENSION_SETTINGS.openingRef,
    showOnPlacement: raw.showOnPlacement ?? DEFAULT_DIMENSION_SETTINGS.showOnPlacement,
    showOnSelection: raw.showOnSelection ?? DEFAULT_DIMENSION_SETTINGS.showOnSelection,
  };
  cache.set(raw, out);
  return out;
}
