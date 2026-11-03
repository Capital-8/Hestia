import { DEFAULT_DIMENSION_STYLE, dimensionStyleOf, type DimensionStyle, type DimTick } from '@hestia/model';
import { fmtNum, t as translate, type Dict, type Lang } from '../../editor/i18n.ts';

/** Rascunho do estilo global de cotas (todos os campos, já resolvidos contra o padrão). */
export type StyleDraft = DimensionStyle;
export type StyleKey = keyof DimensionStyle;
/** Erro por campo; ausente = válido. */
export type StyleErrors = Partial<Record<StyleKey, string>>;

/** Campos numéricos (medidas em mm de papel). */
export type StyleNumKey = 'tickSize' | 'textHeight' | 'extensionGap' | 'extensionOvershoot' | 'textGap' | 'stackSpacing';

export const STYLE_KEYS: ReadonlyArray<StyleKey> = Object.keys(DEFAULT_DIMENSION_STYLE) as StyleKey[];

/** Faixas razoáveis (mm de papel). Fora delas o diálogo recusa o valor. */
export const STYLE_LIMITS: Readonly<Record<StyleNumKey, { min: number; max: number }>> = {
  tickSize: { min: 0.5, max: 10 },
  textHeight: { min: 0.5, max: 15 },
  extensionGap: { min: 0, max: 10 },
  extensionOvershoot: { min: 0, max: 10 },
  textGap: { min: 0, max: 10 },
  stackSpacing: { min: 1, max: 50 },
};

export const STYLE_TEXT_MAX = 12;
export const STYLE_FONT_MAX = 120;

export const DIM_TICK_OPTIONS: ReadonlyArray<{ value: DimTick; label: keyof Dict }> = [
  { value: 'slash', label: 'dlt_dim_tick_slash' },
  { value: 'arrow-filled', label: 'dlt_dim_tick_arrow_filled' },
  { value: 'arrow-open', label: 'dlt_dim_tick_arrow_open' },
  { value: 'dot', label: 'dlt_dim_tick_dot' },
];

export const TEXT_PLACEMENT_OPTIONS: ReadonlyArray<{ value: DimensionStyle['textPlacement']; label: keyof Dict }> = [
  { value: 'above', label: 'dlt_dim_text_above' },
  { value: 'centered', label: 'dlt_dim_text_centered' },
];

/** Convenções de leitura do valor (Revit: Read Convention). */
export const READ_CONVENTION_OPTIONS: ReadonlyArray<{ value: DimensionStyle['readConvention']; label: keyof Dict }> = [
  { value: 'aligned', label: 'dlt_dim_read_aligned' },
  { value: 'upright', label: 'dlt_dim_read_upright' },
  { value: 'horizontal', label: 'dlt_dim_read_horizontal' },
];

/** Comportamento do valor quando não cabe no trecho. */
export const TEXT_FIT_OPTIONS: ReadonlyArray<{ value: DimensionStyle['textFit']; label: keyof Dict }> = [
  { value: 'leader', label: 'dlt_dim_fit_leader' },
  { value: 'inside', label: 'dlt_dim_fit_inside' },
  { value: 'outside', label: 'dlt_dim_fit_outside' },
];

export const UNIT_OPTIONS: ReadonlyArray<{ value: DimensionStyle['unit']; label: keyof Dict }> = [
  { value: 'project', label: 'dlt_dim_unit_project' },
  { value: 'm', label: 'dlt_dim_unit_m' },
  { value: 'cm', label: 'dlt_dim_unit_cm' },
  { value: 'mm', label: 'dlt_dim_unit_mm' },
];

export const PRECISION_OPTIONS: ReadonlyArray<{ value: DimensionStyle['precision']; label: keyof Dict }> = [
  { value: 0, label: 'dlt_dim_precision_0' },
  { value: 1, label: 'dlt_dim_precision_1' },
  { value: 2, label: 'dlt_dim_precision_2' },
  { value: 3, label: 'dlt_dim_precision_3' },
];

/** Famílias de fonte oferecidas; uma fonte gravada fora da lista entra como opção extra (ver `fontOptions`). */
export const FONT_PRESETS: ReadonlyArray<string> = [
  DEFAULT_DIMENSION_STYLE.font,
  'Arial, sans-serif',
  'Times New Roman, serif',
  'Consolas, monospace',
  'Courier New, monospace',
];

export function fontOptions(current: string): string[] {
  return FONT_PRESETS.includes(current) ? [...FONT_PRESETS] : [current, ...FONT_PRESETS];
}

/** Estilo efetivo do projeto (padrão + o que o projeto gravou) como ponto de partida do rascunho. */
export const styleDraftFromProject = (p: { settings: { dimensionStyle?: Partial<DimensionStyle> } }): StyleDraft => dimensionStyleOf(p.settings);

/** Restaurar padrão: rascunho com DEFAULT_DIMENSION_STYLE (cópia, para não compartilhar referência). */
export const defaultStyleDraft = (): StyleDraft => ({ ...DEFAULT_DIMENSION_STYLE });

/**
 * Converte o texto digitado em número. Aceita vírgula ou ponto decimal (pt-BR). Vazio ou inválido = NaN,
 * que a validação recusa com mensagem.
 */
export function parseDecimal(raw: string): number {
  const t = raw.trim().replace(',', '.');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)$/.test(t)) return Number.NaN;
  return Number(t);
}

/** Número para exibir no campo, com o separador decimal do idioma ativo. */
export function formatDecimal(n: number, lang: Lang = 'pt'): string {
  if (!Number.isFinite(n)) return '';
  // units-ok: campo numérico de parâmetros do estilo (mm de papel, casas decimais), não é medida do modelo
  return n.toLocaleString(lang === 'en' ? 'en-US' : 'pt-BR', { maximumFractionDigits: 12, useGrouping: false });
}

/** Valor de cota de exemplo formatado como o estilo manda (precisão, prefixo e sufixo). */
export function formatDimValue(value: number, style: Pick<DimensionStyle, 'precision' | 'prefix' | 'suffix'>, lang: Lang = 'pt'): string {
  return `${style.prefix}${fmtNum(value, style.precision, lang)}${style.suffix}`;
}

function numError(key: StyleNumKey, n: number, lang: Lang): string | undefined {
  const { min, max } = STYLE_LIMITS[key];
  if (!Number.isFinite(n)) return translate(lang, 'dlt_dim_err_number');
  if (n < min || n > max) return translate(lang, 'dlt_dim_err_between', { min: formatDecimal(min, lang), max: formatDecimal(max, lang) });
  return undefined;
}

/** Validação do rascunho: só devolve os campos com erro. Vazio = pode aplicar. */
export function validateStyleDraft(d: StyleDraft, lang: Lang = 'pt'): StyleErrors {
  const e: StyleErrors = {};
  for (const k of Object.keys(STYLE_LIMITS) as StyleNumKey[]) {
    const err = numError(k, d[k], lang);
    if (err) e[k] = err;
  }
  if (!DIM_TICK_OPTIONS.some((o) => o.value === d.tick)) e.tick = translate(lang, 'dlt_dim_err_tick');
  if (!TEXT_PLACEMENT_OPTIONS.some((o) => o.value === d.textPlacement)) e.textPlacement = translate(lang, 'dlt_dim_err_position');
  if (!READ_CONVENTION_OPTIONS.some((o) => o.value === d.readConvention)) e.readConvention = translate(lang, 'dlt_dim_err_convention');
  if (!TEXT_FIT_OPTIONS.some((o) => o.value === d.textFit)) e.textFit = translate(lang, 'dlt_dim_err_behavior');
  if (!UNIT_OPTIONS.some((o) => o.value === d.unit)) e.unit = translate(lang, 'dlt_dim_err_unit');
  if (!PRECISION_OPTIONS.some((o) => o.value === d.precision)) e.precision = translate(lang, 'dlt_dim_err_precision');
  if (d.font.trim() === '') e.font = translate(lang, 'dlt_dim_err_font');
  else if (d.font.length > STYLE_FONT_MAX) e.font = translate(lang, 'dlt_dim_err_max_chars', { n: STYLE_FONT_MAX });
  if (d.prefix.length > STYLE_TEXT_MAX) e.prefix = translate(lang, 'dlt_dim_err_max_chars', { n: STYLE_TEXT_MAX });
  if (d.suffix.length > STYLE_TEXT_MAX) e.suffix = translate(lang, 'dlt_dim_err_max_chars', { n: STYLE_TEXT_MAX });
  return e;
}

export const hasStyleErrors = (e: StyleErrors): boolean => Object.keys(e).length > 0;

/**
 * Só os campos do rascunho que diferem do estilo atual do projeto. Aplicar grava este patch (merge no projeto),
 * então campos iguais ao atual não são regravados.
 */
export function styleDiff(draft: StyleDraft, current: StyleDraft): Partial<DimensionStyle> {
  const out: Partial<Record<StyleKey, unknown>> = {};
  for (const k of STYLE_KEYS) if (draft[k] !== current[k]) out[k] = draft[k];
  return out as Partial<DimensionStyle>;
}

/** Rascunho sujo = há alguma diferença em relação ao estilo atual do projeto. */
export const isStyleDirty = (draft: StyleDraft, current: StyleDraft): boolean => Object.keys(styleDiff(draft, current)).length > 0;
