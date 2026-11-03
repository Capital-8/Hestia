import { dist, boxesOverlap, boxOf, intersectSegments, type Vec2 } from '@hestia/geom';
import { wallMid } from './wallGeom.ts';
import { isComponent, isGeneric, wallsOnLevel, type Id, type Project } from '@hestia/model';
import { pegadaDoComponente, toLocal, wallEndCorners } from '@hestia/engine';
import { cadDrawingIdsInBox as cadBoxIds, cadNear, cadSnapIndexes } from './snapCad.ts';
import { candidatesAt, wallIndexOf } from './pickIndex.ts';

export interface Hit {
  id: Id;
  kind: 'wall' | 'door' | 'window';
}

/**
 * Elemento sob o ponto (aberturas têm prioridade sobre a parede que as hospeda). Só as paredes que podem acertar o ponto
 * entram na conta (índice de `pickIndex.ts`); o resultado é o da varredura de todas as paredes, na mesma ordem.
 */
export function pickAt(p: Project, levelId: Id, at: Vec2, mpp: number): Hit | null {
  const tol = 4 * mpp;
  const ix = wallIndexOf(p, levelId);
  let bestWall: { id: Id; d: number } | null = null;
  for (const i of candidatesAt(ix, at, 2 * tol)) {
    const w = ix.walls[i]!;
    const f = w.frame;
    for (const o of w.opens) {
      const l = toLocal(f, at);
      if (Math.abs(l.t - o.g.offset) <= o.g.width / 2 + tol && l.s <= f.sHi + tol && l.s >= f.sLo - tol) return { id: o.id, kind: o.kind };
    }
    const l = toLocal(f, at);
    if (l.t < -tol || l.t > f.length + tol) continue;
    const over = l.s > f.sHi ? l.s - f.sHi : l.s < f.sLo ? f.sLo - l.s : 0;
    if (over > tol) continue;
    const d = over + Math.abs(l.s - f.sMid) * 1e-3;
    if (!bestWall || d < bestWall.d) bestWall = { id: w.id, d };
  }
  return bestWall ? { id: bestWall.id, kind: 'wall' } : null;
}

export interface Grip {
  wallId: Id;
  /** 'mid' é a alça do meio do arco (muda a flecha). */
  end: 'a' | 'b' | 'mid';
  /** Extremidade do eixo (a linha de locação que a parede move). */
  at: Vec2;
  /**
   * Ponto pegado: a própria extremidade ou um canto visível dela. O arrasto leva este ponto ao destino e o eixo
   * acompanha com o mesmo deslocamento, então pegar o canto que se vê não faz a parede saltar.
   */
  grab: Vec2;
}

/** Alça sob `at` entre as paredes selecionadas: a mais próxima vence (várias selecionadas não escolhem pela ordem). */
export function gripAt(p: Project, ids: Id[], at: Vec2, mpp: number): Grip | null {
  const tol = 9 * mpp;
  let best: (Grip & { d: number }) | null = null;
  const offer = (g: Grip, d: number): void => {
    if (d <= tol && (!best || d < best.d)) best = { ...g, d };
  };
  for (const id of ids) {
    const w = p.elements[id];
    if (!w || w.kind !== 'wall') continue;
    const corners = wallEndCorners(p, w);
    for (const end of ['a', 'b'] as const) {
      const axis = w[end];
      for (const q of [axis, ...corners[end]]) offer({ wallId: id, end, at: axis, grab: q }, dist(q, at));
    }
    if (Math.abs(w.sag) > 1e-6) {
      const m = wallMid(w);
      offer({ wallId: id, end: 'mid', at: m, grab: m }, dist(m, at));
    }
  }
  if (!best) return null;
  const { d: _d, ...grip } = best as Grip & { d: number };
  return grip;
}

/** Tolerância de junção do projeto: a mesma que o motor usa para unir pontas (uma só fonte, J-02). */
export const joinTol = (p: Project): number => p.settings?.joinTolerance ?? 0.02;

/** Comprimento mínimo de parede: abaixo disso a parede some do motor. Arrastar uma ponta até a outra é recusado. */
export const MIN_WALL_LENGTH = 0.01;

/** Paredes (fora de `exclude`) com uma extremidade em `pt`: acompanham o movimento da parede ligada. */
export function connectedEnds(p: Project, levelId: Id, pt: Vec2, exclude: Set<Id>, tol = joinTol(p)): Array<{ wallId: Id; end: 'a' | 'b' }> {
  const out: Array<{ wallId: Id; end: 'a' | 'b' }> = [];
  for (const w of wallsOnLevel(p, levelId)) {
    if (exclude.has(w.id)) continue;
    if (dist(w.a, pt) <= tol) out.push({ wallId: w.id, end: 'a' });
    if (dist(w.b, pt) <= tol) out.push({ wallId: w.id, end: 'b' });
  }
  return out;
}

/**
 * Quem acompanha uma extremidade movida: todas as paredes ligadas nesse nó (canto, T ou nó de 3+), como o Revit
 * mantém a junção. `invert` (Alt) solta só a parede pegada: o nó não acompanha ninguém.
 */
export function followingEnds(p: Project, levelId: Id, pt: Vec2, exclude: Set<Id>, invert = false, tol = joinTol(p)): Array<{ wallId: Id; end: 'a' | 'b' }> {
  return invert ? [] : connectedEnds(p, levelId, pt, exclude, tol);
}

export function idsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  const box = boxOf([a, b]);
  const crossing = b.x < a.x;
  const ids: Id[] = [];
  for (const w of wallsOnLevel(p, levelId)) {
    const bb = boxOf([w.a, w.b]);
    const inside = (q: Vec2): boolean => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY;
    const contained = inside(w.a) && inside(w.b);
    let hit = contained;
    if (!hit && crossing && boxesOverlap(bb, box)) {
      const corners: Vec2[] = [
        { x: box.minX, y: box.minY },
        { x: box.maxX, y: box.minY },
        { x: box.maxX, y: box.maxY },
        { x: box.minX, y: box.maxY },
      ];
      hit = inside(w.a) || inside(w.b) || corners.some((c, i) => intersectSegments(w.a, w.b, c, corners[(i + 1) % 4]!) !== null);
    }
    if (hit) ids.push(w.id);
  }
  return ids;
}

/**
 * Desenho CAD importado cujo traço passa a até `tol` do ponto (clique na linha). Desenho com `visible: false` fica de
 * fora: o que não se vê não se seleciona.
 */
export function cadAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  return cadNear(cadSnapIndexes(p, [levelId]), at, 4 * mpp);
}

/** Desenhos CAD inteiramente dentro da janela (seleção de janela esquerda→direita). */
export function cadIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  return cadBoxIds(cadSnapIndexes(p, [levelId]), a, b);
}

/**
 * Objeto importado sob o ponto: o contorno em planta (hull) guardado no genérico. Aceita o clique na borda com a mesma
 * tolerância do resto da seleção; entre dois objetos sobrepostos vence o de menor área (o mais específico).
 */
export function genericAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  const tol = 4 * mpp;
  let best: { id: Id; area: number } | null = null;
  for (const e of Object.values(p.elements)) {
    if (!isGeneric(e) || e.levelId !== levelId) continue;
    const ring = e.outline;
    if (!ring || ring.length < 3) continue;
    if (!insideOrNear(ring, at, tol)) continue;
    const area = Math.abs(ringArea(ring));
    if (!best || area < best.area) best = { id: e.id, area };
  }
  return best?.id ?? null;
}

/**
 * Componente sob o ponto: qualquer anel externo da pegada em planta o contém (com a mesma tolerância de borda da
 * seleção). Entre sobrepostos vence o de menor área, como no objeto genérico. Componentes de outros níveis ficam fora.
 */
export function componentAt(p: Project, levelId: Id, at: Vec2, mpp: number): Id | null {
  const tol = 4 * mpp;
  let best: { id: Id; area: number } | null = null;
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || e.levelId !== levelId) continue;
    let area = 0;
    let hit = false;
    for (const poly of pegadaDoComponente(p, e)) {
      const ring = poly[0];
      if (!ring) continue;
      area += Math.abs(ringArea(ring));
      if (!hit && insideOrNear(ring, at, tol)) hit = true;
    }
    if (!hit) continue;
    if (!best || area < best.area) best = { id: e.id, area };
  }
  return best?.id ?? null;
}

/** Componentes cuja pegada está inteira dentro da janela (seleção de janela esquerda→direita). */
export function componentIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2): Id[] {
  const box = boxOf([a, b]);
  const ids: Id[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isComponent(e) || e.levelId !== levelId) continue;
    const pegada = pegadaDoComponente(p, e);
    if (pegada.length === 0) continue;
    const dentro = pegada.every((poly) => {
      const ring = poly[0];
      return !ring || ring.every((q) => q.x >= box.minX && q.x <= box.maxX && q.y >= box.minY && q.y <= box.maxY);
    });
    if (dentro) ids.push(e.id);
  }
  return ids;
}

/** Ray casting + distância às arestas (para o clique na borda contar). */
function insideOrNear(ring: readonly Vec2[], at: Vec2, tol: number): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > at.y !== b.y > at.y && at.x < ((b.x - a.x) * (at.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.y - a.y) * dy) / len2));
    if (Math.hypot(at.x - (a.x + t * dx), at.y - (a.y + t * dy)) <= tol) return true;
  }
  return inside;
}

function ringArea(ring: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

