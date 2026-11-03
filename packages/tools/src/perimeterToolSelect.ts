import type { SketchDraft, Vec2 } from '@hestia/geom';
import { SELECT_PX, boxSelection, hitSeg } from './perimeterToolPick.ts';
import { selectSegsMode, type SelectionMode } from './perimeterSession.ts';
import type { PointerInfo } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

/** Retângulo de seleção em arraste: `window` (da esquerda para a direita) pega só as linhas inteiras. */
export interface SelectionBox {
  a: Vec2;
  b: Vec2;
  window: boolean;
}

/** Modo da seleção pelo clique ou pela janela: Ctrl subtrai, Shift soma, sem modificador substitui. */
export function selectionModeOf(p: Pick<PointerInfo, 'shift' | 'ctrl'>): SelectionMode {
  if (p.ctrl) return 'subtract';
  return p.shift ? 'add' : 'replace';
}

/** O que a caixa precisa da ferramenta dona: rascunho, tolerância, troca da seleção e aviso. */
export interface SelectHost {
  draft(): SketchDraft;
  mpp(): number;
  /** Troca só a seleção, sem passo de desfazer. */
  replace(next: SketchDraft): void;
  say(msg: string): void;
  /** Idioma da interface (ausente = português). */
  lang?(): Lang;
}

/**
 * Janela de seleção do esboço: começa no vazio no `down`, acompanha o cursor no `drag` e aplica no `up`. Um arrasto só
 * vale depois de o controlador reconhecer movimento (o `drag`), então o clique no vazio continua limpando a seleção.
 */
export class BoxSelection {
  private box: (SelectionBox & { moved: boolean }) | null = null;

  constructor(private readonly h: SelectHost) {}

  /** Caixa a desenhar; null antes do arrasto e depois de soltar. */
  current(): SelectionBox | null {
    const b = this.box;
    return b && b.moved ? { a: b.a, b: b.b, window: b.window } : null;
  }

  active(): boolean {
    return this.box !== null;
  }

  reset(): void {
    this.box = null;
  }

  /** Começa a caixa se o clique não está numa linha. */
  down(p: PointerInfo): void {
    if (hitSeg(this.h.draft().segs, p.raw, SELECT_PX * this.h.mpp())) return;
    this.box = { a: p.raw, b: p.raw, window: true, moved: false };
  }

  drag(p: PointerInfo): void {
    const b = this.box;
    if (!b) return;
    this.box = { a: b.a, b: p.raw, window: p.raw.x >= b.a.x, moved: true };
  }

  /** Solta a caixa. Devolve false se não houve arrasto (o clique segue o caminho normal). */
  up(p: PointerInfo): boolean {
    const b = this.box;
    if (!b) return false;
    this.box = null;
    if (!b.moved) return false;
    const d = this.h.draft();
    const ids = boxSelection(d.segs, b.a, p.raw);
    const next = selectSegsMode(d, ids, selectionModeOf(p));
    this.h.replace(next);
    const lang = this.h.lang?.() ?? 'pt';
    if (ids.length === 0) this.h.say(translate(lang, selectionModeOf(p) === 'replace' ? 'tl_msg_window_empty_cleared' : 'tl_msg_window_empty_kept'));
    else this.h.say(translate(lang, 'tl_msg_window_count', { n: ids.length, selected: next.selected.length }));
    return true;
  }
}
