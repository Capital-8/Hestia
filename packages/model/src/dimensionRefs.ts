import { dist, type Vec2 } from '@hestia/geom';
import type { DimensionElementRef } from './dimensionContract.ts';
import { openingsOfWall, openingType, wallsOnLevel } from './queries.ts';
import { coreSpan, wallThicknessOf } from './wallType.ts';
import { beamPolygon, findBeamType } from './beam.ts';
import { columnPolygon, findColumnType } from './column.ts';
import { footingPolygon, findFootingType } from './footing.ts';
import { isOpening, isWall, type DimensionRef, type Opening, type Id, type LocationLine, type Project, type Wall, type WallType } from './types.ts';

/**
 * Referências associativas de cota (docs/cotas/CONTRATO.md). Convenções, todas em planta (m):
 * - Parede (reta; a flecha `sag` é ignorada, vale a corda a→b). `index` 0|1 escolhe a extremidade a|b nas FACES
 *   (ausente = 0). `n` é a normal ESQUERDA de a→b.
 *   - `wall-axis-a|b`: a própria extremidade `a`/`b` da parede (a linha de localização, como o antigo `DimensionRef`).
 *   - `wall-face-hi`: ponto da face do lado de +n (esquerda de a→b) na extremidade `index`; `wall-face-lo`: face do
 *     lado -n. É geométrico (independe de `flipped`), como `sHi`/`sLo` do engine, e leva em conta a `locationLine`
 *     e a espessura do tipo.
 * - Esquadria: o ponto fica na linha média da parede (`sMid`), em `t = offset` (centro) ou `offset ∓ largura/2`
 *   (largura do vão do tipo). `opening-edge-a` é a borda do lado de `a` da parede, `opening-edge-b` do lado de `b`.
 * - `vertex`: `boundary[index]` de laje/piso/forro/telhado; em escada/rampa, o anel de vértices na ordem dos componentes
 *   (lance: limite esquerdo e depois o direito de trás para frente; patamar: seu limite), usando o início de cada
 *   segmento do croqui. `edge`: ponto médio da aresta `index` (de `index` a `index+1`, fechando o anel).
 * - `part`: ponto de apoio de escada, rampa ou guarda-corpo (cantos e meios dos degraus, espelhos, acabamentos, eixo, peças
 *   do guarda-corpo...), nomeado por `key`. A geometria vem do motor, que se registra com `definirProvedorDeApoio`
 *   (o modelo não conhece o motor). Sem provedor, ou com a chave que sumiu na edição, resolve para `null` e a cota
 *   mantém o último ponto guardado.
 * - `plane` (3º parâmetro de `resolveDimRef`) está reservado para vistas em corte/elevação: hoje as refs resolvem
 *   sempre para a planta e o parâmetro é ignorado.
 */

/** Pontos de apoio por elemento (escada, rampa, guarda-corpo): fornecidos pelo motor, que conhece a geometria resolvida. */
export interface ProvedorDeApoio {
  /** Ponto de apoio `key` do elemento, ou null se o elemento ou a chave não existe. */
  ponto(p: Project, elementId: Id, key: string): Vec2 | null;
  /** Todos os pontos de apoio do elemento, com a chave de cada um (ordem estável). */
  candidatos(p: Project, el: Project['elements'][string]): Array<{ key: string; point: Vec2 }>;
}

let provedorDeApoio: ProvedorDeApoio | null = null;

/** O motor registra aqui a fonte dos pontos de apoio (efeito da importação de `@hestia/engine`). */
export function definirProvedorDeApoio(f: ProvedorDeApoio | null): void {
  provedorDeApoio = f;
}

export const isElementRef = (r: DimensionRef | DimensionElementRef | undefined): r is DimensionElementRef =>
  !!r && typeof r === 'object' && 'elementId' in r;

/** Deslocamento da face externa até a linha de localização (mesma regra do engine `exteriorOffset`). */
function exteriorOffset(type: WallType, loc: LocationLine): number {
  const total = wallThicknessOf(type);
  const core = coreSpan(type);
  switch (loc) {
    case 'wallCenter': return total / 2;
    case 'coreCenter': return (core.from + core.to) / 2;
    case 'finishExterior': return 0;
    case 'finishInterior': return total;
    case 'coreExterior': return core.from;
    case 'coreInterior': return core.to;
  }
}

interface WallGeo { a: Vec2; b: Vec2; u: Vec2; n: Vec2; length: number; sHi: number; sLo: number; sMid: number }

function wallGeo(p: Pick<Project, 'wallTypes' | 'defaults'>, w: Wall): WallGeo | null {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-4) return null;
  const type = p.wallTypes?.[w.typeId] ?? p.wallTypes?.[p.defaults?.wallTypeId];
  if (!type) return null;
  const u = { x: dx / length, y: dy / length };
  const sign = w.flipped ? -1 : 1;
  const thickness = wallThicknessOf(type);
  const ext = exteriorOffset(type, w.locationLine);
  const sExt = sign * ext;
  const sInt = sign * (ext - thickness);
  const sHi = Math.max(sExt, sInt);
  const sLo = Math.min(sExt, sInt);
  return { a: w.a, b: w.b, u, n: { x: -u.y, y: u.x }, length, sHi, sLo, sMid: (sHi + sLo) / 2 };
}

const at = (g: WallGeo, t: number, s: number): Vec2 => ({ x: g.a.x + g.u.x * t + g.n.x * s, y: g.a.y + g.u.y * t + g.n.y * s });

const projectOnLine = (p: Vec2, orig: Vec2, unitDir: Vec2): Vec2 => {
  const t = (p.x - orig.x) * unitDir.x + (p.y - orig.y) * unitDir.y;
  return { x: orig.x + unitDir.x * t, y: orig.y + unitDir.y * t };
};

function closestPointOnSegment(pt: Vec2, a: Vec2, b: Vec2): { point: Vec2; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  if (l2 < 1e-12) return { point: { ...a }, dist: dist(pt, a) };
  const t = Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { point, dist: dist(pt, point) };
}

function closestPointOnInfiniteLine(pt: Vec2, a: Vec2, b: Vec2): { point: Vec2; dist: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return { point: { ...a }, dist: dist(pt, a) };
  const point = projectOnLine(pt, a, { x: dx / len, y: dy / len });
  return { point, dist: dist(pt, point) };
}

/** Anel de vértices (planta) de um elemento com contorno (inclui pilar, viga e sapata); vazio se não tem. */
export function elementRing(e: Project['elements'][string] | undefined, p?: Project): Vec2[] {
  if (!e) return [];
  if (e.kind === 'column') return columnPolygon(e, p ? findColumnType(p, e.typeId) : undefined);
  if (e.kind === 'beam') return beamPolygon(e, p ? findBeamType(p, e.typeId) : undefined);
  if (e.kind === 'footing') return footingPolygon(e, p ? findFootingType(p, e.typeId) : undefined);
  if (e.kind === 'floor' || e.kind === 'slab' || e.kind === 'ceiling' || e.kind === 'roof') return e.boundary;
  if (e.kind === 'stair' || e.kind === 'ramp') {
    const out: Vec2[] = [];
    for (const c of e.components) {
      if (c.kind === 'landing') {
        for (const s of c.boundary) out.push(s.a);
      } else {
        for (const s of c.boundaryLeft) out.push(s.a);
        const l = c.boundaryLeft[c.boundaryLeft.length - 1];
        if (l) out.push(l.b);
        const r = c.boundaryRight;
        const lastR = r[r.length - 1];
        if (lastR) out.push(lastR.b);
        for (let i = r.length - 1; i >= 0; i--) out.push(r[i]!.a);
      }
    }
    return out;
  }
  return [];
}

function openingHalfWidth(p: Project, o: Opening): number {
  try { return openingType(p, o).width / 2; } catch { return 0; }
}

/** Ponto de uma referência genérica, ou null se o elemento/feição não existe mais. */
export function resolveDimRef(p: Project, ref: DimensionElementRef | DimensionRef, _plane?: unknown): Vec2 | null {
  if (!isElementRef(ref)) {
    const w = p.elements[ref.wallId];
    return isWall(w) ? { ...(ref.end === 'a' ? w.a : w.b) } : null;
  }
  const el = p.elements[ref.elementId];
  if (!el) return null;
  switch (ref.feature) {
    case 'wall-axis-a':
    case 'wall-axis-b':
      if (!isWall(el)) return null;
      return { ...(ref.feature === 'wall-axis-a' ? el.a : el.b) };
    case 'wall-face-lo':
    case 'wall-face-hi': {
      if (!isWall(el)) return null;
      const g = wallGeo(p, el);
      if (!g) return null;
      return at(g, ref.index === 1 ? g.length : 0, ref.feature === 'wall-face-hi' ? g.sHi : g.sLo);
    }
    case 'opening-edge-a':
    case 'opening-edge-b':
    case 'opening-center': {
      if (!isOpening(el)) return null;
      const host = p.elements[el.hostId];
      if (!isWall(host)) return null;
      const g = wallGeo(p, host);
      if (!g) return null;
      const half = ref.feature === 'opening-center' ? 0 : openingHalfWidth(p, el) ;
      const t = ref.feature === 'opening-edge-a' ? el.offset - half : ref.feature === 'opening-edge-b' ? el.offset + half : el.offset;
      return at(g, t, g.sMid);
    }
    case 'part': {
      if (ref.key === undefined || !provedorDeApoio) return null;
      return provedorDeApoio.ponto(p, el.id, ref.key);
    }
    case 'vertex': {
      const ring = elementRing(el, p);
      const v = ring[ref.index ?? 0];
      return v ? { ...v } : null;
    }
    case 'edge': {
      const ring = elementRing(el, p);
      const i = ref.index ?? 0;
      const v = ring[i];
      const w = ring[(i + 1) % ring.length];
      return v && w ? { x: (v.x + w.x) / 2, y: (v.y + w.y) / 2 } : null;
    }
  }
}

/** Candidatos (ref + ponto) de um elemento do nível, na ordem de prioridade para desempate. */
export function dimRefCandidates(p: Project, el: Project['elements'][string]): Array<{ ref: DimensionElementRef; point: Vec2 }> {
  const out: Array<{ ref: DimensionElementRef; point: Vec2 }> = [];
  const push = (ref: DimensionElementRef): void => {
    const point = resolveDimRef(p, ref);
    if (point) out.push({ ref, point });
  };
  if (isWall(el)) {
    for (const o of openingsOfWall(p, el.id)) for (const f of ['opening-edge-a', 'opening-edge-b', 'opening-center'] as const) push({ elementId: o.id, feature: f });
    push({ elementId: el.id, feature: 'wall-axis-a' });
    push({ elementId: el.id, feature: 'wall-axis-b' });
    for (const f of ['wall-face-hi', 'wall-face-lo'] as const) for (const index of [0, 1]) push({ elementId: el.id, feature: f, index });
    return out;
  }
  const n = elementRing(el, p).length;
  for (let i = 0; i < n; i++) push({ elementId: el.id, feature: 'vertex', index: i });
  for (let i = 0; i < n; i++) push({ elementId: el.id, feature: 'edge', index: i });
  return out;
}

/**
 * Candidatos `part` (pontos de apoio de escada, rampa e guarda-corpo) do elemento; vazio sem provedor. Ficam fora de
 * `dimRefCandidates`: a alça de troca de feição não deve percorrer centenas de pontos.
 */
export function dimRefApoioCandidates(p: Project, el: Project['elements'][string]): Array<{ ref: DimensionElementRef; point: Vec2 }> {
  if (!provedorDeApoio) return [];
  return provedorDeApoio.candidatos(p, el).map((c) => ({ ref: { elementId: el.id, feature: 'part' as const, key: c.key }, point: c.point }));
}

function matchElementSegmentRef(
  p: Project,
  el: Project['elements'][string],
  point: Vec2,
  tol: number,
  infinite = false,
): { ref: DimensionElementRef; point: Vec2; dist: number } | null {
  let best: { ref: DimensionElementRef; point: Vec2; dist: number } | null = null;
  const consider = (ref: DimensionElementRef, segA: Vec2, segB: Vec2): void => {
    const hit = infinite ? closestPointOnInfiniteLine(point, segA, segB) : closestPointOnSegment(point, segA, segB);
    if (hit.dist <= tol && (!best || hit.dist < best.dist - 1e-9)) {
      best = { ref, point: hit.point, dist: hit.dist };
    }
  };
  if (isWall(el)) {
    const g = wallGeo(p, el);
    if (!g) return null;
    consider({ elementId: el.id, feature: 'wall-face-hi', index: 0 }, at(g, 0, g.sHi), at(g, g.length, g.sHi));
    consider({ elementId: el.id, feature: 'wall-face-lo', index: 0 }, at(g, 0, g.sLo), at(g, g.length, g.sLo));
    consider({ elementId: el.id, feature: 'wall-axis-a', key: 'line' }, g.a, g.b);
    return best;
  }
  const ring = elementRing(el, p);
  for (let i = 0; i < ring.length; i++) {
    consider({ elementId: el.id, feature: 'edge', index: i }, ring[i]!, ring[(i + 1) % ring.length]!);
  }
  return best;
}

/**
 * Casa um ponto exato (`tol`) contra as feições do elemento: primeiro os pontos discretos (eixo, pontas, vértices,
 * esquadrias) e, se nenhum coincidir, as faces/eixo da parede ou arestas do anel ao longo do segmento (ou reta
 * infinita, quando `infinite = true`, para pontos projetados em cotas temporárias).
 */
export function matchElementDimRef(
  p: Project,
  el: Project['elements'][string],
  point: Vec2,
  tol: number,
  infinite = false,
): { ref: DimensionElementRef; point: Vec2 } | null {
  let best: { ref: DimensionElementRef; point: Vec2 } | null = null;
  let bestD = Infinity;
  for (const c of dimRefCandidates(p, el)) {
    const d = dist(c.point, point);
    if (d <= tol && d < bestD - 1e-9) {
      best = c;
      bestD = d;
    }
  }
  if (best) return best;
  const seg = matchElementSegmentRef(p, el, point, tol, false);
  if (seg) return { ref: seg.ref, point: seg.point };
  if (!infinite) return null;
  const infSeg = matchElementSegmentRef(p, el, point, tol, true);
  return infSeg ? { ref: infSeg.ref, point: infSeg.point } : null;
}

/**
 * Feição de elemento do nível mais próxima de `at` (dentro de `tol`), para criar cotas associativas. Desempate pela
 * ordem de prioridade (esquadria, eixo, faces, vértices, arestas). Sem candidato: null.
 */
export function dimRefAt(p: Project, levelId: Id, point: Vec2, tol: number): { ref: DimensionElementRef | DimensionRef; point: Vec2 } | null {
  let best: { ref: DimensionElementRef; point: Vec2 } | null = null;
  let bestD = Infinity;
  const consider = (c: { ref: DimensionElementRef; point: Vec2 }): void => {
    const d = dist(c.point, point);
    if (d <= tol && d < bestD - 1e-9) { best = c; bestD = d; }
  };
  for (const w of wallsOnLevel(p, levelId)) for (const c of dimRefCandidates(p, w)) consider(c);
  for (const el of Object.values(p.elements)) {
    if (isWall(el) || isOpening(el) || !('levelId' in el) || el.levelId !== levelId) continue;
    for (const c of dimRefCandidates(p, el)) consider(c);
  }
  // Pontos de apoio (degraus, espelhos, acabamentos, guarda-corpo): depois dos vértices e arestas, que vencem o empate.
  for (const el of Object.values(p.elements)) {
    if ((el.kind !== 'stair' && el.kind !== 'ramp' && el.kind !== 'railing') || el.levelId !== levelId) continue;
    for (const c of dimRefApoioCandidates(p, el)) consider(c);
  }
  if (best) return best;

  // Fallback contínuo ao longo de faces de parede e arestas de contorno (para cliques no meio da parede/elemento).
  let bestSeg: { ref: DimensionElementRef; point: Vec2; dist: number } | null = null;
  const considerSeg = (seg: { ref: DimensionElementRef; point: Vec2; dist: number } | null): void => {
    if (seg && (!bestSeg || seg.dist < bestSeg.dist - 1e-9)) bestSeg = seg;
  };
  for (const w of wallsOnLevel(p, levelId)) considerSeg(matchElementSegmentRef(p, w, point, tol));
  for (const el of Object.values(p.elements)) {
    if (isWall(el) || isOpening(el) || !('levelId' in el) || el.levelId !== levelId) continue;
    considerSeg(matchElementSegmentRef(p, el, point, tol));
  }
  const found = bestSeg as { ref: DimensionElementRef; point: Vec2; dist: number } | null;
  return found ? { ref: found.ref, point: found.point } : null;
}

/** Ponto de uma ponta da cota: a referência resolvida (reprojetada ao longo da face/aresta quando contínuo) ou o ponto guardado. */
export function resolveDimEnd(p: Project, ref: DimensionRef | DimensionElementRef | undefined, fallback: Vec2): Vec2 {
  if (!ref) return fallback;
  if (isElementRef(ref)) {
    const el = p.elements[ref.elementId];
    if (!el) return fallback;
    if ((ref.feature === 'wall-face-lo' || ref.feature === 'wall-face-hi' || (ref.feature === 'wall-axis-a' && ref.key === 'line')) && isWall(el)) {
      const g = wallGeo(p, el);
      if (!g) return fallback;
      const s = ref.feature === 'wall-face-hi' ? g.sHi : ref.feature === 'wall-face-lo' ? g.sLo : g.sMid;
      return projectOnLine(fallback, at(g, 0, s), g.u);
    }
    if (ref.feature === 'edge') {
      const ring = elementRing(el, p);
      const i = ref.index ?? 0;
      const v = ring[i];
      const w = ring[(i + 1) % ring.length];
      if (v && w) {
        const edgeLen = Math.hypot(w.x - v.x, w.y - v.y);
        if (edgeLen > 1e-6) return projectOnLine(fallback, v, { x: (w.x - v.x) / edgeLen, y: (w.y - v.y) / edgeLen });
      }
    }
  }
  const pt = resolveDimRef(p, ref);
  if (!pt) return fallback;
  if (!isElementRef(ref)) {
    if (ref.axis === 'x') return { x: pt.x, y: fallback.y };
    if (ref.axis === 'y') return { x: fallback.x, y: pt.y };
  }
  return pt;
}
