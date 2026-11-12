import { add, cross, dist, dot, len, mul, norm, sub, v2, type Vec2 } from '@hestia/geom';
import { frameOfWall, pointAt } from '@hestia/engine';
import {
  floorViewId,
  formatQuantity,
  isCeiling,
  isFloor,
  isRoof,
  isSlab,
  levelRoomSeparators,
  planViewOf,
  projectGrids,
  unitsOf,
  viewAnnotationsOf,
  wallsOnLevel,
  type Id,
  type Project,
  type ResolvedUnits,
} from '@hestia/model';
import { gridPath } from './gridGeom.ts';
import type { PreviewItem } from './types.ts';

export interface DraftLine {
  a: Vec2;
  b: Vec2;
}

export interface WallBand {
  a: Vec2;
  b: Vec2;
  thickness: number;
}

const distToSegment = (q: Vec2, a: Vec2, b: Vec2): number => {
  const d = sub(b, a);
  const l2 = dot(d, d);
  if (l2 < 1e-12) return dist(q, a);
  const t = Math.max(0, Math.min(1, dot(sub(q, a), d) / l2));
  return dist(q, add(a, mul(d, t)));
};

const segmentNear = (at: Vec2, seg: DraftLine, tol: number): boolean => distToSegment(at, seg.a, seg.b) <= tol;

const pushSegs = (out: DraftLine[], pts: Vec2[]): void => {
  for (let i = 1; i < pts.length; i++) if (dist(pts[i - 1]!, pts[i]!) > 1e-9) out.push({ a: pts[i - 1]!, b: pts[i]! });
};

const pointOnSegment = (a: Vec2, b: Vec2, t: number): Vec2 => add(a, mul(sub(b, a), t));

/** Recorta um trecho da prévia contra a faixa expandida da parede em criação. */
function pushOutsideBand(out: DraftLine[], a: Vec2, b: Vec2, band: WallBand, clearance: number): void {
  const isOutside = (p: Vec2): boolean => distToSegment(p, band.a, band.b) > clearance;
  const push = (p: Vec2, q: Vec2): void => {
    if (dist(p, q) > 1e-8) out.push({ a: p, b: q });
  };
  const boundary = (p: Vec2, q: Vec2, pOutside: boolean): Vec2 => {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (isOutside(pointOnSegment(p, q, mid)) === pOutside) lo = mid;
      else hi = mid;
    }
    return pointOnSegment(p, q, pOutside ? lo : hi);
  };

  const mid = pointOnSegment(a, b, 0.5);
  const aOutside = isOutside(a);
  const midOutside = isOutside(mid);
  const bOutside = isOutside(b);
  if (aOutside && bOutside && midOutside) {
    push(a, b);
  } else if (aOutside && bOutside) {
    push(a, boundary(a, mid, true));
    push(boundary(mid, b, false), b);
  } else if (aOutside) {
    push(a, boundary(a, b, true));
  } else if (bOutside) {
    push(boundary(a, b, false), b);
  }
}

/** Interseção das retas dos eixos; paralelas não têm um vértice angular estável. */
function lineIntersection(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const ab = sub(b, a);
  const cd = sub(d, c);
  const det = cross(ab, cd);
  if (Math.abs(det) < 1e-9) return null;
  const t = cross(sub(c, a), cd) / det;
  return add(a, mul(ab, t));
}

/**
 * Linha existente conectada ao ponto: parede (eixo), grade, detalhe, separador e arestas de piso/laje/telhado/forro.
 * É a base do ângulo dinâmico de qualquer ferramenta de desenho de linha.
 */
export function connectedLineAt(p: Project, levelId: Id, at: Vec2, mpp: number, planId?: Id | null): DraftLine | null {
  const tol = Math.max(0.02, 12 * mpp);
  const candidates: Array<{ line: DraftLine; tolerance: number }> = [];
  const addCandidate = (line: DraftLine, tolerance = tol): void => { candidates.push({ line, tolerance }); };
  for (const w of wallsOnLevel(p, levelId)) {
    const frame = frameOfWall(p, w.id);
    if (!frame) continue;
    addCandidate(
      { a: pointAt(frame, 0, frame.sMid), b: pointAt(frame, frame.length, frame.sMid) },
      Math.max(tol, frame.thickness / 2 + 2 * mpp),
    );
  }
  for (const g of projectGrids(p)) {
    const segs: DraftLine[] = [];
    pushSegs(segs, gridPath(g));
    for (const seg of segs) addCandidate(seg);
  }
  const plan = planId ? planViewOf(p, planId) : undefined;
  const annotations = plan ? viewAnnotationsOf(p, plan.id) : null;
  for (const l of annotations?.detailLines ?? viewAnnotationsOf(p, floorViewId(levelId)).detailLines) addCandidate({ a: l.a, b: l.b });
  for (const r of levelRoomSeparators(p, levelId)) addCandidate({ a: r.a, b: r.b });
  for (const e of Object.values(p.elements)) {
    if (!(isFloor(e) || isSlab(e) || isRoof(e) || isCeiling(e))) continue;
    if (e.levelId !== levelId) continue;
    const b = 'boundary' in e ? e.boundary : [];
    for (let i = 0; i < b.length; i++) addCandidate({ a: b[i]!, b: b[(i + 1) % b.length]! });
    const holes = 'holes' in e ? e.holes : [];
    for (const h of holes) for (let i = 0; i < h.length; i++) addCandidate({ a: h[i]!, b: h[(i + 1) % h.length]! });
  }
  let best: { line: DraftLine; d: number } | null = null;
  for (const candidate of candidates) {
    const { line } = candidate;
    if (!segmentNear(at, line, candidate.tolerance)) continue;
    const d = distToSegment(at, line.a, line.b);
    if (!best || d < best.d) best = { line, d };
  }
  return best?.line ?? null;
}

/** Direção da linha para longe do ponto de encontro. */
const away = (line: DraftLine, joint: Vec2): Vec2 => {
  const other = dist(line.a, joint) >= dist(line.b, joint) ? line.a : line.b;
  const d = sub(other, joint);
  return len(d) > 1e-9 ? norm(d) : norm(sub(line.b, line.a));
};

/** Centraliza o valor na bissetriz e o afasta até não colidir com pontos nem com a faixa da parede. */
function labelAt(center: Vec2, angle: number, radius: number, avoid: Vec2[], mpp: number, band?: WallBand): Vec2 | null {
  const bandClearance = band ? band.thickness / 2 + Math.max(0.02, 14 * mpp) : 0;
  const pointClearance = Math.max(0.12, 18 * mpp);
  const firstRadius = radius + Math.max(0.05, 10 * mpp);
  const farthestAvoid = avoid.reduce((far, p) => Math.max(far, dist(center, p)), 0);
  const farthestBandEnd = band ? Math.max(dist(center, band.a), dist(center, band.b)) : 0;
  const lastRadius = Math.max(
    firstRadius + 4 * pointClearance,
    farthestAvoid + pointClearance,
    band ? farthestBandEnd + bandClearance + pointClearance : 0,
  );
  const radii = [firstRadius, firstRadius + pointClearance, firstRadius + 2 * pointClearance, firstRadius + 4 * pointClearance, lastRadius];
  for (const r of radii) {
    const at = add(center, v2(Math.cos(angle) * r, Math.sin(angle) * r));
    if (band && distToSegment(at, band.a, band.b) <= bandClearance) continue;
    if (avoid.every((p) => dist(at, p) > pointClearance)) return at;
  }
  return null;
}

/**
 * Arco e valor do ângulo menor entre uma linha de referência e o trecho em criação. A referência pode ser o segmento
 * anterior da cadeia (`previous`) ou uma linha existente conectada ao ponto inicial. O valor fica na bissetriz; quando
 * há uma parede em prévia, somente o trecho terminal que chega ao eixo pode entrar na faixa da parede.
 */
export function draftAngleItems(opts: {
  previous?: DraftLine | null;
  joint: Vec2;
  current: Vec2;
  mpp: number;
  units: ResolvedUnits;
  avoid?: Vec2[];
  /** Faixa da parede que está sendo criada; o texto não pode cair dentro dela. */
  band?: WallBand;
}): PreviewItem[] {
  const { joint, current, mpp, units } = opts;
  if (!opts.previous || dist(joint, current) < 0.01) return [];
  const axis = opts.band ?? { a: joint, b: current, thickness: 0 };
  const center = lineIntersection(opts.previous.a, opts.previous.b, axis.a, axis.b) ?? joint;
  const dirA = away(opts.previous, center);
  const dirB = norm(sub(axis.b, center));
  if (len(dirB) < 1e-9) return [];
  const value = Math.acos(Math.max(-1, Math.min(1, dot(dirA, dirB))));
  if (value < 0.01 || value > Math.PI - 0.01) return [];
  const radius = Math.max(45 * mpp, Math.min(120 * mpp, dist(center, axis.b) * 0.75));
  const sign = cross(dirA, dirB) >= 0 ? 1 : -1;
  const start = Math.atan2(dirA.y, dirA.x);
  const out: PreviewItem[] = [];
  const steps = Math.min(180, Math.max(36, Math.ceil((radius * value) / Math.max(4 * mpp, 0.02))));
  const bandClearance = opts.band ? opts.band.thickness / 2 + Math.max(0.02, 6 * mpp) : 0;
  const arcPoints = Array.from({ length: steps + 1 }, (_, i) => {
    const a = start + (sign * value * i) / steps;
    return add(center, v2(Math.cos(a) * radius, Math.sin(a) * radius));
  });
  let terminalInsideStart = arcPoints.length - 1;
  if (opts.band) {
    while (terminalInsideStart > 0 && distToSegment(arcPoints[terminalInsideStart - 1]!, opts.band.a, opts.band.b) <= bandClearance) terminalInsideStart--;
  }
  for (let i = 1; i < arcPoints.length; i++) {
    const a = arcPoints[i - 1]!;
    const b = arcPoints[i]!;
    if (opts.band) {
      // Preserve the actual endpoint on the second axis. Only the final run inside the wall band is retained;
      // the rest of the arc stays clear of the wall.
      if (terminalInsideStart > 0 && i >= terminalInsideStart) {
        out.push({ kind: 'line', a, b });
        continue;
      }
      const clipped: DraftLine[] = [];
      pushOutsideBand(clipped, a, b, opts.band, bandClearance);
      out.push(...clipped.map((seg) => ({ kind: 'line' as const, ...seg })));
    } else out.push({ kind: 'line', a, b });
  }
  const mid = start + (sign * value) / 2;
  const textAt = labelAt(center, mid, radius, [...(opts.avoid ?? []), current, joint, center], mpp, opts.band);
  if (textAt) {
    const textAngle = (mid * 180) / Math.PI;
    const rotation = textAngle > 90 ? textAngle - 180 : textAngle <= -90 ? textAngle + 180 : textAngle;
    out.push({ kind: 'label', at: textAt, text: formatQuantity(units, 'angle', value), dimensionStyle: true, rotation });
  }
  return out;
}

/** Ângulo entre dois segmentos, usando o ponto final do anterior como encontro. */
export function draftAngleItemsForConnection(
  p: Project,
  levelId: Id,
  planId: Id | null | undefined,
  joint: Vec2,
  current: Vec2,
  mpp: number,
  units: ResolvedUnits,
  band?: WallBand,
): PreviewItem[] {
  const previous = connectedLineAt(p, levelId, joint, mpp, planId);
  return draftAngleItems({ previous, joint, current, mpp, units, avoid: [current], ...(band ? { band } : {}) });
}

/** Atalho para ferramentas que já têm um segmento anterior no próprio rascunho. */
export const draftAngleItemsForPrevious = (previous: DraftLine | null | undefined, joint: Vec2, current: Vec2, mpp: number, units: ResolvedUnits): PreviewItem[] =>
  draftAngleItems({ previous, joint, current, mpp, units, avoid: [current] });

/** Usa o último segmento do esboço quando ele termina no ponto; senão procura uma linha existente conectada. */
export function draftAngleItemsForDraft(
  p: Project,
  levelId: Id,
  planId: Id | null | undefined,
  segs: ReadonlyArray<DraftLine>,
  joint: Vec2,
  current: Vec2,
  mpp: number,
  units: ResolvedUnits,
): PreviewItem[] {
  const last = segs[segs.length - 1];
  const previous = last && dist(last.b, joint) < 1e-4
    ? { a: last.a, b: last.b }
    : connectedLineAt(p, levelId, joint, mpp, planId);
  return draftAngleItems({ previous, joint, current, mpp, units, avoid: [current] });
}

/** Unidades do projeto, importadas aqui para as ferramentas não repetirem o cálculo. */
export const unitsForDraft = (p: Project): ResolvedUnits => unitsOf(p);
