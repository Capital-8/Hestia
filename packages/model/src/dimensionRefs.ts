import { dist, type Vec2 } from '@hestia/geom';
import type { DimensionElementRef, DimWallLine } from './dimensionContract.ts';
import { openingsOfWall, openingType, wallsOnLevel } from './queries.ts';
import { coreSpan, totalThickness } from './wallType.ts';
import { isOpening, isWall, type DimensionRef, type Opening, type Id, type LocationLine, type Project, type Wall } from './types.ts';

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
 * - `plane` (3º parâmetro de `resolveDimRef`) está reservado para vistas em corte/elevação: hoje as refs resolvem
 *   sempre para a planta e o parâmetro é ignorado.
 */

export const isElementRef = (r: DimensionRef | DimensionElementRef | undefined): r is DimensionElementRef =>
  !!r && typeof r === 'object' && 'elementId' in r;

/** Deslocamento da face externa até a linha de localização (mesma regra do engine `exteriorOffset`). */
function exteriorOffset(type: { layers: readonly { thickness: number }[] } & Parameters<typeof coreSpan>[0], loc: LocationLine): number {
  const total = totalThickness(type);
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

interface WallGeo { a: Vec2; b: Vec2; u: Vec2; n: Vec2; length: number; sHi: number; sLo: number; sMid: number; cHi: number; cLo: number }

function wallGeo(p: Pick<Project, 'wallTypes' | 'defaults'>, w: Wall): WallGeo | null {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-4) return null;
  const type = p.wallTypes?.[w.typeId] ?? p.wallTypes?.[p.defaults?.wallTypeId];
  if (!type) return null;
  const u = { x: dx / length, y: dy / length };
  const sign = w.flipped ? -1 : 1;
  const thickness = totalThickness(type);
  const ext = exteriorOffset(type, w.locationLine);
  const sExt = sign * ext;
  const sInt = sign * (ext - thickness);
  const sHi = Math.max(sExt, sInt);
  const sLo = Math.min(sExt, sInt);
  const core = coreSpan(type);
  const c1 = sign * (ext - core.from);
  const c2 = sign * (ext - core.to);
  return { a: w.a, b: w.b, u, n: { x: -u.y, y: u.x }, length, sHi, sLo, sMid: (sHi + sLo) / 2, cHi: Math.max(c1, c2), cLo: Math.min(c1, c2) };
}

/** Deslocamento perpendicular (s) de uma linha da parede, a partir do eixo a→b. */
const lineS = (g: WallGeo, line: DimWallLine): number =>
  line === 'face-hi' ? g.sHi : line === 'face-lo' ? g.sLo : line === 'core-hi' ? g.cHi : line === 'core-lo' ? g.cLo : 0;

const at = (g: WallGeo, t: number, s: number): Vec2 => ({ x: g.a.x + g.u.x * t + g.n.x * s, y: g.a.y + g.u.y * t + g.n.y * s });

/** Anel de vértices (planta) de um elemento com contorno; vazio se não tem. */
export function elementRing(e: Project['elements'][string] | undefined): Vec2[] {
  if (!e) return [];
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
    case 'wall-line': {
      if (!isWall(el)) return null;
      const g = wallGeo(p, el);
      if (!g) return null;
      const t = Math.min(g.length, Math.max(0, ref.along ?? g.length / 2));
      return at(g, t, lineS(g, ref.line ?? 'axis'));
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
    case 'vertex': {
      const ring = elementRing(el);
      const v = ring[ref.index ?? 0];
      return v ? { ...v } : null;
    }
    case 'edge': {
      const ring = elementRing(el);
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
  const n = elementRing(el).length;
  for (let i = 0; i < n; i++) push({ elementId: el.id, feature: 'vertex', index: i });
  for (let i = 0; i < n; i++) push({ elementId: el.id, feature: 'edge', index: i });
  return out;
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
  return best;
}

/** Ponto de uma ponta da cota: a referência resolvida (com a projeção `axis` do antigo) ou o ponto guardado. */
export function resolveDimEnd(p: Project, ref: DimensionRef | DimensionElementRef | undefined, fallback: Vec2): Vec2 {
  if (!ref) return fallback;
  const pt = resolveDimRef(p, ref);
  if (!pt) return fallback;
  if (!isElementRef(ref)) {
    if (ref.axis === 'x') return { x: pt.x, y: fallback.y };
    if (ref.axis === 'y') return { x: fallback.x, y: pt.y };
  }
  return pt;
}

/** Linhas oferecidas por parede, na ordem de prioridade (faces antes do eixo e do núcleo). */
const WALL_LINES: readonly DimWallLine[] = ['face-hi', 'face-lo', 'axis', 'core-hi', 'core-lo'];

/** Normal unitária (esquerda de a→b) da linha da parede referenciada; null se a ref não é de linha ou a parede sumiu. */
export function lineRefNormal(p: Pick<Project, 'elements' | 'wallTypes' | 'defaults'>, ref: DimensionRef | DimensionElementRef | undefined): Vec2 | null {
  if (!ref || !isElementRef(ref) || ref.feature !== 'wall-line') return null;
  const w = p.elements[ref.elementId];
  if (!isWall(w)) return null;
  const g = wallGeo(p, w);
  return g ? g.n : null;
}

/** Posição (s) da linha e a normal da parede, para o hit test e a escolha de referências na ferramenta. */
export interface WallLineHit { ref: DimensionElementRef; point: Vec2; normal: Vec2; distance: number }

/**
 * Linhas de parede (faces, eixo e núcleo) do nível a até `tol` (m) de `point`. O ponto devolvido é a projeção de `point`
 * na linha, limitada ao comprimento da parede. Paredes curvas não oferecem linha (a corda não é a linha real).
 */
export function wallLinesNear(p: Project, levelId: Id, point: Vec2, tol: number): WallLineHit[] {
  const out: WallLineHit[] = [];
  for (const w of wallsOnLevel(p, levelId)) {
    if (w.sag !== 0) continue;
    const g = wallGeo(p, w);
    if (!g) continue;
    const rel = { x: point.x - g.a.x, y: point.y - g.a.y };
    const t0 = rel.x * g.u.x + rel.y * g.u.y;
    const s0 = rel.x * g.n.x + rel.y * g.n.y;
    const t = Math.min(g.length, Math.max(0, t0));
    for (const line of WALL_LINES) {
      const s = lineS(g, line);
      const d = Math.hypot(t0 - t, s0 - s);
      if (d > tol) continue;
      const ref: DimensionElementRef = { elementId: w.id, feature: 'wall-line', line, along: Math.round(t * 1e4) / 1e4 };
      out.push({ ref, point: at(g, t, s), normal: g.n, distance: d });
    }
  }
  return out.sort((x, y) => x.distance - y.distance);
}

/**
 * Cota "alinhada" entre duas referências de linha paralelas: mede a perpendicular às linhas (o que o Revit faz entre faces).
 * Com qualquer outra combinação devolve `b` como está.
 */
export function perpendicularBetweenLines(p: Pick<Project, 'elements' | 'wallTypes' | 'defaults'>, refs: { a?: DimensionRef | DimensionElementRef; b?: DimensionRef | DimensionElementRef } | undefined, a: Vec2, b: Vec2): Vec2 {
  const na = lineRefNormal(p, refs?.a);
  const nb = lineRefNormal(p, refs?.b);
  if (!na || !nb || Math.abs(na.x * nb.y - na.y * nb.x) > 1e-6) return b;
  const k = (b.x - a.x) * na.x + (b.y - a.y) * na.y;
  return { x: a.x + na.x * k, y: a.y + na.y * k };
}

/** TODAS as feições de ponto (não só a melhor) a até `tol` de `point`, na ordem de prioridade e distância. */
export function dimRefsNear(p: Project, levelId: Id, point: Vec2, tol: number): Array<{ ref: DimensionElementRef; point: Vec2 }> {
  const out: Array<{ ref: DimensionElementRef; point: Vec2; d: number; i: number }> = [];
  let i = 0;
  const consider = (c: { ref: DimensionElementRef; point: Vec2 }): void => {
    const d = dist(c.point, point);
    if (d <= tol) out.push({ ...c, d, i: i++ });
  };
  for (const w of wallsOnLevel(p, levelId)) for (const c of dimRefCandidates(p, w)) consider(c);
  for (const el of Object.values(p.elements)) {
    if (isWall(el) || isOpening(el) || !('levelId' in el) || el.levelId !== levelId) continue;
    for (const c of dimRefCandidates(p, el)) consider(c);
  }
  return out.sort((x, y) => (Math.abs(x.d - y.d) < 1e-9 ? x.i - y.i : x.d - y.d)).map(({ ref, point: pt }) => ({ ref, point: pt }));
}

/** Geometria de parede para cotas "parede inteira": eixo unitário, normal, comprimento e deslocamentos das faces. */
export function wallDimFrame(p: Project, w: Wall): { a: Vec2; u: Vec2; n: Vec2; length: number; sHi: number; sLo: number } | null {
  const g = wallGeo(p, w);
  return g ? { a: g.a, u: g.u, n: g.n, length: g.length, sHi: g.sHi, sLo: g.sLo } : null;
}

/** Parede reta do nível cujo corpo (espessura + `tol`) contém `point`; a mais próxima do eixo vence. */
export function wallBodyAt(p: Project, levelId: Id, point: Vec2, tol: number): Wall | null {
  let best: Wall | null = null;
  let bestD = Infinity;
  for (const w of wallsOnLevel(p, levelId)) {
    if (w.sag !== 0) continue;
    const g = wallGeo(p, w);
    if (!g) continue;
    const rel = { x: point.x - g.a.x, y: point.y - g.a.y };
    const t = rel.x * g.u.x + rel.y * g.u.y;
    const s = rel.x * g.n.x + rel.y * g.n.y;
    if (t < -tol || t > g.length + tol || s < g.sLo - tol || s > g.sHi + tol) continue;
    const d = Math.abs(s - g.sMid);
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}
