import { angleOf, dist, sagFromThreePoints, sub, type Vec2 } from '@hestia/geom';
import {
  beamLength,
  beamPolygon,
  findBeamType,
  makeBeam,
  unitsOf,
  type BeamJustify,
  type BeamType,
  type Id,
  type Project,
} from '@hestia/model';
import { ToolBase, makeId } from './base.ts';
import {
  BEAM_SHAPE_KIND,
  beamArcPreview,
  beamPreviewForSeg,
  beamShapeInputPrompt,
  beamShapePromptMsg,
  buildBeamShapeSegs,
  initBeamShapeStep,
  isArcBeamShape,
  parseBeamShapeInput,
  previewBeamPickFace,
  previewBeamShapeStep,
} from './beamToolShapes.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import { segmentLengthDim } from './dims/providers/wall.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import { PICK_PX } from './perimeterToolInput.ts';
import { anchorOf, kindOf, shapeName, stepsOf, type ShapeStep } from './perimeterToolShape.ts';
import { faceAt } from './sketchPickFace.ts';
import { shapeInputLabel } from './sketchShapes.ts';
import type { BeamDrawShape, PointerInfo } from './types.ts';

export function defaultBeamTypeId(p: Project): Id {
  if (p.beamTypes) {
    const ids = Object.keys(p.beamTypes);
    if (ids.length > 0) return ids[0]!;
  }
  return 'bt_conc_15x40';
}

/**
 * Ferramenta de traçado de vigas estruturais (reta, retângulo, arcos, círculo, polígonos, elipse e selecionar face),
 * com prévia do perfil, linha de eixo tracejada, cota dinâmica e encadeamento opcional.
 */
export class BeamTool extends ToolBase {
  readonly id = 'beam';
  readonly label = 'Viga';

  override get hint(): string {
    if (this.shapeStep) return beamShapePromptMsg(this.shapeStep, this.uiLang());
    return this.t(this.startPt ? 'tl_hint_beam_end' : 'tl_hint_beam');
  }

  private activeShapeKey: BeamDrawShape | null = null;
  private startPt: Vec2 | null = null;
  private chordEnd: Vec2 | null = null;
  private shapeStep: ShapeStep | null = null;
  private flags: Record<string, boolean> = {};
  private cycle = 0;
  private lastPoint: Vec2 | null = null;
  private lastPointer: PointerInfo | null = null;
  private first: Vec2 | null = null;
  private count = 0;

  protected reset(): void {
    this.startPt = null;
    this.chordEnd = null;
    this.shapeStep = null;
    this.flags = {};
    this.cycle = 0;
    this.lastPoint = null;
    this.lastPointer = null;
    this.first = null;
    this.count = 0;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.startPt !== null || this.shapeStep !== null;
  }

  private currentShape(): BeamDrawShape {
    const s = this.env.options().beamShape ?? 'line';
    if (this.activeShapeKey !== null && this.activeShapeKey !== s) {
      this.reset();
    }
    this.activeShapeKey = s;
    return s;
  }

  override space(): void {
    const order: BeamJustify[] = ['center', 'left', 'right'];
    const cur = this.activeJustify();
    const next = order[(order.indexOf(cur) + 1) % order.length]!;
    this.setJustify(next);
  }

  override tab(): void {
    const s = this.currentShape();
    if (s === 'pick-face') {
      this.cycle += 1;
      if (this.lastPointer) this.move(this.lastPointer);
      return;
    }
    const sk = BEAM_SHAPE_KIND[s];
    const flag = sk ? kindOf(sk).inputs.find((i) => i.kind === 'flag') : undefined;
    if (!flag) return;
    this.flags[flag.key] = !this.flags[flag.key];
    this.env.say(this.t('tl_msg_flag_toggle', {
      label: shapeInputLabel(flag.label, this.uiLang()),
      value: this.flags[flag.key] ? this.t('tl_yes') : this.t('tl_no'),
    }));
    if (this.lastPointer) this.move(this.lastPointer);
  }

  onKey(k: string): boolean {
    if (k === ' ') {
      this.space();
      return true;
    }
    if (!this.busy() && (k === '4' || k === '5' || k === '6')) {
      const map: Record<'4' | '5' | '6', BeamJustify> = { '4': 'left', '5': 'center', '6': 'right' };
      this.setJustify(map[k]);
      return true;
    }
    return false;
  }

  private setJustify(beamJustify: BeamJustify): void {
    if (this.env.setOptions) this.env.setOptions({ beamJustify });
    else this.env.options().beamJustify = beamJustify;
    if (this.lastPointer) this.move(this.lastPointer);
  }

  override inputPrompt(): string | null {
    const s = this.currentShape();
    if (this.shapeStep) return beamShapeInputPrompt(this.shapeStep, this.uiLang(), this.t('tl_inp_length'));
    if (!this.startPt || s === 'rect') return null;
    if (isArcBeamShape(s)) return this.chordEnd ? 'Flecha do arco' : 'Comprimento da corda';
    return this.t('tl_inp_length');
  }

  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    const s = this.currentShape();
    if (this.shapeStep && this.lastPoint) {
      const input = stepsOf(this.shapeStep.shape)[this.shapeStep.idx];
      const anchor = anchorOf(this.shapeStep);
      if (anchor && input && (input.kind === 'point' || input.kind === 'length')) {
        return [segmentLengthDim(anchor, this.lastPoint)];
      }
      return [];
    }
    if (!this.startPt || !this.lastPoint || s === 'rect' || this.chordEnd) return [];
    return [segmentLengthDim(this.startPt, this.lastPoint)];
  }

  private activeType(): BeamType {
    const p = this.env.project();
    const typeId = this.env.options().beamTypeId ?? defaultBeamTypeId(p);
    return findBeamType(p, typeId);
  }

  private activeJustify(): BeamJustify {
    return this.env.options().beamJustify ?? 'center';
  }

  private rectSegments(a: Vec2, c: Vec2): Array<[Vec2, Vec2]> {
    const p1 = { x: c.x, y: a.y };
    const p3 = { x: a.x, y: c.y };
    return [[a, p1], [p1, c], [c, p3], [p3, a]];
  }

  override move(p: PointerInfo): void {
    this.lastPointer = p;
    this.raw = p.raw;
    const s = this.currentShape();
    if (s === 'pick-face') {
      const res = previewBeamPickFace(this.env, p.raw, this.cycle, this.activeJustify(), this.activeType(), this.uiLang());
      this.items = res.items;
      this.env.say(res.msg);
      return;
    }

    const catalogKind = BEAM_SHAPE_KIND[s];
    if (catalogKind) {
      const st = this.shapeStep ?? initBeamShapeStep(s);
      const anchor = anchorOf(st);
      const inf = this.snap(p, contextoDeTraco(anchor));
      this.inf = inf;
      this.lastPoint = inf.point;
      this.items = previewBeamShapeStep(s, st, inf.point, this.activeJustify(), this.activeType(), this.flags);
      this.env.say(beamShapePromptMsg(st, this.uiLang()));
      return;
    }

    const inf = this.snap(p, contextoDeTraco(this.chordEnd ?? this.startPt));
    this.inf = inf;
    this.lastPoint = inf.point;
    this.items = [];

    if (!this.startPt) {
      this.items.push({ kind: 'point', at: inf.point });
      this.env.say(this.hint);
      return;
    }

    const a = this.startPt;
    if (isArcBeamShape(s) && this.chordEnd) {
      this.items = beamArcPreview(this.env, a, this.chordEnd, inf.point, this.activeJustify(), this.activeType());
      this.env.say('Clique no ponto do arco, ou digite a flecha e Enter.');
      return;
    }

    const b = inf.point;
    if (dist(a, b) < 1e-6) return;

    if (s === 'rect') {
      for (const [segA, segB] of this.rectSegments(a, b)) {
        if (dist(segA, segB) >= 1e-6) {
          this.items.push({ kind: 'polygon', ring: beamPolygon({ a: segA, b: segB, justify: this.activeJustify() }, this.activeType()) });
        }
      }
      this.items.push({ kind: 'polygon', ring: [a, { x: b.x, y: a.y }, b, { x: a.x, y: b.y }], dashed: true });
      this.env.say(this.t('tl_hint_beam_end'));
      return;
    }

    this.items = beamPreviewForSeg({ a, b }, this.activeJustify(), this.activeType());
    this.env.say(isArcBeamShape(s) ? 'Clique no ponto final da corda.' : this.t('tl_hint_beam_end'));
  }

  private createBeamCmd(a: Vec2, b: Vec2, sag = 0) {
    const o = this.env.options();
    const type = this.activeType();
    return makeBeam({
      id: makeId('bm'),
      typeId: type.id,
      levelId: this.env.levelId(),
      a,
      b,
      sag,
      justify: this.activeJustify(),
      zOffset: o.beamZOffset ?? 0,
      mark: o.placementMark ?? '',
      comments: o.placementComments ?? '',
    });
  }

  private commit(a: Vec2, b: Vec2, sag = 0): void {
    if (beamLength({ a, b, sag }) < 0.05 || dist(a, b) < 0.01) return;
    const beam = this.createBeamCmd(a, b, sag);
    this.env.transaction('Criar viga', () => {
      this.env.exec({ type: 'addBeam', beam });
    });
    this.count += 1;
  }

  private commitSegments(segs: Array<{ a: Vec2; b: Vec2; sag: number }>, label = 'Criar vigas'): void {
    this.env.transaction(label, () => {
      for (const seg of segs) {
        this.env.exec({ type: 'addBeam', beam: this.createBeamCmd(seg.a, seg.b, seg.sag) });
      }
    });
  }

  private commitRect(a: Vec2, c: Vec2): void {
    if (Math.abs(c.x - a.x) < 0.1 || Math.abs(c.y - a.y) < 0.1) {
      this.env.say(this.t('tl_msg_beam_zero_length'));
      return;
    }
    this.commitSegments(this.rectSegments(a, c).map(([segA, segB]) => ({ a: segA, b: segB, sag: 0 })), 'Criar vigas em retângulo');
    this.reset();
    this.env.say(this.hint);
  }

  private finishSegment(end: Vec2): void {
    const closed = this.first && this.count >= 2 && dist(end, this.first) < 0.02;
    if (this.env.options().chain && !closed) {
      this.startPt = end;
      this.chordEnd = null;
    } else {
      this.reset();
      this.env.say(closed ? 'Circuito fechado.' : this.hint);
    }
    this.items = [];
  }

  private setShapeInput(shape: BeamDrawShape, st: ShapeStep, key: string, value: unknown): void {
    st.vals[key] = value;
    st.idx += 1;
    this.items = [];
    if (st.idx < stepsOf(st.shape).length) {
      this.env.say(beamShapePromptMsg(st, this.uiLang()));
      return;
    }
    const segs = buildBeamShapeSegs(shape, st, this.flags);
    if (segs.length === 0) {
      const last = stepsOf(st.shape)[st.idx - 1]!;
      st.idx -= 1;
      delete st.vals[last.key];
      this.env.say(this.t('tl_msg_degenerate_shape'));
      return;
    }
    this.commitSegments(segs, `Criar ${shapeName(st.shape, this.uiLang())}`);
    this.reset();
    this.env.say(this.t('tl_msg_shape_added', { shape: shapeName(st.shape, this.uiLang()) }));
  }

  private clickCatalogShape(p: PointerInfo, shape: BeamDrawShape): void {
    const st = this.shapeStep ?? (this.shapeStep = initBeamShapeStep(shape));
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return;
    const anchor = anchorOf(st);
    const inf = this.snap(p, contextoDeTraco(anchor));
    if (input.kind === 'point') {
      if (anchor && dist(inf.point, anchor) < 1e-9) {
        this.env.say(this.t('tl_msg_point_repeated'));
        return;
      }
      this.setShapeInput(shape, st, input.key, inf.point);
      return;
    }
    if (input.kind === 'count') {
      this.setShapeInput(shape, st, input.key, 6);
      return;
    }
    if ((input.kind === 'length' || input.kind === 'angle') && anchor) {
      const v = input.kind === 'length' ? dist(inf.point, anchor) : angleOf(sub(inf.point, anchor));
      if (input.kind === 'length' && v < 0.05) return;
      this.setShapeInput(shape, st, input.key, v);
    }
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const s = this.currentShape();
    if (s === 'pick-face') {
      const pick = faceAt(this.env, p.raw, PICK_PX * this.env.metersPerPixel(), this.cycle);
      if (!pick) {
        this.env.say(this.t('tl_msg_nothing_face'));
        return;
      }
      if (beamLength({ a: pick.seg.a, b: pick.seg.b, sag: pick.seg.sag ?? 0 }) < 0.05) {
        this.env.say('Comprimento da viga deve ser maior que 0,05 m');
        return;
      }
      this.commit(pick.seg.a, pick.seg.b, pick.seg.sag ?? 0);
      this.cycle = 0;
      this.items = [];
      return;
    }

    if (BEAM_SHAPE_KIND[s]) {
      this.clickCatalogShape(p, s);
      return;
    }

    const inf = this.snap(p, contextoDeTraco(this.chordEnd ?? this.startPt));
    if (!this.startPt) {
      this.startPt = inf.point;
      this.first = inf.point;
      this.count = 0;
      return;
    }

    if (isArcBeamShape(s) && this.chordEnd) {
      const end = this.chordEnd;
      this.commit(this.startPt, end, sagFromThreePoints(this.startPt, inf.point, end));
      this.finishSegment(end);
      return;
    }

    const b = inf.point;
    if (s === 'rect') {
      this.commitRect(this.startPt, b);
      return;
    }
    if (dist(this.startPt, b) < 0.05) {
      this.env.say('Comprimento da viga deve ser maior que 0,05 m');
      return;
    }
    if (isArcBeamShape(s)) {
      this.chordEnd = b;
      return;
    }

    this.commit(this.startPt, b);
    this.finishSegment(b);
  }

  override type(text: string): boolean {
    const s = this.currentShape();
    if (this.shapeStep && BEAM_SHAPE_KIND[s]) {
      const st = this.shapeStep;
      const input = stepsOf(st.shape)[st.idx];
      if (!input) return false;
      if (input.kind === 'length' || input.kind === 'angle' || input.kind === 'count') {
        const v = parseBeamShapeInput(this.env, st, text, this.uiLang());
        if (v === null) return false;
        this.setShapeInput(s, st, input.key, v);
        return true;
      }
      const anchor = anchorOf(st);
      if (input.kind !== 'point' || !anchor) return false;
      const comp = lerComprimentoDigitado(this.env, text);
      if (comp === null) return false;
      this.setShapeInput(s, st, input.key, pontoPorComprimento(anchor, this.inf?.point ?? this.raw, comp));
      return true;
    }

    if (s === 'rect' || !this.startPt) return false;
    const u = unitsOf(this.env.project());
    if (isArcBeamShape(s) && this.chordEnd) {
      const v = parseQuantityText(text, u, 'length');
      if (v === null) {
        this.env.say(`Valor inválido. Digite um número em ${lengthUnitName(u)}.`);
        return false;
      }
      const a = this.startPt;
      const b = this.chordEnd;
      const ref = this.inf?.point ?? this.raw;
      const side = Math.sign((b.x - a.x) * (ref.y - a.y) - (b.y - a.y) * (ref.x - a.x)) || 1;
      this.commit(a, b, side * Math.abs(v));
      this.finishSegment(b);
      return true;
    }

    const v = lerComprimentoDigitado(this.env, text);
    if (v === null) return false;
    const b = pontoPorComprimento(this.startPt, this.inf?.point ?? this.raw, v);
    if (dist(this.startPt, b) < 0.05) {
      this.env.say('Comprimento da viga deve ser maior que 0,05 m');
      return false;
    }
    if (isArcBeamShape(s)) {
      this.chordEnd = b;
      return true;
    }
    this.commit(this.startPt, b);
    this.finishSegment(b);
    return true;
  }
}
