import { dist, type Vec2 } from '@hestia/geom';
import { newId, unitsOf } from '@hestia/model';
import { addSectionDetailLine, ToolBase, viewPlanId } from './base.ts';
import { draftAngleItemsForConnection } from './anglePreview.ts';
import { detailLinePreviewDim } from './dims/providers/line.ts';
import type { DimRef, TempDim } from './dims/types.ts';
import type { PointerInfo } from './types.ts';

/** Linha de detalhe: traço 2D independente da geometria do modelo, restrito ao nível ativo. */
export class DetailLineTool extends ToolBase {
  readonly id = 'detailLine';
  readonly label = 'Linha de detalhe';
  override get hint(): string {
    return this.t('tl_hint_detail_line');
  }
  private a: Vec2 | null = null;
  private last: Vec2 | null = null;
  protected reset(): void { this.a = null; this.last = null; this.items = []; this.inf = null; }
  protected busy(): boolean { return this.a !== null; }
  override move(p: PointerInfo): void {
    const q = this.snap(p).point;
    this.last = q;
    this.items = this.a ? [{ kind: 'line', a: this.a, b: q, dashed: true }] : [];
    if (this.a) this.items.push(...draftAngleItemsForConnection(this.env.project(), this.env.levelId(), viewPlanId(this.env), this.a, q, this.env.metersPerPixel(), unitsOf(this.env.project())));
  }
  /** Comprimento do traço em desenho, pelo sistema único de cotas. */
  tempDims(_overrides: Readonly<Record<string, DimRef>> = {}): TempDim[] {
    return this.a && this.last ? [detailLinePreviewDim(this.a, this.last)] : [];
  }
  override click(p: PointerInfo): void {
    const q = this.snap(p).point;
    if (!this.a) { this.a = q; this.env.say('Clique no fim da linha de detalhe.'); return; }
    if (dist(this.a, q) < 0.01) { this.env.say('Escolha um ponto final mais distante.'); return; }
    const item = { id: newId('dl'), a: this.a, b: q, style: this.env.options().detailLineStyle ?? 'solid' };
    if (!addSectionDetailLine(this.env, item)) this.env.exec({ type: 'addDetailLine', levelId: this.env.levelId(), planId: viewPlanId(this.env), item });
    this.reset();
    this.env.say(this.hint);
  }
}
