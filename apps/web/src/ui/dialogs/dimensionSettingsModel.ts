import {
  DEFAULT_DIMENSION_SETTINGS,
  OPENING_DIM_REFS,
  OPENING_DIM_REF_LABELS,
  WALL_DIM_REFS,
  WALL_DIM_REF_LABELS,
  dimensionSettingsOf,
  type DimensionSettings,
  type OpeningDimRef,
  type Project,
  type ResolvedDimensionSettings,
  type WallDimRef,
} from '@hestia/model';
import { t as translate, type Lang } from '../../editor/i18n.ts';

/** Rascunho do diálogo "Cotas…": a configuração já resolvida, editável sem tocar no projeto. */
export type DimensionDraft = ResolvedDimensionSettings;

export const draftFromProject = (p: Pick<Project, 'settings'>): DimensionDraft => ({ ...dimensionSettingsOf(p) });

/** Padrões do projeto, para o botão "Restaurar padrões". */
export const defaultDraft = (): DimensionDraft => ({ ...DEFAULT_DIMENSION_SETTINGS });

/** Configuração gravada no projeto (completa, para a leitura não depender de padrões futuros). */
export const applyDraft = (d: DimensionDraft): DimensionSettings => ({
  wallRef: d.wallRef,
  openingRef: d.openingRef,
  showOnPlacement: d.showOnPlacement,
  showOnSelection: d.showOnSelection,
});

/** Opções de cada seletor, com o nome por extenso. */
export const WALL_OPTIONS: ReadonlyArray<{ value: WallDimRef; label: string }> = WALL_DIM_REFS.map((value) => ({ value, label: WALL_DIM_REF_LABELS[value] }));
export const OPENING_OPTIONS: ReadonlyArray<{ value: OpeningDimRef; label: string }> = OPENING_DIM_REFS.map((value) => ({ value, label: OPENING_DIM_REF_LABELS[value] }));

/** Opções do seletor no idioma ativo (o modelo só tem os nomes em PT). */
export function wallOptions(lang: Lang = 'pt'): ReadonlyArray<{ value: WallDimRef; label: string }> {
  const key = {
    axis: 'dlt_dim_wall_axis',
    finish: 'dlt_dim_wall_finish',
    coreCenter: 'dlt_dim_wall_core_center',
    coreFace: 'dlt_dim_wall_core_face',
  } as const;
  return WALL_DIM_REFS.map((value) => ({ value, label: translate(lang, key[value]) }));
}

/** Opções do seletor de portas e janelas no idioma ativo. */
export function openingOptions(lang: Lang = 'pt'): ReadonlyArray<{ value: OpeningDimRef; label: string }> {
  const key = {
    center: 'dlt_dim_open_center',
    clear: 'dlt_dim_open_clear',
    frame: 'dlt_dim_open_frame',
    casing: 'dlt_dim_open_casing',
  } as const;
  return OPENING_DIM_REFS.map((value) => ({ value, label: translate(lang, key[value]) }));
}

/** Valor do seletor da troca rápida: a referência de sessão ou '' (padrão do projeto). */
export function sessionChoice(overrides: Readonly<Record<string, string>>, key: string): string {
  return overrides[key] ?? '';
}
