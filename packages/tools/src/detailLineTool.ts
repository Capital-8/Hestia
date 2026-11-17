import { angleOf, dist, sub, type Vec2 } from '@hestia/geom';
import { newId, unitsOf, type DetailLine } from '@hestia/model';
import { addSectionDetailLine, ToolBase, viewPlanId } from './base.ts';
import { draftAngleItemsForConnection } from './anglePreview.ts';
import { detailLinePreviewDim } from './dims/providers/line.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import {
  DETAIL_MIN_LEN,
  DETAIL_SHAPE_KIND,
  buildDetailShapeSegs,
  detailShapeInputPrompt,
  detailShapePromptMsg,
  initDetailShapeStep,
  parseDetailShapeInput,
  previewDetailShapeStep,
  skipCountInputs,
  type DetailSeg,
} from './detailLineToolShapes.ts';
import { anchorOf, kindOf, stepsOf, type ShapeStep } from './perimeterToolShape.ts';
import { shapeInputLabel } from './sketchShapes.ts';
import type { PointerInfo, WallDrawShape } from './types.ts';

/**
 * Linha de detalhe: traço 2D independente da geometria do modelo, com as formas da galeria vindas do núcleo comum
 * (`buildShape`), no molde da viga. Arco é UMA linha com `sag`; o polígono usa `detailLinePolygonSides`.
 * Não encadeia: cada forma é concluída e a ferramenta recomeça.
 */
export class DetailLineTool extends ToolBase {
  readonly id = 'detailLine';
  readonly label = 'Linha de detalhe';
  override get hint(): string {
    if (this.step) return detailShapePromptMsg(this.step, this.uiLang());
    return this.t('tl_hint_detail_line');
  }
  private step: ShapeStep | null = null;
  private activeShape: WallDrawShape | null = null;
  private flags: Record<string, boolean> = {};
  private last: Vec2 | null = null;
  private lastPointer: PointerInfo | null = null;

  protected reset(): void {
    this.step = null;
    this.flags = {};
    this.last = null;
    this.lastPointer = null;
    this.items = [];
    this.inf = null;
  }
  protected busy(): boolean { return this.step !== null && Object.keys(this.step.vals).some((k) => k !== 'sides'); }

  /** Retângulo: o 2º canto não leva Orto/Polar a partir do 1º (cairia sobre o eixo e o retângulo ficaria sem altura). */
  private deRetangulo(): boolean {
    return this.shape() === 'rect';
  }

  private shape(): WallDrawShape {
    const s = this.env.options().detailLineShape ?? 'line';
    if (this.activeShape !== null && this.activeShape !== s) this.reset();
    this.activeShape = s;
    return s;
  }
  private current(): ShapeStep {
    const s = this.shape();
    return this.step ?? initDetailShapeStep(s, this.env.options().detailLinePolygonSides);
  }

  override tab(): void {
    const flag = kindOf(DETAIL_SHAPE_KIND[this.shape()]).inputs.find((i) => i.kind === 'flag');
    if (!flag) return;
    this.flags[flag.key] = !this.flags[flag.key];
    this.env.say(this.t('tl_msg_flag_toggle', {
      label: shapeInputLabel(flag.label, this.uiLang()),
      value: this.flags[flag.key] ? this.t('tl_yes') : this.t('tl_no'),
    }));
    if (this.lastPointer) this.move(this.lastPointer);
  }

  override inputPrompt(): string | null {
    return this.step ? detailShapeInputPrompt(this.step, this.uiLang(), this.t('tl_inp_length')) : null;
  }

  override move(p: PointerInfo): void {
    this.lastPointer = p;
    this.raw = p.raw;
    const shape = this.shape();
    const st = this.current();
    const a = anchorOf(st);
    const q = this.snap(p, contextoDeTraco(this.deRetangulo() ? null : a)).point;
    this.last = q;
    if (!a) { this.items = []; return; }
    this.items = previewDetailShapeStep(st, q, this.flags);
    if (shape === 'line') {
      this.items.push(...draftAngleItemsForConnection(this.env.project(), this.env.levelId(), viewPlanId(this.env), a, q, this.env.metersPerPixel(), unitsOf(this.env.project())));
    }
  }

  /** Comprimento do traço em desenho, pelo sistema único de cotas. */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const st = this.step;
    const a = anchorOf(st);
    const input = st ? stepsOf(st.shape)[st.idx] : undefined;
    if (!a || !this.last || !input || (input.kind !== 'point' && input.kind !== 'length')) return [];
    return [detailLinePreviewDim(a, this.last)];
  }

  /** Comprimento digitado + Enter (pontos) ou valor da entrada (raio, semieixo, ângulo), pelo núcleo comum. */
  override type(text: string): boolean {
    const st = this.step;
    if (!st) return false;
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return false;
    if (input.kind === 'length' || input.kind === 'angle' || input.kind === 'count') {
      const v = parseDetailShapeInput(this.env, st, text, this.uiLang());
      if (v === null) return false;
      this.setInput(st, input.key, v);
      return true;
    }
    const a = anchorOf(st);
    if (input.kind !== 'point' || !a) return false;
    const v = lerComprimentoDigitado(this.env, text);
    if (v === null) return false;
    this.setInput(st, input.key, pontoPorComprimento(a, this.inf?.point ?? this.raw, v));
    return true;
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    this.shape();
    const st = this.step ?? (this.step = this.current());
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return;
    const a = anchorOf(st);
    const q = this.snap(p, contextoDeTraco(this.deRetangulo() ? null : a)).point;
    if (input.kind === 'point') {
      if (a && dist(q, a) < 1e-9) { this.env.say(this.t('tl_msg_point_repeated')); return; }
      this.setInput(st, input.key, q);
    } else if ((input.kind === 'length' || input.kind === 'angle') && a) {
      const v = input.kind === 'length' ? dist(q, a) : angleOf(sub(q, a));
      if (input.kind === 'length' && v < DETAIL_MIN_LEN) return;
      this.setInput(st, input.key, v);
    }
  }

  private setInput(st: ShapeStep, key: string, value: unknown): void {
    st.vals[key] = value;
    st.idx += 1;
    skipCountInputs(st);
    this.items = [];
    if (st.idx < stepsOf(st.shape).length) {
      this.env.say(detailShapePromptMsg(st, this.uiLang()));
      return;
    }
    const segs = buildDetailShapeSegs(st, this.flags);
    if (segs.length === 0) {
      const all = stepsOf(st.shape);
      const lastIn = all.filter((i) => i.kind !== 'count').pop()!;
      st.idx = all.indexOf(lastIn);
      delete st.vals[lastIn.key];
      this.env.say(this.t('tl_msg_degenerate_shape'));
      return;
    }
    this.commit(segs);
    this.reset();
    this.env.say(this.hint);
  }

  private commit(segs: readonly DetailSeg[]): void {
    const style = this.env.options().detailLineStyle ?? 'solid';
    const levelId = this.env.levelId();
    const planId = viewPlanId(this.env);
    this.env.transaction('Linha de detalhe', () => {
      for (const s of segs) {
        const item: DetailLine = { id: newId('dl'), a: s.a, b: s.b, style, ...(s.sag ? { sag: s.sag } : {}) };
        if (!addSectionDetailLine(this.env, item)) this.env.exec({ type: 'addDetailLine', levelId, planId, item });
      }
    });
  }
}
