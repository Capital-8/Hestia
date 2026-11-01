import { add, mul, norm, perp, sub, type Vec2 } from '@hestia/geom';
import { DIM_GAP_MM, DIM_TEXT_MM, paperMmToPx, type DimensionGeometry } from '@hestia/model';
import type { Viewport } from '../viewport.ts';
import { zoomAtinge } from './limiares.ts';
import { noteLabel } from './tags.ts';
import type { Espessura, LabelOp, StrokeOp } from './types.ts';

/** Largura aproximada do valor em px de tela: cerca de 0,6 em por caractere (dígitos, vírgula, espaço e "m"). */
export const valueWidthPx = (text: string, fontPx: number): number => text.length * fontPx * 0.6;

/**
 * Distância do centro do rótulo até a linha de cota, em alturas do texto, para os rótulos afastados. Trechos
 * vizinhos que não cabem alternam entre as duas alturas, então um não cobre o outro.
 */
export const LANE_HEIGHTS = [1.6, 3] as const;

export interface DimensionLabelOps {
  labels: LabelOp[];
  strokes: StrokeOp[];
  /** O valor não coube no trecho: o rótulo foi afastado com linha de chamada. */
  short: boolean;
}

/**
 * O valor (de `n` caracteres) cabe no trecho de comprimento `length` m no `zoom` dado, com a fonte de `textMm` mm de papel
 * na escala 1:`scale`? Antes da fonte bater no piso de 1 px a razão texto/trecho cai com o zoom; depois dela é constante.
 * Devolve também o zoom em que o valor passa a caber (`Infinity` se nunca couber), que é o limiar da decisão.
 */
export function valorCabeNoTrecho(text: string, length: number, textMm: number, scale: number, zoom: number): { cabe: boolean; limiar: number } {
  const k = (textMm * scale) / 1000;
  const cabe = valueWidthPx(text, paperMmToPx(textMm, zoom, scale)) <= length * zoom;
  const limiar = 0.6 * text.length * k <= length ? (0.6 * text.length) / length : Number.POSITIVE_INFINITY;
  return { cabe, limiar };
}

/**
 * Rótulo do valor de uma cota. Se o texto cabe no trecho (comprimento em tela `g.length × zoom`), sai centrado acima da
 * linha, como antes. Se não cabe, sai afastado da linha, com uma linha de chamada curta do meio da cota até o texto.
 * `lane` é a ordem entre os trechos curtos do nível (alterna as alturas). O zoom só entra nessa decisão e vem da vista `v`
 * (px por metro), que registra o limiar consultado: a geometria vale para todo o intervalo entre dois limiares. Sem `v`
 * (testes de unidade, sem quadro), o valor é tratado como cabendo. O corpo da fonte sai em mm de papel (`noteLabel`).
 */
export function dimensionLabelOps(g: DimensionGeometry, offset: number, text: string, textMm: number, scale: number, mPerMm: number, lane: number, color: string, esp: Espessura, v?: Viewport): DimensionLabelOps {
  const medida = v ? valorCabeNoTrecho(text, g.length, textMm, scale, v.zoom) : null;
  if (medida && Number.isFinite(medida.limiar)) zoomAtinge(v!, medida.limiar);
  if (!medida || medida.cabe) return { labels: [noteLabel(g.textAt, text, textMm, scale, g.textRotation)], strokes: [], short: false };
  // Lado de fora: a linha de cota fica deslocada dos pontos medidos pelo `offset`, então o rótulo vai para esse mesmo lado.
  const [ta, tb] = g.line;
  const u = norm(sub(tb, ta));
  const out: Vec2 = mul(perp(u), offset >= 0 ? 1 : -1);
  const gap = DIM_GAP_MM * mPerMm;
  const th = DIM_TEXT_MM * mPerMm;
  const mid = mul(add(ta, tb), 0.5);
  const dist = gap + th * LANE_HEIGHTS[lane % LANE_HEIGHTS.length]!;
  const at = add(mid, mul(out, dist));
  const leader = add(mid, mul(out, dist - th / 2));
  return {
    labels: [noteLabel(at, text, textMm, scale, g.textRotation)],
    strokes: [{ pts: [mid, leader], closed: false, ...esp, color, alpha: 1 }],
    short: true,
  };
}
