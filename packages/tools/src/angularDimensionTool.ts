import { add, dist, dot, len, mul, norm, sub, type Vec2 } from '@hestia/geom';
import {
  angularDimensionData,
  angularDimensionGeometry,
  formatDimension,
  newId,
  unitsOf,
  coreSpan,
  type AngularDimension,
  type AngularDimensionSide,
  type Dimension,
} from '@hestia/model';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { angularReachLinks, frameOfWall, pointAt } from '@hestia/engine';
import { addSectionDimension, ToolBase, viewPlanId } from './base.ts';
import { isSectionRef, sectionRefFeatures } from './angularSectionRefs.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

const LABEL_HALF = 1.2;
const MIN_RADIUS = 0.05;
const LINE_REFERENCE_KINDS = new Set(['faceParede', 'eixoParede', 'nucleoParede', 'arestaAnel', 'linhaEsboco', 'arestaEscada', 'linhaGrade', 'linhaDetalhe', 'separador']);

/** Direção de uma referência: a reta, orientada para o lado do elemento (para o arco sair no encontro certo). */
interface RefLine {
  feature: AlignFeature;
  from: Vec2;
  to: Vec2;
  anchor: Vec2;
  /** Meio do trecho, usado quando o clique cai praticamente no encontro e o lado fica ambíguo. */
  fallback?: Vec2;
  /** Trecho finito da linha selecionada; ausente para linhas curvas/tangentes. */
  segment?: [Vec2, Vec2];
}

const angleOf = (v: Vec2): number => Math.atan2(v.y, v.x);

const wrapPi = (a: number): number => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
};

/** Interseção de duas retas infinitas; null quando são paralelas. */
function intersection(a: Vec2, da: Vec2, b: Vec2, db: Vec2): Vec2 | null {
  const det = da.x * db.y - da.y * db.x;
  if (Math.abs(det) < 1e-9) return null;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = (dx * db.y - dy * db.x) / det;
  return { x: a.x + da.x * t, y: a.y + da.y * t };
}

/**
 * Cota angular (Anotar): clique em duas linhas de referência — face, eixo ou núcleo de parede, como no Alinhar —
 * e depois escolha o lado e o raio do arco com o cursor. Tab alterna as candidatas sob o cursor.
 */
export class AngularDimensionTool extends ToolBase {
  readonly id = 'angularDimension';
  readonly label = 'Cota angular';
  override get hint(): string {
    return this.t('tl_hint_angdim');
  }
  private refA: AlignFeature | null = null;
  private refB: AlignFeature | null = null;
  private hover: AlignFeature[] = [];
  private hoverIndex = 0;
  private placing = false;
  private previewDim: Dimension | null = null;

  protected reset(): void {
    this.refA = null;
    this.refB = null;
    this.hover = [];
    this.hoverIndex = 0;
    this.placing = false;
    this.previewDim = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.refA !== null || this.refB !== null;
  }

  private candidates(at: Vec2): AlignFeature[] {
    // Corte/elevação: as referências são as arestas da vista (t, z); a planta não entra.
    const sec = this.env.section?.();
    if (sec) return sectionRefFeatures(sec, at, this.env.metersPerPixel(), this.env.hiddenInView?.(), this.uiLang());
    return alignFeaturesAt({
      project: this.env.project(),
      levelId: this.env.levelId(),
      at,
      metersPerPixel: this.env.metersPerPixel(),
      prefer: this.env.options().alignPrefer ?? 'faces',
      hidden: this.env.hiddenInView?.(),
      referenceOnly: true,
      planId: this.env.areaPlanId?.() ?? undefined,
    }).filter((f) => LINE_REFERENCE_KINDS.has(f.kind));
  }

  private updateHover(at: Vec2): void {
    const previous = this.hover[this.hoverIndex]?.key;
    const other = this.refA?.key;
    const candidates = this.candidates(at).filter((f) => f.key !== other);
    this.hover = candidates;
    const found = previous ? candidates.findIndex((f) => f.key === previous) : -1;
    this.hoverIndex = found >= 0 ? found : 0;
  }

  private current(): AlignFeature | null {
    return this.hover[this.hoverIndex] ?? null;
  }

  private featureItems(f: AlignFeature, prefix: string, dashed = false): PreviewItem[] {
    // Aresta da vista de corte: desenha o trecho real (não a reta de 2,4 m da planta).
    if (isSectionRef(f) && f.seg) {
      return [
        { kind: 'line', a: f.seg.a, b: f.seg.b, halo: true, dashed },
        { kind: 'label', at: f.line.p, text: `${prefix}${f.label}` },
      ];
    }
    const a = add(f.line.p, mul(f.line.d, -LABEL_HALF));
    const b = add(f.line.p, mul(f.line.d, LABEL_HALF));
    return [
      { kind: 'line', a, b, halo: true, dashed },
      { kind: 'label', at: f.line.p, text: `${prefix}${f.label}` },
    ];
  }

  /** Reta de cada referência, apontando para o lado do elemento (o encontro fica do lado visível). */
  private refLine(f: AlignFeature): RefLine {
    // O clique orienta a semirreta; se ele cair no próprio encontro, o meio do trecho desempata.
    let segment: [Vec2, Vec2] | undefined = f.seg ? [f.seg.a, f.seg.b] : undefined;
    const frame = frameOfWall(this.env.project(), f.ownerId);
    let fallback: Vec2 | undefined;
    if (segment) fallback = { x: (segment[0].x + segment[1].x) / 2, y: (segment[0].y + segment[1].y) / 2 };
    if (!segment && frame) {
      const core = coreSpan(frame.type);
      const s = f.key.endsWith(':face:hi') ? frame.sHi
        : f.key.endsWith(':face:lo') ? frame.sLo
        : f.key.endsWith(':nucleo:a') ? frame.sign * (frame.extOffset - core.from)
        : f.key.endsWith(':nucleo:b') ? frame.sign * (frame.extOffset - core.to)
        : 0;
      fallback = pointAt(frame, frame.length / 2, s);
      if (!frame.arc) segment = [pointAt(frame, 0, s), pointAt(frame, frame.length, s)];
    }
    const dir = norm(f.line.d);
    return { feature: f, anchor: f.line.p, fallback, from: dir, to: f.line.d, ...(segment ? { segment } : {}) };
  }

  /** Centro e direções de referência; null se as retas são paralelas. */
  private geometry(): { center: Vec2; a: RefLine; b: RefLine } | null {
    if (!this.refA || !this.refB) return null;
    return this.pairGeometry(this.refA, this.refB);
  }

  private pairGeometry(a0: AlignFeature, b0: AlignFeature): { center: Vec2; a: RefLine; b: RefLine } | null {
    const a = this.refLine(a0);
    const b = this.refLine(b0);
    const center = intersection(a.feature.line.p, a.from, b.feature.line.p, b.from);
    if (!center) return null;
    const orient = (r: RefLine): Vec2 => {
      const click = sub(r.anchor, center);
      const byClick = len(click) > 1e-3 ? click : null;
      const byFallback = r.fallback ? sub(r.fallback, center) : null;
      const toward = byClick && len(byClick) > 1e-6 ? byClick : byFallback && len(byFallback) > 1e-6 ? byFallback : r.from;
      return dot(r.from, toward) >= 0 ? r.from : { x: -r.from.x, y: -r.from.y };
    };
    return { center, a: { ...a, to: orient(a) }, b: { ...b, to: orient(b) } };
  }

  /** Lado escolhido pelo cursor: menor quando ele está no setor entre as direções, maior fora dele. */
  private sideAt(center: Vec2, from: Vec2, to: Vec2, cursor: Vec2): 'minor' | 'major' {
    const cd = sub(cursor, center);
    if (len(cd) < 1e-9) return 'minor';
    const delta = wrapPi(angleOf(to) - angleOf(from));
    const cursorDelta = wrapPi(angleOf(norm(cd)) - angleOf(from));
    const inside = delta >= 0 ? cursorDelta >= -1e-9 && cursorDelta <= delta + 1e-9 : cursorDelta <= 1e-9 && cursorDelta >= delta - 1e-9;
    return inside ? 'minor' : 'major';
  }

  /** Raio pelo cursor: o arco segue as retas prolongadas, como no Revit. */
  private radiusAt(g: { center: Vec2; a: RefLine; b: RefLine }, cursor: Vec2): number {
    return Math.max(MIN_RADIUS, dist(cursor, g.center));
  }

  /** Dados da cota no lado escolhido pelo cursor: interno = menor; externo = volta >180°. */
  private angularData(g: { center: Vec2; a: RefLine; b: RefLine }, radius: number, cursor: Vec2): AngularDimension {
    const selected = this.sideAt(g.center, g.a.to, g.b.to, cursor);
    const side: AngularDimensionSide = selected === 'major' ? 'reflex' : 'minor';
    // No lado externo, completar o ângulo menor produz a volta externa (ex.: 30° → 330°).
    const base = selected === 'major' ? 'minor' : undefined;
    const data = angularDimensionData(g.center, g.a.to, g.b.to, radius, side, this.refA!.key, this.refB!.key, base);
    return { ...data, links: angularReachLinks(g.center, data.from, data.to, radius, g.a.segment, g.b.segment) };
  }

  private makePreview(cursor: Vec2): void {
    const g = this.geometry();
    if (!g) { this.previewDim = null; return; }
    const radius = this.radiusAt(g, cursor);
    const angular = this.angularData(g, radius, cursor);
    const o = this.env.options();
    const dim: Dimension = {
      id: 'preview-angular',
      a: g.center,
      b: add(g.center, mul(angular.to, radius)),
      offset: 0,
      angular,
      ...(o.dimensionPrecision !== undefined ? { precision: o.dimensionPrecision } : {}),
      ...(o.dimensionTextHeight !== undefined ? { textHeight: o.dimensionTextHeight } : {}),
      ...(o.dimensionTickStyle !== undefined ? { tickStyle: o.dimensionTickStyle } : {}),
    };
    this.previewDim = dim;
  }

  private refreshItems(): void {
    const items: PreviewItem[] = [];
    if (this.refA) items.push(...this.featureItems(this.refA, this.t('tl_label_ref1')));
    if (this.refB) items.push(...this.featureItems(this.refB, this.t('tl_label_ref2')));
    if (!this.refB) {
      const cand = this.current();
      if (cand) items.push(...this.featureItems(cand, this.t(this.refA ? 'tl_label_ref2' : 'tl_label_ref1'), true));
    }
    if (this.previewDim?.angular) {
      const geom = angularDimensionGeometry(this.previewDim);
      if (geom) {
        for (let i = 1; i < geom.arc.length; i++) items.push({ kind: 'line', a: geom.arc[i - 1]!, b: geom.arc[i]! });
        for (const [a, b] of geom.extensions) items.push({ kind: 'line', a, b, dashed: true });
        for (const [a, b] of geom.ticks) items.push({ kind: 'line', a, b });
        items.push({ kind: 'label', at: geom.textAt, text: formatDimension(this.previewDim, 0, unitsOf(this.env.project())) });
      }
    }
    this.items = items;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    if (this.placing) {
      this.makePreview(p.raw);
      this.refreshItems();
      return;
    }
    this.updateHover(p.raw);
    this.refreshItems();
  }

  override tab(): void {
    if (this.placing) return;
    if (this.hover.length < 2) {
      if (this.hover[0]) this.env.say(`${this.hover[0].label}. ${this.hint}`);
      return;
    }
    this.hoverIndex = (this.hoverIndex + 1) % this.hover.length;
    this.refreshItems();
    this.env.say(`${this.current()!.label}. ${this.t('tl_msg_click_reference_tab')}`);
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    if (this.placing) {
      const g = this.geometry();
      if (!g || !this.previewDim?.angular) { this.env.say(this.t('tl_msg_angdim_no_angle')); return; }
      const radius = this.radiusAt(g, p.raw);
      const angular = this.angularData(g, radius, p.raw);
      const o = this.env.options();
      const dimension: Dimension = {
        id: newId('dim'),
        a: g.center,
        b: add(g.center, mul(angular.to, radius)),
        offset: 0,
        angular,
        ...(o.dimensionPrecision !== undefined ? { precision: o.dimensionPrecision } : {}),
        ...(o.dimensionTextHeight !== undefined ? { textHeight: o.dimensionTextHeight } : {}),
        ...(o.dimensionTickStyle !== undefined ? { tickStyle: o.dimensionTickStyle } : {}),
      };
      // No corte/elevação a cota vai para a vista (mesma gravação da cota linear), nunca para o nível.
      if (this.env.section?.()) {
        if (!addSectionDimension(this.env, dimension)) { this.env.say(this.t('tl_msg_dim_section_save_fail')); return; }
      } else {
        this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), planId: viewPlanId(this.env), dimension });
      }
      this.reset();
      this.env.say(this.hint);
      return;
    }
    this.updateHover(p.raw);
    const cand = this.current();
    if (!cand) {
      this.env.say(this.t('tl_msg_click_face_axis_core'));
      return;
    }
    if (!this.refA) {
      this.refA = cand;
      this.env.say(this.t('tl_msg_ref1_chosen', { ref: cand.label }));
      this.refreshItems();
      return;
    }
    if (cand.key === this.refA.key) {
      this.env.say(this.t('tl_msg_second_ref_diff'));
      return;
    }
    const trial = this.pairGeometry(this.refA, cand);
    if (!trial) {
      this.env.say(this.t('tl_msg_angdim_parallel'));
      return;
    }
    this.refB = cand;
    this.placing = true;
    this.makePreview(p.raw);
    this.refreshItems();
    this.env.say(this.t('tl_msg_angdim_place'));
  }

  override confirm(): void {
    if (this.refA && this.refB) {
      this.reset();
      this.env.say(this.hint);
      return;
    }
    super.confirm();
  }
}
