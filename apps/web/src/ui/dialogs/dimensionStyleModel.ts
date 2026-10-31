import { DEFAULT_DIMENSION_STYLE, dimensionStyleOf, type DimensionStyle, type DimTick } from '@hestia/model';

/** Rascunho do estilo global de cotas (todos os campos, já resolvidos contra o padrão). */
export type StyleDraft = DimensionStyle;
export type StyleKey = keyof DimensionStyle;
/** Erro por campo; ausente = válido. */
export type StyleErrors = Partial<Record<StyleKey, string>>;

/** Campos numéricos (medidas em mm de papel). */
export type StyleNumKey = 'tickSize' | 'textHeight' | 'extensionGap' | 'extensionOvershoot' | 'stackSpacing';

export const STYLE_KEYS: ReadonlyArray<StyleKey> = Object.keys(DEFAULT_DIMENSION_STYLE) as StyleKey[];

/** Faixas razoáveis (mm de papel). Fora delas o diálogo recusa o valor. */
export const STYLE_LIMITS: Readonly<Record<StyleNumKey, { min: number; max: number }>> = {
  tickSize: { min: 0.5, max: 10 },
  textHeight: { min: 0.5, max: 15 },
  extensionGap: { min: 0, max: 10 },
  extensionOvershoot: { min: 0, max: 10 },
  stackSpacing: { min: 1, max: 50 },
};

export const STYLE_TEXT_MAX = 12;
export const STYLE_FONT_MAX = 120;

export const DIM_TICK_OPTIONS: ReadonlyArray<{ value: DimTick; label: string }> = [
  { value: 'slash', label: 'Traço (45°)' },
  { value: 'arrow-filled', label: 'Seta cheia' },
  { value: 'arrow-open', label: 'Seta aberta' },
  { value: 'dot', label: 'Ponto' },
];

export const TEXT_PLACEMENT_OPTIONS: ReadonlyArray<{ value: DimensionStyle['textPlacement']; label: string }> = [
  { value: 'above', label: 'Acima da linha' },
  { value: 'centered', label: 'Centrado (interrompe a linha)' },
];

export const UNIT_OPTIONS: ReadonlyArray<{ value: DimensionStyle['unit']; label: string }> = [
  { value: 'project', label: 'Unidade do projeto' },
  { value: 'm', label: 'Metros (m)' },
  { value: 'cm', label: 'Centímetros (cm)' },
  { value: 'mm', label: 'Milímetros (mm)' },
];

export const PRECISION_OPTIONS: ReadonlyArray<{ value: DimensionStyle['precision']; label: string }> = [
  { value: 0, label: '0 casas' },
  { value: 1, label: '1 casa' },
  { value: 2, label: '2 casas' },
  { value: 3, label: '3 casas' },
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

/** Número para exibir no campo, com vírgula decimal. */
export function formatDecimal(n: number): string {
  return Number.isFinite(n) ? String(n).replace('.', ',') : '';
}

/** Valor de cota de exemplo formatado como o estilo manda (precisão, prefixo e sufixo). */
export function formatDimValue(value: number, style: Pick<DimensionStyle, 'precision' | 'prefix' | 'suffix'>): string {
  return `${style.prefix}${value.toFixed(style.precision).replace('.', ',')}${style.suffix}`;
}

function numError(key: StyleNumKey, n: number): string | undefined {
  const { min, max } = STYLE_LIMITS[key];
  if (!Number.isFinite(n)) return 'Digite um número';
  if (n < min || n > max) return `Entre ${formatDecimal(min)} e ${formatDecimal(max)}`;
  return undefined;
}

/** Validação do rascunho: só devolve os campos com erro. Vazio = pode aplicar. */
export function validateStyleDraft(d: StyleDraft): StyleErrors {
  const e: StyleErrors = {};
  for (const k of Object.keys(STYLE_LIMITS) as StyleNumKey[]) {
    const err = numError(k, d[k]);
    if (err) e[k] = err;
  }
  if (!DIM_TICK_OPTIONS.some((o) => o.value === d.tick)) e.tick = 'Marcador desconhecido';
  if (!TEXT_PLACEMENT_OPTIONS.some((o) => o.value === d.textPlacement)) e.textPlacement = 'Posição desconhecida';
  if (!UNIT_OPTIONS.some((o) => o.value === d.unit)) e.unit = 'Unidade desconhecida';
  if (!PRECISION_OPTIONS.some((o) => o.value === d.precision)) e.precision = 'Precisão fora de 0 a 3';
  if (d.font.trim() === '') e.font = 'Informe a fonte';
  else if (d.font.length > STYLE_FONT_MAX) e.font = `Até ${STYLE_FONT_MAX} caracteres`;
  if (d.prefix.length > STYLE_TEXT_MAX) e.prefix = `Até ${STYLE_TEXT_MAX} caracteres`;
  if (d.suffix.length > STYLE_TEXT_MAX) e.suffix = `Até ${STYLE_TEXT_MAX} caracteres`;
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
