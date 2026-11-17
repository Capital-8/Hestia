import { closestOnSegment, dist, type Vec2 } from '@hestia/geom';
import { isLot, type Id, type Lot, type Project } from '@hestia/model';

/**
 * Seleção do lote na planta (ficha P3): funções puras sobre a geometria do modelo. `packages/tools` não importa `packages/render`, então a
 * lógica de `loteNoPonto` e `lotesNaCaixa` (do desenho) é replicada aqui.
 *
 * - Clique: o lote visível do nível cujo CONTORNO passa a no máximo `tol` (m) do ponto. O INTERIOR NÃO seleciona (senão o lote engoliria os
 *   cliques da planta; A.8 item 7). Empate: o mais próximo e, se igual, o de menor id.
 * - Caixa: janela (`b.x >= a.x`) pega o lote com todos os vértices dentro da caixa; cruzamento pega o lote cujo contorno toca a caixa.
 *   Uma caixa inteira dentro do lote, sem tocar o contorno, não o seleciona.
 */

/** Lotes do nível, na ordem de criação, menos os ocultos. */
export function lotesDoNivel(p: Project, levelId: Id, hidden?: ReadonlySet<Id>): Lot[] {
  const out: Lot[] = [];
  for (const e of Object.values(p.elements)) if (isLot(e) && e.levelId === levelId && !hidden?.has(e.id)) out.push(e);
  return out.sort((a, b) => a.order - b.order);
}

/** Distância do ponto ao contorno fechado (m). */
export function distanciaAoContorno(q: Vec2, contorno: readonly Vec2[]): number {
  let d = Infinity;
  contorno.forEach((a, i) => {
    d = Math.min(d, dist(q, closestOnSegment(q, a, contorno[(i + 1) % contorno.length]!)));
  });
  return d;
}

/** O lote do nível cujo contorno passa a no máximo `tol` (m) de `at`, ou null. O interior não conta. */
export function pickLoteAt(p: Project, levelId: Id, at: Vec2, tol: number, hidden?: ReadonlySet<Id>): Id | null {
  let melhor: { id: Id; d: number } | null = null;
  for (const l of lotesDoNivel(p, levelId, hidden)) {
    const d = distanciaAoContorno(at, l.contorno);
    if (d <= tol && (!melhor || d < melhor.d || (d === melhor.d && l.id < melhor.id))) melhor = { id: l.id, d };
  }
  return melhor?.id ?? null;
}

/** Os dois segmentos se cruzam ou se tocam? */
function seCruzam(a: Vec2, b: Vec2, c: Vec2, d: Vec2): boolean {
  const o = (p: Vec2, q: Vec2, r: Vec2): number => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
  const noSeg = (p: Vec2, q: Vec2, r: Vec2): boolean => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b);
  if (o1 !== o2 && o3 !== o4) return true;
  return (o1 === 0 && noSeg(a, b, c)) || (o2 === 0 && noSeg(a, b, d)) || (o3 === 0 && noSeg(c, d, a)) || (o4 === 0 && noSeg(c, d, b));
}

/** Lotes do nível selecionados pela caixa de `a` a `b` (janela da esquerda para a direita; cruzamento ao contrário). */
export function lotIdsInBox(p: Project, levelId: Id, a: Vec2, b: Vec2, hidden?: ReadonlySet<Id>): Id[] {
  const min = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y) };
  const max = { x: Math.max(a.x, b.x), y: Math.max(a.y, b.y) };
  const janela = b.x >= a.x;
  const dentro = (q: Vec2): boolean => q.x >= min.x && q.x <= max.x && q.y >= min.y && q.y <= max.y;
  const cantos: Vec2[] = [min, { x: max.x, y: min.y }, max, { x: min.x, y: max.y }];
  const out: Id[] = [];
  for (const l of lotesDoNivel(p, levelId, hidden)) {
    const c = l.contorno;
    const ok = janela
      ? c.length > 0 && c.every(dentro)
      : c.some(dentro) || c.some((q, i) => cantos.some((k, j) => seCruzam(q, c[(i + 1) % c.length]!, k, cantos[(j + 1) % 4]!)));
    if (ok) out.push(l.id);
  }
  return out;
}
