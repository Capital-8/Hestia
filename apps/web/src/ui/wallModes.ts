import type { ToolOptions } from '@hestia/tools';

/**
 * Modos da ferramenta Parede, como a faixa, a barra de opções e as Propriedades os mostram. O tipo `wallShape` tem
 * `polygon` só; inscrito/circunscrito é a flag `wallPolygonCircumscribed`. Um modo vale por vez.
 */
export type WallMode = 'line' | 'arc' | 'arcCenter' | 'arcTangent' | 'rect' | 'polygonIn' | 'polygonOut' | 'circle' | 'ellipse' | 'spline';

export function wallModeOf(o: Pick<ToolOptions, 'wallShape' | 'wallPolygonCircumscribed'>): WallMode {
  if (o.wallShape === 'polygon') return o.wallPolygonCircumscribed ? 'polygonOut' : 'polygonIn';
  if (o.wallShape === 'arc-center') return 'arcCenter';
  if (o.wallShape === 'arc-tangent') return 'arcTangent';
  return o.wallShape;
}

/** Patch que liga um modo (só o necessário: a flag do polígono sempre vem explícita). */
export function wallModePatch(m: WallMode): Partial<ToolOptions> {
  switch (m) {
    case 'polygonIn': return { wallShape: 'polygon', wallPolygonCircumscribed: false };
    case 'polygonOut': return { wallShape: 'polygon', wallPolygonCircumscribed: true };
    case 'arcCenter': return { wallShape: 'arc-center' };
    case 'arcTangent': return { wallShape: 'arc-tangent' };
    default: return { wallShape: m };
  }
}

/** Forma da galeria "Desenhar" que a Parede oferece (a galeria é a do perímetro; ver `WALL_SHAPES`). */
export type WallGalleryId = 'line' | 'rect' | 'poly-inscribed' | 'poly-circumscribed' | 'circle' | 'arc-3pt' | 'arc-center' | 'arc-tangent' | 'ellipse' | 'spline';

const GALLERY_MODE: Record<WallGalleryId, WallMode> = {
  line: 'line',
  rect: 'rect',
  'poly-inscribed': 'polygonIn',
  'poly-circumscribed': 'polygonOut',
  circle: 'circle',
  'arc-3pt': 'arc',
  'arc-center': 'arcCenter',
  'arc-tangent': 'arcTangent',
  ellipse: 'ellipse',
  spline: 'spline',
};

/** Id da galeria -> patch das opções (a opção `wallShape` e a flag do polígono). */
export const wallGalleryPatch = (id: WallGalleryId): Partial<ToolOptions> => wallModePatch(GALLERY_MODE[id]);

/** Opções -> id da galeria marcado. */
export function wallGalleryOf(o: Pick<ToolOptions, 'wallShape' | 'wallPolygonCircumscribed'>): WallGalleryId {
  const m = wallModeOf(o);
  return (Object.keys(GALLERY_MODE) as WallGalleryId[]).find((k) => GALLERY_MODE[k] === m)!;
}
