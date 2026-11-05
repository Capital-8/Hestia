import { newId, type TextNote } from '@hestia/model';
import { addSectionText, ToolBase, viewPlanId } from './base.ts';
import type { PointerInfo } from './types.ts';

/** Altura padrão do texto de anotação, em mm de papel (Revit: 2,5 mm). */
export const TEXT_DEFAULT_HEIGHT_MM = 2.5;

/**
 * Texto de anotação (Revit: Text). Clique no ponto (centro do texto), digite no campo da barra de opções e Enter.
 * Esc cancela o texto em andamento. A ferramenta só emite `addText`.
 */
export class TextTool extends ToolBase {
  readonly id = 'text';
  readonly label = this.t('tl_inp_text');
  override get hint(): string {
    return this.t('tl_hint_text');
  }
  /** O campo aceita letras e espaços (não só números): a interface envia cada tecla digitável. */
  readonly freeText = true;
  private points: Array<{ x: number; y: number }> = [];

  protected reset(): void {
    this.points = [];
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.points.length > 0;
  }

  override inputPrompt(): string | null {
    return this.points.length ? this.t('tl_inp_text') : null;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    const inf = this.snap(p);
    const leader = this.env.options().textLeader ?? 'none';
    if (!this.points.length) this.items = [{ kind: 'point', at: inf.point }];
    else if (leader === 'straight' && this.points.length === 1) this.items = [{ kind: 'line', a: this.points[0]!, b: inf.point, dashed: true }, { kind: 'point', at: inf.point }];
    else if (leader === 'elbow' && this.points.length <= 2) this.items = [{ kind: 'line', a: this.points[0]!, b: this.points[1] ?? inf.point, dashed: true }, { kind: 'line', a: this.points[1] ?? inf.point, b: inf.point, dashed: true }, { kind: 'point', at: inf.point }];
  }

  override click(p: PointerInfo): void {
    const point = this.snap(p).point;
    const leader = this.env.options().textLeader ?? 'none';
    const required = leader === 'none' ? 1 : leader === 'straight' ? 2 : 3;
    this.points.push(point);
    if (this.points.length < required) {
      this.items = this.points.slice(1).map((b, i) => ({ kind: 'line' as const, a: this.points[i]!, b, dashed: true }));
      this.env.say(leader === 'elbow' && this.points.length === 1 ? 'Clique para definir a dobra da chamada.' : 'Clique para posicionar o texto.');
      return;
    }
    this.items = this.points.slice(1).map((b, i) => ({ kind: 'line' as const, a: this.points[i]!, b }));
    this.env.say('Digite o texto e Enter.');
  }

  override type(text: string): boolean {
    if (!this.points.length) return false;
    const t = text.trim();
    if (t === '') {
      this.env.say(this.t('tl_msg_text_empty'));
      return false;
    }
    const options = this.env.options();
    const at = this.points[this.points.length - 1]!;
    const leader = this.points.length > 1 ? this.points.map((p) => ({ ...p })) : undefined;
    const note: TextNote = { id: newId('txt'), at: { ...at }, text: t, height: options.textHeight ?? TEXT_DEFAULT_HEIGHT_MM, rotation: options.textRotation ?? 0, width: options.textWidth, leader, align: 'left' };
    if (!addSectionText(this.env, note)) this.env.exec({ type: 'addText', levelId: this.env.levelId(), planId: viewPlanId(this.env), text: note });
    this.reset();
    this.env.say(this.hint);
    return true;
  }
}
