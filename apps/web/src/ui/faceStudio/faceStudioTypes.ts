import {
  arcFromSagitta,
  arcSample,
  dist,
  pointInMulti,
  shapeToMultiPolygon,
  sub,
  transformDxfPaths,
  v2,
  type FaceShape2D,
  type SketchSeg,
  type Vec2,
} from '@hestia/geom';
import {
  functionLabels,
  isCurtainType,
  isFloor,
  isMembraneLayer,
  isSlab,
  isWall,
  layerSpans,
  type Element,
  type FaceDxfOverlay,
  type FacePaintEntry,
  type FaceRegion,
  type FaceSlot,
  type Id,
  type Project,
} from '@hestia/model';
import { arcCenterEnds, arcTangent, arcThreePoints } from '@hestia/tools';
import type { Lang } from '../../editor/i18n.ts';
import type { FaceStudioSelection, FaceStudioShape, FaceStudioTool } from '../../editor/state.ts';

export type { FaceStudioSelection, FaceStudioShape, FaceStudioTool };

export interface LayerOption {
  index: number;
  label: string;
  materialId: Id;
}

const MIN_SPAN = 1e-4;

/** Translates a `FaceSlot` identifier into a human-readable label. */
export function faceSlotLabel(face: FaceSlot, lang: Lang): string {
  const pt = lang === 'pt';
  if (face === 'sideExt') return pt ? 'Face externa' : 'Exterior face';
  if (face === 'sideInt') return pt ? 'Face interna' : 'Interior face';
  if (face === 'endA') return pt ? 'Topo inicial (A)' : 'Start end (A)';
  if (face === 'endB') return pt ? 'Topo final (B)' : 'End cap (B)';
  if (face === 'top') return pt ? 'Topo' : 'Top';
  if (face === 'bottom') return pt ? 'Base / Fundo' : 'Bottom';
  if (face.startsWith('edge:')) {
    const [, rStr, iStr] = face.split(':');
    const r = Number(rStr);
    const i = Number(iStr);
    if (r === 0) return pt ? `Borda externa #${i + 1}` : `Outer edge #${i + 1}`;
    return pt ? `Borda furo ${r} #${i + 1}` : `Hole ${r} edge #${i + 1}`;
  }
  if (face.startsWith('opening:')) {
    const [, openId, part] = face.split(':');
    const partLabel =
      part === 'sill'
        ? pt ? 'Peitoril' : 'Sill'
        : part === 'head'
          ? pt ? 'Verga' : 'Head'
          : part === 'jambLeft'
            ? pt ? 'Umbral esq.' : 'Left jamb'
            : pt ? 'Umbral dir.' : 'Right jamb';
    return `${partLabel} (${openId ?? ''})`;
  }
  return face;
}

/** Lists non-membrane layer choices for an element's type. */
export function elementLayerOptions(p: Project, el: Element, lang: Lang): LayerOption[] {
  const wt = isWall(el) ? (p.wallTypes[el.typeId] ?? p.wallTypes[p.defaults.wallTypeId]) : undefined;
  const type = wt ?? (isFloor(el) ? p.floorTypes[el.typeId] : isSlab(el) ? p.slabTypes[el.typeId] : undefined);
  const spans = type ? (wt && isCurtainType(wt) ? [] : layerSpans(type)) : [];
  const fnNames = functionLabels(lang === 'pt' ? 'pt' : 'en');
  const out: LayerOption[] = [];
  for (const { index, layer } of spans) {
    if (isMembraneLayer(layer)) continue;
    const matName = p.materials[layer.materialId]?.name ?? layer.materialId;
    out.push({
      index,
      label: `#${index + 1} · ${fnNames[layer.function]} (${matName})`,
      materialId: layer.materialId,
    });
  }
  return out;
}

function sampleSketchSegs(segs: readonly SketchSeg[]): Vec2[] {
  const out: Vec2[] = [];
  for (const seg of segs) {
    const arc = seg.sag ? arcFromSagitta(seg.a, seg.b, seg.sag) : null;
    const pts = arc ? arcSample(arc, 0, arc.length, 0, 0.005) : [seg.a, seg.b];
    for (const p of pts) {
      const prev = out[out.length - 1];
      if (!prev || dist(prev, p) > 1e-6) out.push(p);
    }
  }
  return out;
}

function sampleEllipseRing(cx: number, cy: number, rx: number, ry: number, segs = 36): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < segs; i++) {
    const a = (2 * Math.PI * i) / segs;
    out.push(v2(cx + rx * Math.cos(a), cy + ry * Math.sin(a)));
  }
  return out;
}

function sampleRegularPolygon(center: Vec2, pt: Vec2, sides: number, circumscribed: boolean): Vec2[] | null {
  const d = dist(center, pt);
  if (d < MIN_SPAN) return null;
  const baseAngle = Math.atan2(pt.y - center.y, pt.x - center.x);
  const r = circumscribed ? d / Math.cos(Math.PI / sides) : d;
  const offset = circumscribed ? Math.PI / sides : 0;
  const ring: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = baseAngle + offset + (2 * Math.PI * i) / sides;
    ring.push(v2(center.x + r * Math.cos(a), center.y + r * Math.sin(a)));
  }
  return ring;
}

function validPoly(ring: Vec2[]): FaceShape2D | null {
  if (ring.length < 3) return null;
  const poly: FaceShape2D = { kind: 'poly', rings: [ring] };
  return shapeToMultiPolygon(poly).length > 0 ? poly : null;
}

/** Builds a `FaceShape2D` from gallery shape, user-picked `(u, v)` points, and band/region mode. */
export function buildShapeFromPoints(
  shape: FaceStudioShape,
  pts: readonly Vec2[],
  bandWidth: number,
  asBand: boolean,
  closed = false,
): FaceShape2D | null {
  const width = Math.max(0.004, bandWidth);
  switch (shape) {
    case 'rect': {
      if (pts.length < 2) return null;
      const [a, b] = [pts[0]!, pts[1]!];
      if (Math.abs(b.x - a.x) < MIN_SPAN || Math.abs(b.y - a.y) < MIN_SPAN) return null;
      if (asBand) {
        return { kind: 'lineBand', pts: [v2(a.x, a.y), v2(b.x, a.y), v2(b.x, b.y), v2(a.x, b.y)], width, closed: true };
      }
      return { kind: 'rect', u0: a.x, v0: a.y, u1: b.x, v1: b.y };
    }
    case 'circle': {
      if (pts.length < 2) return null;
      const [c, edge] = [pts[0]!, pts[1]!];
      const r = dist(c, edge);
      if (r < MIN_SPAN) return null;
      if (asBand) {
        return { kind: 'lineBand', pts: sampleEllipseRing(c.x, c.y, r, r, 36), width, closed: true };
      }
      return { kind: 'circle', center: c, radius: r };
    }
    case 'ellipse': {
      if (pts.length < 2) return null;
      const [a, b] = [pts[0]!, pts[1]!];
      const rx = Math.abs(b.x - a.x) / 2;
      const ry = Math.abs(b.y - a.y) / 2;
      if (rx < MIN_SPAN || ry < MIN_SPAN) return null;
      const center = v2((a.x + b.x) / 2, (a.y + b.y) / 2);
      if (asBand) {
        return { kind: 'lineBand', pts: sampleEllipseRing(center.x, center.y, rx, ry, 36), width, closed: true };
      }
      return { kind: 'ellipse', center, rx, ry };
    }
    case 'poly-inscribed':
    case 'poly-circumscribed': {
      if (pts.length < 2) return null;
      const ring = sampleRegularPolygon(pts[0]!, pts[1]!, 6, shape === 'poly-circumscribed');
      if (!ring) return null;
      if (asBand) return { kind: 'lineBand', pts: ring, width, closed: true };
      return validPoly(ring);
    }
    case 'arc-3pt': {
      if (pts.length < 2) return null;
      const [p0, p1, p2] = [pts[0]!, pts[1]!, pts[2]];
      if (dist(p0, p1) < MIN_SPAN) return null;
      if (!p2) {
        return asBand ? { kind: 'arcBand', pts: [p0, p1], width, closed: false } : null;
      }
      const segs = arcThreePoints(p0, p1, p2);
      const sampled = segs.length > 0 ? sampleSketchSegs(segs) : [p0, p1];
      if (sampled.length < 2) return null;
      if (asBand) return { kind: 'arcBand', pts: sampled, width, closed: false };
      return validPoly(sampled);
    }
    case 'arc-center': {
      if (pts.length < 3) return null;
      const [c, start, end] = [pts[0]!, pts[1]!, pts[2]!];
      if (dist(c, start) < MIN_SPAN || dist(c, end) < MIN_SPAN) return null;
      const a0 = Math.atan2(start.y - c.y, start.x - c.x);
      const a1 = Math.atan2(end.y - c.y, end.x - c.x);
      const delta = (((a1 - a0) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      const segs = arcCenterEnds(c, start, end, delta >= 0);
      const sampled = sampleSketchSegs(segs);
      if (sampled.length < 2) return null;
      if (asBand) return { kind: 'arcBand', pts: sampled, width, closed: false };
      return validPoly([c, ...sampled]);
    }
    case 'arc-tangent': {
      if (pts.length < 3) return null;
      const [p0, p1, p2] = [pts[0]!, pts[1]!, pts[2]!];
      if (dist(p0, p1) < MIN_SPAN || dist(p0, p2) < MIN_SPAN) return null;
      const segs = arcTangent(p0, sub(p1, p0), p2);
      const sampled = sampleSketchSegs(segs);
      if (sampled.length < 2) return null;
      if (asBand) return { kind: 'arcBand', pts: sampled, width, closed: false };
      return validPoly(sampled);
    }
    case 'line': {
      if (pts.length < 2) return null;
      if (asBand) return { kind: 'lineBand', pts: [...pts], width, closed };
      return validPoly([...pts]);
    }
  }
}

function distToSegment2D(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
  return dist(p, v2(a.x + t * dx, a.y + t * dy));
}

function hitTestDxf(pt: Vec2, ov: FaceDxfOverlay, tol: number): boolean {
  const paths = transformDxfPaths(ov.paths, ov.offset, ov.rotationDeg, ov.scale);
  const radius = Math.max(tol, ov.separatorWidth / 2);
  for (const path of paths) {
    const n = path.closed ? path.pts.length : path.pts.length - 1;
    for (let i = 0; i < n; i++) {
      const a = path.pts[i]!;
      const b = path.pts[(i + 1) % path.pts.length]!;
      if (distToSegment2D(pt, a, b) <= radius) return true;
    }
  }
  return false;
}

/** Hit-tests `(u, v)` against DXF overlays and regions (highest order first). */
export function hitTestFaceEntry(pt: Vec2, entry: FacePaintEntry, tol: number): FaceStudioSelection {
  const overlays = entry.dxfOverlays ?? [];
  for (let i = overlays.length - 1; i >= 0; i--) {
    if (hitTestDxf(pt, overlays[i]!, tol)) return { kind: 'dxf', id: overlays[i]!.id };
  }
  const regions = [...(entry.regions ?? [])].sort((a, b) => b.order - a.order);
  for (const r of regions) {
    const poly = shapeToMultiPolygon(r.shape);
    if (poly.length > 0 && pointInMulti(pt, poly)) return { kind: 'region', id: r.id };
  }
  return { kind: 'base' };
}

/** Human-readable name for a gallery shape. */
export function shapeLabel(shape: FaceStudioShape, lang: Lang): string {
  const pt = lang === 'pt';
  const map: Record<FaceStudioShape, string> = {
    line: pt ? 'Linha' : 'Line',
    rect: pt ? 'Retângulo' : 'Rectangle',
    'poly-inscribed': pt ? 'Polígono inscrito' : 'Inscribed polygon',
    'poly-circumscribed': pt ? 'Polígono circunscrito' : 'Circumscribed polygon',
    circle: pt ? 'Círculo' : 'Circle',
    'arc-3pt': pt ? 'Arco (3 pontos)' : 'Arc (3-point)',
    'arc-center': pt ? 'Arco (centro)' : 'Arc (center)',
    'arc-tangent': pt ? 'Arco tangente' : 'Tangent arc',
    ellipse: pt ? 'Elipse' : 'Ellipse',
  };
  return map[shape];
}

/** Tool/shape metadata for region naming and labels. */
export function toolLabel(tool: FaceStudioTool, shape: FaceStudioShape, asBand: boolean, lang: Lang): string {
  const pt = lang === 'pt';
  if (tool === 'select') return pt ? 'Selecionar' : 'Select';
  if (tool === 'paintBucket') return pt ? 'Balde de Tinta' : 'Paint Bucket';
  return `${shapeLabel(shape, lang)}${asBand ? (pt ? ' (faixa)' : ' (band)') : ''}`;
}

/** Bottom HUD status hint for the active tool, shape, band mode, and draft count. */
export function toolHint(
  tool: FaceStudioTool,
  shape: FaceStudioShape,
  asBand: boolean,
  draftCount: number,
  lang: Lang,
): string {
  const pt = lang === 'pt';
  if (tool === 'select') {
    return pt
      ? 'Clique numa região ou DXF para editar · Del exclui · Botão do meio ou Espaço+arraste move'
      : 'Click a region or DXF to edit · Del removes · Middle-drag or Space+drag pans';
  }
  if (tool === 'paintBucket') {
    return pt
      ? 'Clique numa região ou no fundo da face para aplicar o material ativo'
      : 'Click a region or face background to apply active material';
  }
  if (shape === 'line') {
    if (draftCount === 0) {
      return asBand
        ? (pt ? 'Clique os pontos da faixa · Duplo clique ou Enter conclui · Esc cancela' : 'Click band points · Double-click or Enter finishes · Esc cancels')
        : (pt ? 'Clique os vértices do polígono · Duplo clique ou Enter fecha · Esc cancela' : 'Click polygon vertices · Double-click or Enter closes · Esc cancels');
    }
    return asBand
      ? (pt ? 'Próximo ponto · Clique no 1º para fechar, duplo clique ou Enter conclui' : 'Next point · Click start to close, double-click or Enter finishes')
      : (pt ? 'Clique no 1º vértice, duplo clique ou Enter para fechar · Esc cancela' : 'Click start vertex, double-click or Enter to close · Esc cancels');
  }
  if (shape === 'arc-3pt') {
    if (draftCount === 0) return pt ? 'Clique o ponto inicial do arco' : 'Click arc start point';
    if (draftCount === 1) return pt ? 'Clique o ponto final do arco' : 'Click arc end point';
    return pt ? 'Clique um ponto sobre a curva do arco' : 'Click a point along the arc curve';
  }
  if (shape === 'arc-center') {
    if (draftCount === 0) return pt ? 'Clique o centro do arco' : 'Click arc center';
    if (draftCount === 1) return pt ? 'Clique o ponto inicial do arco' : 'Click arc start point';
    return pt ? 'Clique o ponto final do arco' : 'Click arc end point';
  }
  if (shape === 'arc-tangent') {
    if (draftCount === 0) return pt ? 'Clique o ponto inicial do arco' : 'Click arc start point';
    if (draftCount === 1) return pt ? 'Clique um ponto na direção tangente' : 'Click a point along the tangent';
    return pt ? 'Clique o ponto final do arco' : 'Click arc end point';
  }
  if (shape === 'circle' || shape === 'poly-inscribed' || shape === 'poly-circumscribed') {
    return draftCount === 0
      ? (pt ? 'Clique o centro e depois o raio (ou arraste) · Esc cancela' : 'Click center then radius (or drag) · Esc cancels')
      : (pt ? 'Clique para definir o raio · Esc cancela' : 'Click to set radius · Esc cancels');
  }
  return pt ? 'Arraste ou clique dois pontos para desenhar · Esc cancela' : 'Drag or click two points to draw · Esc cancels';
}

export function nextRegionOrder(regions: readonly FaceRegion[] | undefined): number {
  let max = 0;
  for (const r of regions ?? []) if (r.order > max) max = r.order;
  return max + 1;
}
