import {
  sectionLabelOf,
  sectionMarkGeometry,
  sectionPoints,
  sectionSheetNumberOf,
  SECTION_TEXT_MM,
  type Project,
} from '@hestia/model';
import { DXF_LAYER_CORTES, DXF_LAYER_ELEVACOES, type DxfSectionMarks } from './dxf.ts';

/**
 * Marcas de corte/elevação da planta em metros de desenho, para o DXF. `scale` é o denominador da vista (1:100 → 100):
 * a geometria usa as mesmas medidas de papel da tela e da prancha. Quem chama decide a visibilidade da categoria.
 */
/** Lados do polígono que aproxima a bolha do rótulo no DXF (sem entidade de círculo própria neste exportador). */
const BOLHA_LADOS = 24;

export function sectionMarksDxfOf(p: Pick<Project, 'views' | 'elements' | 'sheets'>, scale: number): DxfSectionMarks {
  const mPerMm = scale / 1000;
  const out: DxfSectionMarks = { lines: [], texts: [] };
  for (const view of p.views) {
    if (view.mark?.visible === false) continue;
    const pts = sectionPoints(p, view);
    const g = sectionMarkGeometry(pts.a, pts.b, view.kind, sectionLabelOf(view), mPerMm, view.mark, false, sectionSheetNumberOf(p, view.id));
    const layer = view.kind === 'elevation' ? DXF_LAYER_ELEVACOES : DXF_LAYER_CORTES;
    for (const [a, b] of g.segments) out.lines.push({ a, b, layer });
    for (const ring of g.arrows) {
      for (let i = 0; i < ring.length; i++) out.lines.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]!, layer });
    }
    for (const bub of g.bubbles) {
      const ring = Array.from({ length: BOLHA_LADOS }, (_, i) => {
        const ang = (i * 2 * Math.PI) / BOLHA_LADOS;
        return { x: bub.at.x + Math.cos(ang) * bub.r, y: bub.at.y + Math.sin(ang) * bub.r };
      });
      for (let i = 0; i < ring.length; i++) out.lines.push({ a: ring[i]!, b: ring[(i + 1) % ring.length]!, layer });
    }
    for (const label of g.labels) {
      out.texts.push({
        at: label.at,
        text: label.text,
        height: (view.mark?.textMm ?? SECTION_TEXT_MM) * mPerMm,
        rotation: label.rotation,
        layer,
      });
    }
  }
  return out;
}
