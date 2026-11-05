/**
 * Tabela de estilo das camadas do DXF (fase 3 do exportador R2000). O padrão sai montado pela categoria gráfica e pela
 * escala; o que o usuário mudar no diálogo de exportação fica em `Project.dxfLayers`, por nome de camada. Ausente = padrão.
 */

import { decimalSymbolFor, t, type Lang } from './i18n.ts';

/** Tipos de linha que o escritor R2000 grava na tabela LTYPE. */
export type DxfLayerLineType = 'CONTINUOUS' | 'DASHED';

/** Estilo de uma camada do DXF: cor ACI, espessura (código 370, centésimos de mm) e tipo de linha. */
export interface DxfLayerStyle {
  /** Cor ACI (1 a 255): 1 vermelho, 2 amarelo, 3 verde, 4 ciano, 5 azul, 6 magenta, 7 branco/preto, 8 cinza. */
  color: number;
  /** Espessura em centésimos de mm, num valor válido do DXF (0, 5, 9, …, 211); -3 é o padrão do DXF. */
  lineWeight: number;
  linetype: DxfLayerLineType;
}

/** Valores de espessura aceitos no DXF (código 370), em centésimos de mm. O mesmo conjunto do `dxfLineWeight` do io. */
export const DXF_LINE_WEIGHTS: readonly number[] = [0, 5, 9, 13, 15, 18, 20, 25, 30, 35, 40, 50, 53, 60, 70, 80, 90, 100, 106, 120, 140, 158, 200, 211];

/** Espessura padrão do DXF: -3, "a padrão da camada". */
export const DXF_LINE_WEIGHT_DEFAULT = -3;

/** Rótulo de uma espessura em centésimos de mm (`50` vira `0,50 mm`; `-3` vira `Padrão`). */
export function dxfLineWeightLabel(centi: number, lang: Lang = 'pt'): string {
  if (centi === DXF_LINE_WEIGHT_DEFAULT) return t(lang, 'md_fmt_default');
  const reais = Math.floor(centi / 100);
  const centavos = String(Math.abs(centi % 100)).padStart(2, '0');
  return `${reais}${decimalSymbolFor(lang)}${centavos} mm`;
}
