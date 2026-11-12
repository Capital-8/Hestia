import { add, dot, mul, norm, sub, type Vec2 } from '@hestia/geom';
import { angularDimensionData, coreSpan, levelRoomSeparators, planViewsOfLevel, projectGrids, type Dimension, type Id, type Project } from '@hestia/model';
import { frameOfWall } from './resolve.ts';
import { pointAt, tangentAt } from './frame.ts';

interface WallRefLine {
  p: Vec2;
  d: Vec2;
  segment?: [Vec2, Vec2];
}

const WALL_REF = /^(.+):(face:hi|face:lo|eixo|nucleo:a|nucleo:b)$/;

/** Reta de uma referência de cota angular presa a uma parede (face, eixo ou face do núcleo). */
function wallRefLine(p: Project, key: string): WallRefLine | null {
  const m = WALL_REF.exec(key);
  if (!m) return null;
  const f = frameOfWall(p, m[1]!);
  if (!f) return null;
  const t = f.length / 2;
  const core = coreSpan(f.type);
  const s = m[2] === 'face:hi' ? f.sHi
    : m[2] === 'face:lo' ? f.sLo
    : m[2] === 'eixo' ? 0
    : f.sign * (f.extOffset - (m[2] === 'nucleo:a' ? core.from : core.to));
  return {
    p: pointAt(f, t, s),
    d: tangentAt(f, t),
    ...(!f.arc ? { segment: [pointAt(f, 0, s), pointAt(f, f.length, s)] as [Vec2, Vec2] } : {}),
  };
}

const segmentRef = (a: Vec2, b: Vec2): WallRefLine | null => {
  const d = sub(b, a);
  if (Math.hypot(d.x, d.y) < 1e-9) return null;
  return { p: a, d: norm(d), segment: [a, b] };
};

/** Resolve também grades, linhas de detalhe e separadores; desconhecidas mantêm a geometria gravada. */
function refLine(p: Project, levelId: Id, key: string): WallRefLine | null {
  const wall = wallRefLine(p, key);
  if (wall) return wall;
  const grid = /^(.+):grade:(\d+)$/.exec(key);
  if (grid) {
    const g = projectGrids(p).find((x) => x.id === grid[1]);
    const i = Number(grid[2]);
    if (!g || !g.points[i] || !g.points[i + 1]) return null;
    return segmentRef(g.points[i]!, g.points[i + 1]!);
  }
  const detail = /^(.+):detalhe$/.exec(key);
  if (detail) {
    // Linha de detalhe é anotação de UMA vista de planta do nível (piso, cobertura ou planta de área). O id é único no
    // projeto (as cópias levam o id da vista no sufixo), então basta achá-la na vista do nível que a possui.
    for (const v of planViewsOfLevel(p, levelId)) {
      const l = v.annotations.detailLines.find((x) => x.id === detail[1]);
      if (l) return segmentRef(l.a, l.b);
    }
    return null;
  }
  const sep = /^(.+):separador$/.exec(key);
  if (sep) {
    const r = levelRoomSeparators(p, levelId).find((x) => x.id === sep[1]);
    return r ? segmentRef(r.a, r.b) : null;
  }
  return null;
}

function intersection(a: Vec2, da: Vec2, b: Vec2, db: Vec2): Vec2 | null {
  const det = da.x * db.y - da.y * db.x;
  if (Math.abs(det) < 1e-9) return null;
  const t = ((b.x - a.x) * db.y - (b.y - a.y) * db.x) / det;
  return { x: a.x + da.x * t, y: a.y + da.y * t };
}

const orient = (line: WallRefLine, preferred: Vec2): Vec2 => {
  return dot(line.d, preferred) >= 0 ? line.d : { x: -line.d.x, y: -line.d.y };
};

/**
 * Linhas de chamada da cota angular, como no Revit: quando a ponta do arco passa da extremidade do trecho de uma
 * referência, liga essa extremidade à ponta. O arco segue as retas prolongadas; sem trecho além, não há linha.
 */
export function angularReachLinks(center: Vec2, dirA: Vec2, dirB: Vec2, radius: number, segA?: [Vec2, Vec2], segB?: [Vec2, Vec2]): Array<[Vec2, Vec2]> {
  const link = (dir: Vec2, seg?: [Vec2, Vec2]): [Vec2, Vec2] | null => {
    if (!seg) return null;
    const t0 = dot(sub(seg[0], center), dir);
    const t1 = dot(sub(seg[1], center), dir);
    const reach = Math.min(Math.max(radius, Math.min(t0, t1)), Math.max(t0, t1));
    if (Math.abs(reach - radius) < 1e-6) return null;
    return [add(center, mul(dir, reach)), add(center, mul(dir, radius))];
  };
  return [link(dirA, segA), link(dirB, segB)].filter((x): x is [Vec2, Vec2] => x !== null);
}

/**
 * Recalcula a cota angular a partir das chaves do Alinhar. Assim as faces/eixos/núcleos continuam valendo depois que a
 * parede se move; referências que não são paredes (ou chaves antigas) mantêm a geometria gravada.
 */
export function resolveAngularDimension(p: Project, levelId: Id, d: Dimension): Dimension {
  const a = d.angular;
  if (!a) return d;
  const ra = refLine(p, levelId, a.refA);
  const rb = refLine(p, levelId, a.refB);
  if (!ra || !rb) return d;
  const center = intersection(ra.p, ra.d, rb.p, rb.d);
  if (!center) return d;
  const data = angularDimensionData(center, orient(ra, a.from), orient(rb, a.to), a.radius, a.side, a.refA, a.refB, a.base);
  const links = angularReachLinks(center, data.from, data.to, a.radius, ra.segment, rb.segment);
  return { ...d, a: center, b: add(center, mul(data.to, a.radius)), angular: { ...a, ...data, links } };
}
