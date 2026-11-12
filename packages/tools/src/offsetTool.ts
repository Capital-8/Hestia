import { cross, mul, offsetArc, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall, normalAt, toLocal } from '@hestia/engine';
import { formatQuantity, isRamp, isStair, isWall, unitsOf, type Id, type ResolvedUnits, type StairCurve } from '@hestia/model';
import { ToolBase } from './base.ts';
import { avisaGuardaCorpoHospedado, deslocarCaminho, deslocarGuardaCorpo, ladoDoCursor, manualDe } from './guardaCorpoEdicao.ts';
import { pickRailingAt } from './railingPick.ts';
import { copyWalls, ghostBands, moveWalls } from './edit.ts';
import { commitRingEdit, edgeAtCursor, ringOfRef } from './ringTarget.ts';
import { COMPONENT_EDGE_MSG, componentUnderCursor } from './componentTarget.ts';
import { componentEdgeAt, componentEdgeCurve, type ComponentEdgePick } from './componentEdge.ts';
import { offsetEdge as offsetComponentEdgeCommand } from './componentEdit.ts';
import { offsetComponentEdge } from './componentOps.ts';
import { ringOps } from './ringOps.ts';
import type { EdgePick } from './ringEdge.ts';
import type { PointerInfo } from './types.ts';

const fmtM = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/** Deslocar: copia ou move uma parede paralelamente, para o lado do cursor (concêntrico nas curvas). */
export class OffsetTool extends ToolBase {
  readonly id = 'offset';
  readonly label = 'Deslocar';
  override get hint(): string {
    return this.t('tl_hint_offset');
  }

  protected reset(): void {
    this.items = [];
  }
  protected busy(): boolean {
    return false;
  }

  /**
   * Aresta deslocada para o lado do cursor: sinal pelo produto vetorial (cursor à esquerda de a→b = +dist, como
   * ringOps.offsetEdge). `next` é o anel inteiro já editado; `a`/`b` são os vértices novos da aresta.
   */
  private edgeOffset(pick: EdgePick, at: Vec2): { signed: number; next: Vec2[]; a: Vec2; b: Vec2 } | null {
    const ring = ringOfRef(this.env.project(), pick.ref);
    if (!ring) return null;
    const dist0 = this.env.options().offsetDistance;
    const signed = cross(sub(pick.b, pick.a), sub(at, pick.a)) > 0 ? dist0 : -dist0;
    const next = ringOps.offsetEdge(ring, pick.ref.index, signed);
    const j = (pick.ref.index + 1) % ring.length;
    return { signed, next, a: next[pick.ref.index]!, b: next[j]! };
  }

  /** Aresta do croqui de escada/rampa deslocada para o lado do cursor (prévia pura, sem gravar). */
  private componentOffset(pick: ComponentEdgePick, at: Vec2): { signed: number; curve: StairCurve } | null {
    const e = this.env.project().elements[pick.ref.elementId];
    if (!isStair(e) && !isRamp(e)) return null;
    const dist0 = this.env.options().offsetDistance;
    const signed = cross(sub(pick.b, pick.a), sub(at, pick.a)) > 0 ? dist0 : -dist0;
    const next = offsetComponentEdge(e, pick.ref, signed);
    const curve = next ? componentEdgeCurve(next, pick.ref) : null;
    return curve ? { signed, curve } : null;
  }

  private target(p: Vec2): { id: Id; d: Vec2; arc: { a: Vec2; b: Vec2; sag: number } | null } | null {
    const pr = this.env.project();
    let best: { id: Id; dist: number; half: number; n: Vec2; side: number } | null = null;
    for (const e of Object.values(pr.elements)) {
      if (!isWall(e) || e.levelId !== this.env.levelId()) continue;
      const f = frameOfWall(pr, e.id);
      if (!f) continue;
      const l = toLocal(f, p);
      if (l.t < 0 || l.t > f.length) continue;
      const dd = Math.abs(l.s - f.sMid);
      const n = f.arc ? normalAt(f, l.t) : f.n;
      if (!best || dd < best.dist) best = { id: e.id, dist: dd, half: f.thickness / 2, n, side: l.s - f.sMid };
    }
    // Tolerância de cursor (5 px), não de projeto: o clique numa escada não pode pegar uma parede a metros daqui.
    if (!best || best.dist > best.half + 5 * this.env.metersPerPixel()) return null;
    const dist0 = this.env.options().offsetDistance;
    const sign = best.side >= 0 ? 1 : -1;
    const w = pr.elements[best.id];
    const arc = isWall(w) && Math.abs(w.sag) > 1e-6 ? offsetArc(w.a, w.b, w.sag, sign * dist0) : null;
    return { id: best.id, d: mul(best.n, sign * dist0), arc };
  }

  /** Guarda-corpo sob o cursor: manual (com o deslocamento assinado) ou hospedado (só aviso). */
  private railing(at: Vec2): { id: Id; manual: boolean; signed: number } | null {
    const pr = this.env.project();
    const id = pickRailingAt(pr, this.env.levelId(), at, this.env.metersPerPixel());
    if (!id) return null;
    const g = manualDe(pr, id);
    if (!g) return { id, manual: false, signed: 0 };
    const lado = ladoDoCursor(g.hospedeiro.caminho, g.hospedeiro.fechado, at);
    return { id, manual: true, signed: lado * this.env.options().offsetDistance };
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.raw = p.raw;
    const rail = this.railing(p.raw);
    if (rail) {
      this.items.push({ kind: 'highlight', ids: [rail.id] });
      const g = rail.manual ? manualDe(this.env.project(), rail.id) : null;
      if (g) {
        const pts = deslocarCaminho(g.hospedeiro.caminho, rail.signed, g.hospedeiro.fechado);
        const n = g.hospedeiro.fechado ? pts.length : pts.length - 1;
        for (let i = 0; i < n; i++) this.items.push({ kind: 'line', a: pts[i]!, b: pts[(i + 1) % pts.length]!, dashed: true });
      }
      return;
    }
    const compEdge = componentEdgeAt(this.env, p.raw);
    if (compEdge) {
      this.items.push({ kind: 'highlight', ids: [compEdge.ref.elementId] });
      const off = this.componentOffset(compEdge, p.raw);
      if (off) {
        this.items.push({ kind: 'line', a: compEdge.a, b: compEdge.b });
        this.items.push({ kind: 'line', a: off.curve.a, b: off.curve.b, dashed: true });
        const mid = { x: (off.curve.a.x + off.curve.b.x) / 2, y: (off.curve.a.y + off.curve.b.y) / 2 };
        this.items.push({ kind: 'label', at: mid, text: fmtM(unitsOf(this.env.project()), Math.abs(off.signed)) });
      }
      return;
    }
    const comp = componentUnderCursor(this.env, p.raw);
    if (comp) {
      // Não cai no deslocamento de parede: a escada/rampa é do croqui.
      this.items.push({ kind: 'highlight', ids: [comp.id] });
      return;
    }
    const edge = edgeAtCursor(this.env, p.raw);
    if (edge) {
      const off = this.edgeOffset(edge, p.raw);
      if (!off) return;
      this.items.push({ kind: 'highlight', ids: [edge.ref.elementId] });
      this.items.push({ kind: 'line', a: edge.a, b: edge.b });
      this.items.push({ kind: 'line', a: off.a, b: off.b, dashed: true });
      this.items.push({ kind: 'label', at: { x: (off.a.x + off.b.x) / 2, y: (off.a.y + off.b.y) / 2 }, text: fmtM(unitsOf(this.env.project()), Math.abs(off.signed)) });
      return;
    }
    const t = this.target(p.raw);
    if (!t) return;
    this.items.push({ kind: 'highlight', ids: [t.id] });
    const f = frameOfWall(this.env.project(), t.id);
    if (t.arc && f) this.items.push({ kind: 'wallBand', a: t.arc.a, b: t.arc.b, thickness: f.thickness, sMid: f.sMid, sag: t.arc.sag });
    else this.items.push(...ghostBands(this.env.project(), [t.id], { kind: 'translate', d: t.d }));
  }

  override click(p: PointerInfo): void {
    const rail = this.railing(p.raw);
    if (rail) {
      if (!rail.manual) avisaGuardaCorpoHospedado(this.env);
      else deslocarGuardaCorpo(this.env, rail.id, rail.signed, this.env.options().offsetCopy);
      return;
    }
    const compEdge = componentEdgeAt(this.env, p.raw);
    if (compEdge) {
      if (this.env.options().offsetCopy) {
        this.env.say(this.t('tl_msg_offset_edge_copy'));
        return;
      }
      const off = this.componentOffset(compEdge, p.raw);
      if (!off) {
        this.env.say('A aresta do croqui não pode ser deslocada neste ponto.');
        return;
      }
      const r = offsetComponentEdgeCommand(this.env, compEdge.ref, off.signed);
      if (!r.ok) this.env.say(r.error);
      return;
    }
    if (componentUnderCursor(this.env, p.raw)) {
      this.env.say(COMPONENT_EDGE_MSG);
      return;
    }
    const edge = edgeAtCursor(this.env, p.raw);
    if (edge) {
      if (this.env.options().offsetCopy) {
        this.env.say(this.t('tl_msg_offset_edge_copy'));
        return;
      }
      const off = this.edgeOffset(edge, p.raw);
      if (!off) return;
      this.env.transaction('Deslocar aresta', () => {
        commitRingEdit(this.env, edge.ref, off.next);
      });
      return;
    }
    const t = this.target(p.raw);
    if (!t) return;
    const copy = this.env.options().offsetCopy;
    if (!t.arc) {
      if (copy) this.env.transaction('Deslocar e copiar', () => copyWalls(this.env, [t.id], { kind: 'translate', d: t.d }));
      else moveWalls(this.env, [t.id], t.d);
      return;
    }
    const patch = { a: t.arc.a, b: t.arc.b, sag: t.arc.sag };
    if (copy) {
      this.env.transaction('Deslocar e copiar', () => {
        const [nid] = copyWalls(this.env, [t.id], { kind: 'translate', d: { x: 0, y: 0 } });
        if (nid) this.env.exec({ type: 'updateElements', ids: [nid], patch });
      });
    } else this.env.exec({ type: 'updateElements', ids: [t.id], patch });
  }
}
