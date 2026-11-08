import { add, dist, sagFromThreePoints, sub, type Vec2 } from '@hestia/geom';
import { frameOfWall } from '@hestia/engine';
import { ceilingOutline } from '@hestia/engine';
import { formatQuantity, isCeiling, isFloor, isRoof, isSlab, isWall, levelRoomSeparators, roomSeparatorIssue, unitsOf, type Command, type Id, type Project } from '@hestia/model';
import type { InferContext } from './infer.ts';
import { followingEnds, gripAt, MIN_WALL_LENGTH, type Grip } from './pick.ts';
import { langOf, t as translate } from './i18n.ts';
import { floorGripAt, ringInsertAfter, ringMoveVertex } from './floorPick.ts';
import { slabGripAt } from './slabPick.ts';
import { edgeGripPoint, roofGripAt } from './roofPick.ts';
import { roofSagHold } from './roofSagGrip.ts';
import { roofRingPatch } from './roofEdges.ts';
import { commitRoofPatch } from './roofCheck.ts';
import { ceilingGripAt } from './ceilingPick.ts';
import { commitCeilingBoundary, commitOutlineBoundary } from './outlineEdit.ts';
import { slopeArrowLength, slopePreview } from './slabSlope.ts';
import { moveRoomSeparatorEnd, roomSeparatorGripAt, type RoomSeparatorGrip } from './roomSeparatorPick.ts';
import { stairGripAt, stairHold } from './stairGrips.ts';
import { stairFreeGripAt, stairFreeHold } from './stairFreeGrips.ts';
import { rampGripAt, rampHold } from './rampGrips.ts';
import { railingGripAt, railingHandlePreview, railingHold } from './guardaCorpoGrips.ts';
import { spiralGripAt, spiralHold } from './stairSpiralGrips.ts';
import { gridGripProvider } from './gridGripHold.ts';
import type { PointerInfo, PreviewItem, ToolEnv } from './types.ts';
import { execWithHostedLoss } from './hostedGuard.ts';

/** Vértice de contorno em foco (clicado com a alça): o Delete o remove. */
export interface GripFocus {
  id: Id;
  index: number;
}

/** Alça pressionada ou sob o cursor. A ferramenta de seleção só a manipula por esta interface. */
export interface GripHold {
  /** Ponto da alça (indicador de captura no hover). */
  readonly at: Vec2;
  /** Vértice de contorno: o foco segue como estava até o próximo clique. Alças de parede não mexem no foco. */
  readonly keepsFocus: boolean;
  /** Prévia do arrasto. `snap` captura o cursor e devolve o ponto (só as alças que capturam chamam). */
  drag(p: PointerInfo, snap: (extra: Partial<InferContext>) => Vec2): PreviewItem[];
  /** Ao soltar: grava a mudança; sem arrasto, um vértice de contorno vai para o foco. */
  release(p: PointerInfo, setFocus: (f: GripFocus) => void): void;
}

/**
 * Provedor de alças: devolve a alça de um tipo de elemento sob `at`, entre a seleção, ou null.
 * Pontos de extensão: `gripProviders` (ordem = prioridade). Para alças de outro elemento, acrescente um provedor.
 */
export type GripProvider = (env: ToolEnv, at: Vec2) => GripHold | null;

/** Contorno editável por alças (piso, laje ou telhado). `boundary` é null se o elemento não é deste tipo. */
interface RingOwner {
  boundary(p: Project, id: Id): Vec2[] | null;
  /** Grava o contorno novo. `insertEdge` é a aresta de um vértice novo (só o telhado usa: balanço e inclinação por aresta). */
  commit(env: ToolEnv, id: Id, ring: Vec2[], insertEdge: number | null): void;
}

const commitBoundary = (env: ToolEnv, id: Id, ring: Vec2[]): void => {
  commitOutlineBoundary(env, id, ring);
};

const FLOOR_OWNER: RingOwner = {
  boundary: (p, id) => {
    const f = p.elements[id];
    return isFloor(f) ? f.boundary : null;
  },
  commit: (env, id, ring) => commitBoundary(env, id, ring),
};

const SLAB_OWNER: RingOwner = {
  boundary: (p, id) => {
    const s = p.elements[id];
    return isSlab(s) ? s.boundary : null;
  },
  commit: (env, id, ring) => commitBoundary(env, id, ring),
};

/** Forro: o contorno efetivo (o do ambiente quando acompanha), para a alça cair onde o forro está. */
const CEILING_OWNER: RingOwner = {
  boundary: (p, id) => {
    const c = p.elements[id];
    return isCeiling(c) ? ceilingOutline(p, c).boundary : null;
  },
  commit: (env, id, ring) => commitCeilingBoundary(env, id, ring),
};

const ROOF_OWNER: RingOwner = {
  boundary: (p, id) => {
    const r = p.elements[id];
    return isRoof(r) ? r.boundary : null;
  },
  commit: (env, id, ring, insertEdge) => {
    const r = env.project().elements[id];
    if (isRoof(r)) commitRoofPatch(env, [id], roofRingPatch(r, ring, insertEdge === null ? null : { kind: 'insert', edge: insertEdge }), env.lang?.() ?? 'pt');
  },
};

/** Contorno com o vértice `index` levado a `pt`, ou com um vértice novo logo depois dele (meio da aresta). */
const ringAfter = (ring: Vec2[], vertex: boolean, index: number, pt: Vec2): Vec2[] => (vertex ? ringMoveVertex(ring, index, pt) : ringInsertAfter(ring, index, pt));

/** Alça de parede: extremidade `a` ou `b` (arrasta o nó e as paredes ligadas) ou o meio do arco (muda a flecha). */
function wallHold(env: ToolEnv, g: Grip): GripHold {
  let point: Vec2 | null = null;
  // Deslocamento do eixo em relação ao ponto pegado (canto visível): zero quando pegou o próprio eixo.
  const offset = sub(g.at, g.grab);
  const followers = (p: PointerInfo) => followingEnds(env.project(), env.levelId(), g.at, new Set([g.wallId]), p.alt);
  return {
    at: g.grab,
    keepsFocus: false,
    drag(p, snap) {
      const pr = env.project();
      const w = pr.elements[g.wallId];
      if (!isWall(w)) return [];
      const f = frameOfWall(pr, w.id);
      const items: PreviewItem[] = [];
      if (g.end === 'mid') {
        // Alça do meio do arco: o arco passa a atravessar o cursor.
        point = p.raw;
        if (f) items.push({ kind: 'wallBand', a: w.a, b: w.b, thickness: f.thickness, sMid: f.sMid, sag: sagFromThreePoints(w.a, p.raw, w.b) });
        return items;
      }
      const other = g.end === 'a' ? w.b : w.a;
      const follow = followers(p);
      // Paredes que acompanham não são alvo da captura: senão a própria ponta vizinha vira referência e colapsa.
      const ignore = new Set([w.id, ...follow.map((c) => c.wallId)]);
      const inf = snap({ from: other, ignore });
      const pt = add(inf, offset);
      point = pt;
      if (f) {
        const a = g.end === 'a' ? pt : w.a;
        const b = g.end === 'b' ? pt : w.b;
        items.push({ kind: 'wallBand', a, b, thickness: f.thickness, sMid: f.sMid, sag: w.sag });
        // Cota temporária: comprimento e Δx/Δy do eixo, como no Revit ao arrastar uma ponta.
        const dx = pt.x - other.x;
        const dy = pt.y - other.y;
        items.push({ kind: 'label', at: { x: (pt.x + other.x) / 2, y: (pt.y + other.y) / 2 }, text: `${formatQuantity(unitsOf(pr), 'length', Math.hypot(dx, dy))}  Δx ${formatQuantity(unitsOf(pr), 'length', dx, { withUnit: false })}  Δy ${formatQuantity(unitsOf(pr), 'length', dy, { withUnit: false })}` });
      }
      // Vizinhas que vão acompanhar: aparecem na prévia para não haver surpresa.
      for (const c of follow) {
        const nw = pr.elements[c.wallId];
        const nf = frameOfWall(pr, c.wallId);
        if (!isWall(nw) || !nf) continue;
        items.push({ kind: 'wallBand', a: c.end === 'a' ? pt : nw.a, b: c.end === 'b' ? pt : nw.b, thickness: nf.thickness, sMid: nf.sMid, sag: nw.sag });
      }
      return items;
    },
    release(p) {
      if (!point) return;
      const pr = env.project();
      const wall = pr.elements[g.wallId];
      if (g.end === 'mid') {
        if (isWall(wall)) env.exec({ type: 'updateElements', ids: [g.wallId], patch: { sag: sagFromThreePoints(wall.a, point, wall.b) } });
        return;
      }
      if (!isWall(wall)) return;
      const pt = point;
      const follow = followers(p);
      // Comprimento zero: a parede (ou uma vizinha que acompanha) cairia sobre a outra ponta e sumiria do motor.
      const other = g.end === 'a' ? wall.b : wall.a;
      if (dist(pt, other) < MIN_WALL_LENGTH) {
        env.say(translate(langOf(env), 'tl_msg_wall_zero_grip'));
        return;
      }
      for (const c of follow) {
        const nw = pr.elements[c.wallId];
        if (!isWall(nw)) continue;
        const far = c.end === 'a' ? nw.b : nw.a;
        if (dist(pt, far) < MIN_WALL_LENGTH) {
          env.say('Uma parede ligada ficaria com comprimento zero. Alt solta a parede pegada.');
          return;
        }
      }
      const commands: Command[] = [
        { type: 'setWallEnds', id: g.wallId, [g.end]: pt },
        ...follow.map((c): Command => ({ type: 'setWallEnds', id: c.wallId, [c.end]: pt })),
      ];
      const result = execWithHostedLoss(env, 'Ajustar parede', commands);
      if (result.status === 'cancelled') env.say('Nada foi alterado.');
      else if (result.status === 'pending') env.say('Confirme o diálogo para aplicar.');
    },
  };
}

/** Linha de separação selecionada na planta, pelo id, no nível ativo. */
const separatorOf = (env: ToolEnv, id: Id) => levelRoomSeparators(env.project(), env.levelId()).find((r) => r.id === id);

/** Alça de extremidade de linha de separação: arrasta só essa ponta; ao soltar, grava uma vez (a recusa do modelo vira aviso). */
function roomSeparatorHold(env: ToolEnv, g: RoomSeparatorGrip): GripHold {
  let point: Vec2 = g.at;
  return {
    at: g.at,
    keepsFocus: false,
    drag(_p, snap) {
      const r = separatorOf(env, g.id);
      if (!r) return [];
      const other = g.end === 'a' ? r.b : r.a;
      point = snap({ from: other });
      // Linha atual tracejada; a nova, com a ponta levada ao destino.
      return [
        { kind: 'line', a: r.a, b: r.b, dashed: true },
        { kind: 'line', a: g.end === 'a' ? point : r.a, b: g.end === 'b' ? point : r.b },
      ];
    },
    release() {
      if (dist(point, g.at) <= 1e-6) return;
      const r = separatorOf(env, g.id);
      if (!r) return;
      const issue = roomSeparatorIssue({ ...r, [g.end]: point });
      if (issue) {
        env.say(issue);
        return;
      }
      moveRoomSeparatorEnd(env, g.id, g.end, point);
    },
  };
}

/** Alça de vértice ou de meio de aresta de um contorno (piso, laje ou telhado). */
function ringHold(env: ToolEnv, owner: RingOwner, id: Id, g: { kind: 'vertex' | 'edge'; index: number; at: Vec2 }): GripHold {
  const vertex = g.kind === 'vertex';
  let point: Vec2 | null = g.at;
  return {
    at: g.at,
    keepsFocus: true,
    drag(_p, snap) {
      const ring = owner.boundary(env.project(), id);
      if (!ring) return [];
      // Snap aos outros vértices do próprio contorno (o vértice arrastado não se captura a si mesmo).
      // O próprio elemento sai da captura: senão as arestas e vértices vizinhos do vértice arrastado viram alvo.
      const inf = snap({ extraPoints: vertex ? ring.filter((_, i) => i !== g.index) : ring, ignore: new Set([id]) });
      point = inf;
      return [{ kind: 'polygon', ring, dashed: true }, { kind: 'polygon', ring: ringAfter(ring, vertex, g.index, inf) }];
    },
    release(_p, setFocus) {
      const ring = owner.boundary(env.project(), id);
      if (!point || !ring) return;
      if (dist(point, g.at) > 1e-6) owner.commit(env, id, ringAfter(ring, vertex, g.index, point), vertex ? null : g.index);
      else if (vertex) {
        // Clique sem arrastar num vértice: fica em foco para o Delete.
        setFocus({ id, index: g.index });
        env.say('Vértice em foco: Delete o remove (mínimo de 3).');
      }
    },
  };
}

/** Extremidade de linha de separação selecionada (`roomSeparatorPick.ts`). Vem antes da parede: a linha é a seleção. */
const roomSeparatorGrip: GripProvider = (env, at) => {
  const g = roomSeparatorGripAt(env.project(), env.levelId(), env.selection(), at, env.metersPerPixel());
  return g ? roomSeparatorHold(env, g) : null;
};

const wallGrip: GripProvider = (env, at) => {
  const g = gripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? wallHold(env, g) : null;
};

const floorGrip: GripProvider = (env, at) => {
  const g = floorGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? ringHold(env, FLOOR_OWNER, g.floorId, g) : null;
};

const slabGrip: GripProvider = (env, at) => {
  const g = slabGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? ringHold(env, SLAB_OWNER, g.slabId, g) : null;
};

const ceilingGrip: GripProvider = (env, at) => {
  const g = ceilingGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? ringHold(env, CEILING_OWNER, g.ceilingId, g) : null;
};

const roofGrip: GripProvider = (env, at) => {
  const g = roofGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  if (g?.kind === 'sag') return roofSagHold(env, g);
  return g ? ringHold(env, ROOF_OWNER, g.roofId, g as typeof g & { kind: 'vertex' | 'edge' }) : null;
};

/** Alça de caracol (centro, raios, ângulos inicial e final) de escada selecionada (`stairSpiralGrips.ts`). Vem antes da comum. */
const spiralGrip: GripProvider = (env, at) => {
  const g = spiralGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? spiralHold(env, g) : null;
};

/** Alça de escada selecionada: extremidade de limite, espelho ou caminhada, ou meio de arco (`stairGrips.ts`). */
const stairGrip: GripProvider = (env, at) => {
  const g = stairGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? stairHold(env, g) : null;
};

/** Alça de vértice de escada livre selecionada (`stairFreeGrips.ts`). Vem antes da comum. */
const stairFreeGrip: GripProvider = (env, at) => {
  const g = stairFreeGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? stairFreeHold(env, g) : null;
};

/** Alça de vértice de rampa livre selecionada (`rampGrips.ts`). */
const rampGrip: GripProvider = (env, at) => {
  const g = rampGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? rampHold(env, g) : null;
};

/** Alça de vértice de guarda-corpo manual selecionado (`guardaCorpoGrips.ts`). */
const railingGrip: GripProvider = (env, at) => {
  const g = railingGripAt(env.project(), env.selection(), at, env.metersPerPixel());
  return g ? railingHold(env, g) : null;
};

/** Registro de provedores de alça, em ordem de prioridade (o primeiro que acerta vence). */
export const gripProviders: GripProvider[] = [roomSeparatorGrip, gridGripProvider, wallGrip, spiralGrip, stairFreeGrip, stairGrip, rampGrip, railingGrip, floorGrip, slabGrip, roofGrip, ceilingGrip];

/** Alça sob o cursor entre os elementos selecionados, por ordem de `gripProviders`. */
export function gripHoldAt(env: ToolEnv, at: Vec2): GripHold | null {
  for (const provide of gripProviders) {
    const hold = provide(env, at);
    if (hold) return hold;
  }
  return null;
}

/**
 * Alça de anotação sob o cursor (hoje só a extremidade da linha de separação). A planta de área desliga as alças de
 * modelo, mas esta continua: a linha de separação é anotação e a vista permite editá-la.
 */
export function annotationGripHoldAt(env: ToolEnv, at: Vec2): GripHold | null {
  return roomSeparatorGrip(env, at);
}

/** Alças desenhadas no piso, laje ou telhado selecionado (vértices e meio das arestas), com o foco e a seta de caimento. */
export function ringHandlePreview(p: Project, sel: Id[], focus: GripFocus | null, grips = true): PreviewItem[] {
  // Extremidades das linhas de separação selecionadas (uma alça em cada ponta). Elas são anotação: continuam na planta
  // de área, mesmo quando as alças de modelo estão desligadas.
  const items: PreviewItem[] = [];
  for (const level of p.levels) {
    for (const r of level.roomSeparators ?? []) {
      if (sel.includes(r.id)) items.push({ kind: 'point', at: r.a }, { kind: 'point', at: r.b });
    }
  }
  if (!grips) return items;
  items.push(...railingHandlePreview(p, sel, grips));
  const f = sel.length === 1 ? p.elements[sel[0]!] : undefined;
  if (!(isFloor(f) || isSlab(f) || isRoof(f))) return items;
  const n = f.boundary.length;
  for (let i = 0; i < n; i++) {
    const a = f.boundary[i]!;
    const b = f.boundary[(i + 1) % n]!;
    // Telhado com arco: a alça do meio fica no meio do arco, não no meio da corda.
    items.push({ kind: 'point', at: a }, { kind: 'point', at: isRoof(f) ? edgeGripPoint(f, i) : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } });
  }
  if (focus?.id === f.id && f.boundary[focus.index]) items.push({ kind: 'highlight', ids: [f.id] });
  // Laje com inclinação: a seta do caimento fica visível enquanto ela está selecionada.
  if (isSlab(f) && f.slope) items.push(...slopePreview(f.slope, slopeArrowLength(f.boundary), unitsOf(p)));
  return items;
}
