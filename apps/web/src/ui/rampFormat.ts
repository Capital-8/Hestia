import type { RampQuantities, ResolvedRamp } from '@hestia/engine';
import { formatRampSlope } from '@hestia/model';
import { dictOf, fmtNum, type Lang } from '../editor/i18n.ts';

/** Fração (0,0833) → campo em % (8,33). A inclinação é guardada como fração; a interface edita em %. */
export const slopeToPercentField = (s: number): number => s * 100;

/** Campo em % (8,33) → fração (0,0833). */
export const percentFieldToSlope = (v: number): number => v / 100;

export interface RampSummaryLine {
  label: string;
  value: string;
}

/** Linhas só leitura dos resultados da rampa (painel de propriedades e diálogos) no idioma ativo. */
export function rampSummaryLines(rr: ResolvedRamp, q: RampQuantities, lang: Lang = 'pt'): RampSummaryLine[] {
  const d = dictOf(lang);
  const fmt = (n: number): string => fmtNum(n, 2, lang);
  return [
    { label: d.ramp_prop_rise, value: `${fmt(rr.rise)} m` },
    { label: d.ramp_prop_slope, value: formatRampSlope(rr.slope) },
    { label: d.ramp_prop_flights, value: String(q.flightCount) },
    { label: d.ramp_prop_landings, value: String(q.landingCount) },
    { label: d.ramp_prop_path_length, value: `${fmt(rr.pathLength)} m` },
    { label: d.ramp_prop_area, value: `${fmt(q.planArea)} m²` },
    { label: d.ramp_prop_volume, value: `${fmt(q.volume)} m³` },
  ];
}
