import { dist, type Vec2 } from '@hestia/geom';
import { DIM_MIN_LENGTH, dimRefAt, dimensionGeometry, dimensionValue, formatDimension, newId, roundMm, unitsOf, type Dimension, type DimensionElementRef, type DimensionRef } from '@hestia/model';
import { addSectionDimension, ToolBase, viewPlanId } from './base.ts';
import { endRefAt, signedOffset } from './annotationPick.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

type AnyRef = DimensionRef | DimensionElementRef;
/** Tolerância (m) entre o ponto capturado e a feição do elemento. */
const REF_TOL = 0.005;

/**
 * Cota alinhada (Revit: Aligned Dimension). Clique no ponto A, no ponto B e depois no lado da linha de cota (ou digite
 * o deslocamento e Enter). Pontos sobre a extremidade de uma parede ficam referenciados a ela.
 */
export class DimensionTool extends ToolBase {
  readonly id = 'dimension';
  readonly label = 'Cota';
  readonly hint = 'Cota: clique no primeiro ponto medido, depois no segundo. Mova o cursor para o lado da linha de cota e clique (ou digite o deslocamento).';
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private refA: AnyRef | undefined;
  private refB: AnyRef | undefined;
  private chain: Vec2[] = [];
  private chainRefs: Array<AnyRef | undefined> = [];
  private offsetStage = false;
  private chainOffset = 0;
  /** Ref associativa da feição que coincide com o ponto capturado (planta); no corte, só pontas de parede por coordenada. */
  private refAt(point: Vec2): AnyRef | undefined {
    if (this.env.section?.()) return endRefAt(this.env.project(), this.env.levelId(), point);
    return dimRefAt(this.env.project(), this.env.levelId(), point, REF_TOL)?.ref;
  }
  private measuredPoints(): { a: Vec2; b: Vec2 } {
    const mode = this.env.options().dimensionMode ?? 'aligned';
    if (mode === 'horizontal') return { a: this.a!, b: { x: this.b!.x, y: this.a!.y } };
    if (mode === 'vertical') return { a: this.a!, b: { x: this.a!.x, y: this.b!.y } };
    return { a: this.a!, b: this.b! };
  }

  protected reset(): void {
    this.a = null;
    this.b = null;
    this.refA = undefined;
    this.refB = undefined;
    this.chain = [];
    this.chainRefs = [];
    this.offsetStage = false;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.a !== null || this.chain.length > 0;
  }

  override inputPrompt(): string | null {
    return (this.a && this.b) || this.offsetStage ? 'Deslocamento' : null;
  }

  override confirm(): void {
    if ((this.env.options().dimensionString ?? 'single') !== 'single' && this.chain.length >= 2 && !this.offsetStage) {
      this.offsetStage = true;
      this.env.say('Sequência definida. Clique no lado da linha ou digite o afastamento e Enter.');
      return;
    }
    if (this.chain.length && this.chain.length < 2) { this.reset(); this.env.say(this.hint); return; }
    super.confirm();
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    const inf = this.snap(p);
    if (this.chain.length && !this.a) {
      this.items = this.offsetStage ? this.chainPreview(this.side(p.raw)) : [{ kind: 'point', at: this.chain[0]! }, { kind: 'line', a: this.chain[this.chain.length - 1]!, b: inf.point, dashed: true }];
      return;
    }
    if (this.a && !this.b) this.items = [{ kind: 'point', at: this.a }, { kind: 'line', a: this.a, b: inf.point, dashed: true }];
    if (this.a && this.b) this.items = this.previewOf(this.side(p.raw));
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p);
    const point = inf.point;
    if ((this.env.options().dimensionString ?? 'single') !== 'single') {
      if (this.offsetStage) { this.commitChain(this.side(p.raw) * roundMm(this.distanceToLine(p.raw))); return; }
      if (!this.chain.length) {
        this.chain = [point];
        this.chainRefs = [this.refAt(point)];
      } else {
        const last = this.chain[this.chain.length - 1]!;
        if (dist(last, point) < DIM_MIN_LENGTH) return;
        this.chain.push(point);
        this.chainRefs.push(this.refAt(point));
      }
      this.env.say(`${this.chain.length} referências selecionadas. Continue os cliques e pressione Enter para concluir a sequência.`);
      return;
    }
    if (!this.a) {
      this.a = point;
      this.refA = this.refAt(point);
      this.env.say('Clique no segundo ponto da cota.');
      return;
    }
    if (!this.b) {
      this.b = point;
      const measured = this.measuredPoints();
      this.b = null;
      if (dist(measured.a, measured.b) < DIM_MIN_LENGTH) {
        this.env.say('Os dois pontos da cota são o mesmo: escolha outro ponto.');
        return;
      }
      this.b = point;
      this.refB = this.refAt(point);
      this.env.say('Clique do lado da linha de cota, ou digite o deslocamento e Enter.');
      return;
    }
    this.commit(this.side(p.raw) * roundMm(this.distanceToLine(p.raw)));
  }

  override type(text: string): boolean {
    if (this.offsetStage) {
      const value = parseQuantityText(text, unitsOf(this.env.project()), 'length');
      if (value === null || value <= 0) { this.env.say(`Digite o afastamento em ${lengthUnitName(unitsOf(this.env.project()))}, maior que zero.`); return false; }
      this.commitChain(this.side(this.raw) * value);
      return true;
    }
    if (!this.a || !this.b) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null || v === 0) {
      this.env.say(`Digite o deslocamento em ${lengthUnitName(unitsOf(this.env.project()))}, diferente de zero. Com sinal negativo, a cota vai para o lado direito de a→b.`);
      return false;
    }
    // O sinal digitado escolhe o lado (negativo = direito de a→b); sem sinal, vale o lado do cursor.
    const side = v < 0 ? -1 : this.side(this.raw);
    this.commit(side * roundMm(Math.abs(v)));
    return true;
  }

  /** Lado da linha de cota pelo cursor: +1 à esquerda de a→b, −1 à direita. */
  private side(q: Vec2): number {
    const { a, b } = this.referenceLine();
    return signedOffset(a, b, q) >= 0 ? 1 : -1;
  }

  private distanceToLine(q: Vec2): number {
    const { a, b } = this.referenceLine();
    return Math.abs(signedOffset(a, b, q));
  }

  private referenceLine(): { a: Vec2; b: Vec2 } {
    if (this.chain.length >= 2 && !this.a) {
      const a = this.chain[0]!; const last = this.chain[this.chain.length - 1]!;
      const mode = this.env.options().dimensionMode ?? 'aligned';
      return mode === 'horizontal' ? { a, b: { x: last.x, y: a.y } } : mode === 'vertical' ? { a, b: { x: a.x, y: last.y } } : { a, b: last };
    }
    return this.measuredPoints();
  }

  private previewOf(offset: number): PreviewItem[] {
    // Pré-visualização: 1 mm de papel ≈ 4 px de tela; a cota final sai na escala da vista.
    const mPerMm = this.env.metersPerPixel() * 4;
    const { a, b } = this.measuredPoints();
    const g = dimensionGeometry(a, b, offset, mPerMm, this.env.options().dimensionTextHeight ?? 2.5);
    const out: PreviewItem[] = [
      { kind: 'line', a: g.line[0], b: g.line[1] },
      ...g.extensions.map(([p, q]): PreviewItem => ({ kind: 'line', a: p, b: q, dashed: true })),
    ];
    const opts = this.env.options();
    const project = this.env.project();
    const dim: Dimension = { id: 'preview', a, b, offset, mode: opts.dimensionMode, unit: opts.dimensionUnit ?? 'project', precision: opts.dimensionPrecision, prefix: opts.dimensionPrefix, suffix: opts.dimensionSuffix };
    out.push({ kind: 'label', at: g.textAt, text: formatDimension(dim, dimensionValue(project, dim), unitsOf(project)) });
    return out;
  }

  private chainPairs(): Array<{ a: Vec2; b: Vec2; ra?: AnyRef; rb?: AnyRef; offset: number }> {
    const mode = this.env.options().dimensionString ?? 'continuous';
    const out: Array<{ a: Vec2; b: Vec2; ra?: AnyRef; rb?: AnyRef; offset: number }> = [];
    const project = (a: Vec2, b: Vec2): { a: Vec2; b: Vec2 } => {
      const dir = this.env.options().dimensionMode ?? 'aligned';
      return dir === 'horizontal' ? { a, b: { x: b.x, y: a.y } } : dir === 'vertical' ? { a, b: { x: a.x, y: b.y } } : { a, b };
    };
    if (mode === 'continuous') {
      for (let i = 1; i < this.chain.length; i++) {
        const a = this.chain[i - 1]!; const b = this.chain[i]!; const pts = project(a, b);
        if (dist(pts.a, pts.b) >= DIM_MIN_LENGTH) out.push({ ...pts, ra: this.chainRefs[i - 1], rb: this.chainRefs[i], offset: this.chainOffset });
      }
    } else {
      const a = this.chain[0]!;
      const step = this.env.options().dimensionTextHeight ?? 2.5;
      const mPerMm = this.env.metersPerPixel() * 4;
      for (let i = 1; i < this.chain.length; i++) {
        const b = this.chain[i]!; const pts = project(a, b);
        if (dist(pts.a, pts.b) >= DIM_MIN_LENGTH) out.push({ ...pts, ra: this.chainRefs[0], rb: this.chainRefs[i], offset: this.chainOffset + (this.chainOffset >= 0 ? 1 : -1) * (i - 1) * step * mPerMm * 2.5 });
      }
    }
    return out;
  }

  private chainPreview(offset: number): PreviewItem[] {
    this.chainOffset = offset;
    return this.chainPairs().flatMap((d) => {
      const g = dimensionGeometry(d.a, d.b, d.offset, this.env.metersPerPixel() * 4);
      return [{ kind: 'line' as const, a: g.line[0], b: g.line[1] }, ...g.extensions.map(([a, b]) => ({ kind: 'line' as const, a, b, dashed: true }))];
    });
  }

  private commitChain(offset: number): void {
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) { this.env.say('O afastamento da cota não pode ser zero.'); return; }
    this.chainOffset = offset;
    const opts = this.env.options();
    const pairs = this.chainPairs();
    if (!pairs.length) { this.env.say('A sequência não contém segmentos mensuráveis.'); return; }
    this.env.transaction('Criar sequência de cotas', () => {
      for (const d of pairs) {
        const refs = { ...(d.ra ? { a: d.ra } : {}), ...(d.rb ? { b: d.rb } : {}) };
        const dimension: Dimension = { id: newId('dim'), a: d.a, b: d.b, offset: d.offset, mode: opts.dimensionMode ?? 'aligned', unit: opts.dimensionUnit ?? 'project', ...(opts.dimensionPrecision !== undefined ? { precision: opts.dimensionPrecision } : {}), textHeight: opts.dimensionTextHeight ?? 2.5, tickStyle: opts.dimensionTickStyle ?? 'slash', ...(opts.dimensionPrefix ? { prefix: opts.dimensionPrefix } : {}), ...(opts.dimensionSuffix ? { suffix: opts.dimensionSuffix } : {}), ...(Object.keys(refs).length ? { refs } : {}) };
        if (!addSectionDimension(this.env, dimension)) this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), planId: viewPlanId(this.env), dimension });
      }
    });
    this.reset();
    this.env.say(`${pairs.length} cotas criadas na sequência.`);
  }

  private commit(offset: number): void {
    const a = this.a!;
    const b = this.b!;
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) {
      this.env.say('O deslocamento da cota não pode ser zero.');
      return;
    }
    const refs = { ...(this.refA ? { a: this.refA } : {}), ...(this.refB ? { b: this.refB } : {}) };
    const o = this.env.options();
    const dimension: Dimension = { id: newId('dim'), a, b, offset, mode: o.dimensionMode ?? 'aligned', unit: o.dimensionUnit ?? 'project', ...(o.dimensionPrecision !== undefined ? { precision: o.dimensionPrecision } : {}), prefix: o.dimensionPrefix ?? '', suffix: o.dimensionSuffix ?? '', textHeight: o.dimensionTextHeight ?? 2.5, tickStyle: o.dimensionTickStyle ?? 'slash', ...(Object.keys(refs).length ? { refs } : {}) };
    if (!addSectionDimension(this.env, dimension)) this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), planId: viewPlanId(this.env), dimension });
    this.reset();
    this.env.say(this.hint);
  }
}
