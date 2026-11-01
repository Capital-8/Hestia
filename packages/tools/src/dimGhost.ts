import { applyTransform, type Transform } from '@hestia/geom';
import { dimensionFormatStyle, dimensionGeometry, dimensionPoints, dimensionStyleFor, dimensionValue, formatDimension, isElementRef, isOpening, isWall, levelDimensions, unitsOf, type Dimension, type Id, type Project } from '@hestia/model';
import type { PreviewItem } from './types.ts';

const refElement = (r: unknown): Id | undefined => {
  if (!r || typeof r !== 'object') return undefined;
  return isElementRef(r as never) ? (r as { elementId: Id }).elementId : (r as { wallId?: Id }).wallId;
};

/**
 * Cotas permanentes do nível presas a paredes (ou esquadrias delas) que se movem: a prévia redesenha a cota com a
 * parede na posição nova, para o valor mudar ao vivo durante mover/girar/arrastar (como no Revit).
 */
export function ghostDimensions(p: Project, levelId: Id, wallIds: readonly Id[], t: Transform, mPerMm = 0.1): PreviewItem[] {
  const moved = new Set(wallIds);
  const touches = (d: Dimension): boolean => [d.refs?.a, d.refs?.b].some((r) => {
    const id = refElement(r);
    const el = id ? p.elements[id] : undefined;
    return !!id && (moved.has(id) || (isOpening(el) && moved.has(el.hostId)));
  });
  const dims = levelDimensions(p, levelId).filter((d) => !d.angular && d.refs && touches(d));
  if (!dims.length) return [];
  const sim: Project = { ...p, elements: { ...p.elements } };
  for (const id of moved) {
    const w = p.elements[id];
    if (isWall(w)) sim.elements[id] = { ...w, a: applyTransform(t, w.a), b: applyTransform(t, w.b) };
  }
  const units = unitsOf(p);
  const out: PreviewItem[] = [];
  for (const d of dims) {
    const pts = dimensionPoints(sim, d);
    const style = dimensionStyleFor(p.settings, d);
    const g = dimensionGeometry(pts.a, pts.b, d.offset, mPerMm, d.textHeight ?? style.textHeight);
    out.push({ kind: 'line', a: g.line[0], b: g.line[1] }, ...g.extensions.map(([a, b]): PreviewItem => ({ kind: 'line', a, b, dashed: true })));
    out.push({ kind: 'label', at: g.textAt, text: formatDimension(d, dimensionValue(sim, d), units, dimensionFormatStyle(style)), dimensionStyle: true, rotation: g.textRotation });
  }
  return out;
}
