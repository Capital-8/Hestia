import { dist, type Vec2 } from '@hestia/geom';
import type { Command } from './commands.ts';
import { changesWallEnds } from './hostedOffset.ts';
import { wallBaseElevation, wallTopElevation, wallType } from './queries.ts';
import { isWall, type Id, type Project, type Wall } from './types.ts';
import { wallThicknessOf } from './wallType.ts';
import { DEFAULT_JOIN } from './wall.ts';

/** Resíduo de junção: a ponta que perde o parceiro volta ao padrão (butt) no mesmo passo de desfazer do comando. */
export type EndsSnapshot = Map<Id, { a: Vec2; b: Vec2; levelId: Id }>;

/** O comando (ou algum filho de um lote) pode mover pontas de parede. */
export function movesWallEnds(c: Command): boolean {
  switch (c.type) {
    case 'setWallEnds': return true;
    case 'transform': return true;
    case 'updateElements': return changesWallEnds(c.patch as Partial<Wall>);
    case 'batch': return c.commands.some(movesWallEnds);
    default: return false;
  }
}

export function snapshotEnds(p: Project): EndsSnapshot {
  const s: EndsSnapshot = new Map();
  for (const e of Object.values(p.elements)) if (isWall(e)) s.set(e.id, { a: { ...e.a }, b: { ...e.b }, levelId: e.levelId });
  return s;
}

/**
 * Mesma faixa de junção: o mesmo nível, ou outro nível cuja faixa de altura nominal (base..topo) se sobrepõe à da parede
 * de forma ESTRITA (encostar topo com base não une). O model não vê a cota resolvida do engine: vale a nominal.
 */
function sameBand(p: Project, w: Wall, v: Wall): boolean {
  if (v.levelId === w.levelId) return true;
  const [wb, wt] = [wallBaseElevation(p, w), wallTopElevation(p, w)];
  const [vb, vt] = [wallBaseElevation(p, v), wallTopElevation(p, v)];
  return Math.max(Math.min(wb, wt), Math.min(vb, vt)) < Math.min(Math.max(wb, wt), Math.max(vb, vt)) - 1e-9;
}

/** Há outra parede do nível (ou de outro nível na mesma faixa de altura) com uma ponta no ponto (tolerância de junção, mais meia espessura dela: canto desenhado pela face). */
function hasPartner(p: Project, w: Wall, o: Vec2, walls: Wall[], tol: number): boolean {
  for (const v of walls) {
    if (v.id === w.id) continue;
    const reach = tol + wallThicknessOf(wallType(p, v)) / 2;
    if (dist(v.a, o) <= reach || dist(v.b, o) <= reach) return true;
  }
  return false;
}

function isDefault(j: Wall['joinStart']): boolean {
  return j.kind === DEFAULT_JOIN.kind && j.flip === DEFAULT_JOIN.flip && j.transicao === undefined;
}

/**
 * Depois de um comando que moveu pontas: zera a configuração das pontas que ficaram sem parceiro (livres ou em T), tanto
 * nas paredes movidas quanto nas que perderam o parceiro que estava no ponto antigo. Pontas que ainda têm par (canto
 * arrastado junto) mantêm a esquadria. Roda uma vez por comando externo, depois dos filhos de um lote.
 */
export function clearJoinResidue(p: Project, before: EndsSnapshot): void {
  const tol = p.settings.joinTolerance;
  const moved: Wall[] = [];
  for (const [id, old] of before) {
    const w = p.elements[id];
    if (isWall(w) && (dist(w.a, old.a) > 1e-9 || dist(w.b, old.b) > 1e-9)) moved.push(w);
  }
  if (moved.length === 0) return;
  const cand = new Set<Wall>(moved);
  const all = Object.values(p.elements).filter(isWall);
  for (const w of moved) {
    const old = before.get(w.id)!;
    for (const v of all) {
      if (cand.has(v) || v.id === w.id || !sameBand(p, w, v)) continue;
      const reach = tol + wallThicknessOf(wallType(p, w)) / 2;
      if ([old.a, old.b].some((o) => dist(v.a, o) <= reach || dist(v.b, o) <= reach)) cand.add(v);
    }
  }
  for (const w of cand) {
    const walls = all.filter((v) => sameBand(p, w, v));
    if (!isDefault(w.joinStart) && !hasPartner(p, w, w.a, walls, tol)) w.joinStart = { ...DEFAULT_JOIN };
    if (!isDefault(w.joinEnd) && !hasPartner(p, w, w.b, walls, tol)) w.joinEnd = { ...DEFAULT_JOIN };
  }
}
