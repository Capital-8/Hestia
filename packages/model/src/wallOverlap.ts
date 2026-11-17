import { arcFromSagitta, cross, dist, dot, norm, sub, type Arc, type Vec2 } from '@hestia/geom';
import { isWall, type Id, type Project, type Wall } from './types.ts';

/** Abaixo disso a parede não tem direção definida. */
export const MIN_WALL_LENGTH = 0.001;
/** Trecho comum mínimo para duas paredes colineares serem consideradas sobrepostas (item C14). */
export const WALL_OVERLAP_MIN = 0.05;
/** Ângulo máximo entre eixos para serem "praticamente colineares" (1°). */
export const COLLINEAR_ANGLE = (1 * Math.PI) / 180;
/** Distância lateral máxima entre eixos para serem "praticamente colineares" (1 cm). */
export const COLLINEAR_OFFSET = 0.01;

export interface WallOverlap {
  /** Trecho em comum dos eixos, em metros. */
  length: number;
  /** Distância entre os eixos no meio do trecho comum, em metros. */
  lateral: number;
}

/** O que o critério olha: o eixo a→b e a curvatura opcional `sag`. */
export type WallAxis = Pick<Wall, 'a' | 'b'> & { sag?: number };

const TAU = Math.PI * 2;
const normAngle = (rad: number): number => ((rad % TAU) + TAU) % TAU;

/** Intervalos [lo, hi] em [0, 2π] ocupados por um arco. */
function arcIntervals(arc: Arc): Array<[number, number]> {
  const start = normAngle(arc.a0);
  const end = start + arc.sweep;
  if (arc.sweep >= 0) return end <= TAU ? [[start, end]] : [[start, TAU], [0, end - TAU]];
  return end >= 0 ? [[end, start]] : [[0, start], [end + TAU, TAU]];
}

/** Sobreposição entre duas paredes em arco: mesmo círculo (centro e raio dentro de 1 cm) e trecho angular comum > 5 cm. */
function curvedWallOverlap(a: Arc, b: Arc): WallOverlap | null {
  const lateral = dist(a.center, b.center) + Math.abs(a.radius - b.radius);
  if (lateral >= COLLINEAR_OFFSET) return null;
  let sharedAngle = 0;
  for (const [a0, a1] of arcIntervals(a)) {
    for (const [b0, b1] of arcIntervals(b)) {
      const lo = Math.max(a0, b0);
      const hi = Math.min(a1, b1);
      if (hi > lo) sharedAngle += hi - lo;
    }
  }
  const length = sharedAngle * ((a.radius + b.radius) / 2);
  return length > WALL_OVERLAP_MIN ? { length, lateral } : null;
}

/**
 * Sobreposição de eixos de duas paredes: colineares (ângulo < 1°), eixos a menos de 1 cm no meio do
 * trecho e trecho comum maior que 5 cm. Quando as DUAS paredes são arcos (`sag`), compara os arcos reais
 * (dois semicírculos opostos sobre o mesmo diâmetro não se sobrepõem); com no máximo um arco, só o eixo a→b entra.
 */
export function wallOverlap(a: WallAxis, b: WallAxis): WallOverlap | null {
  const arcA = a.sag ? arcFromSagitta(a.a, a.b, a.sag) : null;
  const arcB = b.sag ? arcFromSagitta(b.a, b.b, b.sag) : null;
  if (arcA && arcB) return curvedWallOverlap(arcA, arcB);
  // Reta contra arco (ou um só arco): vale o critério dos eixos a→b, como no C14; a guarda das ferramentas
  // (`wallOverlapGuard.ts`) distingue arcos de mesma corda e flechas diferentes na hora de criar/mover/copiar.
  const la = dist(a.a, a.b);
  const lb = dist(b.a, b.b);
  if (la < MIN_WALL_LENGTH || lb < MIN_WALL_LENGTH) return null;
  const uA = norm(sub(a.b, a.a));
  const uB = norm(sub(b.b, b.a));
  // Ângulo entre as retas (sentido ignorado: paredes em sentidos opostos também se sobrepõem).
  const angle = Math.atan2(Math.abs(cross(uA, uB)), Math.abs(dot(uA, uB)));
  if (angle >= COLLINEAR_ANGLE) return null;
  const tB1 = dot(sub(b.a, a.a), uA);
  const tB2 = dot(sub(b.b, a.a), uA);
  const lo = Math.max(0, Math.min(tB1, tB2));
  const hi = Math.min(la, Math.max(tB1, tB2));
  const length = hi - lo;
  if (length <= WALL_OVERLAP_MIN) return null;
  const mid: Vec2 = { x: a.a.x + uA.x * ((lo + hi) / 2), y: a.a.y + uA.y * ((lo + hi) / 2) };
  const lateral = Math.abs(cross(uB, sub(mid, b.a)));
  return lateral < COLLINEAR_OFFSET ? { length, lateral } : null;
}

/** Parede existente que conflita com `w`, com o trecho em comum. */
export interface WallConflict {
  wall: Wall;
  overlap: WallOverlap;
}

/** Parede a conferir: eixo, curvatura opcional, id e nível bastam (a candidata pode ainda não estar no projeto). */
export type WallCandidate = Pick<Wall, 'id' | 'levelId' | 'a' | 'b'> & { sag?: number };

/**
 * Primeira parede do projeto que fica por baixo de `w` (mesmo nível, eixos sobrepostos).
 * `ignore` pula ids que não devem contar (ex.: o próprio conjunto sendo transformado).
 */
export function wallConflict(p: Project, w: WallCandidate, ignore?: ReadonlySet<Id>): WallConflict | null {
  for (const e of Object.values(p.elements)) {
    if (!isWall(e) || e.id === w.id || e.levelId !== w.levelId) continue;
    if (ignore?.has(e.id)) continue;
    const overlap = wallOverlap(w, e);
    if (overlap) return { wall: e, overlap };
  }
  return null;
}
