import { fitArcs, TOL_PADRAO, MAX_ARCOS_PADRAO, type Vec2 } from '@hestia/geom';

/** Segmento de parede: corda a→b e flecha com sinal (positiva à esquerda de a→b), como `Wall.sag`. */
export interface WallSegment {
  a: Vec2;
  b: Vec2;
  sag: number;
}

export const POLYGON_SIDES_MIN = 3;
export const POLYGON_SIDES_MAX = 64;

const ok = (p: Vec2): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

/** Área com sinal (positiva = anti-horário) do polígono formado pelas pontas `a` dos segmentos. */
function signedArea(segs: WallSegment[]): number {
  let s = 0;
  for (let i = 0; i < segs.length; i++) {
    const p = segs[i]!.a;
    const q = segs[(i + 1) % segs.length]!.a;
    s += p.x * q.y - q.x * p.y;
  }
  return s / 2;
}

/** Inverte o percurso (a↔b, flecha com sinal trocado, ordem invertida): o lado deixa de ser o mesmo. */
const reversed = (segs: WallSegment[]): WallSegment[] =>
  segs.map((s) => ({ a: s.b, b: s.a, sag: -s.sag })).reverse();

/** Contornos fechados saem no sentido horário: a face externa fica à esquerda de a→b (padrão do motor, flipped=false). */
const clockwise = (segs: WallSegment[]): WallSegment[] => (segs.length > 1 && signedArea(segs) > 0 ? reversed(segs) : segs);

/**
 * Polígono regular. `through` define o raio e a rotação: inscrito, é um vértice; circunscrito, é o ponto médio
 * de um lado (raio = apótema). Lados 3 a 64; degenerado devolve [].
 */
export function polygonSegments(center: Vec2, through: Vec2, sides: number, circumscribed = false): WallSegment[] {
  const n = Math.round(sides);
  if (!ok(center) || !ok(through) || n < POLYGON_SIDES_MIN || n > POLYGON_SIDES_MAX) return [];
  const r = Math.hypot(through.x - center.x, through.y - center.y);
  if (!(r > 1e-9)) return [];
  const phi = Math.atan2(through.y - center.y, through.x - center.x);
  const rv = circumscribed ? r / Math.cos(Math.PI / n) : r;
  const start = circumscribed ? phi - Math.PI / n : phi;
  const vs: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    // Horário: o ângulo decresce.
    const th = start - (2 * Math.PI * i) / n;
    vs.push({ x: center.x + rv * Math.cos(th), y: center.y + rv * Math.sin(th) });
  }
  return vs.map((a, i) => ({ a, b: vs[(i + 1) % n]!, sag: 0 }));
}

/** Círculo como dois arcos de 180° (|sag| = raio). Com `rotacao` 0: a=(cx-r, cy), b=(cx+r, cy). */
export function circleSegments(center: Vec2, radius: number, rotacao = 0): WallSegment[] {
  if (!ok(center) || !(radius > 1e-9) || !Number.isFinite(rotacao)) return [];
  const u = { x: Math.cos(rotacao) * radius, y: Math.sin(rotacao) * radius };
  const p = { x: center.x - u.x, y: center.y - u.y };
  const q = { x: center.x + u.x, y: center.y + u.y };
  // Horário: a esquerda da corda é o lado de fora, então a flecha é positiva.
  return [{ a: p, b: q, sag: radius }, { a: q, b: p, sag: radius }];
}

/** Elipse ajustada a arcos tangentes (`fitArcs`); `rotacao` em radianos. 16 arcos para rx=4, ry=2 com tol 5 mm. */
export function ellipseSegments(center: Vec2, rx: number, ry: number, rotacao = 0, tol: number = TOL_PADRAO, maxArcos: number = MAX_ARCOS_PADRAO): WallSegment[] {
  if (!ok(center) || !(rx > 1e-9) || !(ry > 1e-9) || !Number.isFinite(rotacao)) return [];
  return clockwise(fitArcs({ tipo: 'elipse', centro: center, rx, ry, rotacao }, tol, maxArcos).arcos);
}

/** Spline (Catmull-Rom centrípeta) pelos pontos clicados, ajustada a arcos. Aberta (>= 2 pontos) ou fechada (>= 3). */
export function splineSegments(points: readonly Vec2[], closed = false, tol: number = TOL_PADRAO, maxArcos: number = MAX_ARCOS_PADRAO): WallSegment[] {
  if (points.some((p) => !ok(p)) || points.length < (closed ? 3 : 2)) return [];
  const r = fitArcs({ tipo: 'spline', pontos: [...points], fechada: closed }, tol, maxArcos);
  return closed ? clockwise(r.arcos) : r.arcos;
}
