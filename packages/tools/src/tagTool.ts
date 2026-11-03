import { newId } from '@hestia/model';
import { addSectionTag, ToolBase, viewPlanId } from './base.ts';
import type { PointerInfo } from './types.ts';

/** Etiqueta associativa: usa a seleção como anfitrião e vincula o rótulo ao ponto clicado. */
export class TagTool extends ToolBase {
  readonly id = 'tag';
  readonly label = 'Etiqueta';
  override get hint(): string {
    return this.t('tl_hint_tag');
  }
  protected reset(): void { this.items = []; this.inf = null; }
  protected busy(): boolean { return false; }
  override move(p: PointerInfo): void {
    const point = this.snap(p).point;
    const host = this.env.selection().find((id) => this.env.project().elements[id]);
    const e = host ? this.env.project().elements[host] : undefined;
    const anchor = e?.kind === 'wall' ? { x: (e.a.x + e.b.x) / 2, y: (e.a.y + e.b.y) / 2 }
      : e?.kind === 'room' ? e.point
      : e && 'boundary' in e && e.boundary.length ? { x: e.boundary.reduce((s, q) => s + q.x, 0) / e.boundary.length, y: e.boundary.reduce((s, q) => s + q.y, 0) / e.boundary.length } : null;
    this.items = anchor && this.env.options().tagLeader !== false ? [{ kind: 'line', a: anchor, b: point, dashed: true }] : [{ kind: 'point', at: point }];
  }
  override click(p: PointerInfo): void {
    const hostId = this.env.selection().find((id) => this.env.project().elements[id]);
    if (!hostId) { this.env.say('Selecione um elemento do modelo antes de posicionar a etiqueta.'); return; }
    const item = { id: newId('tag'), hostId, at: this.snap(p).point, property: this.env.options().tagProperty ?? 'type', leader: this.env.options().tagLeader !== false, orientation: this.env.options().tagOrientation ?? 'horizontal' } as const;
    if (!addSectionTag(this.env, item)) this.env.exec({ type: 'addTag', levelId: this.env.levelId(), planId: viewPlanId(this.env), item });
    this.env.say(this.t('tl_msg_tag_done'));
  }
}
