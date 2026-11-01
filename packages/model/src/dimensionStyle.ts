import type { DimensionStyle } from './dimensionContract.ts';

/** Estilo padrão (aparência CAD técnica). Medidas em mm de papel. */
export const DEFAULT_DIMENSION_STYLE: DimensionStyle = {
  tick: 'slash',
  tickSize: 2.8,
  textHeight: 2.5,
  font: 'Arial Narrow, Arial, sans-serif',
  extensionGap: 1.5,
  extensionOvershoot: 2,
  textPlacement: 'above',
  textGap: 1.5,
  readConvention: 'aligned',
  textFit: 'leader',
  leaderWhenNoFit: true,
  stackSpacing: 7,
  unit: 'project',
  precision: 2,
  prefix: '',
  suffix: '',
};

/** Estilo efetivo: padrão + o que o projeto definiu (campos ausentes caem no padrão). */
export function dimensionStyleOf(settings: { dimensionStyle?: Partial<DimensionStyle> } | undefined): DimensionStyle {
  return { ...DEFAULT_DIMENSION_STYLE, ...(settings?.dimensionStyle ?? {}) };
}

/**
 * Campos de formatação do estilo que valem como definidos pelo projeto: os iguais ao padrão não sobrepõem as unidades do
 * projeto (o padrão `precision: 2` não pode apagar as casas das unidades do projeto). É a ponte única entre um estilo
 * (família) e o texto da cota, usada pelo desenho, pelo DXF e pela prancha.
 */
export function dimensionFormatStyle(style: DimensionStyle | undefined): Partial<Pick<DimensionStyle, 'unit' | 'precision' | 'prefix' | 'suffix'>> {
  if (!style) return {};
  const D = DEFAULT_DIMENSION_STYLE;
  return {
    ...(style.unit !== D.unit ? { unit: style.unit } : {}),
    ...(style.precision !== D.precision ? { precision: style.precision } : {}),
    ...(style.prefix !== D.prefix ? { prefix: style.prefix } : {}),
    ...(style.suffix !== D.suffix ? { suffix: style.suffix } : {}),
  };
}
