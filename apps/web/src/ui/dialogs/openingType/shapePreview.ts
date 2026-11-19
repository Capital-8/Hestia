import { openingFrame, openingRough, openingShapeOf, outline, outlineInset, validateOpeningShape, type OPt, type OpeningShape, type OpeningType } from '@hestia/model';
import { formaDaEsquadria } from '@hestia/engine';

/*
 * Geometria da prévia 2D da forma do vão (docs/estudo-esquadrias/34): o contorno real do vão bruto (`outline`), a esquadria e
 * a esquadria recuada (`outlineInset`), as cotas e a conversão entre pixels da prévia e coordenadas do polígono. Funções
 * puras: o desenho (SVG) e o arraste ficam em `ShapePreview.tsx`. Sistema do contorno: x ao longo da parede, origem no meio
 * da base; z para cima; metros.
 */

/** Cota: valor em metros e os dois extremos (x, z) na geometria do vão; `side` diz de que lado do desenho ela fica. */
export interface ShapeDim {
  id: 'width' | 'height' | 'rise' | 'top';
  value: number;
  a: OPt;
  b: OPt;
  side: 'below' | 'left' | 'right' | 'above';
}

export interface ShapeGeometry {
  /** Largura e altura do vão bruto (o que fura a parede). */
  width: number;
  height: number;
  /** Contorno do vão bruto; `null` quando a forma é inválida. */
  outer: OPt[] | null;
  /** Contorno da esquadria (mesma forma na largura e altura do tipo); `null` quando ela não cabe (peças retangulares). */
  frame: OPt[] | null;
  /** Esquadria recuada pela largura do perfil (a luz). `null` quando o recuo é recusado. */
  inner: OPt[] | null;
  /** A forma não cabe na esquadria: as peças ficam retangulares (aviso `forma-esquadria-retangular`). */
  frameFallsBack: boolean;
  dims: ShapeDim[];
  /** Razões de escala dos pontos do polígono: tipo -> vão bruto. */
  kx: number;
  ky: number;
}

/** Cota de flecha (de onde nasce o arco ou a empena até o topo) e de topo do trapézio; `null` onde não se aplica. */
function extraDims(shape: OpeningShape): ShapeDim[] {
  const h = shape.height;
  switch (shape.kind) {
    case 'round':
      return [{ id: 'rise', value: shape.width / 2, a: [shape.width / 2, h - shape.width / 2], b: [shape.width / 2, h], side: 'right' }];
    case 'segmental':
    case 'pointed':
    case 'gable':
      return [{ id: 'rise', value: shape.rise, a: [shape.width / 2, h - shape.rise], b: [shape.width / 2, h], side: 'right' }];
    case 'trapezoid':
      return [{ id: 'top', value: shape.topWidth, a: [-shape.topWidth / 2, h], b: [shape.topWidth / 2, h], side: 'above' }];
    default:
      return [];
  }
}

const safeOutline = (s: OpeningShape): OPt[] | null => (validateOpeningShape(s).length === 0 ? outline(s) : null);

/** Geometria da prévia do tipo. Vão retangular ou sem forma também tem geometria (retângulo e as duas cotas). */
export function shapeGeometry(d: OpeningType): ShapeGeometry {
  const rough = openingRough(d);
  const rect = (w: number, h: number): OpeningShape => ({ kind: 'rect', width: w, height: h });
  const vao = openingShapeOf(d) ?? rect(rough.width, rough.height);
  const outer = safeOutline(vao);
  const stored = d.shape && d.shape.kind !== 'rect' ? d.shape : null;
  const esq = stored ? formaDaEsquadria(stored, d.width, d.height) : rect(d.width, d.height);
  const frame = esq ? safeOutline(esq) : null;
  let inner: OPt[] | null = null;
  if (esq && frame) {
    const ring = outlineInset(esq, openingFrame(d, 1).frameWidth);
    inner = ring.length >= 3 ? ring : null;
  }
  const w = vao.width;
  const h = vao.height;
  return {
    width: w,
    height: h,
    outer,
    frame,
    inner,
    frameFallsBack: stored !== null && esq === null,
    dims: [
      { id: 'width', value: w, a: [-w / 2, 0], b: [w / 2, 0], side: 'below' },
      { id: 'height', value: h, a: [-w / 2, 0], b: [-w / 2, h], side: 'left' },
      ...extraDims(vao),
    ],
    kx: d.width > 0 ? w / d.width : 1,
    ky: d.height > 0 ? h / d.height : 1,
  };
}

/** Quadro do SVG: tamanho em pixels, origem do desenho (já com a margem das cotas) e escala (px por metro). */
export interface PreviewFrame {
  w: number;
  h: number;
  padL: number;
  padT: number;
  scale: number;
  /** Largura e altura do vão em metros (centram o desenho). */
  spanW: number;
  spanH: number;
}

/** Escala o desenho para caber no SVG de `w` x `h` px, com a margem pedida para as cotas, e o centra na área livre. */
export function previewFrame(spanW: number, spanH: number, w = 300, h = 260, pad = { l: 44, r: 52, t: 30, b: 36 }): PreviewFrame {
  const scale = Math.min((w - pad.l - pad.r) / Math.max(spanW, 1e-6), (h - pad.t - pad.b) / Math.max(spanH, 1e-6));
  return { w, h, padL: pad.l + (w - pad.l - pad.r - spanW * scale) / 2, padT: pad.t + (h - pad.t - pad.b - spanH * scale) / 2, scale, spanW, spanH };
}

/** Ponto do contorno (x, z em metros) em pixels do SVG. */
export function toPx(f: PreviewFrame, p: OPt): [number, number] {
  return [f.padL + (p[0] + f.spanW / 2) * f.scale, f.padT + (f.spanH - p[1]) * f.scale];
}

/** Pixels do SVG para (x, z) em metros: o inverso de `toPx`. */
export function fromPx(f: PreviewFrame, px: number, py: number): OPt {
  return [(px - f.padL) / f.scale - f.spanW / 2, f.spanH - (py - f.padT) / f.scale];
}

/** Pontos do polígono (u, v do tipo) em pixels; `kx`, `ky` levam do tipo ao vão bruto. */
export function polygonHandlePx(f: PreviewFrame, g: Pick<ShapeGeometry, 'width' | 'kx' | 'ky'>, p: { u: number; v: number }): [number, number] {
  return toPx(f, [p.u * g.kx - g.width / 2, p.v * g.ky]);
}

/** Pixels do SVG para (u, v) do polígono no sistema do tipo (o inverso de `polygonHandlePx`, sem limitar à caixa). */
export function pxToPolygonUV(f: PreviewFrame, g: Pick<ShapeGeometry, 'width' | 'kx' | 'ky'>, px: number, py: number): { u: number; v: number } {
  const [x, z] = fromPx(f, px, py);
  return { u: (x + g.width / 2) / g.kx, v: z / g.ky };
}
