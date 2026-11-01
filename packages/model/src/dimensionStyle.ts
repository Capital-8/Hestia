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
