import { dist, type Vec2 } from '@hestia/geom';
import { formatQuantity, unitsOf, type ResolvedUnits } from '@hestia/model';
import { ToolBase, makeId } from './base.ts';
import { draftAngleItemsForConnection } from './anglePreview.ts';
import { contextoDeTraco, lerComprimentoDigitado, pontoPorComprimento } from './desenhoPolilinha.ts';
import type { PointerInfo } from './types.ts';

const fmt = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/**
 * Linha de separação de ambiente (Revit: Room Separation Line). Clique no ponto inicial e depois no final; a linha
 * divide a área livre entre paredes em dois ambientes. A recusa do modelo (comprimento mínimo) vira mensagem.
 */
export class RoomSeparatorTool extends ToolBase {
  readonly id = 'roomsep';
  readonly label = 'Linha de separação';
  override get hint(): string {
    return this.t('tl_hint_room_sep');
  }
  private a: Vec2 | null = null;

  protected reset(): void {
    this.a = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.a !== null;
  }

  override move(p: PointerInfo): void {
    const inf = this.snap(p, contextoDeTraco(this.a));
    if (!this.a) return;
    const b = inf.point;
    this.items = [
      { kind: 'point', at: this.a },
      { kind: 'line', a: this.a, b, dashed: true },
      { kind: 'label', at: { x: (this.a.x + b.x) / 2, y: (this.a.y + b.y) / 2 }, text: fmt(unitsOf(this.env.project()), dist(this.a, b)) },
      ...draftAngleItemsForConnection(this.env.project(), this.env.levelId(), null, this.a, b, this.env.metersPerPixel(), unitsOf(this.env.project())),
    ];
  }

  /** Comprimento digitado + Enter, pelo núcleo comum de desenho (igual à parede). */
  override type(text: string): boolean {
    if (!this.a) return false;
    const v = lerComprimentoDigitado(this.env, text);
    if (v === null) return false;
    this.fim(pontoPorComprimento(this.a, this.inf?.point ?? this.raw, v));
    return true;
  }

  override click(p: PointerInfo): void {
    const inf = this.snap(p, contextoDeTraco(this.a));
    if (!this.a) {
      this.a = inf.point;
      this.env.say(this.t('tl_msg_roomsep_end'));
      return;
    }
    this.fim(inf.point);
  }

  private fim(b: Vec2): void {
    if (!this.a) return;
    const a = this.a;
    try {
      this.env.transaction('Criar linha de separação', () => {
        this.env.exec({ type: 'addRoomSeparator', levelId: this.env.levelId(), separator: { id: makeId('rs'), a, b } });
      });
    } catch (e) {
      // Recusa do modelo (comprimento mínimo): descarta o primeiro clique para a ferramenta não ficar travada.
      this.reset();
      this.env.say(e instanceof Error ? e.message : String(e));
      return;
    }
    this.reset();
    this.env.say(this.hint);
  }
}
