import type { ToolOptions } from '@hestia/tools';

/**
 * Modos da ferramenta Parede, como a faixa, a barra de opções e as Propriedades os mostram. O tipo `wallShape` tem
 * `polygon` só; inscrito/circunscrito é a flag `wallPolygonCircumscribed`. Um modo vale por vez.
 */
export type WallMode = 'line' | 'arc' | 'rect' | 'polygonIn' | 'polygonOut' | 'circle' | 'ellipse' | 'spline';

export function wallModeOf(o: Pick<ToolOptions, 'wallShape' | 'wallPolygonCircumscribed'>): WallMode {
  if (o.wallShape === 'polygon') return o.wallPolygonCircumscribed ? 'polygonOut' : 'polygonIn';
  return o.wallShape;
}

/** Patch que liga um modo (só o necessário: a flag do polígono sempre vem explícita). */
export function wallModePatch(m: WallMode): Partial<ToolOptions> {
  switch (m) {
    case 'polygonIn': return { wallShape: 'polygon', wallPolygonCircumscribed: false };
    case 'polygonOut': return { wallShape: 'polygon', wallPolygonCircumscribed: true };
    default: return { wallShape: m };
  }
}
