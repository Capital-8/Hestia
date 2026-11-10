import { pointInRing, type Vec2 } from '@hestia/geom';
import { formatQuantity, isFloor, isOpening, isRoof, isSlab, isWall, makeFloor, makeSlab, unitsOf, type Floor, type Id, type ResolvedUnits, type Slab, type Wall } from '@hestia/model';
import { frameOfWall, pointAt, toLocal } from '@hestia/engine';
import { ToolBase, makeId } from './base.ts';
import { avisaGuardaCorpoHospedado, dividirCaminho, dividirGuardaCorpo, manualDe } from './guardaCorpoEdicao.ts';
import { pickRailingAt } from './railingPick.ts';
import { parseQuantityText } from './numeric.ts';
import { pickAt } from './pick.ts';
import { pickFloorAt } from './floorPick.ts';
import { pickSlabAt } from './slabPick.ts';
import { commitRingEdit, pickLineTarget, ringOfRef } from './ringTarget.ts';
import { COMPONENT_EDGE_MSG, componentUnderCursor } from './componentTarget.ts';
import { componentEdgeAt } from './componentEdge.ts';
import { splitEdge as splitComponentEdgeCommand } from './componentEdit.ts';
import { ringOps } from './ringOps.ts';
import { roofRingPatch } from './roofEdges.ts';
import { commitRoofPatch } from './roofCheck.ts';
import { OUTLINE_LOCKED_MSG } from './outlineEdit.ts';
import { splitRingByLine } from './splitRing.ts';
import type { EdgePick } from './ringEdge.ts';
import type { PointerInfo } from './types.ts';

const SNAP_PX = 10;
/** Ponto de corte: distância `t` ao longo da parede, medida a partir de `a`. */
interface Cut {
  wallId: Id;
  t: number;
  at: Vec2;
  snapped: boolean;
}

/** Primeiro clique de Dividir piso/laje: o elemento e o ponto A sobre ele. */
interface SlabStart {
  id: Id;
  at: Vec2;
}

const fmt = (u: ResolvedUnits, m: number): string => formatQuantity(u, 'length', m);

/**
 * Dividir (Revit: Split Element / Split with Gap). Parede: clique no ponto de corte; Tab alterna o modo "com intervalo"
 * (dois cliques delimitam o trecho removido); digitar uma distância e Enter corta a essa medida do início da parede em
 * destaque. Aresta de piso, laje, telhado ou forro: clique insere um vértice naquele ponto. Piso ou laje: dois cliques
 * (A e B) dividem o elemento em dois pela linha A→B.
 */
export class SplitTool extends ToolBase {
  readonly id = 'split';
  readonly label = 'Dividir';
  override get hint(): string {
    return this.t('tl_hint_split');
  }
  private hoverId: Id | null = null;
  private gapStart: Cut | null = null;
  private slabStart: SlabStart | null = null;
  private withGap = false;

  protected reset(): void {
    this.hoverId = null;
    this.gapStart = null;
    this.slabStart = null;
    this.items = [];
    this.inf = null;
  }

  protected busy(): boolean {
    return this.gapStart !== null || this.slabStart !== null;
  }

  override tab(): void {
    this.withGap = !this.withGap;
    this.gapStart = null;
    this.slabStart = null;
    this.items = [];
    this.env.say(this.withGap ? 'Com intervalo: clique no início e no fim do trecho a remover.' : this.hint);
  }

  override inputPrompt(): string | null {
    return this.hoverId && !this.withGap ? this.t('tl_inp_seg_offset') : null;
  }

  /** Parede sob o cursor; uma abertura conta como a parede que a hospeda. */
  private wallAt(p: PointerInfo): Wall | null {
    const pr = this.env.project();
    const hit = pickAt(pr, this.env.levelId(), p.raw, this.env.metersPerPixel());
    if (!hit) return null;
    const el = pr.elements[hit.id];
    const host = isOpening(el) ? pr.elements[el.hostId] : el;
    return isWall(host) ? host : null;
  }

  /** Piso ou laje sob o cursor (dentro ou sobre a borda), pelos mesmos critérios de pickFloorAt e pickSlabAt. */
  private slabLikeAt(p: PointerInfo): Id | null {
    const pr = this.env.project();
    const levelId = this.env.levelId();
    const mpp = this.env.metersPerPixel();
    return pickFloorAt(pr, levelId, p.raw, mpp) ?? pickSlabAt(pr, levelId, p.raw, mpp);
  }

  /** Motivo para não dividir o piso ou a laje, ou null se pode dividir. */
  private blockReason(el: Floor | Slab): string | null {
    if (el.outlineSource?.linked) return OUTLINE_LOCKED_MSG;
    return null;
  }

  /** Projeta o cursor no eixo da parede (reta ou arco) e arredonda à grade quando está perto. Null fora do miolo. */
  private cutOn(w: Wall, raw: Vec2): Cut | null {
    const f = frameOfWall(this.env.project(), w.id);
    if (!f || f.length < 1e-9) return null;
    const L = f.length;
    let t = toLocal(f, raw).t;
    if (t <= 0 || t >= L) return null;
    const g = this.env.gridStep();
    const near = g > 0 ? Math.round(t / g) * g : t;
    let snapped = false;
    if (near > 0 && near < L && Math.abs(near - t) <= SNAP_PX * this.env.metersPerPixel()) {
      t = near;
      snapped = true;
    }
    return { wallId: w.id, t, at: pointAt(f, t, 0), snapped };
  }

  override move(p: PointerInfo): void {
    this.items = [];
    this.inf = null;
    if (this.slabStart) {
      this.hoverId = null;
      this.items.push({ kind: 'highlight', ids: [this.slabStart.id] });
      this.items.push({ kind: 'point', at: this.slabStart.at });
      this.items.push({ kind: 'line', a: this.slabStart.at, b: p.raw, dashed: true });
      return;
    }
    const compEdge = componentEdgeAt(this.env, p.raw);
    if (compEdge) {
      this.hoverId = null;
      this.items.push({ kind: 'highlight', ids: [compEdge.ref.elementId] }, { kind: 'point', at: compEdge.at });
      this.inf = { point: compEdge.at, kind: 'nearest', guides: [] };
      return;
    }
    const railId = this.withGap ? null : pickRailingAt(this.env.project(), this.env.levelId(), p.raw, this.env.metersPerPixel());
    const railManual = railId ? manualDe(this.env.project(), railId) : null;
    if (railId) {
      this.hoverId = null;
      this.items.push({ kind: 'highlight', ids: [railId] });
      if (railManual) {
        const r = dividirCaminho(railManual.hospedeiro, p.raw);
        const at = r?.primeiro[r.primeiro.length - 1];
        if (at) {
          this.items.push({ kind: 'point', at });
          this.inf = { point: at, kind: 'nearest', guides: [] };
        }
      }
      return;
    }
    const w = this.wallAt(p);
    this.hoverId = w?.id ?? null;
    if (!w) {
      this.moveNonWall(p);
      return;
    }
    this.items.push({ kind: 'highlight', ids: [w.id] });
    if (this.gapStart && this.gapStart.wallId !== w.id) this.items.push({ kind: 'highlight', ids: [this.gapStart.wallId] });
    const cut = this.cutOn(w, p.raw);
    if (!cut) return;
    this.inf = { point: cut.at, kind: cut.snapped ? 'grid' : 'nearest', guides: [] };
    if (this.gapStart && this.gapStart.wallId === w.id) {
      this.items.push({ kind: 'point', at: this.gapStart.at });
      this.items.push({ kind: 'line', a: this.gapStart.at, b: cut.at, dashed: true });
      this.items.push({ kind: 'label', at: cut.at, text: `intervalo ${fmt(unitsOf(this.env.project()), Math.abs(cut.t - this.gapStart.t))}` });
      return;
    }
    this.items.push({ kind: 'point', at: cut.at });
    this.items.push({ kind: 'label', at: cut.at, text: `a ${fmt(unitsOf(this.env.project()), cut.t)} do início do trecho` });
  }

  /** Sem parede sob o cursor: aresta de anel (Dividir aresta) ou piso/laje (para a divisão em dois cliques). */
  private moveNonWall(p: PointerInfo): void {
    if (this.withGap) return;
    const target = pickLineTarget(this.env.project(), this.env.levelId(), p.raw, this.env.metersPerPixel());
    if (target?.kind === 'edge') {
      this.items.push({ kind: 'highlight', ids: [target.pick.ref.elementId] });
      this.items.push({ kind: 'point', at: target.pick.at });
      this.inf = { point: target.pick.at, kind: 'nearest', guides: [] };
      return;
    }
    const id = this.slabLikeAt(p);
    if (id) this.items.push({ kind: 'highlight', ids: [id] });
  }

  override click(p: PointerInfo): void {
    if (this.slabStart) {
      this.finishSlabSplit(p.raw);
      return;
    }
    const compEdge = componentEdgeAt(this.env, p.raw);
    if (compEdge) {
      if (this.withGap) {
        this.env.say(this.t('tl_msg_gap_walls_only'));
        return;
      }
      const r = splitComponentEdgeCommand(this.env, compEdge.ref, p.raw);
      if (r.ok) this.env.say('Vértice inserido na aresta do croqui.');
      else this.env.say(r.error);
      this.reset();
      return;
    }
    // A linha da escada/rampa não é aresta de piso: dividir aqui cortaria o piso por baixo sem o usuário ver.
    if (componentUnderCursor(this.env, p.raw)) {
      this.env.say(COMPONENT_EDGE_MSG);
      return;
    }
    const railId = this.withGap ? null : pickRailingAt(this.env.project(), this.env.levelId(), p.raw, this.env.metersPerPixel());
    if (railId) {
      if (!manualDe(this.env.project(), railId)) avisaGuardaCorpoHospedado(this.env);
      else if (dividirGuardaCorpo(this.env, railId, p.raw)) this.env.say(this.t('tl_msg_railing_split'));
      else this.env.say(this.t('tl_msg_railing_split_end'));
      this.reset();
      return;
    }
    const w = this.wallAt(p);
    if (!w) {
      this.clickNonWall(p);
      return;
    }
    const cut = this.cutOn(w, p.raw);
    if (!cut) {
      this.env.say('Clique no miolo da parede, longe das extremidades.');
      return;
    }
    if (!this.withGap) {
      this.split(w.id, cut.t, 0);
      this.reset();
      return;
    }
    if (!this.gapStart) {
      this.gapStart = cut;
      this.env.say('Agora clique no fim do trecho a remover.');
      return;
    }
    if (this.gapStart.wallId !== w.id) {
      this.env.say('Os dois cliques devem ser na mesma parede.');
      return;
    }
    const start = this.gapStart;
    this.split(w.id, (start.t + cut.t) / 2, Math.abs(cut.t - start.t));
    this.reset();
  }

  /** Clique sem parede: aresta de anel insere vértice; piso ou laje começa a divisão em dois cliques. */
  private clickNonWall(p: PointerInfo): void {
    if (this.withGap) {
      this.env.say('Clique sobre uma parede.');
      return;
    }
    const pr = this.env.project();
    const target = pickLineTarget(pr, this.env.levelId(), p.raw, this.env.metersPerPixel());
    if (target?.kind === 'edge') {
      this.splitEdge(target.pick);
      return;
    }
    const id = this.slabLikeAt(p);
    if (!id) {
      this.env.say('Clique sobre uma parede, aresta ou piso.');
      return;
    }
    const el = pr.elements[id];
    if (!(isFloor(el) || isSlab(el))) return;
    const blocked = this.blockReason(el);
    if (blocked) {
      this.env.say(blocked);
      return;
    }
    this.slabStart = { id, at: p.raw };
    this.env.say('Agora clique no segundo ponto da linha de divisão.');
  }

  /** Insere um vértice no ponto da aresta sob o cursor. Telhado acompanha o vetor por aresta (inclinação e balanço). */
  private splitEdge(pick: EdgePick): void {
    const pr = this.env.project();
    const ring = ringOfRef(pr, pick.ref);
    const e = pr.elements[pick.ref.elementId];
    if (!ring || !e) return;
    const next = ringOps.insertVertex(ring, pick.ref.index, pick.at);
    if (isRoof(e) && pick.ref.hole === null) {
      if (commitRoofPatch(this.env, [e.id], roofRingPatch(e, next, { kind: 'insert', edge: pick.ref.index }), this.env.lang?.() ?? 'pt')) this.env.say('Vértice inserido na aresta do telhado.');
      this.reset();
      return;
    }
    if (commitRingEdit(this.env, pick.ref, next)) this.env.say('Vértice inserido na aresta.');
    this.reset();
  }

  /** Segundo clique de Dividir piso/laje: corta o contorno pela linha A→B e cria o segundo elemento no mesmo passo de desfazer. */
  private finishSlabSplit(b: Vec2): void {
    const start = this.slabStart;
    this.reset();
    if (!start) return;
    const pr = this.env.project();
    const el = pr.elements[start.id];
    if (!(isFloor(el) || isSlab(el))) return;
    const blocked = this.blockReason(el);
    if (blocked) {
      this.env.say(blocked);
      return;
    }
    const parts = splitRingByLine(el.boundary, start.at, b);
    if (!parts) {
      this.env.say('A linha precisa cruzar o contorno em dois pontos.');
      return;
    }
    const [first, second] = parts;
    const floor = isFloor(el);
    // Furo fica na parte que contém o seu centro; furo que a linha corta é descartado (não há como dividi-lo).
    const holesOf = (ring: Vec2[]): Vec2[][] => el.holes.filter((h) => pointInRing(centroidOf(h), ring));
    const firstHoles = holesOf(first);
    const secondHoles = holesOf(second);
    const cut = el.holes.length - firstHoles.length - secondHoles.length;
    try {
      this.env.transaction(floor ? 'Dividir piso' : 'Dividir laje', () => {
        // Caimento é um plano: as duas partes mantêm a mesma inclinação.
        const common = { typeId: el.typeId, levelId: el.levelId, boundary: second, holes: secondHoles, heightOffset: el.heightOffset, mark: el.mark, comments: el.comments };
        if (isFloor(el)) this.env.exec({ type: 'addFloor', floor: makeFloor({ ...common, id: makeId('f') }) });
        else this.env.exec({ type: 'addSlab', slab: makeSlab({ ...common, slope: el.slope, id: makeId('l') }) });
        this.env.exec({ type: 'updateElements', ids: [el.id], patch: { boundary: first, holes: firstHoles } });
      });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : 'Não foi possível dividir o elemento.');
      return;
    }
    const msg = floor ? 'Piso dividido em dois' : 'Laje dividida em duas';
    this.env.say(cut > 0 ? `${msg}. ${cut} furo(s) cortado(s) pela linha foram removidos.` : `${msg}.`);
  }

  override type(text: string): boolean {
    if (this.withGap || !this.hoverId) return false;
    const v = parseQuantityText(text, unitsOf(this.env.project()), 'length');
    if (v === null) {
      this.env.say('Valor inválido. Digite a distância em metros, medida desde o início do trecho sob o cursor.');
      return false;
    }
    if (!this.split(this.hoverId, v, 0)) return false;
    this.reset();
    return true;
  }

  /** Executa o corte como um único passo de desfazer. Devolve false e mostra o motivo se o modelo recusar. */
  private split(wallId: Id, t: number, gap: number): boolean {
    try {
      this.env.exec({ type: 'splitWall', id: wallId, newId: makeId('w'), t, gap });
    } catch (e) {
      this.env.say(e instanceof Error ? e.message : 'Não foi possível dividir a parede.');
      return false;
    }
    this.env.say(gap > 0
      ? this.t('tl_msg_wall_split_gap', { d: fmt(unitsOf(this.env.project()), gap) })
      : this.t('tl_msg_wall_split', { d: fmt(unitsOf(this.env.project()), t) }));
    return true;
  }
}

/** Média dos vértices: centro de referência de um furo para saber em qual parte do piso ele cai. */
function centroidOf(ring: Vec2[]): Vec2 {
  const n = ring.length;
  return { x: ring.reduce((s, q) => s + q.x, 0) / n, y: ring.reduce((s, q) => s + q.y, 0) / n };
}
