import { mul, offsetArc, v2, type Vec2 } from '@hestia/geom';
import { frameOfWall, toLocal, type WallFrame } from '@hestia/engine';
import { formatQuantity, isWall, unitsOf, type Id, type ResolvedUnits } from '@hestia/model';
import { ToolBase } from './base.ts';
import { copyWalls, ghostBands } from './edit.ts';
import { COMPONENT_EDGE_MSG, componentUnderCursor } from './componentTarget.ts';
import { lengthUnitName, parseQuantityText } from './numeric.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

const fmtM = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/**
 * Parede paralela. Convenção da distância (ToolOptions.offsetFrom):
 * - `face` (padrão): distância de FACE a FACE. Mede-se da face da base, do lado do cursor, até a face mais próxima
 *   da nova parede. A nova parede tem o tipo da base, então o eixo novo fica em `espessura + distância` do eixo da base.
 * - `axis`: distância entre EIXOS (linhas de centro). A nova parede fica a `distância` do eixo da base.
 * O lado é o do cursor (ou da tecla Tab). Clique do lado desejado mede a distância até o cursor; digitar um valor
 * e Enter cria a parede a essa distância. A nova parede é uma cópia da base (mesmo tipo, altura, vãos não copiados).
 */
export class ParallelTool extends ToolBase {
  readonly id = 'parallel';
  readonly label = 'Parede paralela';
  override get hint(): string {
    return this.t('tl_hint_parallel');
  }
  private base: Id | null = null;
  private frame: WallFrame | null = null;
  private side: 1 | -1 = 1;
  /** Tab inverte o lado escolhido pelo cursor (até a próxima base). */
  private flip = false;
  private last: PointerInfo | null = null;

  protected reset(): void {
    this.base = null;
    this.frame = null;
    this.side = 1;
    this.flip = false;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.base !== null;
  }

  override inputPrompt(): string | null {
    return this.base ? this.t('tl_inp_distance') : null;
  }

  private byFace(): boolean {
    return (this.env.options().offsetFrom ?? 'face') === 'face';
  }

  /** Nome do modo de medida mostrado nas mensagens: o usuário vê antes do clique qual convenção vale. */
  private modo(): string {
    return this.t(this.byFace() ? 'tl_measure_face' : 'tl_measure_axis');
  }

  /** Ao ativar a ferramenta, a barra de status já diz o modo (padrão: face a face). */
  override start(): void {
    this.reset();
    this.env.say(this.t('tl_msg_parallel_start', { mode: this.modo() }));
  }

  /** Parede sob o cursor (dentro da faixa da parede, ou a até um pixel da faixa). Mais próxima do eixo vence. */
  private pick(at: Vec2): { id: Id; f: WallFrame } | null {
    const pr = this.env.project();
    const tol = 10 * this.env.metersPerPixel();
    let best: { id: Id; f: WallFrame; score: number } | null = null;
    for (const e of Object.values(pr.elements)) {
      if (!isWall(e) || e.levelId !== this.env.levelId()) continue;
      const f = frameOfWall(pr, e.id);
      if (!f) continue;
      const l = toLocal(f, at);
      if (l.t < -tol || l.t > f.length + tol) continue;
      const score = Math.max(0, Math.abs(l.s - f.sMid) - f.thickness / 2);
      if (score > tol) continue;
      if (!best || score < best.score) best = { id: e.id, f, score };
    }
    return best ? { id: best.id, f: best.f } : null;
  }

  /** Lado do cursor em relação ao eixo da base. */
  private cursorSideAt(s: number): 1 | -1 {
    return s - this.frame!.sMid >= 0 ? 1 : -1;
  }

  /** Lado onde a nova parede fica: o do cursor, invertido por Tab. */
  private sideAt(s: number): 1 | -1 {
    const cursorSide = this.cursorSideAt(s);
    return this.flip ? (-cursorSide as 1 | -1) : cursorSide;
  }

  /**
   * Distância medida pela convenção de `offsetFrom`, para o cursor em `at` (negativa: o cursor está dentro da base).
   * A medida segue o lado do CURSOR, não o lado invertido por Tab: Tab só troca onde a parede é criada.
   */
  private measure(at: Vec2): number {
    const f = this.frame!;
    const l = toLocal(f, at);
    const c = this.cursorSideAt(l.s);
    const from = this.byFace() ? f.sMid + c * (f.thickness / 2) : f.sMid;
    return c * (l.s - from);
  }

  /** Deslocamento do eixo da base para a nova parede, a partir da distância `d` medida pela convenção. */
  private shiftOf(d: number): number {
    return this.byFace() ? this.frame!.thickness + d : d;
  }

  /** Geometria da nova parede deslocada `shift` para o lado atual: translação, ou arco deslocado. */
  private plan(shift: number): { d: Vec2; arc: { a: Vec2; b: Vec2; sag: number } | null } {
    const f = this.frame!;
    const w = this.env.project().elements[this.base!];
    const dd = this.side * shift;
    const arc = isWall(w) && Math.abs(w.sag) > 1e-6 ? offsetArc(w.a, w.b, w.sag, dd) : null;
    return { d: mul(f.n, dd), arc };
  }

  override move(p: PointerInfo): void {
    this.last = p;
    this.items = [];
    if (!this.base) {
      const comp = componentUnderCursor(this.env, p.raw);
      if (comp) {
        this.inf = null;
        this.items.push({ kind: 'highlight', ids: [comp.id] });
        return;
      }
      const hit = this.pick(p.raw);
      this.inf = null;
      if (hit) this.items.push({ kind: 'highlight', ids: [hit.id] });
      return;
    }
    const inf = this.snap(p, { ignore: new Set([this.base]) });
    this.side = this.sideAt(toLocal(this.frame!, inf.point).s);
    this.drawPlan(this.measure(inf.point), inf.point);
  }

  /** Pré-visualização da nova parede a `d` (distância pela convenção) e o rótulo com o valor. */
  private drawPlan(d: number, at: Vec2): void {
    const f = this.frame!;
    const pr = this.env.project();
    this.items.push({ kind: 'highlight', ids: [this.base!] });
    if (d <= 1e-6) {
      this.env.say(this.t('tl_msg_move_cursor_side'));
      return;
    }
    const plan = this.plan(this.shiftOf(d));
    if (plan.arc) {
      const band: PreviewItem = { kind: 'wallBand', a: plan.arc.a, b: plan.arc.b, thickness: f.thickness, sMid: f.sMid, sag: plan.arc.sag };
      this.items.push(band);
    } else {
      this.items.push(...ghostBands(pr, [this.base!], { kind: 'translate', d: plan.d }));
    }
    this.items.push({ kind: 'label', at, text: fmtM(unitsOf(this.env.project()), d) });
    this.env.say(this.t('tl_msg_parallel_preview', { d: fmtM(unitsOf(this.env.project()), d), mode: this.modo(), flip: this.flip ? this.t('tl_msg_opposite_side') : '' }));
  }

  override click(p: PointerInfo): void {
    if (!this.base) {
      if (componentUnderCursor(this.env, p.raw)) {
        this.env.say(COMPONENT_EDGE_MSG);
        return;
      }
      const hit = this.pick(p.raw);
      if (!hit) return;
      this.base = hit.id;
      this.frame = hit.f;
      this.side = this.sideAt(toLocal(hit.f, p.raw).s);
      this.env.say(this.t('tl_msg_base_chosen', { mode: this.modo() }));
      this.move(p);
      return;
    }
    const inf = this.snap(p, { ignore: new Set([this.base]) });
    this.side = this.sideAt(toLocal(this.frame!, inf.point).s);
    const d = this.measure(inf.point);
    if (d <= 1e-6) {
      this.env.say(this.t('tl_msg_outside_base'));
      return;
    }
    this.create(d);
  }

  override type(text: string): boolean {
    if (!this.base) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) {
      this.env.say(this.t('tl_msg_invalid_number', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
      return false;
    }
    if (v <= 0) {
      this.env.say(this.t('tl_msg_type_distance_unit', { unit: lengthUnitName(unitsOf(this.env.project()), this.uiLang()) }));
      return false;
    }
    this.create(v);
    return true;
  }

  /** Tab inverte o lado da nova parede. */
  override tab(): void {
    if (!this.base) return;
    this.flip = !this.flip;
    this.env.say(this.t('tl_msg_side_flipped'));
    if (this.last) this.move(this.last);
  }

  /** Cria a parede paralela a `d` (pela convenção de `offsetFrom`) no lado atual e volta ao primeiro passo. */
  private create(d: number): void {
    const id = this.base!;
    const plan = this.plan(this.shiftOf(d));
    let criada = false;
    this.env.transaction(this.t('tl_undo_parallel_wall'), () => {
      const [nid] = copyWalls(this.env, [id], { kind: 'translate', d: plan.arc ? v2(0, 0) : plan.d });
      if (nid) criada = true;
      if (plan.arc && nid) this.env.exec({ type: 'updateElements', ids: [nid], patch: { a: plan.arc.a, b: plan.arc.b, sag: plan.arc.sag } });
    });
    this.reset();
    // Bloqueio da decisão 0044: a mensagem já foi dita; não anuncia uma parede que não nasceu.
    if (criada) this.env.say(this.t('tl_msg_parallel_created', { d: fmtM(unitsOf(this.env.project()), d), mode: this.modo() }));
  }
}
