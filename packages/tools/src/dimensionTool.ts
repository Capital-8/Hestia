import { dist, type Vec2 } from '@hestia/geom';
import {
  DIM_MIN_LENGTH,
  defaultDimensionFamilyIdOf,
  dimRefAt,
  dimensionFormatStyle,
  dimensionGeometry,
  dimensionStyleFor,
  dimensionValue,
  formatDimension,
  newId,
  roundMm,
  unitsOf,
  type Dimension,
  type DimensionElementRef,
  type DimensionRef,
} from '@hestia/model';
import { addSectionDimension, ToolBase, vistaDoComando } from './base.ts';
import { anotacoesSelecionaveis, signedOffset } from './annotationPick.ts';
import { viewIdOfEnv } from './vistaDoAmbiente.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { PointerInfo, PreviewItem, ToolOptions } from './types.ts';

type AnyRef = DimensionRef | DimensionElementRef;
/** Tolerância (m) entre o ponto capturado e a feição do elemento. */
const REF_TOL = 0.005;
/** Afastamento (mm de papel) em que a cota nova "encosta" numa linha de cota existente: cadeias alinhadas como no Revit. */
const SNAP_OFFSET_MM = 3;

type DimMode = 'aligned' | 'horizontal' | 'vertical';

/**
 * Campos de estilo que a cota nova grava: só os que o usuário escolheu na barra de opções. Com família escolhida, nada é
 * gravado (a aparência vem da família); os demais ficam de fora para a cota seguir o estilo global do projeto
 * (`ProjectSettings.dimensionStyle`).
 */
function styleOverrides(o: ToolOptions): Partial<Dimension> {
  return {
    ...(o.dimensionUnit !== undefined ? { unit: o.dimensionUnit } : {}),
    ...(o.dimensionPrecision !== undefined ? { precision: o.dimensionPrecision } : {}),
    ...(o.dimensionTextHeight !== undefined ? { textHeight: o.dimensionTextHeight } : {}),
    ...(o.dimensionTickStyle !== undefined ? { tickStyle: o.dimensionTickStyle } : {}),
  };
}

/**
 * Cota alinhada (Revit: Aligned Dimension). Clique no ponto A, no ponto B e depois no lado da linha de cota (ou digite o
 * deslocamento e Enter). Pontos sobre a extremidade de uma parede ficam referenciados a ela.
 *
 * No modo `auto` (padrão) a direção é inferida: dois pontos na mesma horizontal viram cota horizontal, na mesma vertical
 * viram vertical e o resto fica alinhada — não é preciso escolher o modo antes de começar. A linha de cota encosta nas
 * linhas de cota que já existem (mesmo afastamento) e a prévia usa a escala real da vista (o que se vê é o que sai).
 */
export class DimensionTool extends ToolBase {
  readonly id = 'dimension';
  readonly label = 'Cota';
  override get hint(): string {
    return this.t('tl_hint_dimension');
  }
  private a: Vec2 | null = null;
  private b: Vec2 | null = null;
  private refA: AnyRef | undefined;
  private refB: AnyRef | undefined;
  private chain: Vec2[] = [];
  private chainRefs: Array<AnyRef | undefined> = [];
  private offsetStage = false;
  private chainOffset = 0;

  /** Escala de impressão (1:N) da vista ativa: prévia e cota saem com as mesmas medidas de papel. */
  private scale(): number {
    const s = this.env.viewScale?.();
    return s !== undefined && Number.isFinite(s) && s > 0 ? s : 100;
  }

  /** Metros de modelo por milímetro de papel na escala da vista (a medida de todas as cotas). */
  private mPerMm(): number { return this.scale() / 1000; }

  /**
   * Ref associativa da feição que coincide com o ponto capturado (planta). No corte/elevação não há refs: o par gravado é
   * `(t,z)` e as referências de parede da planta não valem (uma coincidência numérica gravaria uma ref falsa).
   */
  private refAt(point: Vec2): AnyRef | undefined {
    if (this.env.section?.()) return undefined;
    return dimRefAt(this.env.project(), this.env.levelId(), point, REF_TOL)?.ref;
  }

  /** Direção efetiva da cota entre dois pontos: `auto` infere horizontal/vertical quando os pontos compartilham um eixo. */
  private modeFor(a: Vec2, b: Vec2): DimMode {
    const o = this.env.options().dimensionMode ?? 'auto';
    if (o !== 'auto') return o;
    const dx = Math.abs(b.x - a.x);
    const dy = Math.abs(b.y - a.y);
    if (dy <= 1e-6 && dx > 1e-6) return 'horizontal';
    if (dx <= 1e-6 && dy > 1e-6) return 'vertical';
    return 'aligned';
  }

  private measuredPoints(): { a: Vec2; b: Vec2 } {
    const a = this.a!;
    const b = this.b!;
    const mode = this.modeFor(a, b);
    if (mode === 'horizontal') return { a, b: { x: b.x, y: a.y } };
    if (mode === 'vertical') return { a, b: { x: a.x, y: b.y } };
    return { a, b };
  }

  /** Afastamentos das cotas que já existem na vista ativa (a cota nova encosta nelas) mais o último afastamento usado. */
  private existingOffsets(): number[] {
    const sec = this.env.section?.();
    const dims = sec
      ? sec.annotations().dimensions
      : anotacoesSelecionaveis(this.env.project(), this.env.levelId(), viewIdOfEnv(this.env)).dimensions;
    const out = dims.map((d) => d.offset).filter((o) => Number.isFinite(o) && Math.abs(o) > 1e-6);
    const last = this.env.options().dimensionOffset;
    if (last !== undefined && Number.isFinite(last) && Math.abs(last) > 1e-6) out.push(last);
    return out;
  }

  /**
   * Afastamento com encaixe: se o cursor fica a poucos mm de papel de uma linha de cota existente, a cota nova nasce
   * alinhada com ela (é o que faz a "família de cotas" parecer desenho de arquiteto, em vez de linhas soltas).
   */
  private snapOffset(offset: number): number {
    const tol = Math.max(0.005, (SNAP_OFFSET_MM * this.scale()) / 1000);
    let best = offset;
    let bestDistance = tol;
    for (const candidate of this.existingOffsets()) {
      const d = Math.abs(candidate - offset);
      if (d < bestDistance) { bestDistance = d; best = candidate; }
    }
    return best === offset ? offset : roundMm(best);
  }

  /** Família da cota nova: a escolhida na barra ou a padrão do projeto (só quando o projeto tem famílias explícitas). */
  private familyId(): string | undefined {
    const o = this.env.options();
    if (o.dimensionFamilyId !== undefined) return o.dimensionFamilyId ?? undefined;
    const settings = this.env.project().settings;
    if ((settings.dimensionFamilies?.length ?? 0) === 0) return undefined;
    return defaultDimensionFamilyIdOf(settings);
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
    return (this.a && this.b) || this.offsetStage ? this.t('tl_inp_offset') : null;
  }

  override confirm(): void {
    if ((this.env.options().dimensionString ?? 'single') !== 'single' && this.chain.length >= 2 && !this.offsetStage) {
      this.offsetStage = true;
      this.chainOffset = this.rememberedOffset();
      this.env.say(this.t('tl_msg_chain_defined'));
      return;
    }
    if (this.chain.length && this.chain.length < 2) { this.reset(); this.env.say(this.hint); return; }
    super.confirm();
  }

  /** Ponto de partida do próximo clique: base de perpendicular, Orto e Polar (planta e corte usam o mesmo motor). */
  private anchor(): Vec2 | undefined {
    if (this.chain.length && !this.offsetStage) return this.chain[this.chain.length - 1];
    return this.a && !this.b ? this.a : undefined;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    const inf = this.snap(p, { from: this.anchor() });
    if (this.chain.length && !this.a) {
      this.items = this.offsetStage ? this.chainPreview(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw)))) : [{ kind: 'point', at: this.chain[0]! }, { kind: 'line', a: this.chain[this.chain.length - 1]!, b: inf.point, dashed: true }];
      return;
    }
    if (this.a && !this.b) this.items = [{ kind: 'point', at: this.a }, { kind: 'line', a: this.a, b: inf.point, dashed: true }];
    if (this.a && this.b) this.items = this.previewOf(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw))));
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.anchor() });
    const point = inf.point;
    if ((this.env.options().dimensionString ?? 'single') !== 'single') {
      if (this.offsetStage) { this.commitChain(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw)))); return; }
      if (!this.chain.length) {
        this.chain = [point];
        this.chainRefs = [this.refAt(point)];
      } else {
        const last = this.chain[this.chain.length - 1]!;
        if (dist(last, point) < DIM_MIN_LENGTH) return;
        this.chain.push(point);
        this.chainRefs.push(this.refAt(point));
      }
      this.env.say(this.t('tl_msg_refs_selected', { n: this.chain.length }));
      return;
    }
    if (!this.a) {
      this.a = point;
      this.refA = this.refAt(point);
      this.env.say(this.t('tl_msg_click_second_point'));
      return;
    }
    if (!this.b) {
      this.b = point;
      const measured = this.measuredPoints();
      this.b = null;
      if (dist(measured.a, measured.b) < DIM_MIN_LENGTH) {
        this.env.say(this.t('tl_msg_dim_same_point'));
        return;
      }
      this.b = point;
      this.refB = this.refAt(point);
      this.env.say(this.t('tl_msg_click_dim_side'));
      return;
    }
    this.commit(this.snapOffset(this.side(p.raw) * roundMm(this.distanceToLine(p.raw))));
  }

  override type(text: string): boolean {
    if (this.offsetStage) {
      const value = parseQuantityText(text, unitsOf(this.env.project()), 'length');
      if (value === null || value <= 0) { this.env.say(this.t('tl_msg_type_offset_unit', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) })); return false; }
      this.commitChain(this.side(this.raw) * value);
      return true;
    }
    if (!this.a || !this.b) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null || v === 0) {
      this.env.say(this.t('tl_msg_type_displacement_unit', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
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
      const mode = this.modeFor(a, last);
      return mode === 'horizontal' ? { a, b: { x: last.x, y: a.y } } : mode === 'vertical' ? { a, b: { x: a.x, y: last.y } } : { a, b: last };
    }
    return this.measuredPoints();
  }

  /** Afastamento inicial da sequência: o último usado (ou o do encaixe com as cotas existentes). */
  private rememberedOffset(): number {
    const last = this.env.options().dimensionOffset;
    return last !== undefined && Number.isFinite(last) && Math.abs(last) > 1e-6 ? last : this.chainOffset;
  }

  private previewOf(offset: number): PreviewItem[] {
    // Prévia com a escala REAL da vista e o estilo da família: o texto e as marcas têm o mesmo tamanho da cota confirmada.
    const mPerMm = this.mPerMm();
    const { a, b } = this.measuredPoints();
    const opts = this.env.options();
    const mode = this.modeFor(a, b);
    const project = this.env.project();
    const familyId = this.familyId();
    const style = dimensionStyleFor(project.settings, { familyId });
    const g = dimensionGeometry(a, b, offset, mPerMm, opts.dimensionTextHeight ?? style.textHeight, undefined, {
      extensionGapMm: style.extensionGap,
      extensionOvershootMm: style.extensionOvershoot,
      tickHalfMm: style.tickSize / 2,
      textGapMm: style.textGap,
      centered: style.textPlacement === 'centered',
      readConvention: style.readConvention,
    });
    const out: PreviewItem[] = [
      { kind: 'line', a: g.line[0], b: g.line[1] },
      ...g.extensions.map(([p, q]): PreviewItem => ({ kind: 'line', a: p, b: q, dashed: true })),
    ];
    const dim: Dimension = { id: 'preview', a, b, offset, mode, unit: opts.dimensionUnit ?? 'project', precision: opts.dimensionPrecision, prefix: opts.dimensionPrefix, suffix: opts.dimensionSuffix };
    // `dimensionStyle`: a prévia é desenhada como cota (fonte de cota, sem a caixa do rótulo de interface) na planta e no corte.
    out.push({ kind: 'label', at: g.textAt, text: formatDimension(dim, dimensionValue(project, dim), unitsOf(project), dimensionFormatStyle(style)), dimensionStyle: true, rotation: g.textRotation });
    return out;
  }

  private chainPairs(): Array<{ a: Vec2; b: Vec2; ra?: AnyRef; rb?: AnyRef; offset: number; mode: DimMode }> {
    const mode = this.env.options().dimensionString ?? 'continuous';
    const out: Array<{ a: Vec2; b: Vec2; ra?: AnyRef; rb?: AnyRef; offset: number; mode: DimMode }> = [];
    const project = (a: Vec2, b: Vec2): { a: Vec2; b: Vec2; mode: DimMode } => {
      const dir = this.modeFor(a, b);
      return dir === 'horizontal' ? { a, b: { x: b.x, y: a.y }, mode: dir } : dir === 'vertical' ? { a, b: { x: a.x, y: b.y }, mode: dir } : { a, b, mode: dir };
    };
    if (mode === 'continuous') {
      for (let i = 1; i < this.chain.length; i++) {
        const a = this.chain[i - 1]!; const b = this.chain[i]!; const pts = project(a, b);
        if (dist(pts.a, pts.b) >= DIM_MIN_LENGTH) out.push({ ...pts, ra: this.chainRefs[i - 1], rb: this.chainRefs[i], offset: this.chainOffset });
      }
    } else {
      const a = this.chain[0]!;
      const step = this.env.options().dimensionTextHeight ?? 2.5;
      const mPerMm = this.mPerMm();
      for (let i = 1; i < this.chain.length; i++) {
        const b = this.chain[i]!; const pts = project(a, b);
        if (dist(pts.a, pts.b) >= DIM_MIN_LENGTH) out.push({ ...pts, ra: this.chainRefs[0], rb: this.chainRefs[i], offset: this.chainOffset + (this.chainOffset >= 0 ? 1 : -1) * (i - 1) * step * mPerMm * 2.5 });
      }
    }
    return out;
  }

  private chainPreview(offset: number): PreviewItem[] {
    this.chainOffset = offset;
    const mPerMm = this.mPerMm();
    return this.chainPairs().flatMap((d) => {
      const g = dimensionGeometry(d.a, d.b, d.offset, mPerMm);
      return [{ kind: 'line' as const, a: g.line[0], b: g.line[1] }, ...g.extensions.map(([a, b]) => ({ kind: 'line' as const, a, b, dashed: true }))];
    });
  }

  private commitChain(offset: number): void {
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) { this.env.say(this.t('tl_msg_dim_offset_zero')); return; }
    this.chainOffset = offset;
    const opts = this.env.options();
    const pairs = this.chainPairs();
    if (!pairs.length) { this.env.say(this.t('tl_msg_chain_no_segments')); return; }
    this.env.transaction(this.t('tl_undo_create_dim_chain'), () => {
      for (const d of pairs) {
        const refs = { ...(d.ra ? { a: d.ra } : {}), ...(d.rb ? { b: d.rb } : {}) };
        const dimension: Dimension = { id: newId('dim'), a: d.a, b: d.b, offset: d.offset, mode: d.mode, ...styleOverrides(opts), ...(opts.dimensionPrefix ? { prefix: opts.dimensionPrefix } : {}), ...(opts.dimensionSuffix ? { suffix: opts.dimensionSuffix } : {}), ...(Object.keys(refs).length ? { refs } : {}), ...this.familyPatch() };
        if (!addSectionDimension(this.env, dimension)) this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), ...vistaDoComando(this.env), dimension });
      }
    });
    this.env.setOptions?.({ dimensionOffset: offset });
    this.reset();
    this.env.say(this.t('tl_msg_dim_created', { n: pairs.length }));
  }

  /** `familyId` da cota nova, quando há família (a aparência vai da família; sem ela, vale o estilo global). */
  private familyPatch(): Partial<Dimension> {
    const id = this.familyId();
    return id ? { familyId: id } : {};
  }

  private commit(offset: number): void {
    const a = this.a!;
    const b = this.b!;
    if (!Number.isFinite(offset) || Math.abs(offset) < 1e-6) {
      this.env.say(this.t('tl_msg_dim_offset_zero'));
      return;
    }
    const refs = { ...(this.refA ? { a: this.refA } : {}), ...(this.refB ? { b: this.refB } : {}) };
    const o = this.env.options();
    const dimension: Dimension = { id: newId('dim'), a, b, offset, mode: this.modeFor(a, b), ...styleOverrides(o), ...(o.dimensionPrefix ? { prefix: o.dimensionPrefix } : {}), ...(o.dimensionSuffix ? { suffix: o.dimensionSuffix } : {}), ...(Object.keys(refs).length ? { refs } : {}), ...this.familyPatch() };
    if (!addSectionDimension(this.env, dimension)) this.env.exec({ type: 'addDimension', levelId: this.env.levelId(), ...vistaDoComando(this.env), dimension });
    this.env.setOptions?.({ dimensionOffset: offset });
    this.reset();
    this.env.say(this.hint);
  }
}
