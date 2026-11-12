import { dist, type Vec2 } from '@hestia/geom';
import { newId } from '@hestia/model';
import { addSectionDetailRegion, ToolBase, viewPlanId } from './base.ts';
import { contextoDeTraco } from './desenhoPolilinha.ts';
import type { PointerInfo } from './types.ts';

/** Região de detalhe poligonal; Enter fecha o contorno. */
export class DetailRegionTool extends ToolBase {
  readonly id = 'filledRegion';
  readonly label = 'Região preenchida';
  override get hint(): string {
    return this.t('tl_hint_filled_region');
  }
  private points: Vec2[] = [];
  protected reset(): void { this.points = []; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.points.length > 0; }
  override move(p: PointerInfo): void {
    const q = this.snap(p, contextoDeTraco(this.points[this.points.length - 1])).point;
    this.items = this.points.length ? [{ kind: 'polygon', ring: [...this.points, q], dashed: true }] : [];
  }
  override click(p: PointerInfo): void {
    const q = this.snap(p, contextoDeTraco(this.points[this.points.length - 1])).point;
    if (this.points.length >= 3 && dist(q, this.points[0]!) <= 8 * this.env.metersPerPixel()) { this.finish(); return; }
    if (!this.points.length || dist(q, this.points[this.points.length - 1]!) > 0.01) this.points.push(q);
    this.items = this.points.length >= 2 ? [{ kind: 'polygon', ring: this.points, dashed: true }] : [{ kind: 'point', at: q }];
    this.env.say('Continue clicando nos vértices; Enter conclui a região.');
  }
  override confirm(): void { this.finish(); }
  private finish(): void {
    if (this.points.length < 3) { this.env.say('A região precisa de pelo menos três pontos.'); return; }
    const levelId = this.env.levelId();
    const item = { id: newId('dr'), boundary: this.points.map((p) => ({ ...p })), color: this.env.options().regionColor ?? '#f5d782', mask: this.env.options().regionMask === true };
    if (!addSectionDetailRegion(this.env, item)) this.env.exec({ type: 'addDetailRegion', levelId, planId: viewPlanId(this.env), item });
    this.reset();
    this.env.say(this.hint);
  }
}
