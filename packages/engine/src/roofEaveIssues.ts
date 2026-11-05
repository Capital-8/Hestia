import { dot, sub, type Vec2 } from '@hestia/geom';
import { formatQuantity, openingTypeById, isOpening, isRoof, isWall, unitsOf, type Id, type Opening, type Project, type ValidationIssue, type Wall } from '@hestia/model';
import { buildFrame, type WallFrame } from './frame.ts';
import { t, type Lang } from './i18nMessages.ts';
import { expandRoofArcs } from './roofArcs.ts';

/** Distância (m) do beiral à abertura abaixo da qual se avisa (checagem de proximidade, `roof-eave-opening`). */
export const EAVE_OPENING_DISTANCE = 0.3;
/** Folga (m): encostar na face da parede não é invasão; também é a espessura mínima de penetração (1 mm). */
const TOUCH_TOL = 1e-3;

/** Retângulo alinhado aos eixos da parede (t ao longo do eixo, s na normal). */
interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/** Parede reta do nível com a moldura local: corpo = t em [0, L] e s em [lo, hi] (eixo, `locationLine` e espessura). */
interface Body {
  wall: Wall;
  frame: WallFrame;
  L: number;
  lo: number;
  hi: number;
}

const label = (e: { id: Id; mark: string }): string => (e.mark ? `"${e.mark}" (${e.id})` : `"${e.id}"`);
/** Coordenadas locais da parede (isometria: as distâncias não mudam). */
function local(f: WallFrame, p: Vec2): Vec2 {
  const d = sub(p, f.a);
  return { x: dot(d, f.u), y: dot(d, f.n) };
}

/** O segmento p–q toca o retângulo fechado b? (Liang–Barsky) */
function segmentHitsBox(p: Vec2, q: Vec2, b: Box): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const checks: Array<[number, number]> = [
    [-dx, p.x - b.x0],
    [dx, b.x1 - p.x],
    [-dy, p.y - b.y0],
    [dy, b.y1 - p.y],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pk, qk] of checks) {
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) t0 = Math.max(t0, r);
    else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

const pointBoxDist = (c: Vec2, b: Box): number =>
  Math.hypot(Math.max(b.x0 - c.x, 0, c.x - b.x1), Math.max(b.y0 - c.y, 0, c.y - b.y1));

function pointSegDist(c: Vec2, p: Vec2, q: Vec2): number {
  const d = sub(q, p);
  const len2 = dot(d, d);
  const t = len2 > 0 ? Math.min(1, Math.max(0, dot(sub(c, p), d) / len2)) : 0;
  return Math.hypot(p.x + d.x * t - c.x, p.y + d.y * t - c.y);
}

/** Distância entre o segmento p–q e o retângulo b (0 quando se tocam). */
function segBoxDist(p: Vec2, q: Vec2, b: Box): number {
  if (segmentHitsBox(p, q, b)) return 0;
  const corners: Vec2[] = [
    { x: b.x0, y: b.y0 },
    { x: b.x1, y: b.y0 },
    { x: b.x1, y: b.y1 },
    { x: b.x0, y: b.y1 },
  ];
  return Math.min(pointBoxDist(p, b), pointBoxDist(q, b), ...corners.map((c) => pointSegDist(c, p, q)));
}

/** Paredes retas com tipo e espessura válidos; curvas ficam de fora (o corpo do arco não é checado). */
function bodiesOf(p: Project): Body[] {
  const out: Body[] = [];
  for (const e of Object.values(p.elements)) {
    if (!isWall(e)) continue;
    const type = p.wallTypes[e.typeId];
    if (!type) continue;
    const frame = buildFrame(e, type);
    if (!frame || frame.arc) continue;
    const { length: L, sLo: lo, sHi: hi } = frame;
    if (L <= 2 * TOUCH_TOL || hi - lo <= 2 * TOUCH_TOL) continue;
    out.push({ wall: e, frame, L, lo, hi });
  }
  return out;
}

/** Arestas do contorno do telhado (a aresta i vai de boundary[i] a boundary[i+1]; o contorno fecha sozinho). */
function eaveEdges(boundary: Vec2[]): Array<{ p: Vec2; q: Vec2 }> {
  return boundary.map((p, i) => ({ p, q: boundary[(i + 1) % boundary.length]! }));
}

/**
 * Avisos de beiral do telhado (não bloqueantes, no painel de avisos):
 * - `roof-eave-wall`: uma aresta do contorno entra no corpo de uma parede do mesmo nível (eixo ± metade da espessura).
 *   Encostar na face não conta; parede inteira sob o telhado também não.
 * - `roof-eave-opening`: uma aresta com balanço real (não encosta em parede do nível) passa a menos de
 *   `EAVE_OPENING_DISTANCE` de uma abertura hospedada numa parede do mesmo nível.
 * Paredes curvas não são checadas. A cota do beiral não entra no cálculo (só a planta).
 */
export function roofEaveIssues(p: Project, lang: Lang = 'pt'): ValidationIssue[] {
  const units = unitsOf(p);
  const roofs = Object.values(p.elements).filter(isRoof);
  if (roofs.length === 0) return [];
  const bodies = bodiesOf(p);
  const bodyById = new Map(bodies.map((b) => [b.wall.id, b] as const));
  const openings: Opening[] = Object.values(p.elements).filter(isOpening);
  const out: ValidationIssue[] = [];
  for (const roof of roofs) {
    if (roof.boundary.length < 3) continue;
    const onLevel = bodies.filter((b) => b.wall.levelId === roof.levelId);
    const edges = eaveEdges(expandRoofArcs(roof).boundary);

    for (const b of onLevel) {
      const inner: Box = { x0: TOUCH_TOL, x1: b.L - TOUCH_TOL, y0: b.lo + TOUCH_TOL, y1: b.hi - TOUCH_TOL };
      if (edges.some((e) => segmentHitsBox(local(b.frame, e.p), local(b.frame, e.q), inner))) {
        out.push({
          severity: 'warning',
          code: 'roof-eave-wall',
          message: t(lang, 'egb_issue_roof_eave_wall', { roof: label(roof), wall: label(b.wall) }),
          elementId: roof.id,
          ids: [roof.id, b.wall.id],
        });
      }
    }

    // Balanço real: a aresta não pode encostar em nenhuma parede do nível (encostar é contorno sem balanço).
    const free = edges.filter((e) =>
      onLevel.every((b) => {
        const outer: Box = { x0: 0, x1: b.L, y0: b.lo, y1: b.hi };
        return segBoxDist(local(b.frame, e.p), local(b.frame, e.q), outer) > TOUCH_TOL;
      }),
    );
    if (free.length === 0) continue;

    for (const o of openings) {
      const host = bodyById.get(o.hostId);
      const type = openingTypeById(p, o.typeId);
      if (!host || !type || host.wall.levelId !== roof.levelId) continue;
      const box: Box = { x0: o.offset - type.width / 2, x1: o.offset + type.width / 2, y0: host.lo, y1: host.hi };
      let best = Infinity;
      for (const e of free) best = Math.min(best, segBoxDist(local(host.frame, e.p), local(host.frame, e.q), box));
      if (best < EAVE_OPENING_DISTANCE) {
        out.push({
          severity: 'warning',
          code: 'roof-eave-opening',
          message: t(lang, 'egb_issue_roof_eave_opening', {
            roof: label(roof),
            dist: formatQuantity(units, 'smallLength', best),
            opening: label(o),
            limit: formatQuantity(units, 'smallLength', EAVE_OPENING_DISTANCE),
          }),
          elementId: roof.id,
          ids: [roof.id, o.id],
        });
      }
    }
  }
  return out;
}
