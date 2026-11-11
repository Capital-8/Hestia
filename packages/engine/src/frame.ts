import { arcFromSagitta, arcLocal, arcPointAt, arcTangentAt, dist, dot, intersectLines, len as vlen, norm, perp, sub, type Arc, type Vec2 } from '@hestia/geom';
import { coreSpan, wallThicknessOf, type LocationLine, type Wall, type WallType } from '@hestia/model';

/**
 * Sistema de coordenadas de uma parede. `t` corre ao longo do eixo a→b; `s` mede para a ESQUERDA
 * de a→b (normal `n`). A face externa fica à esquerda, salvo `flipped` (docs/05 §3).
 */
export interface WallFrame {
  wall: Wall;
  type: WallType;
  a: Vec2;
  b: Vec2;
  u: Vec2;
  n: Vec2;
  /** Comprimento do eixo: arco nas paredes curvas. */
  length: number;
  /** Arco do eixo; null se reta. u e n são a tangente e a normal do INÍCIO. */
  arc: Arc | null;
  sign: 1 | -1;
  /** Distância da face externa até a linha de localização. */
  extOffset: number;
  thickness: number;
  /** Coordenada s da face externa / interna. */
  sExt: number;
  sInt: number;
  sHi: number;
  sLo: number;
  sMid: number;
  /** Faixa vertical da parede (cota da base e cota do topo). Ausente = desconhecida: a junção não filtra por altura. */
  z?: { z0: number; top: number };
}

/** Distância da face externa até a linha de localização escolhida. */
export function exteriorOffset(type: WallType, loc: LocationLine): number {
  const total = wallThicknessOf(type);
  const core = coreSpan(type);
  switch (loc) {
    case 'wallCenter':
      return total / 2;
    case 'coreCenter':
      return (core.from + core.to) / 2;
    case 'finishExterior':
      return 0;
    case 'finishInterior':
      return total;
    case 'coreExterior':
      return core.from;
    case 'coreInterior':
      return core.to;
  }
}

export function buildFrame(wall: Wall, type: WallType): WallFrame | null {
  const d = sub(wall.b, wall.a);
  const chord = vlen(d);
  if (chord < 1e-4) return null;
  const arc = arcFromSagitta(wall.a, wall.b, wall.sag);
  const length = arc ? arc.length : chord;
  const u = arc ? arcTangentAt(arc, 0) : norm(d);
  const n = perp(u);
  const sign: 1 | -1 = wall.flipped ? -1 : 1;
  const thickness = wallThicknessOf(type);
  const extOffset = exteriorOffset(type, wall.locationLine);
  const sExt = sign * extOffset;
  const sInt = sign * (extOffset - thickness);
  const sHi = Math.max(sExt, sInt);
  const sLo = Math.min(sExt, sInt);
  return { wall, type, a: wall.a, b: wall.b, u, n, length, arc, sign, extOffset, thickness, sExt, sInt, sHi, sLo, sMid: (sHi + sLo) / 2 };
}

export function pointAt(f: WallFrame, t: number, s: number): Vec2 {
  if (f.arc) return arcPointAt(f.arc, t, s);
  return { x: f.a.x + f.u.x * t + f.n.x * s, y: f.a.y + f.u.y * t + f.n.y * s };
}

/** Tangente do eixo em t (sentido a→b) e normal à esquerda. */
export function tangentAt(f: WallFrame, t: number): Vec2 {
  return f.arc ? arcTangentAt(f.arc, t) : f.u;
}
export const normalAt = (f: WallFrame, t: number): Vec2 => perp(tangentAt(f, t));

/** Tangente em a ou b (sentido a→b). */
export const endTangent = (f: WallFrame, which: 'a' | 'b'): Vec2 => tangentAt(f, which === 'a' ? 0 : f.length);

/** Coordenada s de um plano a profundidade `d` da face externa. */
export const sAtDepth = (f: WallFrame, d: number): number => f.sign * (f.extOffset - d);

/** Posição (t, s) de um ponto do mundo no sistema da parede. */
export function toLocal(f: WallFrame, p: Vec2): { t: number; s: number } {
  if (f.arc) return arcLocal(f.arc, p);
  const r = sub(p, f.a);
  return { t: dot(r, f.u), s: dot(r, f.n) };
}

/** Curva de uma face de parede: reta (ponto e direção unitária) ou circunferência (centro e raio). */
export type Curve = { kind: 'line'; p: Vec2; d: Vec2 } | { kind: 'circle'; c: Vec2; r: number };

/** Face à profundidade `s`: reta paralela ao eixo, ou circunferência de raio R + k·s no arco. */
export function faceCurve(f: WallFrame, s: number): Curve {
  if (f.arc) return { kind: 'circle', c: f.arc.center, r: f.arc.radius + f.arc.k * s };
  return { kind: 'line', p: { x: f.a.x + f.n.x * s, y: f.a.y + f.n.y * s }, d: f.u };
}

/**
 * Interseção exata de duas curvas de face (reta ou círculo), a que fica mais perto de `near` (o nó). Em vez da
 * tangente, a interseção é a mesma vista dos dois lados do canto: o pareamento de duas paredes curvas e de uma
 * curva com uma reta depende disso (qualquer erro vira fresta ou sobreposição entre os dois anéis).
 */
/**
 * Ponto em que a face de profundidade `s` (reta ou arco) cruza o segmento p→q do corte plano. A reta pode cruzar a
 * circunferência em duas raízes: vale a que cai dentro do segmento (entre O e K); sem nenhuma, a mais perto de `near`.
 */
export function planeHit(f: WallFrame, s: number, p: Vec2, q: Vec2, near: Vec2): Vec2 | null {
  const reta: Curve = { kind: 'line', p, d: norm(sub(q, p)) };
  const face = faceCurve(f, s);
  const raizes = face.kind === 'circle' ? lineCircle(reta, face) : [intersectCurves(face, reta, near)].filter((x): x is Vec2 => x !== null);
  const d = sub(q, p);
  const ll = dot(d, d);
  const dentro = raizes.filter((x) => {
    const lam = dot(sub(x, p), d) / ll;
    return lam >= -1e-6 && lam <= 1 + 1e-6;
  });
  return nearest(dentro.length ? dentro : raizes, near);
}

export function intersectCurves(g: Curve, h: Curve, near: Vec2): Vec2 | null {
  if (g.kind === 'line' && h.kind === 'line') {
    const r = intersectLines(g.p, g.d, h.p, h.d);
    return r ? r.point : null;
  }
  if (g.kind === 'line' && h.kind === 'circle') return nearest(lineCircle(g, h), near);
  if (g.kind === 'circle' && h.kind === 'line') return nearest(lineCircle(h, g), near);
  if (g.kind === 'circle' && h.kind === 'circle') return nearest(circleCircle(g, h), near);
  return null;
}

const nearest = (pts: Vec2[], near: Vec2): Vec2 | null => {
  let best: Vec2 | null = null;
  for (const p of pts) if (!best || dist(p, near) < dist(best, near)) best = p;
  return best;
};

function lineCircle(l: Extract<Curve, { kind: 'line' }>, c: Extract<Curve, { kind: 'circle' }>): Vec2[] {
  const w = sub(l.p, c.c);
  const b = dot(l.d, w);
  // Reta tangente à circunferência (continuidade reta→arco): o discriminante pode dar −1e-16 por arredondamento.
  const raw = b * b - (dot(w, w) - c.r * c.r);
  if (raw < -1e-10) return [];
  const sq = Math.sqrt(Math.max(0, raw));
  return [-b - sq, -b + sq].map((k) => ({ x: l.p.x + l.d.x * k, y: l.p.y + l.d.y * k }));
}

function circleCircle(g: Extract<Curve, { kind: 'circle' }>, h: Extract<Curve, { kind: 'circle' }>): Vec2[] {
  const dv = sub(h.c, g.c);
  const d = Math.hypot(dv.x, dv.y);
  if (d < 1e-12) return [];
  const a = (g.r * g.r - h.r * h.r + d * d) / (2 * d);
  const h2 = g.r * g.r - a * a;
  if (h2 < -1e-10) return [];
  const hh = Math.sqrt(Math.max(0, h2));
  const ux = dv.x / d;
  const uy = dv.y / d;
  const bx = g.c.x + ux * a;
  const by = g.c.y + uy * a;
  return [
    { x: bx - uy * hh, y: by + ux * hh },
    { x: bx + uy * hh, y: by - ux * hh },
  ];
}
