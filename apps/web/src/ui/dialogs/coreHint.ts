import { coreRange, coreSpan, formatQuantity, unitSymbol, type Layer, type ResolvedUnits } from '@hestia/model';
import { t, useI18n, type Lang } from '../../editor/i18n.ts';

export interface CoreHint {
  /** Nota para embaixo da tabela de camadas. */
  text: string;
  /** true quando o tipo não tem camada Estrutura (o núcleo é o elemento inteiro). */
  semEstrutura: boolean;
}

/** Texto do núcleo para o editor de piso e de laje, medida a partir da face indicada. */
export function coreHint(
  type: { layers: readonly Layer[] },
  units: ResolvedUnits,
  face?: string,
  lang: Lang = useI18n.getState().lang,
): CoreHint {
  if (type.layers.length === 0) return { text: t(lang, 'dlm_core_no_layers'), semEstrutura: true };
  if (!type.layers.some((l) => l.function === 'structure')) {
    return { text: t(lang, 'dlm_core_no_structure'), semEstrutura: true };
  }
  const { first, last } = coreRange(type);
  const span = coreSpan(type);
  const sem = (m: number): string => formatQuantity(units, 'smallLength', m, { withUnit: false });
  return {
    text: t(lang, 'dlm_core_hint', {
      a: first + 1,
      b: last + 1,
      x: sem(span.from),
      y: sem(span.to),
      unit: unitSymbol(units, 'smallLength'),
      face: face ?? t(lang, 'dlm_core_face_top'),
    }),
    semEstrutura: false,
  };
}
