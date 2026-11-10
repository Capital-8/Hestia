import { dot, len, sub, type Vec2 } from '@hestia/geom';
import { floorViewId, sectionLabelOf, sectionMarkGeometry, sectionPoints, sectionSheetNumberOf, viewGraphicsOf, type Id, type Project } from '@hestia/model';

/** Distância de `p` ao segmento a–b. */
function distToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const d = sub(b, a);
  const l2 = dot(d, d);
  if (l2 < 1e-18) return len(sub(p, a));
  const t = Math.max(0, Math.min(1, dot(sub(p, a), d) / l2));
  return len(sub(p, { x: a.x + d.x * t, y: a.y + d.y * t }));
}

/** Ponto dentro do triângulo (barycentric, aceita a borda). */
function inTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** Vistas cujas extremidades caem na janela de seleção. */
export function sectionMarkIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  if (viewGraphicsOf(p, floorViewId(levelId)).overrides.annotation.visible === false) return [];
  const x0 = Math.min(a.x, b.x);
  const x1 = Math.max(a.x, b.x);
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  const inside = (q: Vec2): boolean => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
  return p.views
    .filter((v) => v.mark?.visible !== false)
    .filter((v) => {
      const pts = sectionPoints(p, v);
      return inside(pts.a) || inside(pts.b);
    })
    .map((v) => v.id);
}

/**
 * Vista de corte/elevação sob o cursor. A marca é desenhada em mm de papel, então a tolerância acompanha o zoom e a
 * escala da vista; o rótulo e os triângulos das setas também são clicáveis. Categoria `annotation` oculta não seleciona.
 */
export function sectionMarkAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  const g = viewGraphicsOf(p, floorViewId(levelId));
  if (g.overrides.annotation.visible === false) return null;
  const mPerMm = g.scale / 1000;
  const tol = Math.max(3 * mpp, 0.02);
  let bestId: Id | null = null;
  let bestScore = Infinity;
  const consider = (id: Id, score: number): void => {
    if (score <= tol && score < bestScore) {
      bestId = id;
      bestScore = score;
    }
  };

  for (const view of p.views) {
    if (view.mark?.visible === false) continue;
    const pts = sectionPoints(p, view);
    const geo = sectionMarkGeometry(pts.a, pts.b, view.kind, sectionLabelOf(view), mPerMm, view.mark, false, sectionSheetNumberOf(p, view.id));
    for (const [a, b] of geo.segments) consider(view.id, distToSegment(at, a, b));
    for (const ring of geo.arrows) {
      if (ring.length < 3) continue;
      if (inTriangle(at, ring[0]!, ring[1]!, ring[2]!)) consider(view.id, 0);
      for (let i = 0; i < ring.length; i++) consider(view.id, distToSegment(at, ring[i]!, ring[(i + 1) % ring.length]!));
    }
    for (const label of geo.labels) {
      const rad = (label.rotation * Math.PI) / 180;
      const u = { x: Math.cos(rad), y: Math.sin(rad) };
      const n = { x: -u.y, y: u.x };
      const q = sub(at, label.at);
      const along = dot(q, u);
      const across = dot(q, n);
      const textMm = view.mark?.textMm ?? 2.5;
      const halfW = Math.max(2 * mpp, (label.text.length * textMm * 0.58 * mPerMm) / 2);
      const halfH = Math.max(2 * mpp, (textMm * 0.6 * mPerMm) / 2);
      if (Math.abs(along) <= halfW && Math.abs(across) <= halfH) consider(view.id, 0);
    }
  }
  return bestId;
}
