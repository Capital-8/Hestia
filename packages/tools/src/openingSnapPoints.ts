import type { Vec2 } from '@hestia/geom';
import { buildOpeningModel, frameOfWall, openingAnchoredPoint, openingGeometry, pointAt, type LeafOpening, type OpeningModel, type OpeningPlanAnchor, type WallFrame } from '@hestia/engine';
import { openingTypeById, openingAngle2d, openingsOfWall, wallsOnLevel, type Id, type OpeningType, type Project, type Wall } from '@hestia/model';
import type { SnapPoint } from './infer.ts';
import type { SnapKind } from './types.ts';

/** Segmento de captura de uma abertura: a ombreira atravessa a espessura da parede, de uma face à outra. */
export interface OpeningSnapSegment {
  a: Vec2;
  b: Vec2;
  hostId: Id;
  /** Tipo da captura no segmento (a ombreira é 'face'); ausente = 'nearest', como as arestas de piso. */
  kind?: SnapKind;
}

export interface OpeningSnapGeometry {
  points: SnapPoint[];
  segments: OpeningSnapSegment[];
}

/** Geometria por projeto e nível: o projeto é imutável, então o cache por identidade acompanha as edições. */
const cache = new WeakMap<Project, Map<Id, OpeningSnapGeometry>>();

function at(f: WallFrame, t: number, s: number): Vec2 {
  return pointAt(f, t, s);
}

/** Sinal do giro da folha: o mesmo de `openingSign` (movimento da folha, ou a regra do lado). */
function leafSign(leaf: LeafOpening, model: OpeningModel): 1 | -1 {
  const motion = model.parts.find((p) => p.role === 'leaf' && p.leaf === leaf.leaf)?.motion;
  if (motion && motion.kind === 'rotate' && motion.axis === 'z') return motion.sign;
  return (leaf.side * (leaf.latchT > leaf.hingeT ? 1 : -1)) as 1 | -1;
}

/** Caixa da folha `index` em `t` (união das peças da folha), como `leafBox` da planta. */
function leafT(model: OpeningModel, index: number): [number, number] | null {
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const part of model.parts) {
    if (part.role !== 'leaf' || part.leaf !== index) continue;
    t0 = Math.min(t0, part.box.t0);
    t1 = Math.max(t1, part.box.t1);
  }
  return t0 <= t1 ? [t0, t1] : null;
}

/** Dobradiça e ponta do arco de giro, na mesma conta do símbolo de planta (`addOpeningArc`). */
function swingPoints(t: OpeningType, g: ReturnType<typeof openingGeometry>, model: OpeningModel): Vec2[] {
  const angle = (openingAngle2d(t) * Math.PI) / 180;
  const out: Vec2[] = [];
  for (const leaf of model.openings) {
    if (leaf.kind !== 'side' && leaf.kind !== 'pivot') continue;
    const pivot = leaf.pivot;
    const anchor: OpeningPlanAnchor = {
      t: pivot.t,
      s: pivot.s,
      ...(leaf.kind === 'pivot' ? {} : { refT: leaf.latchT }),
    };
    out.push(openingAnchoredPoint(g, anchor, pivot.t, pivot.s));
    const closedEnds = leaf.kind === 'pivot' ? (leafT(model, leaf.leaf) ?? [leaf.latchT, leaf.latchT]) : [leaf.latchT];
    const sweep = leafSign(leaf, model) * angle;
    const cos = Math.cos(sweep);
    const sin = Math.sin(sweep);
    for (const closedT of closedEnds) {
      const dt = closedT - pivot.t;
      out.push(openingAnchoredPoint(g, anchor, pivot.t + dt * cos, pivot.s + dt * sin));
    }
  }
  return out;
}

/** Abertura com os pontos e as ombreiras para a captura. `hostId` é a parede: some quando ela está em `ignore`. */
function geometryOfLevel(p: Project, levelId: Id): OpeningSnapGeometry {
  const points: SnapPoint[] = [];
  const segments: OpeningSnapSegment[] = [];
  for (const w of wallsOnLevel(p, levelId)) {
    const f = frameOfWall(p, w.id);
    if (!f) continue;
    for (const o of openingsOfWall(p, w.id)) {
      const t = openingTypeById(p, o.typeId);
      if (!t) continue;
      const half = t.width / 2;
      const t0 = o.offset - half;
      const t1 = o.offset + half;
      for (const s of [f.sHi, f.sLo]) {
        points.push({ ...at(f, t0, s), hostId: w.id, kind: 'endpoint' });
        points.push({ ...at(f, t1, s), hostId: w.id, kind: 'endpoint' });
      }
      points.push({ ...at(f, o.offset, f.sMid), hostId: w.id, kind: 'center' });
      segments.push({ a: at(f, t0, f.sHi), b: at(f, t0, f.sLo), hostId: w.id, kind: 'face' });
      segments.push({ a: at(f, t1, f.sHi), b: at(f, t1, f.sLo), hostId: w.id, kind: 'face' });
      if (o.kind !== 'door') continue;
      const g = openingGeometry(p, o, f);
      const model = buildOpeningModel(p, o, g, f);
      for (const q of swingPoints(t, g, model)) points.push({ ...q, hostId: w.id, kind: 'endpoint' });
    }
  }
  return { points, segments };
}

/**
 * Pontos e segmentos de captura das aberturas do nível: os quatro cantos do vão nas duas faces, o centro e as
 * ombreiras; nas portas de giro, também a dobradiça e a ponta do arco. `isVisible` é o mesmo filtro da captura das
 * paredes (ocultas ou fora do recorte não entram).
 */
export function openingSnapGeometry(p: Project, levelId: Id, isVisible?: (w: Wall) => boolean): OpeningSnapGeometry {
  let byLevel = cache.get(p);
  if (!byLevel) {
    byLevel = new Map();
    cache.set(p, byLevel);
  }
  let all = byLevel.get(levelId);
  if (!all) {
    all = geometryOfLevel(p, levelId);
    byLevel.set(levelId, all);
  }
  if (!isVisible) return all;
  const visible = new Set(wallsOnLevel(p, levelId).filter(isVisible).map((w) => w.id));
  return {
    points: all.points.filter((q) => q.hostId === undefined || visible.has(q.hostId)),
    segments: all.segments.filter((s) => visible.has(s.hostId)),
  };
}
