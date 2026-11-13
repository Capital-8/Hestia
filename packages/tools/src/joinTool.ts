import { dist, type Vec2 } from '@hestia/geom';
import { joinStatus, levelFrames } from '@hestia/engine';
import { wallThicknessOf, type JoinKind } from '@hestia/model';
import { ToolBase } from './base.ts';
import { execWithHostedLoss } from './hostedGuard.ts';
import { COMPONENT_EDGE_MSG, componentUnderCursor } from './componentTarget.ts';
import { pickAt } from './pick.ts';
import type { PointerInfo } from './types.ts';
import { t as translate, type Lang } from './i18n.ts';

const ORDER: JoinKind[] = ['butt', 'miter'];
const LABEL: Record<JoinKind, string> = { butt: 'Encosto', miter: 'Esquadria' };

/** Rótulo do tipo de junção no idioma da interface. */
const joinLabel = (kind: JoinKind, lang: Lang): string => translate(lang, kind === 'butt' ? 'tl_join_butt' : 'tl_join_miter');

/**
 * Ponto de junção sob o cursor. `pair` tem tipo e dominância (clique alterna, Tab inverte). `tee`, `node` e
 * `disallowed` não têm tipo para alternar: o clique liga/desliga "não unir" na ponta sob o cursor (J-03).
 */
type Node =
  | { at: Vec2; status: 'pair'; ends: Array<{ wallId: string; end: 'a' | 'b' }>; kind: JoinKind; flip: boolean }
  | { at: Vec2; status: 'tee' | 'node' | 'disallowed'; ends: Array<{ wallId: string; end: 'a' | 'b' }>; clicked: { wallId: string; end: 'a' | 'b' }; count: number; hostId?: string };

/** Ferramenta Junção (Revit: Wall Joins): clique num canto para alternar encosto e esquadria; em T ou nó, liga/desliga "não unir". */
export class JoinTool extends ToolBase {
  readonly id = 'joins';
  readonly label = 'Junção';
  override get hint(): string {
    return this.t('tl_hint_join');
  }
  private node: Node | null = null;

  protected reset(): void {
    this.node = null;
    this.items = [];
  }
  protected busy(): boolean {
    return false;
  }

  private find(p: Vec2): Node | null {
    const pr = this.env.project();
    const tol = 12 * this.env.metersPerPixel();
    const frames = levelFrames(pr, this.env.levelId());
    let best: { n: Node; d: number } | null = null;
    for (const f of frames) {
      for (const end of ['a', 'b'] as const) {
        const at = end === 'a' ? f.a : f.b;
        const d = dist(at, p);
        if (d > tol || (best && d >= best.d)) continue;
        const st = joinStatus(frames, f.wall.id, end, pr.settings.joinTolerance);
        const clicked = { wallId: f.wall.id, end };
        let n: Node;
        if (st.kind === 'pair') {
          const ends = [clicked, ...st.partners];
          const other = pr.elements[st.partners[0]!.wallId];
          const mine = f.wall;
          const first = other && other.kind === 'wall' && other.order < mine.order ? other : mine;
          const firstEnd = first === mine ? end : st.partners[0]!.end;
          const cfg = firstEnd === 'a' ? first.joinStart : first.joinEnd;
          n = { at, status: 'pair', ends, kind: cfg.kind, flip: cfg.flip };
        } else if (st.kind === 'tee') {
          n = { at, status: 'tee', ends: [clicked], clicked, count: 2, hostId: st.hostId };
        } else if (st.kind === 'node') {
          n = { at, status: 'node', ends: [clicked, ...st.partners], clicked, count: st.partners.length + 1 };
        } else if (st.kind === 'disallowed') {
          n = { at, status: 'disallowed', ends: [clicked], clicked, count: 1 };
        } else continue;
        best = { n, d };
      }
    }
    return best ? best.n : null;
  }

  override move(p: PointerInfo): void {
    const comp = componentUnderCursor(this.env, p.raw);
    if (comp) {
      this.node = null;
      this.items = [{ kind: 'highlight', ids: [comp.id] }];
      return;
    }
    this.node = this.find(p.raw);
    this.items = [];
    const n = this.node;
    if (!n) return;
    this.items.push({ kind: 'point', at: n.at });
    this.items.push({ kind: 'label', at: n.at, text: this.labelOf(n) });
    this.items.push({ kind: 'highlight', ids: n.ends.map((e) => e.wallId) });
  }

  private labelOf(n: Node): string {
    switch (n.status) {
      case 'pair':
        return `${LABEL[n.kind]}${n.flip ? ' (ordem invertida)' : ''}`;
      case 'tee':
        return 'Em T (encosto fixo) · clique: não unir · Tab: transformar em canto';
      case 'node':
        return `Nó de ${n.count} paredes · clique: não unir esta ponta`;
      case 'disallowed':
        return 'Não unida · clique: unir de novo';
    }
  }

  private apply(kind: JoinKind, flip: boolean): void {
    if (!this.node || this.node.status !== 'pair') return;
    this.env.exec({ type: 'setJoin', ends: this.node.ends, config: { kind, flip } });
    this.node = { ...this.node, kind, flip };
    this.env.say(this.t('tl_msg_join', { type: joinLabel(kind, this.uiLang()), reversed: flip ? this.t('tl_msg_join_reversed') : '' }));
  }

  /** Liga ou desliga "não unir" na ponta clicada (T e nó: limpa a junção dessa ponta; "não unida": religa). */
  private toggleNoJoin(n: Node & { status: 'tee' | 'node' | 'disallowed' }): void {
    const w = this.env.project().elements[n.clicked.wallId];
    if (!w || w.kind !== 'wall') return;
    const key = n.clicked.end === 'a' ? 'noJoinStart' : 'noJoinEnd';
    const off = n.status === 'disallowed';
    this.env.exec({ type: 'updateElements', ids: [w.id], patch: { [key]: !off } });
    this.env.say(off ? 'Ponta unida de novo.' : 'Ponta marcada como não unida.');
  }

  /** Motivo do clique ignorado: ponta sem parceira, meio do vão (cruzamento) ou fora de paredes. */
  private miss(p: Vec2): string {
    const pr = this.env.project();
    const tol = 12 * this.env.metersPerPixel();
    const frames = levelFrames(pr, this.env.levelId());
    for (const f of frames) {
      for (const end of ['a', 'b'] as const) {
        if (dist(end === 'a' ? f.a : f.b, p) > tol) continue;
        const st = joinStatus(frames, f.wall.id, end, pr.settings.joinTolerance);
        if (st.kind === 'node') return 'Clique no canto/ponta onde duas paredes se encontram. Mais de duas paredes neste canto: a junção só atua em cantos de duas paredes.';
        if (st.kind === 'disallowed') return 'Clique no canto/ponta onde duas paredes se encontram. Esta ponta está com a junção desligada.';
        return 'Clique no canto/ponta onde duas paredes se encontram. Esta ponta não tem outra parede para unir.';
      }
    }
    if (pickAt(pr, this.env.levelId(), p, this.env.metersPerPixel())) return 'Clique no canto/ponta onde duas paredes se encontram. No meio do vão não há junção.';
    return 'Clique no canto/ponta onde duas paredes se encontram.';
  }

  override click(p: PointerInfo): void {
    if (componentUnderCursor(this.env, p.raw)) {
      this.env.say(COMPONENT_EDGE_MSG);
      return;
    }
    this.node = this.find(p.raw);
    const n = this.node;
    if (!n) {
      this.env.say(this.miss(p.raw));
      return;
    }
    if (n.status === 'pair') this.apply(ORDER[(ORDER.indexOf(n.kind) + 1) % ORDER.length]!, n.flip);
    else this.toggleNoJoin(n);
    this.move(p);
  }

  override tab(): void {
    if (this.node?.status === 'pair') this.apply(this.node.kind, !this.node.flip);
    else if (this.node?.status === 'tee') this.toCorner(this.node);
  }

  /**
   * T em canto (J-03): leva a ponta até a extremidade da outra parede, se a geometria permitir. "Permitir" aqui é a
   * ponta estar a até duas espessuras dessa extremidade; mais longe, o T está no meio do vão e não vira canto.
   */
  private toCorner(n: { clicked: { wallId: string; end: 'a' | 'b' }; hostId?: string }): void {
    const pr = this.env.project();
    const wall = pr.elements[n.clicked.wallId];
    const host = n.hostId ? pr.elements[n.hostId] : undefined;
    if (!wall || wall.kind !== 'wall' || !host || host.kind !== 'wall') return;
    const hostFrame = levelFrames(pr, this.env.levelId()).find((f) => f.wall.id === host.id);
    if (!hostFrame) return;
    const at = n.clicked.end === 'a' ? wall.a : wall.b;
    const ends = [hostFrame.a, hostFrame.b];
    const near = ends.reduce((best, e) => (dist(e, at) < dist(best, at) ? e : best));
    const hostType = pr.wallTypes[host.typeId];
    const reach = 2 * (hostType ? wallThicknessOf(hostType) : 0);
    if (dist(near, at) > reach) {
      this.env.say(this.t('tl_msg_join_far'));
      return;
    }
    const result = execWithHostedLoss(this.env, 'Transformar T em canto', [{ type: 'setWallEnds', id: wall.id, [n.clicked.end]: near }]);
    if (result.status === 'cancelled') return;
    this.env.say(result.status === 'pending' ? 'Confirme o diálogo para aplicar.' : 'T transformado em canto.');
    this.move({ raw: near, shift: false, ctrl: false, alt: false });
  }
}
