/* eslint-disable max-lines */
import type { PerimeterModifyKind } from './perimeterModifyKind.ts';
import { angleOf, dist, sub, type SketchDraft, type SketchResult, type SketchTarget, type Vec2 } from '@hestia/geom';
import { ToolBase } from './base.ts';
import { lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import { unitsOf } from '@hestia/model';
import { parseNumber, parseQuantityText } from './numeric.ts';
import { SKETCH_DEFAULTS, addSegs, closeAnalysis, finish as finishSketch, newDraft, removeSegs, selectAllSegs, type FinishResult, type SketchOrigin } from './perimeterSession.ts';
import { anchorOf, buildShape, kindOf, promptOf, shapeName, stepPreview, stepsOf, type ShapeStep } from './perimeterToolShape.ts';
import { SELECT_PX, boxRing, hitSeg, roomClick, roomHover, segLines } from './perimeterToolPick.ts';
import { boxPick, facePick, selectClick, shapeHintOf } from './perimeterToolInput.ts';
import { applySegs, faceMove, refuse, shapeIdOf, snapExtraOf } from './perimeterToolHelpers.ts';
import { shapeInputLabel, type ShapeKindId } from './sketchShapes.ts';
import type { PointerInfo, PreviewItem, ToolEnv } from './types.ts';
import { DraftHistory } from './perimeterToolModifyHistory.ts';
import { ModifyFlow } from './perimeterToolModify.ts';
import { BoxSelection, type SelectionBox } from './perimeterToolSelect.ts';
import { perimeterDraftDims } from './perimeterToolDims.ts';
import { draftAngleItemsForDraft } from './anglePreview.ts';
import type { DimRef, TempDim } from './dims/types.ts';

/** Forma escolhida na barra: uma forma de SHAPE_KINDS, ou um dos dois modos de contorno por referência. */
export type PerimeterShape = ShapeKindId | 'pickFace' | 'byPerimeter' | 'pickRoom';

/** Linha de limite (clique seleciona e desenha) ou inclinação (clique no triângulo de uma aresta, só telhado). */
export type LineKind = 'boundary' | 'slope';

/** Dica inicial do Perímetro (PT: fallback histórico; a ferramenta usa a chave `tl_hint_perimeter`). */
export const PERIMETER_HINT = 'Perímetro: escolha uma forma na barra, ou clique numa linha para selecionar. Concluir fecha o contorno.';

/**
 * Esboço de perímetro (Criar/Editar perímetro). A ferramenta guarda o `SketchDraft` e só o altera pelas funções puras
 * de `perimeterSession` e de `perimeterModify`. Esc cancela o passo em andamento (e, sem passo, tira a forma escolhida
 * ou desliga o comando de Modificar); Enter não conclui; concluir e descartar são botões (`finish`, `discard`), e
 * `finish` devolve o resultado para quem cria o elemento. Toda mudança de geometria é um passo de `draftHistory`.
 */
export class PerimeterTool extends ToolBase {
  readonly id = 'perimeter';
  readonly label = 'Perímetro';
  override get hint(): string { return this.t('tl_hint_perimeter'); }
  /** Passos de desfazer do rascunho. A UI desfaz e refaz com `undoDraft` e `redoDraft` (Ctrl+Z, Ctrl+Y). */
  readonly draftHistory: DraftHistory;
  private readonly mod: ModifyFlow;
  private readonly sel: BoxSelection;
  private shape: PerimeterShape | null = null;
  private originInfo: SketchOrigin = {};
  private line: LineKind = 'boundary';
  private step: ShapeStep | null = null;
  /** Sinalizadores da forma (Tab), ex.: sentido do arco. */
  private flags: Record<string, boolean> = {};
  /** Tab em "pela face": qual candidato entre os ao alcance do cursor. */
  private cycle = 0;
  private hover: string | null = null;
  /** Caixa do arrasto em "pela caixa", ou null. */
  private box: { a: Vec2; b: Vec2 } | null = null;

  constructor(env: ToolEnv, target: SketchTarget = 'roof') {
    super(env);
    const o = env.options();
    this.draftHistory = new DraftHistory(newDraft(target, { slopePct: o.roofSlope ?? SKETCH_DEFAULTS.slopePct, overhang: o.roofOverhang ?? SKETCH_DEFAULTS.overhang }));
    this.mod = new ModifyFlow({
      draft: () => this.d,
      commit: (next) => this.draftHistory.push(next),
      replace: (next) => this.draftHistory.replace(next),
      say: (msg) => this.env.say(msg),
      mpp: () => this.env.metersPerPixel(),
      snap: (p) => this.snap(p, snapExtraOf(this.d, null)).point,
      options: () => this.env.options(),
      project: () => this.env.project(),
      levelId: () => this.env.levelId(),
      lang: () => this.uiLang(),
    });
    this.sel = new BoxSelection({
      draft: () => this.d,
      mpp: () => this.env.metersPerPixel(),
      replace: (next) => this.draftHistory.replace(next),
      say: (msg) => this.env.say(msg),
      lang: () => this.uiLang(),
    });
  }

  /** Rascunho corrente (dado puro, para a planta desenhar). */
  /** De onde veio o esboço: caixa sobre as paredes (`walls`) e ambiente escolhido (`roomId`). Para o vínculo do contorno. */
  origin(): SketchOrigin {
    return this.originInfo;
  }

  draft(): SketchDraft {
    return this.d;
  }

  /** Rascunho corrente, lido do histórico. */
  private get d(): SketchDraft {
    return this.draftHistory.current();
  }

  /** Forma escolhida na barra, ou null (modo de seleção). */
  activeShape(): PerimeterShape | null { return this.shape; }

  lineKind(): LineKind { return this.line; }

  /** Validação corrente do rascunho, para a barra de status e o botão Concluir. */
  closeInfo(): SketchResult {
    return closeAnalysis(this.d);
  }

  /** Linha sob o cursor no modo de seleção (ou no comando de Modificar), para a planta destacar. */
  hoverId(): string | null {
    return this.mod.active() ? this.mod.hoverId() : this.hover;
  }

  /** Caixa de seleção em arraste, para a planta desenhar. */
  selectionBox(): SelectionBox | null {
    return this.sel.current();
  }

  /** Ctrl+A: seleciona todas as linhas do esboço, sem passo de desfazer. */
  selectAll(): void {
    const next = selectAllSegs(this.d);
    this.draftHistory.replace(next);
    this.env.say(this.t('tl_msg_lines_selected', { n: next.selected.length }));
  }

  override preview(): PreviewItem[] {
    return this.mod.active() ? this.mod.preview() : this.items;
  }

  /** Cotas do lado em desenho: o ponto capturado (com o modo ortogonal), não o cursor cru. */
  tempDims = (overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] => perimeterDraftDims(this.env.project(), this.env.levelId(), this.d, this.step, this.inf?.point ?? this.raw, overrides);

  /** Escolhe a forma da barra. Null volta à seleção. Troca o passo em andamento e desliga o comando de Modificar. */
  setShape(kind: PerimeterShape | null): void {
    this.mod.stop();
    this.shape = kind;
    this.flags = {};
    this.reset();
    this.env.say(kind === null ? this.t('tl_hint_perim_select') : shapeHintOf(kind, this.uiLang()));
  }

  /** Comando de Modificar ativo, ou null (seleção de linhas). */
  modifyKind(): PerimeterModifyKind | null {
    return this.mod.kind();
  }

  /**
   * Liga um comando de Modificar sobre as linhas do rascunho (null volta à seleção de linhas). Recusa, com aviso, quando
   * não há linhas para modificar. Limpa o passo em andamento.
   */
  setModify(kind: PerimeterModifyKind | null): boolean {
    if (kind === null) {
      this.mod.stop();
      this.shape = null;
      this.reset();
      this.env.say(this.t('tl_hint_perim_select'));
      return true;
    }
    if (this.d.segs.length === 0) return refuse(this.env, this.t('tl_msg_draw_lines_first'));
    this.shape = null;
    this.flags = {};
    this.reset();
    this.mod.start(kind);
    return true;
  }

  /** Desfaz o último passo do rascunho. Devolve false se não há o que desfazer. */
  undoDraft(): boolean {
    if (!this.draftHistory.undo()) return refuse(this.env, this.t('tl_msg_nothing_undo'));
    this.reset();
    this.env.say(this.t('tl_msg_undone'));
    return true;
  }

  /** Refaz o passo desfeito. Devolve false se não há o que refazer. */
  redoDraft(): boolean {
    if (!this.draftHistory.redo()) return refuse(this.env, this.t('tl_msg_nothing_redo'));
    this.reset();
    this.env.say(this.t('tl_msg_redone'));
    return true;
  }

  /** Linha de limite ou de inclinação. Inclinação só existe no telhado e leva o modo de seleção (clique no triângulo). */
  setLineKind(kind: LineKind): boolean {
    if (kind === 'slope' && this.d.target !== 'roof') {
      this.env.say(this.t('tl_msg_slope_roof_only'));
      return false;
    }
    this.mod.stop();
    this.line = kind;
    if (kind === 'slope') this.shape = null;
    this.flags = {};
    this.reset();
    this.env.say(kind === 'slope' ? this.t('tl_hint_perim_slope') : this.t('tl_hint_perim_select'));
    return true;
  }

  /** Botão Concluir: valida o esboço. Se fecha, devolve o contorno e os furos (com as flags das arestas) e limpa o rascunho. */
  finish(): FinishResult {
    const r = finishSketch(this.d);
    if (!r.ok) {
      this.env.say(r.issues[0]?.message ?? this.t('tl_msg_sketch_incomplete'));
      return r;
    }
    this.draftHistory.reset(newDraft(this.d.target, this.d.defaults));
    this.originInfo = {};
    this.mod.stop();
    this.reset();
    this.env.say(this.t('tl_msg_perimeter_done'));
    return r;
  }

  /** Botão Cancelar: descarta o rascunho inteiro. O Esc não faz isto (ver `cancel`). */
  discard(): void {
    this.draftHistory.reset(newDraft(this.d.target, this.d.defaults));
    this.shape = null;
    this.flags = {};
    this.mod.stop();
    this.reset();
    this.env.say(this.t('tl_msg_perimeter_discarded'));
  }

  /**
   * Carrega um rascunho (Editar perímetro, ou ajuste de padrões e flags). Troca o rascunho corrente sem passo de
   * desfazer: o histórico de Criar não volta ao contorno carregado.
   */
  loadDraft(d: SketchDraft): void {
    this.draftHistory.replace(d);
    this.originInfo = {};
    this.reset();
    this.env.say(this.hint);
  }

  /**
   * Esc (contrato `Tool.cancel`). Com comando de Modificar: cancela o passo, e sem passo desliga o comando. Sem
   * comando: cancela o passo da forma; sem passo, tira a forma escolhida. Nunca conclui nem descarta o rascunho.
   */
  override cancel(): void {
    if (this.mod.active()) {
      if (this.mod.cancel()) this.setModify(null);
      return;
    }
    if (this.step || this.box || this.sel.active()) {
      this.reset();
      this.env.say(this.t('tl_msg_step_cancelled'));
      return;
    }
    if (this.shape !== null) {
      this.setShape(null);
      return;
    }
    this.env.say(this.t('tl_hint_perim_select'));
  }

  /** Enter não conclui: só avisa onde está o botão. Com Modificar, confirma a seleção ou a matriz. */
  override confirm(): void {
    if (this.mod.active()) return this.mod.confirm();
    if (this.d.segs.length > 0) this.env.say(this.t('tl_msg_perimeter_enter'));
  }

  protected reset(): void {
    this.step = null;
    this.items = [];
    this.inf = null;
    this.hover = null;
    this.box = null;
    this.cycle = 0;
    this.sel.reset();
    this.mod.clearStep();
  }

  protected busy(): boolean {
    return this.step !== null || this.box !== null || this.sel.active();
  }

  override inputPrompt(): string | null {
    if (this.mod.active()) return this.mod.prompt();
    const st = this.step;
    const input = st ? stepsOf(st.shape)[st.idx] : undefined;
    if (!st || !input) return null;
    if (input.kind === 'length' || input.kind === 'angle' || input.kind === 'count') return shapeInputLabel(input.label, this.uiLang());
    return input.kind === 'point' && st.shape.id === 'line' && anchorOf(st) ? this.t('tl_inp_length') : null;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    if (this.box) return;
    this.items = [];
    this.inf = null;
    this.hover = null;
    if (this.mod.active()) {
      this.mod.move(p);
      return;
    }
    const id = shapeIdOf(this.shape);
    if (this.shape === null) {
      if (this.line === 'boundary') this.hover = hitSeg(this.d.segs, p.raw, SELECT_PX * this.env.metersPerPixel());
      return;
    }
    if (this.shape === 'pickFace') faceMove(this.env, p.raw, this.cycle, this.items, this.uiLang());
    else if (this.shape === 'pickRoom') {
      const h = roomHover(this.env, p.raw, this.uiLang());
      this.items = h.items;
      this.env.say(h.say);
    } else if (id) this.moveShape(p, id);
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    if (this.mod.active()) this.mod.click(p);
    else if (this.shape === null) this.clickSelect(p);
    else if (this.shape === 'pickFace') this.clickPick(p);
    else if (this.shape === 'pickRoom') this.roomStep(roomClick(this.env, p.raw, this.d, this.uiLang()));
    else if (this.shape === 'byPerimeter') return;
    else this.clickShape(p, this.shape);
  }

  /** Arrasto: a caixa do contorno pela caixa (no vazio, a janela de seleção das linhas). */
  down(p: PointerInfo): void {
    this.raw = p.raw;
    if (this.shape === 'byPerimeter') {
      this.box = { a: p.raw, b: p.raw };
      return;
    }
    if (this.shape === null && this.line === 'boundary' && (!this.mod.active() || this.mod.picking())) this.sel.down(p);
  }

  drag(p: PointerInfo): void {
    if (this.sel.active()) {
      this.sel.drag(p);
      return;
    }
    if (!this.box) {
      this.move(p);
      return;
    }
    this.box = { a: this.box.a, b: p.raw };
    this.items = [{ kind: 'polygon', ring: boxRing(this.box.a, this.box.b), dashed: true }];
  }

  /** Solta a caixa: contorno das paredes ou janela de seleção. Avisos vão para a barra de status. */
  up(p: PointerInfo): void {
    if (this.sel.up(p)) {
      this.mod.afterWindowPick();
      return;
    }
    const box = this.box;
    if (!box) return;
    this.reset();
    const r = boxPick(this.env, box.a, p.raw, this.uiLang());
    if (!r) return;
    if (r.segs.length > 0) this.commit(applySegs(this.d, r.segs));
    if (r.segs.length > 0) this.originInfo = { ...this.originInfo, walls: true };
    this.env.say(r.msg);
  }

  /** Tab: alterna o candidato sob o cursor (face), o sinalizador da forma (ex.: sentido do arco), ou a variante de Modificar. */
  override tab(): void {
    if (this.mod.active()) return this.mod.tab();
    if (this.shape === 'pickFace') {
      this.cycle += 1;
      this.items = [];
      faceMove(this.env, this.raw, this.cycle, this.items);
      return;
    }
    const id = shapeIdOf(this.shape);
    const flag = id ? kindOf(id).inputs.find((i) => i.kind === 'flag') : undefined;
    if (!flag) return;
    this.flags[flag.key] = !this.flags[flag.key];
    this.env.say(this.t('tl_msg_flag_toggle', {
      label: shapeInputLabel(flag.label, this.uiLang()),
      value: this.flags[flag.key] ? this.t('tl_yes') : this.t('tl_no'),
    }));
  }

  /** Digitação: medida, ângulo (graus) ou contagem para a entrada pendente. Na linha, digitar o comprimento põe o fim na direção do cursor. */
  override type(text: string): boolean {
    if (this.mod.active()) return this.mod.type(text);
    const st = this.step;
    const input = st ? stepsOf(st.shape)[st.idx] : undefined;
    if (!st || !input) return false;
    const q = input.kind === 'length' ? 'length' : input.kind === 'angle' ? 'angle' : null;
    const v = q ? parseQuantityText(text, unitsOf(this.env.project()), q) : parseNumber(text);
    if (input.kind === 'length' || input.kind === 'angle' || input.kind === 'count') {
      if (v === null) return refuse(this.env, this.t('tl_msg_invalid_number_plain'));
      if (input.kind === 'length' && v <= 0) return refuse(this.env, this.t('tl_msg_length_positive_m'));
      if (input.kind === 'count' && (!Number.isInteger(v) || v < 3)) return refuse(this.env, this.t('tl_msg_sides_int'));
      this.setInput(st, input.key, v);
      return true;
    }
    const anchor = anchorOf(st);
    if (input.kind !== 'point' || st.shape.id !== 'line' || !anchor) return false;
    // Comprimento digitado no núcleo comum: o ponto cai na direção do cursor já com Orto/Polar/snap.
    const comp = lerComprimentoDigitado(this.env, text);
    if (comp === null) return false;
    this.setInput(st, input.key, pontoPorComprimento(anchor, this.inf?.point ?? this.raw, comp));
    return true;
  }

  /** Delete: remove as linhas selecionadas. Sem seleção, deixa o Delete seguir para a seleção do projeto. */
  deleteKey(): boolean {
    const ids = this.d.selected;
    if (ids.length === 0) return false;
    this.commit(removeSegs(this.d, ids));
    this.hover = null;
    this.env.say(this.t('tl_msg_lines_removed', { n: ids.length }));
    return true;
  }

  /** Muda o rascunho como passo de desfazer (geometria). Seleção só troca o corrente, sem passo. */
  private commit(next: SketchDraft): void { this.draftHistory.push(next); }

  /** "Por ambiente": o contorno do ambiente entra no esboço e o id do ambiente vai para a origem. */
  private roomStep(r: ReturnType<typeof roomClick>): void {
    if (r.roomId) this.originInfo = { ...this.originInfo, roomId: r.roomId };
    if (r.draft !== this.d) this.commit(r.draft);
    this.env.say(r.say);
  }

  private moveShape(p: PointerInfo, id: ShapeKindId): void {
    const st: ShapeStep = this.step ?? { shape: kindOf(id), idx: 0, vals: {} };
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return;
    const anchor = anchorOf(st);
    if (input.kind === 'segment') {
      const sid = hitSeg(this.d.segs, p.raw, SELECT_PX * this.env.metersPerPixel());
      const seg = this.d.segs.find((s) => s.id === sid);
      if (seg) this.items.push(...segLines(seg, { halo: true }));
      const labelLow = shapeInputLabel(input.label, this.uiLang()).toLowerCase();
      this.env.say(seg
        ? this.t('tl_msg_click_shape_pick', { label: shapeInputLabel(input.label, this.uiLang()) })
        : this.t('tl_msg_click_sketch_line_by', { label: labelLow }));
      return;
    }
    let value: unknown = null;
    let cursor: Vec2 = p.raw;
    if (input.kind === 'point') {
      const inf = this.snap(p, snapExtraOf(this.d, st));
      // O `snap` já grava em `this.inf`: a prévia e as cotas do lado em desenho usam o ponto capturado (ortogonal).
      this.inf = inf;
      value = inf.point;
      cursor = inf.point;
    } else if (input.kind === 'length' && anchor) {
      value = dist(p.raw, anchor);
    } else if (input.kind === 'angle' && anchor) {
      value = angleOf(sub(p.raw, anchor));
    }
    this.items.push(...stepPreview(st, value, anchor, cursor, this.flags));
    if (this.line === 'boundary' && st.shape.id === 'line' && anchor && this.inf) this.items.push(...draftAngleItemsForDraft(this.env.project(), this.env.levelId(), this.env.areaPlanId?.(), this.d.segs, anchor, this.inf.point, this.env.metersPerPixel(), unitsOf(this.env.project())));
    this.env.say(this.t('tl_msg_shape_prompt', { shape: shapeName(st.shape, this.uiLang()), prompt: promptOf(st, this.uiLang()) }));
  }

  private clickSelect(p: PointerInfo): void {
    const r = selectClick(this.d, p, this.line === 'slope', this.env.metersPerPixel(), this.t('tl_hint_perim_select'), this.uiLang());
    if (r.geom) this.commit(r.next);
    else this.draftHistory.replace(r.next);
    this.env.say(r.msg);
  }

  private clickPick(p: PointerInfo): void {
    const r = facePick(this.env, p.raw, this.cycle, this.d, this.uiLang());
    if ('msg' in r) return this.env.say(r.msg);
    this.commit(addSegs(this.d, [r.seg]));
    this.cycle = 0;
    this.env.say(this.t('tl_msg_added', { label: r.label }));
  }

  private clickShape(p: PointerInfo, id: ShapeKindId): void {
    const st = this.step ?? (this.step = { shape: kindOf(id), idx: 0, vals: {} });
    const input = stepsOf(st.shape)[st.idx];
    if (!input) return;
    const anchor = anchorOf(st);
    if (input.kind === 'point') {
      const q = this.snap(p, snapExtraOf(this.d, st)).point;
      if (anchor && dist(q, anchor) < 1e-9) {
        this.env.say(this.t('tl_msg_point_repeated'));
        return;
      }
      this.setInput(st, input.key, q);
      return;
    }
    if (input.kind === 'segment') {
      const seg = this.d.segs.find((s) => s.id === hitSeg(this.d.segs, p.raw, SELECT_PX * this.env.metersPerPixel()));
      if (!seg) this.env.say(this.t('tl_msg_click_sketch_line'));
      else this.setInput(st, input.key, seg);
      return;
    }
    if ((input.kind === 'length' || input.kind === 'angle') && anchor) {
      const v = input.kind === 'length' ? dist(p.raw, anchor) : angleOf(sub(p.raw, anchor));
      if (input.kind === 'length' && v < 1e-9) return;
      this.setInput(st, input.key, v);
      return;
    }
    this.env.say(this.t('tl_msg_type_label', { label: shapeInputLabel(input.label, this.uiLang()).toLowerCase() }));
  }

  /** Grava a entrada pendente e avança; ao fechar todas, cria a forma. */
  private setInput(st: ShapeStep, key: string, value: unknown): void {
    st.vals[key] = value;
    st.idx += 1;
    this.items = [];
    if (st.idx >= stepsOf(st.shape).length) this.complete(st);
    else this.env.say(this.t('tl_msg_shape_prompt', { shape: shapeName(st.shape, this.uiLang()), prompt: promptOf(st, this.uiLang()) }));
  }

  private complete(st: ShapeStep): void {
    const segs = buildShape(st.shape.id, st.vals, this.flags);
    if (segs.length === 0) {
      const last = stepsOf(st.shape)[st.idx - 1]!;
      st.idx -= 1;
      delete st.vals[last.key];
      this.env.say(this.t('tl_msg_degenerate_shape'));
      return;
    }
    this.commit(applySegs(this.d, segs));
    this.items = [];
    this.inf = null;
    if (st.shape.id === 'line') {
      // Linha de limite: a próxima começa na ponta desta, até Esc.
      this.step = { shape: st.shape, idx: 1, vals: { a: st.vals.b } };
      this.env.say(this.t('tl_msg_line_created'));
      return;
    }
    this.step = null;
    this.env.say(this.t('tl_msg_shape_added', { shape: shapeName(st.shape, this.uiLang()) }));
  }
}
