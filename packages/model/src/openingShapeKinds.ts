/**
 * Lista das formas de vão para a interface, rótulos em português, parâmetros de cada uma, forma padrão e redimensionamento.
 * Arquivo novo; docs/estudo-esquadrias/32.
 *
 * Peraltado: o arco peraltado (pleno com ombreiras retas acima da nascença) JÁ existe: é `round` com `height > width / 2`
 * (ombreiras de `height - width / 2`) e, com flecha menor que a metade, `segmental` com `height > rise`. Não há tipo à parte.
 */
import type { OpeningShape } from './openingShape.ts';

export type OpeningShapeKind = OpeningShape['kind'];

/** Todas as formas, na ordem em que a interface as oferece. */
export const OPENING_SHAPE_KINDS = ['rect', 'round', 'segmental', 'pointed', 'circle', 'horseshoe', 'gable', 'trapezoid', 'polygon'] as const satisfies readonly OpeningShapeKind[];

/** Rótulos em português. */
export const OPENING_SHAPE_LABELS_PT: Readonly<Record<OpeningShapeKind, string>> = {
  rect: 'Retangular',
  round: 'Arco pleno (meia-lua; peraltado quando mais alto que a meia-largura)',
  segmental: 'Arco abatido',
  pointed: 'Ogival',
  circle: 'Círculo ou elipse',
  horseshoe: 'Ferradura',
  gable: 'Empena (triangular ou casinha)',
  trapezoid: 'Trapézio',
  polygon: 'Polígono livre',
};

/** Parâmetros próprios de cada forma, além de `width` e `height` (nomes dos campos de `OpeningShape`). */
export const OPENING_SHAPE_PARAMS: Readonly<Record<OpeningShapeKind, readonly string[]>> = {
  rect: [],
  round: [],
  segmental: ['rise'],
  pointed: ['rise'],
  circle: [],
  horseshoe: ['neck'],
  gable: ['rise'],
  trapezoid: ['topWidth', 'baseWidth'],
  polygon: ['points', 'symmetric'],
};

/** Forma válida (para larguras e alturas razoáveis) de cada tipo, para começar a editar. */
export function defaultOpeningShape(kind: OpeningShapeKind, width: number, height: number): OpeningShape {
  const w = width;
  const h = height;
  switch (kind) {
    case 'rect':
    case 'round':
    case 'circle':
      return { kind, width: w, height: h };
    case 'segmental':
      return { kind, width: w, height: h, rise: Math.min(w / 4, h) };
    case 'pointed':
      return { kind, width: w, height: h, rise: Math.min(Math.max(w * 0.866, w / 2), h) };
    case 'horseshoe':
      return { kind, width: w, height: h, neck: w * 0.8 };
    case 'gable':
      return { kind, width: w, height: h, rise: Math.min(h / 3, w / 2) };
    case 'trapezoid':
      return { kind, width: w, height: h, topWidth: w * 0.6 };
    case 'polygon':
      return {
        kind,
        width: w,
        height: h,
        points: [{ u: 0, v: 0 }, { u: w, v: 0 }, { u: w, v: h * 0.7 }, { u: w / 2, v: h }, { u: 0, v: h * 0.7 }],
      };
  }
}

/**
 * A forma com outra largura e altura. Parâmetros no sentido da largura (`topWidth`, `baseWidth`, `neck`) e os pontos do polígono
 * acompanham a proporção; a flecha (`rise`, no sentido da altura) fica como gravada, como sempre foi. Formas antigas: só troca
 * `width` e `height`, igual a `{ ...forma, width, height }`.
 */
export function resizeOpeningShape(s: OpeningShape, width: number, height: number): OpeningShape {
  const kx = s.width > 0 && Number.isFinite(s.width) ? width / s.width : 1;
  const ky = s.height > 0 && Number.isFinite(s.height) ? height / s.height : 1;
  switch (s.kind) {
    case 'trapezoid':
      return { ...s, width, height, topWidth: s.topWidth * kx, ...(s.baseWidth !== undefined ? { baseWidth: s.baseWidth * kx } : {}) };
    case 'horseshoe':
      return { ...s, width, height, neck: s.neck * kx };
    case 'polygon':
      return { ...s, width, height, points: s.points.map((p) => ({ u: p.u * kx, v: p.v * ky })) };
    default:
      return { ...s, width, height };
  }
}
