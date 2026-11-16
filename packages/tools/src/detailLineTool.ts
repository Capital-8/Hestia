import { dist, type Vec2 } from '@hestia/geom';
import { newId, unitsOf } from '@hestia/model';
import { addSectionDetailLine, ToolBase, viewPlanId } from './base.ts';
import { draftAngleItemsForConnection } from './anglePreview.ts';
import { detailLinePreviewDim } from './dims/providers/line.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import type { PointerInfo, WallDrawShape } from './types.ts';

function arcThreePt(p0: Vec2, p1: Vec2, p2: Vec2, segs = 16): Array<[Vec2, Vec2]> {
  const ax = p0.x; const ay = p0.y;
  const bx = p1.x; const by = p1.y;
  const cx = p2.x; const cy = p2.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-6) return [[p0, p2]];
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  const a0 = Math.atan2(ay - uy, ax - ux);
  const a1 = Math.atan2(by - uy, bx - ux);
  const a2 = Math.atan2(cy - uy, cx - ux);
  const norm = (ang: number): number => ((ang % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  let sweep = norm(a2 - a0);
  const mid = norm(a1 - a0);
  if (mid > sweep) sweep -= Math.PI * 2;
  const out: Array<[Vec2, Vec2]> = [];
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + (sweep * i) / segs;
    const t1 = a0 + (sweep * (i + 1)) / segs;
    out.push([
      { x: ux + Math.cos(t0) * r, y: uy + Math.sin(t0) * r },
      { x: ux + Math.cos(t1) * r, y: uy + Math.sin(t1) * r },
    ]);
  }
  return out;
}

function shapeSegments(shape: WallDrawShape, pts: readonly Vec2[], cur: Vec2): Array<[Vec2, Vec2]> {
  const p0 = pts[0];
  if (!p0) return [];
  if (shape === 'line') return [[p0, cur]];
  if (shape === 'rect') {
    const p1 = { x: cur.x, y: p0.y };
    const p2 = cur;
    const p3 = { x: p0.x, y: cur.y };
    return [[p0, p1], [p1, p2], [p2, p3], [p3, p0]];
  }
  if (shape === 'circle' || shape === 'poly-inscribed' || shape === 'poly-circumscribed') {
    const r0 = dist(p0, cur);
    if (r0 < 1e-4) return [];
    const sides = shape === 'circle' ? 24 : 6;
    const r = shape === 'poly-circumscribed' ? r0 / Math.cos(Math.PI / sides) : r0;
    const baseAng = Math.atan2(cur.y - p0.y, cur.x - p0.x);
    const out: Array<[Vec2, Vec2]> = [];
    for (let i = 0; i < sides; i++) {
      const a0 = baseAng + (i / sides) * Math.PI * 2;
      const a1 = baseAng + ((i + 1) / sides) * Math.PI * 2;
      out.push([
        { x: p0.x + Math.cos(a0) * r, y: p0.y + Math.sin(a0) * r },
        { x: p0.x + Math.cos(a1) * r, y: p0.y + Math.sin(a1) * r },
      ]);
    }
    return out;
  }
  if (shape === 'ellipse') {
    const rx = Math.abs(cur.x - p0.x);
    const ry = Math.abs(cur.y - p0.y);
    if (rx < 1e-4 || ry < 1e-4) return [];
    const sides = 24;
    const out: Array<[Vec2, Vec2]> = [];
    for (let i = 0; i < sides; i++) {
      const a0 = (i / sides) * Math.PI * 2;
      const a1 = ((i + 1) / sides) * Math.PI * 2;
      out.push([
        { x: p0.x + Math.cos(a0) * rx, y: p0.y + Math.sin(a0) * ry },
        { x: p0.x + Math.cos(a1) * rx, y: p0.y + Math.sin(a1) * ry },
      ]);
    }
    return out;
  }
  if (shape === 'arc' || shape === 'arc-tangent') {
    if (pts.length === 1) return [[p0, cur]];
    return arcThreePt(p0, pts[1]!, cur);
  }
  if (shape === 'arc-center') {
    if (pts.length === 1) return [[p0, cur]];
    const p1 = pts[1]!;
    const r = dist(p0, p1);
    const a0 = Math.atan2(p1.y - p0.y, p1.x - p0.x);
    const a1 = Math.atan2(cur.y - p0.y, cur.x - p0.x);
    let sweep = a1 - a0;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    const segs = 16;
    const out: Array<[Vec2, Vec2]> = [];
    for (let i = 0; i < segs; i++) {
      const t0 = a0 + (sweep * i) / segs;
      const t1 = a0 + (sweep * (i + 1)) / segs;
      out.push([
        { x: p0.x + Math.cos(t0) * r, y: p0.y + Math.sin(t0) * r },
        { x: p0.x + Math.cos(t1) * r, y: p0.y + Math.sin(t1) * r },
      ]);
    }
    return out;
  }
  return [[p0, cur]];
}

/** Linha de detalhe: traço 2D independente da geometria do modelo, com todas as formas geométricas da galeria. */
export class DetailLineTool extends ToolBase {
  readonly id = 'detailLine';
  readonly label = 'Linha de detalhe';
  override get hint(): string {
    return this.t('tl_hint_detail_line');
  }
  private pts: Vec2[] = [];
  private last: Vec2 | null = null;
  protected reset(): void { this.pts = []; this.last = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.pts.length > 0; }
  private shape(): WallDrawShape { return this.env.options().detailLineShape ?? 'line'; }
  private requiredClicks(): number {
    const s = this.shape();
    return s === 'arc' || s === 'arc-center' || s === 'arc-tangent' ? 3 : 2;
  }

  override move(p: PointerInfo): void {
    const a = this.pts[this.pts.length - 1] ?? null;
    const q = this.snap(p, contextoDeTraco(a)).point;
    this.last = q;
    if (!this.pts.length) { this.items = []; return; }
    const segs = shapeSegments(this.shape(), this.pts, q);
    this.items = segs.map(([sa, sb]) => ({ kind: 'line' as const, a: sa, b: sb, dashed: true }));
    if (this.shape() === 'line' && a) {
      this.items.push(...draftAngleItemsForConnection(this.env.project(), this.env.levelId(), viewPlanId(this.env), a, q, this.env.metersPerPixel(), unitsOf(this.env.project())));
    }
  }

  /** Comprimento do traço em desenho, pelo sistema único de cotas. */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const a = this.pts[0];
    return a && this.last ? [detailLinePreviewDim(a, this.last)] : [];
  }

  /** Comprimento digitado + Enter, pelo núcleo comum de desenho (igual à parede). */
  override type(text: string): boolean {
    const a = this.pts[this.pts.length - 1];
    if (!a) return false;
    const v = lerComprimentoDigitado(this.env, text);
    if (v === null) return false;
    this.commit(pontoPorComprimento(a, this.inf?.point ?? this.raw, v));
    return true;
  }

  override click(p: PointerInfo): void {
    const a = this.pts[this.pts.length - 1] ?? null;
    const q = this.snap(p, contextoDeTraco(a)).point;
    if (this.pts.length + 1 < this.requiredClicks()) {
      this.pts.push(q);
      this.env.say(this.pts.length === 1 ? 'Clique no próximo ponto da forma.' : 'Clique para concluir o arco.');
      return;
    }
    this.commit(q);
  }

  private commit(q: Vec2): void {
    const segs = shapeSegments(this.shape(), this.pts, q).filter(([a, b]) => dist(a, b) >= 0.01);
    if (!segs.length) { this.env.say('Escolha um ponto final mais distante.'); return; }
    const style = this.env.options().detailLineStyle ?? 'solid';
    const levelId = this.env.levelId();
    const planId = viewPlanId(this.env);
    this.env.transaction('Linha de detalhe', () => {
      for (const [a, b] of segs) {
        const item = { id: newId('dl'), a, b, style };
        if (!addSectionDetailLine(this.env, item)) this.env.exec({ type: 'addDetailLine', levelId, planId, item });
      }
    });
    this.reset();
    this.env.say(this.hint);
  }
}
