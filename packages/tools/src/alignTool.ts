import { add, mul, type Vec2 } from '@hestia/geom';
import { sampleCurve } from '@hestia/engine';
import type { Id, StairCurve } from '@hestia/model';
import { alignFeaturesAt, type AlignFeature } from './alignFeatures.ts';
import { applyAlignMany } from './alignApply.ts';
import { solveAlign, type AlignSolution } from './alignSolve.ts';
import { ToolBase } from './base.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

const LABEL_HALF = 1.2;
/** Máximo de segmentos da prévia de uma aresta em arco (a curva inteira, sem pesar no desenho). */
const MAX_CURVE_SEGMENTS = 48;

/** Pontos da curva reduzidos a no máximo `MAX_CURVE_SEGMENTS` segmentos, preservando o arco inteiro. */
function previewCurvePoints(c: StairCurve): Vec2[] {
  const pts = sampleCurve(c);
  if (pts.length <= MAX_CURVE_SEGMENTS + 1) return pts;
  const out: Vec2[] = [];
  for (let i = 0; i <= MAX_CURVE_SEGMENTS; i++) {
    out.push(pts[Math.round((i * (pts.length - 1)) / MAX_CURVE_SEGMENTS)]!);
  }
  return out;
}

/** Parede que a feição de referência pertence (a própria parede, a da extremidade ou a hospedeira da abertura). */
function paredeDaFeicao(f: AlignFeature): Id | undefined {
  const m = f.move;
  if (m.policy === 'transladar' && m.target === 'parede') return m.id;
  if (m.policy === 'ponta') return m.wallId;
  if (m.policy === 'abertura') return m.hostId;
  return undefined;
}

/**
 * Alinhar universal (Revit: Align): o primeiro clique define a REFERÊNCIA e o segundo o que se move. Vale para
 * qualquer feição reconhecida (face/eixo/núcleo/extremidade de parede, ombreira/centro de abertura, aresta de anel,
 * linha do esboço e aresta de escada), inclusive misturando tipos. Ctrl+clique acumula vários alvos; Tab alterna a
 * candidata sob o cursor; Esc volta um passo.
 */
export class AlignTool extends ToolBase {
  readonly id = 'align';
  readonly label = 'Alinhar';
  override get hint(): string {
    return this.t('tl_hint_align');
  }
  private ref: AlignFeature | null = null;
  private queue: AlignFeature[] = [];
  private hover: AlignFeature[] = [];
  private hoverIndex = 0;

  protected reset(): void {
    this.ref = null;
    this.queue = [];
    this.hover = [];
    this.hoverIndex = 0;
    this.items = [];
  }
  protected busy(): boolean {
    return this.ref !== null || this.queue.length > 0;
  }

  /** Candidatas sob o cursor, com a opção "Preferir" e a visibilidade da vista. */
  private candidates(at: Vec2): AlignFeature[] {
    return alignFeaturesAt({
      project: this.env.project(),
      levelId: this.env.levelId(),
      at,
      metersPerPixel: this.env.metersPerPixel(),
      prefer: this.env.options().alignPrefer ?? 'faces',
      hidden: this.env.hiddenInView?.(),
    });
  }

  /** Recalcula o hover mantendo o índice do Tab na mesma feição (pela chave estável). */
  private updateHover(at: Vec2): void {
    const previous = this.hover[this.hoverIndex]?.key;
    this.hover = this.candidates(at);
    const found = previous ? this.hover.findIndex((f) => f.key === previous) : -1;
    this.hoverIndex = found >= 0 ? found : 0;
  }

  private current(): AlignFeature | null {
    return this.hover[this.hoverIndex] ?? null;
  }

  /**
   * Realce de uma feição. Com `curve` (arco), desenha a curva inteira em segmentos; com `seg`, a aresta exata;
   * sem nenhum dos dois (eixos e referências), o risco curto centrado em `line.p`. `ref` usa traço cheio; alvo em
   * espera usa tracejado. O rótulo fica sobre a feição.
   */
  private featureItems(f: AlignFeature, prefix: string, dashed = false): PreviewItem[] {
    const items: PreviewItem[] = [];
    let labelAt = f.line.p;
    if (f.curve && Math.abs(f.curve.sag) >= 1e-9) {
      const pts = previewCurvePoints(f.curve);
      for (let i = 1; i < pts.length; i++) {
        items.push({ kind: 'line', a: pts[i - 1]!, b: pts[i]!, halo: true, dashed });
      }
      if (pts.length) labelAt = pts[Math.floor(pts.length / 2)]!;
    } else if (f.seg) {
      items.push({ kind: 'line', a: f.seg.a, b: f.seg.b, halo: true, dashed });
      labelAt = mul(add(f.seg.a, f.seg.b), 0.5);
    } else {
      const a = add(f.line.p, mul(f.line.d, -LABEL_HALF));
      const b = add(f.line.p, mul(f.line.d, LABEL_HALF));
      items.push({ kind: 'line', a, b, halo: true, dashed });
    }
    items.push({ kind: 'label', at: labelAt, text: `${prefix}${f.label}` });
    return items;
  }

  private refreshItems(): void {
    const items: PreviewItem[] = [];
    if (this.ref) items.push(...this.featureItems(this.ref, this.t('tl_label_reference')));
    for (const q of this.queue) items.push(...this.featureItems(q, this.t('tl_label_align'), true));
    const cand = this.current();
    if (cand) items.push(...this.featureItems(cand, this.ref ? this.t('tl_label_move') : this.t('tl_label_reference'), true));
    this.items = items;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.updateHover(p.raw);
    this.refreshItems();
  }

  override tab(): void {
    if (this.hover.length < 2) {
      if (this.hover[0]) this.env.say(`${this.hover[0].label}. ${this.hint}`);
      return;
    }
    this.hoverIndex = (this.hoverIndex + 1) % this.hover.length;
    this.refreshItems();
    this.env.say(`${this.current()!.label}. ${this.t(this.ref ? 'tl_msg_click_align_tab' : 'tl_msg_click_reference_tab')}`);
  }

  /** Texto de recusa/“já alinhado” a partir dos resultados calculados. */
  private refusal(results: AlignSolution[], targets: AlignFeature[]): string {
    const error = results.find((r): r is Extract<AlignSolution, { kind: 'erro' }> => r.kind === 'erro');
    if (error) return error.mensagem;
    if (results.length > 0 && results.every((r) => r.kind === 'nada')) {
      return targets.every((t) => t.kind === 'arestaAnel') ? this.t('tl_msg_already_aligned_f') : this.t('tl_msg_already_aligned_m');
    }
    return this.t('tl_msg_nothing_align');
  }

  /** Calcula e aplica os alvos num só passo de desfazer; a referência continua escolhida. */
  private applyTargets(targets: AlignFeature[]): void {
    if (!this.ref || !targets.length) return;
    const pr = this.env.project();
    const refWall = paredeDaFeicao(this.ref);
    // Alinhar a parede de referência a ela mesma não faz sentido: a referência se moveria junto.
    const results: AlignSolution[] = targets.map((t) => {
      const sol = solveAlign(this.ref!.line, t, pr, this.uiLang());
      if (sol.kind === 'transladar' && sol.target === 'parede' && sol.id === refWall) {
        return { kind: 'erro', mensagem: this.t('tl_msg_align_self_ref') };
      }
      return sol;
    });
    const valid = results.filter((r): r is Exclude<AlignSolution, { kind: 'nada' } | { kind: 'erro' }> => r.kind !== 'nada' && r.kind !== 'erro');
    if (!valid.length) {
      this.env.say(this.refusal(results, targets));
      return;
    }
    const label = valid.every((r) => r.kind === 'anel') ? this.t('tl_label_align_edge') : this.t('tl_label_align_do');
    const { applied } = applyAlignMany(this.env, valid, label, { referencia: refWall });
    // Recusas individuais (vizinha curta, anel travado) já foram ditas por `applyAlign`.
    if (!applied) return;
    const ignored = results.filter((r) => r.kind === 'erro').length;
    const extra = ignored ? this.t('tl_msg_targets_ignored', { n: ignored, msg: this.refusal(results, targets) }) : '';
    this.env.say(this.t('tl_msg_aligned', { extra, ref: this.ref.label }));
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    this.updateHover(p.raw);
    const cand = this.current();
    if (!this.ref) {
      if (!cand) {
        this.env.say(this.t('tl_msg_click_align_feature'));
        return;
      }
      this.ref = cand;
      this.queue = [];
      this.refreshItems();
      this.env.say(this.t('tl_msg_align_reference', { ref: cand.label }));
      return;
    }
    if (!cand) {
      this.env.say(this.t('tl_msg_click_move_feature'));
      return;
    }
    if (p.ctrl) {
      const i = this.queue.findIndex((q) => q.key === cand.key);
      if (i >= 0) this.queue.splice(i, 1);
      else this.queue.push(cand);
      this.refreshItems();
      this.env.say(
        this.queue.length
          ? this.t('tl_msg_features_to_align', { n: this.queue.length })
          : this.t('tl_msg_multi_empty'),
      );
      return;
    }
    const targets = this.queue.length ? [...this.queue.filter((q) => q.key !== cand.key), cand] : [cand];
    this.queue = [];
    this.applyTargets(targets);
    // O modelo mudou: refaz o hover para não deixar a prévia antiga no lugar onde a feição estava.
    this.updateHover(this.raw);
    this.refreshItems();
  }

  override confirm(): void {
    if (this.ref && this.queue.length) {
      const targets = this.queue;
      this.queue = [];
      this.applyTargets(targets);
      this.updateHover(this.raw);
      this.refreshItems();
      return;
    }
    super.confirm();
  }

  override cancel(): void {
    if (this.queue.length) {
      this.queue = [];
      this.refreshItems();
      this.env.say(this.t('tl_msg_align_multi_cancel', { ref: this.ref?.label ?? this.t('tl_msg_none'), hint: this.hint }));
      return;
    }
    if (this.ref) {
      this.ref = null;
      this.refreshItems();
      this.env.say(this.hint);
      return;
    }
    this.env.done();
  }
}
