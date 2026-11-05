import { dist, pointInPolygon, polygonArea, type Vec2 } from '@hestia/geom';
import { roomRegionAt, type RoomProblem } from '@hestia/engine';
import { formatQuantity, roomsOnLevel, unitsOf, type ResolvedUnits } from '@hestia/model';
import { ToolBase } from './base.ts';
import { interiorPoint, nextRoomNumber, roomDraft } from './roomCreate.ts';
import type { PointerInfo } from './types.ts';

/** Motivo, em português, de o cursor não estar num circuito fechado (`problem` do motor). */
export const ROOM_PROBLEM_TEXT: Record<RoomProblem, string> = {
  fora: 'Fora de circuito fechado: feche o contorno com paredes ou com o Separador de ambiente, depois clique dentro dele.',
  aberto: 'Circuito aberto: há um vão entre as paredes, feche-o para criar o ambiente.',
};

const fmtArea = (u: ResolvedUnits, a: number): string => formatQuantity(u, 'area', a);

/** Intervalo, em ms, em que um segundo clique no mesmo ponto é tratado como o duplo clique do mouse. */
const DUPLO_CLIQUE_MS = 600;

/**
 * Ambiente (Revit: Room). Passe o cursor num circuito fechado de paredes: a região é pré-visualizada com o nome e a
 * área; o clique cria o ambiente no nível ativo (um passo de desfazer). A ferramenta só emite `addRoom`.
 */
export class RoomTool extends ToolBase {
  readonly id = 'room';
  readonly label = 'Ambiente';
  override get hint(): string {
    return this.t('tl_hint_room');
  }
  /** Último clique que criou ambiente (ponto e instante), para reconhecer o duplo clique. */
  private ultimo: { at: Vec2; quando: number } | null = null;

  protected reset(): void {
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return false;
  }

  override move(p: PointerInfo): void {
    this.raw = p.raw;
    this.showAt(p.raw);
  }

  override click(p: PointerInfo): void {
    this.raw = p.raw;
    const project = this.env.project();
    const levelId = this.env.levelId();
    const region = roomRegionAt(project, levelId, p.raw);
    if (!region.polygon) {
      this.items = [{ kind: 'point', at: p.raw }];
      this.env.say(ROOM_PROBLEM_TEXT[region.problem ?? 'fora']);
      return;
    }
    // Duplo clique: o navegador manda dois cliques no mesmo ponto, e o segundo não cria outro ambiente (um Ctrl+Z desfaz o único).
    const agora = Date.now();
    if (this.ultimo && agora - this.ultimo.quando < DUPLO_CLIQUE_MS && dist(this.ultimo.at, p.raw) <= 4 * this.env.metersPerPixel()) return;
    this.ultimo = { at: p.raw, quando: agora };
    const polygon = region.polygon;
    const repeated = roomsOnLevel(project, levelId).some((r) => pointInPolygon(r.point, polygon));
    const draft = roomDraft(project, levelId, p.raw);
    const options = this.env.options();
    const room = {
      ...draft,
      name: options.roomName?.trim() || draft.name,
      number: options.roomNumber?.trim() || draft.number,
      heightOffset: options.roomHeightOffset ?? 0,
      ceilingHeight: options.roomCeilingHeight,
      floorFinish: options.roomFloorFinish ?? '',
      wallFinish: options.roomWallFinish ?? '',
      ceilingFinish: options.roomCeilingFinish ?? '',
      ...(options.roomColor ? { color: options.roomColor } : {}),
    };
    this.env.exec({ type: 'addRoom', room });
    this.env.setSelection([room.id]);
    this.env.say(this.t('tl_msg_room_created', {
      number: room.number,
      area: fmtArea(unitsOf(this.env.project()), polygonArea(polygon)),
      warning: repeated ? this.t('tl_msg_room_repeated') : '',
    }));
    this.items = [];
  }

  /** Pré-visualização: contorno da região (furos tracejados), nome, número e área; fora de circuito, só o motivo. */
  private showAt(at: Vec2): void {
    this.items = [];
    const region = roomRegionAt(this.env.project(), this.env.levelId(), at);
    if (!region.polygon) {
      this.items.push({ kind: 'point', at });
      this.env.say(ROOM_PROBLEM_TEXT[region.problem ?? 'fora']);
      return;
    }
    this.items.push({ kind: 'polygon', ring: region.polygon[0]! });
    for (const h of region.polygon.slice(1)) this.items.push({ kind: 'polygon', ring: h, dashed: true });
    const n = nextRoomNumber(this.env.project(), this.env.levelId());
    const label = interiorPoint(region.polygon) ?? at;
    this.items.push({ kind: 'label', at: label, text: `Ambiente ${n} · ${fmtArea(unitsOf(this.env.project()), polygonArea(region.polygon))}` });
    this.env.say(this.t('tl_msg_room_click'));
  }
}
