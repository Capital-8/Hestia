import { dist, type Vec2 } from '@hestia/geom';
import { formatQuantity, unitsOf, type ResolvedUnits } from '@hestia/model';
import { ToolBase } from './base.ts';
import type { PointerInfo, PreviewItem } from './types.ts';

/** Cota de uma medida: linha entre os dois pontos, marcas nas extremidades e o valor no meio. */
function cotaItems(u: ResolvedUnits, a: Vec2, b: Vec2): PreviewItem[] {
  return [
    { kind: 'line', a, b, halo: true },
    { kind: 'point', at: a },
    { kind: 'point', at: b },
    { kind: 'label', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text: formatQuantity(u, 'length', dist(a, b)) },
  ];
}

export class MeasureTool extends ToolBase {
  readonly id = 'measure';
  readonly label = 'Medir';
  override get hint(): string {
    return this.t('tl_hint_measure');
  }
  private a: Vec2 | null = null;
  /** Última medida concluída: a cota fica no desenho até Esc ou um novo clique. Só é visual (não entra no modelo nem no desfazer). */
  private kept: { a: Vec2; b: Vec2 } | null = null;

  protected reset(): void {
    this.a = null;
    this.kept = null;
    this.items = [];
  }
  protected busy(): boolean {
    return this.a !== null || this.kept !== null;
  }

  override move(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.a ?? undefined });
    this.items = [];
    if (!this.a) {
      if (this.kept) this.items.push(...cotaItems(unitsOf(this.env.project()), this.kept.a, this.kept.b));
      this.items.push({ kind: 'point', at: inf.point });
      return;
    }
    this.items.push({ kind: 'line', a: this.a, b: inf.point, halo: true });
    this.items.push({ kind: 'label', at: inf.point, text: formatQuantity(unitsOf(this.env.project()), 'length', dist(this.a, inf.point)) });
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p, { from: this.a ?? undefined });
    if (!this.a) {
      this.kept = null;
      this.items = [];
      this.a = inf.point;
      return;
    }
    const d = dist(this.a, inf.point);
    const ang = (Math.atan2(inf.point.y - this.a.y, inf.point.x - this.a.x) * 180) / Math.PI;
    const u = unitsOf(this.env.project());
    this.env.say(this.t('tl_msg_measure', {
      d: formatQuantity(u, 'length', d),
      dx: formatQuantity(u, 'length', inf.point.x - this.a.x, { withUnit: false }),
      dy: formatQuantity(u, 'length', inf.point.y - this.a.y, { withUnit: false }),
      angle: formatQuantity(u, 'angle', (ang * Math.PI) / 180),
    }));
    this.kept = { a: this.a, b: inf.point };
    this.a = null;
    this.items = cotaItems(unitsOf(this.env.project()), this.kept.a, this.kept.b);
  }
}
