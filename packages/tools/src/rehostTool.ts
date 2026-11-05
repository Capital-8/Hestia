import { formatQuantity, openingTypeById, isOpening, isWall, unitsOf, wallLength, type Id } from '@hestia/model';
import { ToolBase } from './base.ts';
import { closestOnWall } from './wallGeom.ts';
import { pickAt } from './pick.ts';
import type { PointerInfo } from './types.ts';

const DEFAULT_WIDTH = 0.8;

/**
 * Trocar a parede anfitriã (D7). 1º clique: a abertura (ou a já selecionada). 2º clique: a nova parede;
 * a abertura vai para o ponto da parede mais próximo do clique. Erros (não cabe, sobreposição, outro nível)
 * aparecem na barra de status e nada muda. A ferramenta continua ativa para a próxima troca.
 */
export class RehostTool extends ToolBase {
  readonly id = 'rehost';
  readonly label = 'Trocar anfitriã';
  override get hint(): string {
    return this.t('tl_hint_rehost');
  }
  private openingId: Id | null = null;

  protected reset(): void {
    this.openingId = null;
    this.items = [];
  }
  protected busy(): boolean {
    return this.openingId !== null;
  }

  override start(): void {
    this.reset();
    const sel = this.env.selection();
    const e = sel.length === 1 ? this.env.project().elements[sel[0]!] : undefined;
    if (isOpening(e)) {
      this.openingId = e.id;
      this.env.say('Clique na nova parede para a abertura selecionada.');
    } else this.env.say(this.hint);
  }

  /** Parede sob o cursor; uma abertura conta como a parede que a hospeda. */
  private wallUnder(p: PointerInfo): Id | null {
    const pr = this.env.project();
    const hit = pickAt(pr, this.env.levelId(), p.raw, this.env.metersPerPixel());
    if (!hit) return null;
    const e = pr.elements[hit.id];
    if (isWall(e)) return e.id;
    return isOpening(e) ? e.hostId : null;
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.raw = p.raw;
    const pr = this.env.project();
    if (!this.openingId) {
      const hit = pickAt(pr, this.env.levelId(), p.raw, this.env.metersPerPixel());
      if (hit && isOpening(pr.elements[hit.id])) this.items.push({ kind: 'highlight', ids: [hit.id] });
      return;
    }
    const wallId = this.wallUnder(p);
    const w = wallId ? pr.elements[wallId] : undefined;
    if (!wallId || !isWall(w)) return;
    this.items.push({ kind: 'highlight', ids: [wallId] });
    const at = closestOnWall(w, p.raw);
    this.items.push({ kind: 'point', at: at.point });
    this.items.push({ kind: 'label', at: at.point, text: `${formatQuantity(unitsOf(pr), 'length', at.t)} do início` });
  }

  override click(p: PointerInfo): void {
    const pr = this.env.project();
    if (!this.openingId) {
      const hit = pickAt(pr, this.env.levelId(), p.raw, this.env.metersPerPixel());
      if (!hit || !isOpening(pr.elements[hit.id])) {
        this.env.say('Clique numa porta ou janela para trocar a parede dela.');
        return;
      }
      this.openingId = hit.id;
      this.env.say('Agora clique na nova parede.');
      return;
    }
    const opening = pr.elements[this.openingId];
    if (!isOpening(opening)) {
      this.reset();
      this.env.say(this.hint);
      return;
    }
    const wallId = this.wallUnder(p);
    const w = wallId ? pr.elements[wallId] : undefined;
    if (!wallId || !isWall(w)) {
      this.env.say('Clique numa parede para trocar a anfitriã.');
      return;
    }
    const width = openingTypeById(pr, opening.typeId)?.width ?? DEFAULT_WIDTH;
    const len = wallLength(w);
    if (len < width) {
      this.env.say(this.t('tl_msg_rehost_no_fit'));
      return;
    }
    // Posição mais próxima do clique, com o vão inteiro dentro da parede.
    const t = closestOnWall(w, p.raw).t;
    const offset = Math.min(len - width / 2, Math.max(width / 2, t));
    const id = this.openingId;
    try {
      this.env.exec({ type: 'setOpeningHost', id, hostId: wallId, offset });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : 'Não foi possível trocar a parede.');
      return;
    }
    this.reset();
    this.env.say('Abertura passou para a nova parede. Escolha outra abertura, ou Esc para sair.');
  }
}
